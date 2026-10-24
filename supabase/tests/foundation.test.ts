// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error JS harness is shared with the standalone type generator.
import { createTestDatabase } from '../../scripts/test-database.mjs'

let db: PGlite
const alice = '10000000-0000-0000-0000-000000000001'
const bob = '10000000-0000-0000-0000-000000000002'
const id = (prefix: number, n = 1) => `${prefix}0000000-0000-0000-0000-00000000000${n}`
const tables = ['works', 'library_entries', 'authors', 'work_authors', 'fandoms', 'work_fandoms', 'tags', 'work_tags', 'collections', 'collection_works', 'personal_tags', 'library_entry_tags']
const privateTables = ['library_entries', 'collections', 'collection_works', 'personal_tags', 'library_entry_tags']
const sharedTables = tables.filter(t => !privateTables.includes(t))

async function asUser(user: string, action: () => Promise<void>) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${user}';`)
  try { await action() } finally { await db.exec("reset role; reset request.jwt.claim.sub;") }
}

beforeAll(async () => {
  db = await createTestDatabase()
  await db.exec(`insert into auth.users values ('${alice}'), ('${bob}'); delete from public.collections;`)
  for (const [n, user] of [[1, alice], [2, bob]] as const) {
    await db.exec(`
      insert into public.works(id, ao3_work_id, title) values ('${id(2, n)}', ${n}, 'Work ${n}');
      insert into public.library_entries(id, user_id, work_id, original_url, notes) values ('${id(3, n)}','${user}','${id(2, n)}','https://archiveofourown.org/works/${n}/chapters/987?view_adult=true','Private ${n}');
      insert into public.authors(id, name) values ('${id(4, n)}', 'Author ${n}');
      insert into public.work_authors values ('${id(2, n)}','${id(4, n)}');
      insert into public.fandoms(id, name) values ('${id(5, n)}', 'Fandom ${n}');
      insert into public.work_fandoms values ('${id(2, n)}','${id(5, n)}');
      insert into public.tags(id, name) values ('${id(6, n)}', 'Tag ${n}');
      insert into public.work_tags values ('${id(2, n)}','${id(6, n)}');
      insert into public.collections(id,user_id,name) values ('${id(7, n)}','${user}','Shelf ${n}');
      insert into public.collection_works(user_id, collection_id, library_entry_id) values ('${user}','${id(7, n)}','${id(3, n)}');
      insert into public.personal_tags(id,user_id,name) values ('${id(8, n)}','${user}','Personal ${n}');
      insert into public.library_entry_tags values ('${user}','${id(3, n)}','${id(8, n)}',now());
    `)
  }
}, 30000)
afterAll(async () => { await db?.close() })

describe('migration structure', () => {
  it('creates the core and import tables with forced RLS and private read policies', async () => {
    const result = await db.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(`select relname, relrowsecurity, relforcerowsecurity from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='public' and relkind='r'`)
    expect(result.rows.map(r => r.relname).sort()).toEqual([...tables, 'library_series', 'collection_series', 'import_batches', 'import_items', 'metadata_jobs', 'metadata_preferences', 'processing_logs', 'reading_records', 'metadata_worker_state', 'backup_save_state', 'metadata_queue_turns', 'library_search_documents', 'userscript_devices'].sort())
    expect(result.rows.every(r => r.relrowsecurity && r.relforcerowsecurity)).toBe(true)
    const policies = await db.query<{ tablename: string }>("select tablename from pg_policies where schemaname='public'")
    expect(policies.rows.map(r => r.tablename).sort()).toEqual([...tables, 'library_series', 'collection_series', 'import_batches', 'import_items', 'metadata_jobs', 'metadata_preferences', 'processing_logs', 'reading_records', 'library_search_documents'].sort())
  })
})

