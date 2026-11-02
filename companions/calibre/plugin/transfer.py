"""Disk-backed transfers and loopback bridge; no Qt or Calibre imports."""
import base64
import hashlib
import hmac
import json
import os
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlparse
from urllib.request import Request, build_opener, HTTPRedirectHandler

MAX_EPUB = 50 * 1024 * 1024
MODES = ('Automatic', 'Cloud Inbox', 'Local Reader')
METADATA_FIELDS = ('title', 'authors', 'publisher', 'language', 'language_code', 'rating', 'summary', 'fandoms', 'additional_tags', 'series')
RESULT_GROUPS = ('Successful', 'Failed', 'Pending', 'Skipped')


def result_group(status):
    if status in ('imported', 'duplicate'):
        return 'Successful'
    if status in ('error', 'cancelled'):
        return 'Failed'
    return 'Skipped' if status == 'skipped' else 'Pending'


def validate_pair(value):
    pair = dict(value)
    for field in ('id', 'device'):
        uuid.UUID(pair[field])
    if not isinstance(pair.get('label'), str) or not 1 <= len(pair['label']) <= 160:
        raise ValueError('Destination name must contain 1–160 characters')
    if pair.get('version') != 1 or not isinstance(pair.get('token'), str) or len(pair['token']) != 64 or any(c not in '0123456789abcdef' for c in pair['token']):
        raise ValueError('Unsupported pairing configuration')
    if pair.get('mode') not in MODES or not isinstance(pair.get('cloud'), bool):
        raise ValueError('Invalid transfer mode or account state')
    if pair.get('cloud'):
        uuid.UUID(pair['account'])
        url = urlparse(pair.get('cloud_url', ''))
        if url.scheme != 'https' and not (url.scheme == 'http' and url.hostname in ('127.0.0.1', 'localhost')):
            raise ValueError('Cloud inbox requires HTTPS (HTTP allowed for loopback development)')
        if not url.hostname or url.username or url.password or url.query or url.fragment:
            raise ValueError('Invalid cloud inbox URL')
    elif pair.get('account'):
        raise ValueError('Guest destination cannot name a cloud account')
    origin = urlparse(pair['origin'])
    if origin.scheme not in ('https', 'http') or not origin.hostname or origin.username or origin.password or origin.path or origin.query or origin.fragment:
        raise ValueError('Invalid reader origin')
    if pair.get('local_url') != 'http://127.0.0.1:47821':
        raise ValueError('Unsupported local bridge address')
    return pair


def destination(pair, mode):
    if mode not in MODES:
        raise ValueError('Unknown transfer mode')
    chosen = ('Cloud Inbox' if pair['cloud'] else 'Local Reader') if mode == 'Automatic' else mode
    if chosen == 'Cloud Inbox' and not pair['cloud']:
        raise ValueError('Pair with a signed-in reader cloud library first')
    return chosen


def write_json(path, value):
    path = Path(path)
    temporary = path.with_suffix('.tmp')
    with open(temporary, 'w', encoding='utf-8') as stream:
        if os.name != 'nt':
            os.chmod(temporary, 0o600)
        json.dump(value, stream, ensure_ascii=False)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('Inbox redirected; verify the paired destination before retrying')


def cloud_request(pair, path, data=None, headers=None):
    request = Request(pair['cloud_url'].rstrip('/') + path, data=data, headers={
        'Authorization': 'Bearer ' + pair['token'], **(headers or {})})
    with build_opener(NoRedirect()).open(request, timeout=30) as response:
        return json.load(response)


