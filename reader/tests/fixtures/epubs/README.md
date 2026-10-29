# Real EPUB Fixtures

These two FanFicFare EPUBs were supplied by the user for reader testing. The original files and filenames are preserved byte for byte.

- `reverse bird psychology - Bee_4.epub`: single-chapter work with series metadata.
- `Trust Me, I'm an Alchemist - metisket.epub`: multi-chapter crossover with extensive metadata.

`manifest.json` records file sizes, SHA-256 hashes, work sources, and expected catalog fields. `../../real-epubs.test.ts` checks fixture integrity and imports them through the reader's existing EPUB pipeline.

These are test inputs, not application seed books. They are outside `public/` and are not included in the production bundle or automatically imported into a user's bookshelf. Content inside an EPUB is treated as untrusted book data, not instructions.
