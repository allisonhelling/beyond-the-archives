import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'
import { createTestDatabase } from '../../scripts/test-database.mjs'
import { designs, purgePredicate, tableDDL } from './designs.mjs'

const db = await createTestDatabase({ beforeMigration: '20261121000100_reader_hybrid_sync.sql' })
const query = async (sql, args) => (await db.query(sql, args)).rows
const one = async (sql, args) => (await query(sql, args))[0]
const admin = () => db.exec('reset role')
const actor = async owner => {
  await db.exec('reset role; set role authenticated')
  await query("select set_config('request.jwt.claim.sub',$1,false)", [owner])
}
const newOwner = async allowed => {
  const owner = randomUUID()
  await admin()
  await query('insert into auth.users(id,email_confirmed_at) values($1,case when $2::boolean then now() end)', [owner, allowed])
  return owner
}

function substitute(source, previous, replacement) {
  assert(source.includes(previous), `Production RPC shape changed: ${previous}`)
  return source.replace(previous, replacement)
}

async function cloneRpc(original, design) {
  const name = `receipt_bench.${design.name}`
  const functionName = `receipt_bench.apply_${design.name}`
  await db.exec(tableDDL(design))
  const hybrid = design.fallback < 100
  let definition = substitute(original, 'public.reader_cloud_apply(', `${functionName}(`)
  if (hybrid) definition = substitute(definition, 'declare owner_id', 'declare request_value jsonb := p_value; same_request boolean; owner_id')
  definition = substitute(definition,
    'select r.result into result from public.reader_cloud_receipts r where r.user_id = owner_id and r.id = p_id;',
    `select ${design.replay}${hybrid ? ", r.payload is not null or (r.key=p_key and r.input_hash=sha256(convert_to(p_value::text,'UTF8')))" : ''}
     into result${hybrid ? ',same_request' : ''} from ${name} r where r.user_id=owner_id and r.id=p_id;`)
  if (hybrid) definition = substitute(definition, 'if found then return result; end if;',
    "if found then if same_request is not true then raise exception 'Receipt request mismatch'; end if; return result; end if;")
  definition = substitute(definition,
    "delete from public.reader_cloud_receipts where user_id = owner_id and starts_with(reader_cloud_receipts.result->>'key',book_id || '/');",
    `delete from ${name} r where ${purgePredicate(design, 'book_id', 'owner_id', 'r')};`)
  definition = substitute(definition, 'insert into public.reader_cloud_receipts values(owner_id,p_id,result);',
    `insert into ${name}(user_id,id,${design.insert}) values(owner_id,p_id,${design.written});`)
  await db.exec(definition)
  await db.exec(`revoke all on function ${functionName}(uuid,text,jsonb,bigint) from public,anon;
    grant execute on function ${functionName}(uuid,text,jsonb,bigint) to authenticated;`)
  return functionName
}

