#!/usr/bin/env python3
"""Export associations from a Calibre metadata.db without modifying the library."""
import argparse
import csv
import re
import sqlite3
from pathlib import Path


def export_mapping(library, output):
    database = Path(library).expanduser().resolve() / "metadata.db"
    with sqlite3.connect(database.as_uri() + "?mode=ro", uri=True) as connection:
        books = connection.execute("SELECT id, title FROM books ORDER BY id").fetchall()
        identifiers = {}
        for book, kind, value in connection.execute("SELECT book, type, val FROM identifiers"):
            identifiers.setdefault(book, {})[kind.lower()] = value
        authors = {}
        for book, name in connection.execute("SELECT l.book, a.name FROM books_authors_link l JOIN authors a ON a.id=l.author ORDER BY l.id"):
            authors.setdefault(book, []).append(name.replace("|", ","))
    # The upload ID is not known to be the reader/content ID. Leave the URL blank.
    with Path(output).expanduser().open("x", newline="", encoding="utf-8") as report:
        writer = csv.DictWriter(report, fieldnames=["link", "title", "author", "bookfusion_id", "bookfusion_url"])
        writer.writeheader()
        for book, title in books:
            ids = identifiers.get(book, {})
            work_ids = sorted({match for value in ids.values() for match in re.findall(r"https?://(?:www\.)?archiveofourown\.org/works/([1-9]\d*)(?=[/?#\s]|$)", value)})
            # Retain missing/ambiguous metadata for review rather than guessing.
            for work_id in work_ids or [None]:
                writer.writerow({"link": f"https://archiveofourown.org/works/{work_id}" if work_id else "", "title": title, "author": "; ".join(authors.get(book, [])), "bookfusion_id": ids.get("bookfusion", ""), "bookfusion_url": ""})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--library", required=True, help="Calibre library directory containing metadata.db")
    parser.add_argument("--output", required=True, help="New CSV path (existing files are never overwritten)")
    args = parser.parse_args()
    export_mapping(args.library, args.output)