class TransferStore:
    def __init__(self, root):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        if os.name != 'nt':
            os.chmod(self.root, 0o700)
        self.lock = threading.RLock()

    def jobs(self):
        with self.lock:
            return [json.loads(path.read_text(encoding='utf-8')) for path in sorted(self.root.glob('*.json'))]

    def save(self, job):
        with self.lock:
            write_json(self.root / (str(uuid.UUID(job['id'])) + '.json'), job)

    def enqueue(self, pair, mode, title, data, metadata):
        if not data or len(data) > MAX_EPUB:
            raise ValueError('EPUB must be between 1 byte and 50 MiB')
        metadata = {**metadata, '_filename': title[:200] + '.epub'}
        if len(json.dumps(metadata, ensure_ascii=False).encode('utf-8')) > 16384:
            raise ValueError('Mapped metadata exceeds 16 KiB')
        job = dict(id=str(uuid.uuid4()), pair=dict(pair), destination=destination(pair, mode),
                   title=title, hash=hashlib.sha256(data).hexdigest(), metadata=metadata,
                   status='queued', message='Waiting to deliver.', attempts=0, created_at=time.time_ns())
        # Only the latest snapshot of a book may suppress delivery; reverting metadata must still send.
        identity = metadata.get('_calibre_uuid')
        candidates = [previous for previous in self.jobs()
                      if previous['pair']['id'] == pair['id'] and previous['destination'] == job['destination']
                      and ((identity and previous['metadata'].get('_calibre_uuid') == identity)
                           or (not identity and previous['hash'] == job['hash']))]
        previous = max(candidates, key=lambda item: item.get('created_at', 0), default=None)
        if (previous and previous['hash'] == job['hash'] and previous['metadata'] == metadata
                and previous['status'] in ('queued', 'imported', 'duplicate')):
            return previous
        file = self.root / (job['id'] + '.epub')
        with open(file, 'wb') as stream:
            if os.name != 'nt':
                os.chmod(file, 0o600)
            stream.write(data)
        self.save(job)
        return job

    def acknowledge(self, job_id, result):
        with self.lock:
            job = next((job for job in self.jobs() if job['id'] == job_id), None)
            if not job:
                raise ValueError('Unknown transfer')
            if result.get('status') not in ('imported', 'duplicate', 'error', 'cancelled'):
                raise ValueError('Invalid result')
            job.update(status=result['status'], message=str(result.get('message', ''))[:2000])
            self.save(job)
            # Originals are removable only after the reader has committed its result.
            if job['status'] in ('imported', 'duplicate'):
                (self.root / (job_id + '.epub')).unlink(missing_ok=True)

    def deliver(self, job, cancel, report):
        if job['destination'] == 'Local Reader':
            report(job['title'] + (': Retry Import in the paired reader.' if job['status'] in ('error', 'cancelled') else ': Waiting for the paired reader on this computer.'))
            return
        pair = job['pair']
        for attempt in range(3):
            if cancel.is_set():
                return
            try:
                actual = cloud_request(pair, '/destination')
                if actual['account'] != pair['account'] or actual['device'] != pair['device']:
                    raise ValueError('Paired account/device changed. Explicitly pair again.')
                try:
                    receipt = cloud_request(pair, '/books/' + job['id'])
                except HTTPError as error:
                    if error.code != 404:
                        raise
                    receipt = None
                if receipt:
                    job.update(status=receipt['status'], message=receipt.get('message', ''))
                    self.save(job)
                    if job['status'] in ('imported', 'duplicate'):
                        self.acknowledge(job['id'], receipt)
                    report(job['title'] + ': ' + job['status'] + '. ' + job['message'])
                    return
                data = (self.root / (job['id'] + '.epub')).read_bytes()
                result = cloud_request(pair, '/books/' + job['id'], data, {
                    'Content-Type': 'application/epub+zip', 'X-Epub-Hash': job['hash'],
                    'X-Reader-Metadata': base64.b64encode(json.dumps(job['metadata'], ensure_ascii=False).encode('utf-8')).decode('ascii')})
                job.update(status=result['status'], message=result.get('message', ''), attempts=job['attempts'] + 1)
                self.save(job)
                report(job['title'] + ': ' + job['status'] + '. ' + job['message'])
                return
            except Exception as error:
                job.update(message=str(error), attempts=job['attempts'] + 1)
                self.save(job)
                report(job['title'] + ': Queued for Cloud Inbox. ' + str(error))
                if isinstance(error, (ValueError, HTTPError)) and (not isinstance(error, HTTPError) or error.code < 500):
                    return
                if cancel.wait(2 ** attempt):
                    return


class Bridge:
    def __init__(self, store, pair):
        self.store, self.pair = store, pair
        bridge = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass  # Never log pairing credentials or book metadata.

            def authorized(self):
                return (self.headers.get('Host') == '127.0.0.1:47821'
                        and self.headers.get('Origin') == bridge.pair['origin']
                        and hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + bridge.pair['token'])
                        and self.headers.get('X-Reader-Destination') == bridge.pair['id'])

            def reply(self, value, status=200, binary=False):
                body = value if binary else json.dumps(value).encode('utf-8')
                self.send_response(status)
                self.send_header('Access-Control-Allow-Origin', bridge.pair['origin'])
                self.send_header('Vary', 'Origin')
                self.send_header('Cache-Control', 'no-store')
                self.send_header('Content-Type', 'application/epub+zip' if binary else 'application/json')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def do_OPTIONS(self):
                if self.headers.get('Origin') != bridge.pair['origin'] or self.headers.get('Host') != '127.0.0.1:47821':
                    self.reply({'error': 'Forbidden origin'}, 403)
                    return
                self.send_response(204)
                self.send_header('Access-Control-Allow-Origin', bridge.pair['origin'])
                self.send_header('Vary', 'Origin')
                self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
                self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Reader-Destination')
                self.send_header('Access-Control-Allow-Private-Network', 'true')
                self.end_headers()

            def do_GET(self):
                if not self.authorized():
                    self.reply({'error': 'Pairing required'}, 403)
                    return
                jobs = [job for job in bridge.store.jobs() if job['pair']['id'] == bridge.pair['id'] and job['destination'] == 'Local Reader']
                if self.path == '/inbox':
                    self.reply([{key: job[key] for key in ('id', 'hash', 'metadata', 'status', 'message')} for job in jobs if job['status'] == 'queued'][:50])
                elif self.path.startswith('/books/'):
                    job = next((job for job in jobs if self.path == '/books/' + job['id']), None)
                    if not job:
                        self.reply({'error': 'Unknown transfer'}, 404)
                    else:
                        file = bridge.store.root / (job['id'] + '.epub')
                        if file.exists():
                            self.reply(file.read_bytes(), binary=True)
                        else:
                            self.reply({'error': 'Original no longer queued'}, 404)
                else:
                    self.reply({'error': 'Unknown route'}, 404)

            def do_POST(self):
                if not self.authorized():
                    self.reply({'error': 'Pairing required'}, 403)
                    return
                job = next((job for job in bridge.store.jobs() if job['pair']['id'] == bridge.pair['id'] and job['destination'] == 'Local Reader' and self.path == '/results/' + job['id']), None)
                if not job:
                    self.reply({'error': 'Unknown transfer'}, 404)
                    return
                try:
                    size = int(self.headers.get('Content-Length', '0'))
                    if not 0 < size <= 10000:
                        raise ValueError('Invalid result size')
                    bridge.store.acknowledge(job['id'], json.loads(self.rfile.read(size)))
                    self.reply({'ok': True})
                except (ValueError, TypeError):
                    self.reply({'error': 'Invalid result'}, 400)

        self.server = ThreadingHTTPServer(('127.0.0.1', 47821), Handler)
        self.server.daemon_threads = True
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def close(self):
        self.server.shutdown()
        self.server.server_close()