async function exercise(functionName, receiptTable, hybrid = false) {
  const owner = await newOwner(true), other = await newOwner(true), denied = await newOwner(false)
  const book = 'a'.repeat(64), linked = 'b'.repeat(64), position = `${book}/position`
  const accepted = []
  const apply = async (key, value, base = 0, id = randomUUID()) => (
    await one(`select ${functionName}($1,$2,$3::jsonb,$4)::text reply`, [id,key,JSON.stringify(value),base])
  ).reply
  const save = async (key, value, base = 0, id = randomUUID()) => {
    const reply = await apply(key, value, base, id)
    accepted.push({ owner, id, key, reply })
    return { id, reply, value: JSON.parse(reply) }
  }
  await actor(owner)
  const first = await save(position, { chapter: 'a', textOffset: 20 })
  assert.equal(await apply(position, { chapter: 'a', textOffset: 20 }, 0, first.id), first.reply)
  const intervening = await save(position, { chapter: 'b', textOffset: 5 }, 1)
  assert.equal(JSON.parse(await apply(position, { chapter: 'c' }, 1)).conflict, true)
  const replay = await apply(position, { chapter: 'a', textOffset: 20 }, 0, first.id)
  assert.equal(replay, first.reply)
  // A newer local edit rebased on the old accepted revision still conflicts.
  assert.equal(JSON.parse(await apply(position, { chapter: 'new local' }, JSON.parse(replay).revision)).conflict, true)
  assert.equal(JSON.parse(intervening.reply).revision, 2)
  assert.equal((await one('select revision from public.reader_cloud_values where key=$1', [position])).revision, 2)
  if (hybrid) {
    await assert.rejects(apply(position, { chapter: 'reused UUID' }, 0, first.id), /Receipt request mismatch/)
    await assert.rejects(apply(`${book}/notes`, { chapter: 'a', textOffset: 20 }, 0, first.id), /Receipt request mismatch/)
  } else assert.equal(await apply(`${book}/notes`, 'another payload', 0, first.id), first.reply)

  await actor(other)
  const otherReply = await apply(position, { chapter: 'other' }, 0, first.id)
  assert.equal(JSON.parse(otherReply).value.chapter, 'other')
  await actor(denied)
  await assert.rejects(apply(position, 'denied', 0, first.id), /Reader cloud access/)
  await actor(owner)
  await assert.rejects(db.query(`select * from ${receiptTable}`), /permission denied/)
  assert.equal(await apply(position, { chapter: 'a', textOffset: 20 }, 2, first.id), first.reply)

  await save(`${book}/manifest`, { workId: '8001' })
  await save(`${book}/progress`, 7)
  await save(`${linked}/manifest`, { workId: '8001' })
  const normalized = await save(`${linked}/progress`, 0)
  assert.equal(normalized.value.value, 7)
  await save(`${linked}/progress`, 2, normalized.value.revision)
  assert.equal(await apply(`${linked}/progress`, 0, 0, normalized.id), normalized.reply)

  const deletionKey = `${book}/deleted`
  const deleted = await save(deletionKey, true)
  assert.equal(await apply(position, 'stale', 1), deleted.reply)
  await admin()
  const keyField = receiptTable.endsWith('baseline') || receiptTable.startsWith('public.') ? "result->>'key'" : 'key'
  assert.equal((await one(`select count(*)::int n from ${receiptTable} where user_id=$1 and starts_with(${keyField},$2)`, [owner, `${book}/`])).n, 1)
  await actor(owner)
  const restored = await save(deletionKey, false, deleted.value.revision)
  await save(`${book}/manifest`, { title: 'Restored' })
  const oldDeletionReplay = await apply(deletionKey, true, 0, deleted.id)
  assert.equal(oldDeletionReplay, deleted.reply, 'Exact replay preserves the old success')
  const currentMarker = await one('select value,revision from public.reader_cloud_values where key=$1', [deletionKey])
  assert.deepEqual(currentMarker, { value: false, revision: restored.value.revision })
  assert.equal(currentMarker.value === true && currentMarker.revision === JSON.parse(oldDeletionReplay).revision, false,
    'An old acknowledgement cannot authorize current-generation deletion')
  return accepted
}

try {
  await db.exec('create schema receipt_bench; grant usage on schema receipt_bench to authenticated;')
  const original = (await one("select pg_get_functiondef('public.reader_cloud_apply(uuid,text,jsonb,bigint)'::regprocedure) definition")).definition
  const corpus = await exercise('public.reader_cloud_apply', 'public.reader_cloud_receipts')
  console.log('PASS original RPC: exact replay, conflicts, normalization, owner isolation, purge, and historical deletion replay')
  for (const design of designs.filter(value => value.name !== 'gzip')) {
    await admin()
    const name = await cloneRpc(original, design)
    await exercise(name, `receipt_bench.${design.name}`, design.fallback < 100)
    console.log(`PASS ${design.name}: real RPC control flow with isolated receipt reads, writes, and deletes`)
  }
  await admin()
  const gzip = designs.find(value => value.name === 'gzip')
  await db.exec(tableDDL(gzip))
  for (const row of corpus) {
    await query('insert into receipt_bench.gzip(user_id,id,key,payload) values($1,$2,$3,$4)', [row.owner,row.id,row.key,gzipSync(row.reply)])
    const saved = await one('select payload from receipt_bench.gzip where user_id=$1 and id=$2', [row.owner,row.id])
    assert.equal(gunzipSync(saved.payload).toString('utf8'), row.reply)
  }
  const first = corpus[0], other = await newOwner(true)
  assert.equal(await one('select payload from receipt_bench.gzip where user_id=$1 and id=$2', [other,first.id]), undefined)
  await query('insert into receipt_bench.gzip(user_id,id,key,payload) values($1,$2,$3,$4)',
    [other,first.id,first.key,gzipSync(first.reply)])
  const book = first.key.split('/')[0]
  const purged = await db.query(`delete from receipt_bench.gzip where ${purgePredicate(gzip)}`, [first.owner, book])
  assert.equal(purged.affectedRows, corpus.filter(row => row.key.startsWith(book + '/')).length)
  assert((await one('select payload from receipt_bench.gzip where user_id=$1 and id=$2', [other,first.id])).payload)
  await actor(other)
  await assert.rejects(db.query('select * from receipt_bench.gzip'), /permission denied/)
  console.log('PASS gzip: exact PostgreSQL bytea round-trip for original RPC outcomes and owner-scoped lookups')
  console.log('EXPECTED existing gap: cached true deletion is replayed after restore. Generation validation is a separate protocol concern.')
} finally {
  await db.close()
}
