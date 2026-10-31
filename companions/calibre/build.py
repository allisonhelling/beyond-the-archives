"""Build the Calibre UI plugin with only the Python standard library."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parent
output = root / 'dist' / 'archives-unfolded-calibre.zip'
output.parent.mkdir(exist_ok=True)
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    for name in ('__init__.py', 'ui.py', 'transfer.py', 'plugin-import-name-archives_unfolded.txt'):
        archive.write(root / 'plugin' / name, name)
print(output)