describe('collection appearance', () => {
  it('atomically saves custom order and rejects foreign, default, duplicate, or incomplete lists', async () => {
    await asUser(alice, async () => {
      await db.exec(`insert into public.collections(id,user_id,name,default_key) values ('${id(7, 3)}','${alice}','Second custom',null), ('${id(7, 4)}','${alice}','Default shelf','favorites')`)
      try {
        await db.query('select public.reorder_collections($1::uuid[])', [[id(7, 3), id(7)]])
        const order = () => db.query<{ id: string }>('select id from public.collections where default_key is null order by sort_position')
        expect((await order()).rows.map(row => row.id)).toEqual([id(7, 3), id(7)])
        for (const ids of [[id(7)], [id(7), id(7)], [id(7), id(7, 2)], [id(7), id(7, 4)]]) {
          await expect(db.query('select public.reorder_collections($1::uuid[])', [ids])).rejects.toThrow('Collections changed')
          expect((await order()).rows.map(row => row.id)).toEqual([id(7, 3), id(7)])
        }
      } finally {
        await db.exec(`delete from public.collections where id in ('${id(7, 3)}','${id(7, 4)}'); update public.collections set sort_position = null;`)
      }
    })
    await asUser(bob, async () => {
      expect((await db.query('select sort_position from public.collections')).rows).toEqual([{ sort_position: null }])
    })
  })
  it('persists private colors and symbols, and rejects invalid values', async () => {
    await asUser(alice, async () => {
      await db.query(`update public.collections set color = '#123456', symbol = 'moon' where id = $1`, [id(7)])
      const result = await db.query(`select color, symbol from public.collections where id = $1`, [id(7)])
      expect(result.rows[0]).toMatchObject({ color: '#123456', symbol: 'moon' })
      await expect(db.query(`update public.collections set color = 'red' where id = $1`, [id(7)])).rejects.toThrow(/check constraint/)
      await expect(db.query(`update public.collections set symbol = 'unknown' where id = $1`, [id(7)])).rejects.toThrow(/check constraint/)
    })
    await asUser(bob, async () => {
      expect((await db.query(`select * from public.collections where id = $1`, [id(7)])).rows).toHaveLength(0)
    })
  })
})

describe('anonymous access', () => {
  for (const table of tables) {
    it(`rejects anonymous SELECT and DELETE on ${table}`, async () => {
      await db.exec('set role anon')
      try {
        await expect(db.query<Record<string, unknown>>(`select * from public.${table}`)).rejects.toThrow(/permission denied/)
        await expect(db.query<Record<string, unknown>>(`delete from public.${table}`)).rejects.toThrow(/permission denied/)
      } finally { await db.exec('reset role') }
    })
  }
  it('rejects an authenticated role with no user claim', async () => {
    await db.exec('set role authenticated')
    try {
      for (const table of tables) expect((await db.query<Record<string, unknown>>(`select * from public.${table}`)).rows).toHaveLength(0)
    } finally { await db.exec('reset role') }
  })
})

describe('cross-account isolation', () => {
  for (const table of tables) {
    it(`restricts ${table} reads to metadata or personal records in the caller's library`, async () => {
      await asUser(alice, async () => {
        const { rows } = await db.query<Record<string, unknown>>(`select * from public.${table}`)
        expect(rows).toHaveLength(1)
        expect(JSON.stringify(rows)).not.toContain('Private 2')
        expect(JSON.stringify(rows)).not.toContain('Work 2')
      })
    })
  }
  for (const table of privateTables) {
    it(`prevents modifying, deleting, or claiming another user's ${table}`, async () => {
      await asUser(alice, async () => {
        const field = table === 'library_entries' ? "notes = 'stolen'" : table === 'collections' || table === 'personal_tags' ? "name = 'stolen'" : 'created_at = now()'
        expect((await db.query<Record<string, unknown>>(`update public.${table} set ${field} where user_id='${bob}' returning *`)).rows).toHaveLength(0)
        expect((await db.query<Record<string, unknown>>(`delete from public.${table} where user_id='${bob}' returning *`)).rows).toHaveLength(0)
        await expect(db.query<Record<string, unknown>>(`update public.${table} set user_id='${bob}' where user_id='${alice}'`)).rejects.toThrow(/row-level security|permission denied/)
      })
    })
  }
  for (const table of sharedTables) {
    it(`prevents browser metadata changes to ${table}`, async () => {
      await asUser(alice, async () => {
        await expect(db.query<Record<string, unknown>>(`delete from public.${table}`)).rejects.toThrow(/permission denied/)
        await expect(db.query<Record<string, unknown>>(`insert into public.${table} default values`)).rejects.toThrow(/permission denied/)
        const field = table.startsWith('work_') ? 'work_id = work_id' : 'updated_at = now()'
        await expect(db.query<Record<string, unknown>>(`update public.${table} set ${field}`)).rejects.toThrow(/permission denied/)
      })
    })
  }
  it('blocks claiming a guessed work ID to reveal another library', async () => {
    await asUser(alice, async () => {
      await expect(db.query<Record<string, unknown>>(`insert into public.library_entries(user_id,work_id,original_url) values ('${alice}','${id(2, 2)}','test')`)).rejects.toThrow(/permission denied/)
      await expect(db.query<Record<string, unknown>>(`update public.library_entries set work_id='${id(2, 2)}'`)).rejects.toThrow(/permission denied/)
    })
  })
  it('rejects forged owners on private inserts', async () => {
    await asUser(alice, async () => {
      for (const table of ['collections', 'personal_tags']) {
        await expect(db.query<Record<string, unknown>>(`insert into public.${table}(user_id,name) values ('${bob}','forged')`)).rejects.toThrow(/row-level security/)
      }
      await expect(db.query<Record<string, unknown>>(`insert into public.collection_works(user_id,collection_id,library_entry_id) values ('${bob}','${id(7, 2)}','${id(3, 2)}')`)).rejects.toThrow(/row-level security/)
      await expect(db.query<Record<string, unknown>>(`insert into public.library_entry_tags(user_id,personal_tag_id,library_entry_id) values ('${bob}','${id(8, 2)}','${id(3, 2)}')`)).rejects.toThrow(/row-level security/)
    })
  })
  it('rejects cross-owner membership even when the submitted owner is the caller', async () => {
    await asUser(alice, async () => {
      for (const [shelf, entry] of [[1, 2], [2, 1]]) {
        await expect(db.query<Record<string, unknown>>(`insert into public.collection_works(user_id,collection_id,library_entry_id) values ('${alice}','${id(7, shelf)}','${id(3, entry)}')`)).rejects.toThrow(/foreign key/)
      }
      for (const [tag, entry] of [[1, 2], [2, 1]]) {
        await expect(db.query<Record<string, unknown>>(`insert into public.library_entry_tags(user_id,personal_tag_id,library_entry_id) values ('${alice}','${id(8, tag)}','${id(3, entry)}')`)).rejects.toThrow(/foreign key/)
      }
    })
  })
})

