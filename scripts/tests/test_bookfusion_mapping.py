import csv
import importlib.util
import sqlite3
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("mapping", Path(__file__).parents[1] / "export-bookfusion-mapping.py")
mapping = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mapping)


class MappingTest(unittest.TestCase):
    def test_exports_exact_urls_and_retains_missing_and_ambiguous_books(self):
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / "metadata.db"
            with sqlite3.connect(database) as db:
                db.executescript("""
                    CREATE TABLE books(id INTEGER, title TEXT);
                    CREATE TABLE identifiers(book INTEGER, type TEXT, val TEXT);
                    CREATE TABLE authors(id INTEGER, name TEXT);
                    CREATE TABLE books_authors_link(id INTEGER, book INTEGER, author INTEGER);
                    INSERT INTO books VALUES(1, 'Title, with comma'), (2, 'Missing'), (3, 'Ambiguous');
                    INSERT INTO identifiers VALUES(1, 'url', 'https://archiveofourown.org/works/123/chapters/456'),
                    (1, 'bookfusion', 'upload-789'), (3, 'url', 'https://archiveofourown.org/works/234'),
                    (3, 'uri', 'https://archiveofourown.org/works/345');
                    INSERT INTO authors VALUES(1, 'An Author');
                    INSERT INTO books_authors_link VALUES(1, 1, 1);
                """)
            before = database.read_bytes()
            output = Path(directory) / "mapping.csv"
            mapping.export_mapping(directory, output)
            with output.open() as report:
                rows = list(csv.DictReader(report))
            self.assertEqual(len(rows), 4)
            self.assertEqual(rows[0], dict(link="https://archiveofourown.org/works/123", title="Title, with comma", author="An Author", bookfusion_id="upload-789", bookfusion_url=""))
            self.assertEqual(rows[1]["link"], "")
            self.assertEqual(database.read_bytes(), before)
            with self.assertRaises(FileExistsError):
                mapping.export_mapping(directory, output)


if __name__ == "__main__":
    unittest.main()
