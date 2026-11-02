"""Run with calibre-debug after installing the ZIP into an isolated Calibre config."""
import tempfile
from pathlib import Path
import calibre.customize.ui  # Initialize installed plugin imports.
from calibre.library import db
from calibre.ebooks.metadata.book.base import Metadata
from qt.core import QApplication
from calibre_plugins.archives_unfolded.ui import Worker
from calibre_plugins.archives_unfolded.transfer import TransferStore
import uuid
app = QApplication([])
with tempfile.TemporaryDirectory(prefix='archives-native-') as directory:
    database = db(str(Path(directory) / 'library'))
    api = database.new_api
    fixture = Path(__file__).resolve().parents[3] / 'reader/tests/fixtures/epubs/reverse bird psychology - Bee_4.epub'
    ids, duplicates = api.add_books([(Metadata('Native Test', ['Test Author']), {'EPUB': str(fixture)})])
    pair = dict(version=1,id=str(uuid.uuid4()),device=str(uuid.uuid4()),token='ab'*32,cloud=False,account='',mode='Automatic',label='Smoke',origin='http://127.0.0.1:4174',local_url='http://127.0.0.1:47821')
    store = TransferStore(Path(directory) / 'queue')
    unrelated = store.enqueue(pair, 'Automatic', 'Unselected Pending Book', b'pending original', {'_calibre_uuid': str(uuid.uuid4())})
    delivered = []
    deliver = store.deliver

    def record_delivery(job, *args):
        delivered.append(job['id'])
        return deliver(job, *args)
    store.deliver = record_delivery

    def run(selected):
        worker = Worker(store,api,selected,pair,'Automatic',{'title':'title','authors':'authors'},None)
        failures, results = [], []
        worker.failed.connect(failures.append)
        worker.result.connect(lambda *result: results.append(result))
        worker.finished.connect(app.quit)
        worker.start(); app.exec(); worker.wait()
        assert not failures, failures
        return results

    results = run(list(ids))
    assert len(store.jobs()) == 2
    selected = next(job for job in store.jobs() if job['id'] != unrelated['id'])
    assert delivered == [selected['id']], delivered
    assert [row[0] for row in results] == [selected['id']]
    store.acknowledge(selected['id'], {'status': 'imported', 'message': 'Saved'})
    delivered.clear()
    results = run(list(ids))
    assert not delivered, delivered
    assert len(store.jobs()) == 2
    assert [row[1] for row in results] == ['imported']
    run([])
    assert not delivered, delivered
    run(None)
    assert delivered == [unrelated['id']], delivered
    print('Native Calibre selection scope, unchanged-book skipping, result signals, and explicit queue retry passed')
    database.close()
