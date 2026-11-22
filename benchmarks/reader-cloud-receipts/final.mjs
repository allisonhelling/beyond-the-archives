import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { createTestDatabase } from '../../scripts/test-database.mjs'

const printSql = process.argv[2] === '--sql'
const db = printSql ? undefined : await createTestDatabase()
const trials = Number(process.argv[printSql ? 3 : 2] ?? 3)
assert(Number.isInteger(trials) && trials > 0, 'Expected a positive trial count')
const query = async (sql, args) => (await db.query(sql, args)).rows
const one = async (sql, args) => (await query(sql, args))[0]

async function measure(sql) {
  const before = await one('select pg_current_wal_insert_lsn()::text as lsn')
  const start = performance.now()
  await db.exec(sql)
  const ms = performance.now() - start
  const after = await one('select pg_wal_lsn_diff(pg_current_wal_insert_lsn(),$1::pg_lsn)::float8 as wal', [before.lsn])
  return { ms, walBytes: after.wal }
}

function applyRange(from, to) {
  return `do $$ declare s record; base bigint; reply jsonb; begin
    for s in select * from receipt_bench.requests where n between ${from} and ${to} order by n loop
      perform set_config('request.jwt.claim.sub',s.user_id::text,true);
      select coalesce((select revision from public.reader_cloud_values where user_id=s.user_id and key=s.key),0) into base;
      reply:=public.reader_cloud_apply(s.id,s.key,s.value,base,0);
      if reply ? 'conflict' or reply ? 'stale' then raise exception 'Unexpected generated conflict'; end if;
      -- A TEMP log records input bases and hashes of replies only for replay verification.
      insert into probes values(s.n,base,sha256(convert_to(reply::text,'UTF8')));
    end loop;
  end $$;`
}

const replay = `do $$ declare s record; reply jsonb; begin
  for s in select r.*, p.base, p.digest from receipt_bench.requests r join probes p using(n)
    order by md5('replay:'||r.n) limit 512 loop
    perform set_config('request.jwt.claim.sub',s.user_id::text,true);
    reply:=public.reader_cloud_apply(s.id,s.key,s.value,s.base,0);
    if sha256(convert_to(reply::text,'UTF8'))<>s.digest then raise exception 'Historical reply changed'; end if;
  end loop;
end $$;`

// An explicit two-edition association per owner exercises real fallback writes.
// Use separate books from the generated primary cohort.
const normalize = `do $$ declare owner uuid; reply jsonb; first text:=repeat('a',64); second text:=repeat('b',64); begin
 for owner in select distinct user_id from receipt_bench.source loop
  perform set_config('request.jwt.claim.sub',owner::text,true);
  perform public.reader_cloud_apply(gen_random_uuid(),first||'/manifest','{"workId":"990001"}',0,0);
  perform public.reader_cloud_apply(gen_random_uuid(),first||'/progress','7',0,0);
  perform public.reader_cloud_apply(gen_random_uuid(),second||'/manifest','{"workId":"990001"}',0,0);
  reply:=public.reader_cloud_apply(gen_random_uuid(),second||'/progress','0',0,0);
  if reply->'value'<>'7' then raise exception 'Expected normalization'; end if;
 end loop;
end $$;`

const setup = `
    create view receipt_bench.requests as
      select n,user_id,id,case when key like '%/deleted' then replace(key,'/deleted','/synthetic-toggle') else key end as key,value
      from receipt_bench.source;
    insert into auth.users(id,email_confirmed_at) select distinct user_id,now() from receipt_bench.source;
    create temp table probes(n integer primary key,base bigint,digest bytea);`
const storageSql = `
      select pg_total_relation_size(c.oid) total, pg_relation_size(c.oid) heap, pg_indexes_size(c.oid) indexes,
        pg_total_relation_size(c.reltoastrelid) toast,pg_relation_size(c.reltoastrelid) toast_heap,
        pg_indexes_size(c.reltoastrelid) toast_indexes
      from pg_class c where c.oid='public.reader_cloud_receipts'::regclass`
const usageSql = `
      select count(*)::int receipts,count(r.accepted_value)::int fallback,
       coalesce(sum(octet_length(r.accepted_value::text)),0) fallback_bytes,
       sum(octet_length(coalesce(r.accepted_value,s.value,'7')::text)) accepted_bytes
      from public.reader_cloud_receipts r left join receipt_bench.requests s using(user_id,id)`
const cleanupSql = `do $$ declare owner uuid; begin
      select user_id into owner from receipt_bench.source order by user_id limit 1;
      perform set_config('request.jwt.claim.sub',owner::text,true);
      perform public.reader_cloud_apply(gen_random_uuid(),repeat('b',64)||'/deleted','true',0,0);
    end $$;`

// Emits SQL for a disposable native database with the complete migration chain.
if (printSql) {
  const timedSql = (label, sql) => `
    select clock_timestamp() as started, pg_current_wal_insert_lsn() as start_lsn \\gset
    ${sql}
    select json_build_object('phase','${label}','ms',extract(epoch from (clock_timestamp()-:'started'::timestamptz))*1000,
      'walBytes',pg_wal_lsn_diff(pg_current_wal_insert_lsn(),:'start_lsn'::pg_lsn));`
  console.log(`do $$ begin
    if current_setting('bta.disposable_receipt_benchmark',true) is distinct from 'yes' then
      raise exception 'Use an explicitly marked disposable local database';
    end if;
  end $$;`)
  console.log('create schema receipt_bench;')
  console.log(await readFile(new URL('./workload.sql', import.meta.url),'utf8'))
  console.log(setup)
  for (let i=0; i<trials; i++) {
    console.log("truncate public.reader_cloud_receipts,public.reader_cloud_values,probes;")
    console.log(normalize)
    console.log(timedSql('insert',applyRange(1,22817)))
    console.log(timedSql('update',applyRange(22818,23817)))
    console.log('analyze public.reader_cloud_receipts; analyze public.reader_cloud_values;')
    console.log(`select row_to_json(s) from (${storageSql}) s;`)
    console.log(`select row_to_json(s) from (${usageSql}) s;`)
    for (let pass=0;pass<4;pass++) console.log(timedSql('replay',replay))
    console.log(timedSql('retire',cleanupSql))
  }
} else {
  try {
    await db.exec('create schema receipt_bench')
    await db.exec(await readFile(new URL('./workload.sql', import.meta.url),'utf8'))
    await db.exec(setup)
    const results = []
    for (let i=0; i<trials; i++) {
      process.stderr.write(`Final RPC trial ${i+1}/${trials}\n`)
      await db.exec('truncate public.reader_cloud_receipts,public.reader_cloud_values,probes')
      await db.exec(normalize)
      const insert = await measure(applyRange(1,22817))
      const repeated = await measure(applyRange(22818,23817))
      await db.exec('analyze public.reader_cloud_receipts; analyze public.reader_cloud_values')
      const storage = await one(storageSql)
      const usage = await one(usageSql)
      assert.equal(usage.receipts,23865)
      assert.equal(usage.fallback,12)
      const lookup = []
      for (let pass=0;pass<4;pass++) lookup.push(await measure(replay))
      assert.equal((await one('select count(*)::int n from public.reader_cloud_receipts')).n,usage.receipts)
      const cleanup = await measure(cleanupSql)
      assert.equal((await one('select count(*)::int n from public.reader_cloud_receipts where redacted')).n,1)
      results.push({insert,repeated,lookup,cleanup,storage,usage})
    }
    console.log(JSON.stringify({postgres:(await one('select version()')).version,results},null,2))
  } finally { await db.close() }
}
