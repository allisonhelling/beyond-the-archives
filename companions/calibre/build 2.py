"""Build the Calibre UI plugin with only the Python standard library."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parent
output = root / 'dist' / 'archives-unfolded-calibre.zip'
output.parent.mkdir(exist_ok=True)
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    for source in sorted((root / 'plugin').iterdir()):
        if source.is_file() and source.suffix in ('.py', '.txt'):
            archive.write(source, source.name)
print(output)