describe('foundation integrity', () => {
  it('preserves unknown chapters and publication status as NULL', async () => {
    const { rows } = await db.query<Record<string, unknown>>(`select total_chapters,published_chapters,is_complete,canonical_url from public.works where ao3_work_id=1`)
    expect(rows[0]).toEqual({ total_chapters: null, published_chapters: null, is_complete: null, canonical_url: null })
    await expect(db.query<Record<string, unknown>>('insert into public.works(ao3_work_id,total_chapters) values (90,0)')).rejects.toThrow(/check constraint/)
  })
  it('requires unique AO3 identities and one entry per user and work', async () => {
    await expect(db.query<Record<string, unknown>>('insert into public.works(ao3_work_id) values (1)')).rejects.toThrow(/unique constraint/)
    await expect(db.query<Record<string, unknown>>(`insert into public.library_entries(user_id,work_id,original_url) values ('${alice}','${id(2)}','test')`)).rejects.toThrow(/unique constraint/)
  })
  it('keeps submitted URLs unchanged when the verified canonical URL is set', async () => {
    await db.exec(`update public.works set canonical_url='https://archiveofourown.org/works/1',canonical_verified_at=now() where ao3_work_id=1`)
    const { rows } = await db.query<Record<string, unknown>>(`select original_url from public.library_entries where id='${id(3)}'`)
    expect(String(rows[0].original_url)).toContain('/chapters/987?view_adult=true')
    await expect(db.query<Record<string, unknown>>("update public.works set canonical_url='https://example.com' where ao3_work_id=1")).rejects.toThrow(/check constraint/)
    await expect(db.query<Record<string, unknown>>("update public.works set canonical_url=null,canonical_verified_at=now() where ao3_work_id=1")).rejects.toThrow(/check constraint/)
    await asUser(alice, async () => {
      await expect(db.query<Record<string, unknown>>(`update public.library_entries set original_url='changed'`)).rejects.toThrow(/permission denied/)
    })
  })
  it('updates private overrides without modifying shared metadata or the other account', async () => {
    await asUser(alice, async () => {
      await db.query<Record<string, unknown>>(`update public.library_entries set metadata_overrides='{"title":"My title"}',notes='My private note',last_read_chapter=8 where id='${id(3)}'`)
      await expect(db.query<Record<string, unknown>>(`update public.library_entries set last_read_chapter=-1`)).rejects.toThrow(/check constraint/)
      await expect(db.query<Record<string, unknown>>(`update public.library_entries set personal_rating=6`)).rejects.toThrow(/check constraint/)
    })
    const { rows } = await db.query<Record<string, unknown>>(`select w.title,e.reading_status,e.last_read_chapter,e.metadata_overrides from public.works w join public.library_entries e on e.work_id=w.id where e.id='${id(3)}'`)
    expect(rows[0]).toEqual({ title: 'Work 1', reading_status: 'to_read', last_read_chapter: 8, metadata_overrides: { title: 'My title' } })
    expect((await db.query<Record<string, unknown>>(`select notes from public.library_entries where user_id='${bob}'`)).rows[0]?.notes).toBe('Private 2')
  })
  it('allows owners to manage their own shelves and tags, including memberships', async () => {
    await asUser(alice, async () => {
      const shelf = await db.query<{ id: string }>("insert into public.collections(name) values ('New shelf') returning id")
      const tag = await db.query<{ id: string }>("insert into public.personal_tags(name) values ('New tag') returning id")
      await db.query<Record<string, unknown>>(`insert into public.collection_works(collection_id,library_entry_id) values ($1,$2)`, [shelf.rows[0].id, id(3)])
      await db.query<Record<string, unknown>>(`insert into public.library_entry_tags(personal_tag_id,library_entry_id) values ($1,$2)`, [tag.rows[0].id, id(3)])
      await db.query<Record<string, unknown>>('delete from public.collections where id=$1', [shelf.rows[0].id])
      await db.query<Record<string, unknown>>('delete from public.personal_tags where id=$1', [tag.rows[0].id])
    })
  })
  it('retains personal completion independently of AO3 completion', async () => {
    await db.exec(`update public.works set is_complete=true where ao3_work_id=1`)
    expect((await db.query<Record<string, unknown>>(`select reading_status from public.library_entries where id='${id(3)}'`)).rows[0]?.reading_status).toBe('to_read')
  })
  it('shares canonical identity while keeping each account’s overrides and notes private', async () => {
    const entry = await db.query<{ id: string }>(`insert into public.library_entries(user_id,work_id,original_url,notes,metadata_overrides) values ('${bob}','${id(2)}','https://archiveofourown.org/works/1','Bob shared work','{"title":"Bob title"}') returning id`)
    try {
      await asUser(bob, async () => {
        const result = await db.query<{ notes: string; metadata_overrides: unknown }>(`select notes,metadata_overrides from public.library_entries where work_id='${id(2)}'`)
        expect(result.rows).toEqual([{ notes: 'Bob shared work', metadata_overrides: { title: 'Bob title' } }])
        expect((await db.query(`select id from public.works where id='${id(2)}'`)).rows).toHaveLength(1)
      })
      await asUser(alice, async () => {
        const result = await db.query<{ notes: string; metadata_overrides: unknown }>(`select notes,metadata_overrides from public.library_entries where work_id='${id(2)}'`)
        expect(result.rows).toEqual([{ notes: 'My private note', metadata_overrides: { title: 'My title' } }])
      })
    } finally { await db.query('delete from public.library_entries where id=$1', [entry.rows[0].id]) }
  })
  it('uses timestamptz for every timestamp', async () => {
    const { rows } = await db.query<{ data_type: string }>("select data_type from information_schema.columns where table_schema='public' and column_name like '%_at'")
    expect(rows.length).toBeGreaterThan(10)
    expect(rows.every(r => r.data_type === 'timestamp with time zone')).toBe(true)
  })
  it('allows the trusted server role to create metadata without a browser session', async () => {
    await db.exec('set role service_role')
    try { await db.exec('insert into public.works(ao3_work_id) values (999)') }
    finally { await db.exec('reset role') }
  })
  it('cascades account deletion through private records but preserves shared work identity', async () => {
    await db.exec(`delete from auth.users where id='${bob}'`)
    for (const table of privateTables) expect((await db.query<Record<string, unknown>>(`select * from public.${table} where user_id='${bob}'`)).rows).toHaveLength(0)
    expect((await db.query<Record<string, unknown>>('select * from public.works where ao3_work_id=2')).rows).toHaveLength(1)
  })
})

