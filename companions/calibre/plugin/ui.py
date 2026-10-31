import json
import threading
from pathlib import Path

from calibre.gui2 import error_dialog
from calibre.gui2.actions import InterfaceAction
from calibre.utils.config import JSONConfig, config_dir
from qt.core import (QComboBox, QDialog, QDialogButtonBox, QFormLayout, QLabel,
                     QMenu, QPlainTextEdit, QProgressBar, QPushButton, QThread,
                     QVBoxLayout, pyqtSignal)
from calibre_plugins.archives_unfolded.transfer import (
    Bridge, METADATA_FIELDS, MODES, TransferStore, destination, validate_pair)

prefs = JSONConfig('plugins/archives_unfolded')
prefs.defaults['pair'] = None
prefs.defaults['mapping'] = {}


class Worker(QThread):
    progress = pyqtSignal(str, int, int)
    failed = pyqtSignal(str)

    def __init__(self, store, db, ids, pair, mode, mapping, parent):
        super().__init__(parent)
        self.store, self.db, self.ids = store, db, ids
        self.pair, self.mode, self.mapping = pair, mode, mapping
        self.cancel = threading.Event()

    def run(self):
        try:
            # The thread-safe new_api is captured before a library switch can occur.
            for index, book_id in enumerate(self.ids):
                if self.cancel.is_set():
                    break
                title = self.db.field_for('title', book_id) or str(book_id)
                try:
                    if not self.db.has_format(book_id, 'EPUB'):
                        self.progress.emit(title + ': Skipped (no EPUB format).', index + 1, len(self.ids))
                        continue
                    data = self.db.format(book_id, 'EPUB')
                    metadata = {target: self.db.field_for(source, book_id) for target, source in self.mapping.items()}
                    metadata['_calibre_uuid'] = self.db.field_for('uuid', book_id)
                    job = self.store.enqueue(self.pair, self.mode, title, data, metadata)
                    self.progress.emit(title + (': Already imported; skipped.' if job['status'] in ('imported', 'duplicate') else ': Queued for ' + job['destination'] + '.'), index + 1, len(self.ids))
                except Exception as error:
                    self.progress.emit(title + ': Failed to queue: ' + str(error), index + 1, len(self.ids))
            jobs = [job for job in self.store.jobs() if job['status'] not in ('imported', 'duplicate')]
            for index, job in enumerate(jobs):
                if self.cancel.is_set():
                    break
                # Retry keeps each job's original account, device, and transport snapshot.
                self.store.deliver(job, self.cancel, lambda text: self.progress.emit(text, index + 1, len(jobs)))
            for job in self.store.jobs():
                self.progress.emit(job['title'] + ': ' + job['destination'] + ' · ' + job['status'] + ' · ' + job['message'], 0, 0)
        except Exception as error:
            self.failed.emit(str(error))


