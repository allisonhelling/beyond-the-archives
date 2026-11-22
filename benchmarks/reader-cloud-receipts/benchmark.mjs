import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { gzipSync, gunzipSync } from 'node:zlib'
import { createTestDatabase } from '../../scripts/test-database.mjs'
import { designs, purgePredicate, tableDDL } from './designs.mjs'

const trials = Number(process.argv[2] ?? 3)
assert(Number.isInteger(trials) && trials > 0, 'Expected a positive trial count')
const total = 23817
const repeated = 1000
const lastBulk = total - repeated
const db = await createTestDatabase({ beforeMigration: '20261121000100_reader_hybrid_sync.sql' })
const query = async (sql, args) => (await db.query(sql, args)).rows
const one = async (sql, args) => (await query(sql, args))[0]
async function timed(action) {
  const start = performance.now()
  const result = await action()
  return { ms: performance.now() - start, result }
}

async function sizes(name) {
  return one(`
    select pg_total_relation_size(c.oid) as total, pg_relation_size(c.oid) as heap,
      pg_indexes_size(c.oid) as indexes, pg_relation_size(c.reltoastrelid) as toast_heap,
      pg_indexes_size(c.reltoastrelid) as toast_indexes,
      pg_total_relation_size(c.oid) - pg_relation_size(c.oid) - pg_indexes_size(c.oid)
        - pg_relation_size(c.reltoastrelid) - pg_indexes_size(c.reltoastrelid) as auxiliary
    from pg_class c where c.oid = $1::regclass`, [name])
}

async function stageGzip() {
  await db.exec('create table receipt_bench.packed(n integer primary key,payload bytea not null);')
  let encodeMs = 0, decodeMs = 0, bytes = 0
  for (let start = 1; start <= total; start += 500) {
    const source = await query('select n,result::text as text from receipt_bench.source where n >= $1 and n < $2 order by n', [start, start + 500])
    const encoded = await timed(() => source.map(row => gzipSync(row.text, { level: 6 })))
    encodeMs += encoded.ms
    const decoded = await timed(() => encoded.result.map(payload => gunzipSync(payload).toString('utf8')))
    decodeMs += decoded.ms
    const rows = source.map((row, index) => {
      assert.equal(decoded.result[index], row.text)
      bytes += encoded.result[index].length
      return { n: row.n, hex: encoded.result[index].toString('hex') }
    })
    await query("insert into receipt_bench.packed select n,decode(hex,'hex') from jsonb_to_recordset($1::jsonb) as x(n integer,hex text)", [JSON.stringify(rows)])
  }
  await db.exec('analyze receipt_bench.packed')
  return { encodeMs, decodeMs, bytes, node: process.versions.node, zlib: process.versions.zlib }
}