it('persists private one-shot corrections, validates their type, and restores automatic detection', async () => {
  let entry = ''
  await asUser(alice, async () => {
    const result = await db.query<{ id: string }>("select public.save_library_story('https://archiveofourown.org/works/803', '{\"title\":\"With art\",\"one_shot\":true,\"published_chapters\":3,\"total_chapters\":3}'::jsonb, 'to_read', 0, '', null, false, '{}'::uuid[], '{}'::text[]) as id")
    entry = result.rows[0].id
    expect((await db.query<{ metadata_overrides: object }>('select metadata_overrides from public.library_entries where id=$1', [entry])).rows[0].metadata_overrides).toMatchObject({ one_shot: true })
  })
  // Browser metadata refreshes merge under private corrections.
  await db.query("update public.library_entries set extension_metadata='{\"published_chapters\":4}' where id=$1", [entry])
  await asUser(alice, async () => {
    expect((await db.query<{ metadata_overrides: object }>('select metadata_overrides from public.library_entries where id=$1', [entry])).rows[0].metadata_overrides).toMatchObject({ one_shot: true })
    await expect(db.query("update public.library_entries set metadata_overrides=jsonb_set(metadata_overrides,'{one_shot}','\"yes\"') where id=$1", [entry])).rejects.toThrow(/boolean one-shot/)
    await db.query("update public.library_entries set metadata_overrides=jsonb_set(metadata_overrides,'{one_shot}','false') where id=$1", [entry])
    await db.query("select public.clear_metadata_override($1,'one_shot')", [entry])
    expect((await db.query<{ metadata_overrides: object }>('select metadata_overrides from public.library_entries where id=$1', [entry])).rows[0].metadata_overrides).not.toHaveProperty('one_shot')
  })
})