class ArchivesUnfoldedAction(InterfaceAction):
    name = 'archives unfolded'
    action_spec = ('archives unfolded', None, 'Sync EPUBs to your paired reader', None)

    def genesis(self):
        self.store = TransferStore(Path(config_dir) / 'plugins' / 'archives-unfolded-queue')
        self.bridge = None
        self.worker = None
        menu = QMenu(self.gui)
        for label, action in (
            ('Sync Selected Books', lambda: self.start(False)),
            ('Sync All Books', lambda: self.start(True)),
            ('Retry Queued Transfers', lambda: self.start(None)),
            ('Pair Reader Destination', self.configure),
            ('Stop Local Reader Bridge', self.stop_bridge),
        ):
            menu.addAction(label, action)
        self.qaction.setMenu(menu)
        self.qaction.triggered.connect(lambda: self.start(False))
        self.start_bridge()

    def stop_bridge(self):
        if self.bridge:
            self.bridge.close()
            self.bridge = None

    def start_bridge(self):
        self.stop_bridge()
        if prefs['pair']:
            try:
                self.bridge = Bridge(self.store, validate_pair(prefs['pair']))
            except Exception as error:
                self.gui.status_bar.showMessage('Local Reader bridge unavailable: ' + str(error), 15000)

    def configure(self):
        dialog = QDialog(self.gui)
        dialog.setWindowTitle('Pair Reader Destination')
        layout = QVBoxLayout(dialog)
        layout.addWidget(QLabel('In the reader, open Calibre Transfers and copy its pairing configuration.\nPairing follows reader cloud sign-in, independently of the organizer.'))
        pair_input = QPlainTextEdit(json.dumps(prefs['pair'] or {}, ensure_ascii=False))
        layout.addWidget(pair_input)
        layout.addWidget(QLabel('Optional Metadata Mapping (reader field → Calibre field, including #custom columns):\n' + ', '.join(METADATA_FIELDS)))
        mapping_input = QPlainTextEdit(json.dumps(prefs['mapping'], ensure_ascii=False))
        mapping_input.setPlaceholderText('{"title":"title","authors":"authors","fandoms":"#fandoms"}')
        layout.addWidget(mapping_input)
        buttons = QDialogButtonBox(QDialogButtonBox.StandardButton.Save | QDialogButtonBox.StandardButton.Cancel)
        layout.addWidget(buttons)
        buttons.rejected.connect(dialog.reject)

        def save():
            try:
                pair = validate_pair(json.loads(pair_input.toPlainText()))
                mapping = json.loads(mapping_input.toPlainText())
                if not isinstance(mapping, dict) or any(target not in METADATA_FIELDS or not isinstance(source, str) or source not in self.gui.current_db.new_api.field_metadata for target, source in mapping.items()):
                    raise ValueError('Mapping must use supported reader fields and existing Calibre field names')
                prefs['pair'], prefs['mapping'] = pair, mapping
                self.start_bridge()
                dialog.accept()
            except Exception as error:
                error_dialog(dialog, 'Invalid Pairing Configuration', str(error), show=True)
        buttons.accepted.connect(save)
        dialog.resize(650, 480)
        dialog.exec()

    def start(self, all_books):
        if self.worker and self.worker.isRunning():
            error_dialog(self.gui, 'Transfer In Progress', 'Finish or cancel the current transfer first.', show=True)
            return
        if not prefs['pair']:
            self.configure()
            if not prefs['pair']:
                return
        pair = validate_pair(prefs['pair'])
        db = self.gui.current_db.new_api
        ids = [] if all_books is None else sorted(db.all_book_ids()) if all_books else self.gui.library_view.get_selected_ids()
        dialog = QDialog(self.gui)
        dialog.setWindowTitle('Confirm Reader Destination')
        layout = QVBoxLayout(dialog)
        layout.addWidget(QLabel(pair['label'] + '\nAccount: ' + (pair['account'] or 'Guest / Local Library') + '\nDevice: ' + pair['device']))
        mode = QComboBox()
        mode.addItems(MODES)
        mode.setCurrentText(pair['mode'])
        form = QFormLayout()
        form.addRow('Transfer Mode', mode)
        layout.addLayout(form)
        summary = QLabel()
        layout.addWidget(summary)

        def describe():
            try:
                selected = destination(pair, mode.currentText())
                summary.setText(f'{len(ids)} EPUB candidates → {selected}.\n' + ('Offline uploads remain queued for this cloud account.' if selected == 'Cloud Inbox' else 'The paired reader must be open on this computer.'))
            except ValueError as error:
                summary.setText(str(error))
        mode.currentTextChanged.connect(describe)
        describe()
        layout.addWidget(QLabel('Retries keep their original destination. To switch, explicitly select another mode and sync the books again.\nExisting queued transfers keep their original destination; cancelling does not recall delivered files.'))
        pending = [job for job in self.store.jobs() if job['status'] not in ('imported', 'duplicate')]
        if pending:
            preview = QPlainTextEdit()
            preview.setReadOnly(True)
            preview.setPlainText('Existing Queue (Destinations Stay Pinned):\n' + '\n'.join(job['title'] + ' → ' + job['destination'] + ' · ' + job['pair']['label'] + ' · Account ' + (job['pair']['account'] or 'Guest') + ' · Device ' + job['pair']['device'] for job in pending))
            layout.addWidget(preview)
        buttons = QDialogButtonBox(QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel)
        buttons.accepted.connect(dialog.accept)
        buttons.rejected.connect(dialog.reject)
        layout.addWidget(buttons)
        if not dialog.exec():
            return
        try:
            destination(pair, mode.currentText())
        except ValueError as error:
            error_dialog(self.gui, 'Destination Unavailable', str(error), show=True)
            return
        pair['mode'] = mode.currentText()
        prefs['pair'] = pair
        self.start_bridge()
        progress = QDialog(self.gui)
        progress.setWindowTitle('Calibre Transfer Results')
        progress_layout = QVBoxLayout(progress)
        status = QLabel(pair['label'] + ' · ' + destination(pair, pair['mode']))
        progress_layout.addWidget(status)
        bar = QProgressBar()
        progress_layout.addWidget(bar)
        results = QPlainTextEdit()
        results.setReadOnly(True)
        progress_layout.addWidget(results)
        cancel = QPushButton('Cancel Transfer')
        progress_layout.addWidget(cancel)
        self.worker = Worker(self.store, db, ids, pair, pair['mode'], prefs['mapping'], progress)

        def update(text, current, total):
            results.appendPlainText(text)
            if total:
                bar.setRange(0, total)
                bar.setValue(current)
        self.worker.progress.connect(update)
        self.worker.failed.connect(results.appendPlainText)
        cancel.clicked.connect(self.worker.cancel.set)
        progress.rejected.connect(self.worker.cancel.set)
        self.worker.finished.connect(lambda: (status.setText('Transfer Pass Finished — Undelivered EPUBs Remain Queued'), cancel.setText('Close'), cancel.clicked.connect(progress.accept)))
        self.worker.start()
        progress.resize(720, 480)
        # Keep the dialog/thread alive even when closed while a network request finishes.
        self.progress_dialog = progress
        progress.show()