async function run(design, owner, book, purgeRows) {
  const name = `receipt_bench.${design.name}`
  await db.exec(tableDDL(design))
  const insert = `insert into ${name}(user_id,id,${design.insert}) select s.user_id,s.id,${design.selected}`
  const bulk = (from, to) => timed(() => query(`${insert} from receipt_bench.source s
    where s.n between $1 and $2 order by s.n`, [from, to]))
  const bulkMs = [], physical = {}
  let from = 1
  for (const to of [1000, 10000, lastBulk]) {
    bulkMs.push({ rows: to - from + 1, ms: (await bulk(from, to)).ms })
    if (to !== lastBulk) physical[to] = await sizes(name)
    from = to + 1
  }
  await db.exec(`create table receipt_bench.active (user_id uuid,key text,revision bigint,value jsonb,primary key(user_id,key));
    insert into receipt_bench.active
    select distinct on (user_id,key) user_id,key,revision,value
    from receipt_bench.source where n <= ${lastBulk} order by user_id,key,n desc;`)
  const wave = await timed(() => db.exec(`do $$ declare s receipt_bench.source%rowtype; begin
    for s in select * from receipt_bench.source where n > ${lastBulk} order by n loop
      insert into receipt_bench.active values (s.user_id,s.key,s.revision,s.value)
      on conflict(user_id,key) do update set revision=excluded.revision,value=excluded.value;
      ${insert};
    end loop;
  end $$;`))
  await db.exec(`analyze ${name}`)
  const stats = await query('select attname,avg_width,null_frac from pg_stats where schemaname=$1 and tablename=$2 order by attname',
    ['receipt_bench',design.name])
  const payload = design.name === 'baseline' ? 'result' : 'payload'
  const storageCompression = await query(`select pg_column_compression(${payload}) method,count(*)::int rows
    from ${name} where ${payload} is not null group by 1 order by 1`)
  const inserted = await one(`select count(*)::int rows from ${name}`)
  assert.equal(inserted.rows, total)
  physical[total] = await sizes(name)
  const response = design.replay.replaceAll('p_key', 's.key').replaceAll('p_value', 's.value')
  const lookup = `select hit.reply from receipt_bench.probes s
    cross join lateral (select ${design.name === 'gzip' ? response : `(${response})::text`} reply
      from ${name} r where (r.user_id,r.id)=(s.user_id,s.id) limit 1) hit`
  const lookupMs = []
  for (let pass = 0; pass < 4; pass++) {
    const scan = await timed(() => query(lookup))
    assert.equal(scan.result.length, 512)
    const decode = design.name === 'gzip'
      ? await timed(() => scan.result.map(row => gunzipSync(row.reply).toString('utf8'))) : null
    lookupMs.push({ ms: scan.ms, decodeMs: decode?.ms ?? 0 })
  }
  const lookupPlan = await query(`explain (costs off) ${lookup}`)
  await db.exec(`vacuum (analyze) ${name}`)
  const vacuum = await sizes(name)
  const purge = `delete from ${name} where ${purgePredicate(design)}`
  const purgePlan = await query(`explain (costs off) ${purge}`, [owner,book])
  const cleanup = await timed(() => db.query(purge, [owner,book]))
  assert.equal(cleanup.result.affectedRows, purgeRows)
  const afterDelete = await sizes(name)
  await db.exec(`vacuum (full, analyze) ${name}`)
  const afterRewrite = await sizes(name)
  await db.exec(`drop table ${name},receipt_bench.active`)
  return { stats, storageCompression, bulkMs, repeated: { rows: repeated, ms: wave.ms }, physical, vacuum, afterDelete, afterRewrite,
    lookupMs, lookupPlan, purgePlan, cleanup: { rows: cleanup.result.affectedRows, ms: cleanup.ms } }
}

try {
  await db.exec('create schema receipt_bench; set default_toast_compression=pglz;')
  await db.exec(await readFile(new URL('./workload.sql', import.meta.url), 'utf8'))
  await db.exec(`insert into auth.users(id) select distinct user_id from receipt_bench.source;
    create table receipt_bench.probes as select * from receipt_bench.source
    order by md5('probe:' || n) limit 512;`)
  const config = await query(`select name,setting,unit,enumvals from pg_settings where name in
    ('block_size','default_toast_compression','shared_buffers','fsync','synchronous_commit','autovacuum','wal_level','jit') order by name`)
  const dataset = await one(`select count(*)::int rows,count(distinct user_id)::int owners,
    count(*) filter(where jsonb_typeof(value)='object')::int objects,
    count(distinct (user_id,key)) filter(where jsonb_typeof(value)='object')::int object_keys,
    count(distinct (user_id,key,value)) filter(where jsonb_typeof(value)='object')::int unique_objects,
    avg(octet_length(result::text))::float8 mean_json, max(octet_length(result::text)) max_json,
    sum(octet_length(result::text)) logical_json_bytes, sum(pg_column_size(result)) source_jsonb_bytes
    from receipt_bench.source`)
  const { user_id: owner, book, receipt_count: purgeRows } = await one(`select user_id,split_part(key,'/',1) book,count(*)::int receipt_count
    from receipt_bench.source group by 1,2 order by receipt_count desc,1,2 limit 1`)
  const compression = await stageGzip()
  const results = Object.fromEntries(designs.map(design => [design.name, []]))
  for (let trial = 0; trial < trials; trial++) {
    for (const design of [...designs.slice(trial % designs.length), ...designs.slice(0, trial % designs.length)]) {
      process.stderr.write(`Trial ${trial + 1}/${trials} ${design.name}\n`)
      results[design.name].push(await run(design, owner, book, purgeRows))
    }
  }
  console.log(JSON.stringify({ postgres: (await one('select version()')).version, config, dataset, compression, results }, null, 2))
} finally {
  await db.close()
}
