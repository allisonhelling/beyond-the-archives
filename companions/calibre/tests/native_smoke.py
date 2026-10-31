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
    worker = Worker(store,api,list(ids),pair,'Automatic',{'title':'title','authors':'authors'},None)
    failures=[]
    worker.failed.connect(failures.append)
    worker.progress.connect(lambda text, *_: print(text))
    worker.finished.connect(app.quit)
    worker.start()
    app.exec()
    worker.wait()
    assert not failures, failures
    assert len(store.jobs()) == 1
    assert store.jobs()[0]['destination'] == 'Local Reader'
    print('Native Calibre database / Qt worker smoke passed')
    database.close()
