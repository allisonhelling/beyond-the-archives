import hashlib
import importlib.util
import json
import tempfile
import threading
import unittest
import uuid
from http.client import HTTPConnection
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('transfer', Path(__file__).parents[1] / 'plugin' / 'transfer.py')
transfer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(transfer)


def pair(cloud=False):
    return dict(version=1, id=str(uuid.uuid4()), device=str(uuid.uuid4()), token='ab' * 32,
                cloud=cloud, account=str(uuid.uuid4()) if cloud else '', mode='Automatic',
                label='Test Reader', origin='http://127.0.0.1:4174', local_url='http://127.0.0.1:47821',
                cloud_url='https://reader.example/functions/v1/reader-inbox')


class TransferTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.store = transfer.TransferStore(self.temp.name)

    def test_default_tracks_reader_account_and_explicit_mode(self):
        self.assertEqual(transfer.destination(pair(), 'Automatic'), 'Local Reader')
        self.assertEqual(transfer.destination(pair(True), 'Automatic'), 'Cloud Inbox')
        self.assertEqual(transfer.destination(pair(True), 'Local Reader'), 'Local Reader')
        with self.assertRaises(ValueError):
            transfer.destination(pair(), 'Cloud Inbox')
        bad = pair(True)
        bad['cloud_url'] = 'http://insecure.example/inbox'
        with self.assertRaises(ValueError):
            transfer.validate_pair(bad)

    def test_offline_job_survives_restart_and_never_switches_destination(self):
        destination = pair(True)
        job = self.store.enqueue(destination, 'Automatic', 'Story', b'epub bytes', {})
        destination['account'] = str(uuid.uuid4())
        cancel = threading.Event()
        with patch.object(transfer, 'cloud_request', side_effect=OSError('Offline')):
            self.store.deliver(job, cancel, lambda _text: cancel.set())
        restored = transfer.TransferStore(self.temp.name).jobs()[0]
        self.assertEqual(restored['status'], 'queued')
        self.assertEqual(restored['destination'], 'Cloud Inbox')
        self.assertNotEqual(restored['pair']['account'], destination['account'])
        self.assertEqual(restored['hash'], hashlib.sha256(b'epub bytes').hexdigest())
        self.assertTrue((Path(self.temp.name) / (job['id'] + '.epub')).exists())

    def test_cloud_checks_identity_and_uses_same_receipt_on_retry(self):
        destination = pair(True)
        job = self.store.enqueue(destination, 'Automatic', 'Story', b'epub bytes', {})
        with patch.object(transfer, 'cloud_request', return_value={'account':'different','device':destination['device']}) as request:
            self.store.deliver(job, threading.Event(), lambda _text: None)
            self.assertEqual(request.call_count, 1)
        receipt = {'status':'imported','message':'Saved'}
        with patch.object(transfer, 'cloud_request', side_effect=[destination, receipt]) as request:
            self.store.deliver(job, threading.Event(), lambda _text: None)
            self.assertEqual(request.call_args.args[1], '/books/' + job['id'])
        self.assertEqual(self.store.jobs()[0]['status'], 'imported')
        self.assertFalse((Path(self.temp.name) / (job['id'] + '.epub')).exists())

    def test_loopback_requires_origin_credential_and_destination(self):
        destination = pair()
        job = self.store.enqueue(destination, 'Automatic', 'Story', b'epub bytes', {'title':'Mapped'})
        bridge = transfer.Bridge(self.store, destination)
        self.addCleanup(bridge.close)
        def request(path, headers, body=None):
            connection = HTTPConnection('127.0.0.1', 47821, timeout=3)
            connection.request('POST' if body else 'GET', path, body=body, headers=headers)
            response = connection.getresponse()
            status, data = response.status, response.read()
            connection.close()
            return status, data
        headers = {'Origin':destination['origin'], 'Authorization':'Bearer ' + destination['token'], 'X-Reader-Destination':destination['id']}
        self.assertEqual(request('/inbox', {})[0], 403)
        self.assertEqual(request('/inbox', {**headers, 'Origin':'https://attacker.example'})[0], 403)
        self.assertEqual(request('/inbox', {**headers, 'Host':'attacker.example'})[0], 403)
        self.assertEqual(len(json.loads(request('/inbox', headers)[1])), 1)
        self.assertEqual(request('/books/' + job['id'], headers)[1], b'epub bytes')
        self.assertEqual(request('/books/../../secrets', headers)[0], 404)
        self.assertEqual(request('/results/' + job['id'], headers, json.dumps({'status':'duplicate','message':'Existing copy'}))[0], 200)
        self.assertEqual(json.loads(request('/inbox', headers)[1]), [])
        self.assertEqual(self.store.jobs()[0]['status'], 'duplicate')

    def test_rejects_oversize_epubs_and_metadata(self):
        with self.assertRaises(ValueError):
            self.store.enqueue(pair(), 'Automatic', 'Story', b'', {})
        with self.assertRaises(ValueError):
            self.store.enqueue(pair(), 'Automatic', 'Story', b'epub', {'summary':'x' * 17000})


if __name__ == '__main__':
    unittest.main()
