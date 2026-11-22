# Reader Cloud Receipt Benchmark

The harness starts a fresh, in-memory PostgreSQL 17 database through the project's existing PGlite test setup. It applies the checked-in migrations inside that instance, generates synthetic data, and writes candidate tables and functions in the `receipt_bench` schema. The baseline correctness suite also calls the unmodified RPC in that disposable database.

## Setup and Execution

From the repository root, use Node.js 24 and install the repository's locked dependencies if needed.

```sh
npm ci
node benchmarks/reader-cloud-receipts/final.mjs 3 > /tmp/reader-cloud-receipts-final.json
node benchmarks/reader-cloud-receipts/verify.mjs
node benchmarks/reader-cloud-receipts/benchmark.mjs 3 > /tmp/reader-cloud-receipts-results.json
npm exec -- vitest run supabase/tests/reader-cloud.test.ts
```

For native PostgreSQL, initialize a fresh disposable database with the same Auth/Storage fixture and migration chain used in `scripts/test-database.mjs`. Then supply the opt-in session flag ahead of the generated SQL. Use a verified local socket and database. The native run truncates Reader tables between trials.

```sh
{
  printf "set bta.disposable_receipt_benchmark = 'yes';\n"
  node benchmarks/reader-cloud-receipts/final.mjs --sql 1
} | psql -X -v ON_ERROR_STOP=1 -d disposable_reader_benchmark
```

The number argument is the trial count. Progress goes to stderr and the JSON report goes to stdout. The full benchmark can use several hundred MB of memory because both the fixture and the current candidate live inside PostgreSQL's in-memory filesystem. A single trial is useful for a quick check.

The scripts accept no connection URL and never open a network database connection. They close the embedded PostgreSQL instance on exit. The temporary result file can be removed after comparison. No hosted credentials, Docker services, or private book data are needed.

## Files

- [Final Protocol Results](FINAL.md) measures the actual migration and canonical RPC. The original comparison and prototype verification are pinned to the pre-transition schema.

- [workload.sql](workload.sql) builds the deterministic replay workload.
- [designs.mjs](designs.mjs) is the shared candidate schema, encoder, lookup, and EPUB cleanup definition.
- [benchmark.mjs](benchmark.mjs) reports physical storage, timings, planner statistics, and access paths.
- [verify.mjs](verify.mjs) runs correctness checks through the original RPC and isolated copies that replace only the receipt operations. It verifies gzip as a PostgreSQL byte-storage round trip.
- [Results](RESULTS.md) documents the measurements, compatibility assessment, and recommendation.
- [Migration Proposal](MIGRATION.md) describes a possible future rollout. It is a design document.
