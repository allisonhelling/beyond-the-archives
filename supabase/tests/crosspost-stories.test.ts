// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Existing embedded PostgreSQL fixture.
import { createTestDatabase } from '../../scripts/test-database.mjs'
import { storyOrganization, type Story, type StoryOrganization } from '../../src/features/library/model'
import { automaticCollectionRules } from '../../src/features/library/collections/automatic-collections'
import { defaultReadingFilters } from '../../src/features/library/reading-search'
import type { StoryVersions } from '../../src/features/library/repository'

let db: PGlite
const alice = '5a000000-0000-4000-8000-000000000001'
const bob = '5a000000-0000-4000-8000-000000000002'
async function as<T>(user: string, action: () => Promise<T>) {
 await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user])
 await db.exec('set role authenticated')
 try { return await action() } finally { await db.exec('reset role; reset request.jwt.claim.sub') }
}
async function scalar<T>(sql: string, args: unknown[] = []) {
 return (await db.query<{ result: T }>(`select ${sql} as result`, args)).rows[0].result
}
function versions(id: string, search: string | null = null) {
 return scalar<StoryVersions>('public.story_versions($1,$2)', [id, search])
}
const blankOrganization: StoryOrganization = { notes: '', favorite: false, rating: null, tags: [], collections: [] }
function change(anchor: string, target: Story, action: string, revision: string, organization = blankOrganization) {
 return scalar<string>('public.write_story_versions($1,$2,$3,$4,$5,$6,$7)', [
  anchor, target.id, action, revision, target.updated_at, organization, action === 'link' ? storyOrganization(target) : null,
 ])
}
async function save(title: string, url: string, chapters: number, progress: number) {
 return scalar<string>('public.save_library_story_checked(null,$1,$2,null)', [url, {
  metadata: { title, authors: ['Same Author'], published_chapters: chapters, publication_status: 'in_progress', chapter_count_manual: true },
  status:'reading', progress, notes: url, rating: null, favorite: false, collections: [], tags: [],
 }])
}
beforeAll(async () => {
 db = await createTestDatabase()
 await db.query('insert into auth.users(id) values($1),($2)', [alice,bob])
}, 30000)
afterAll(async () => { await db?.close() })

it('reviews possible matches, keeps version data independent, and can unlink or relink', async () => {
 const foreign = await as(bob, () => save('Shared Name','https://outside.example/private',9,2))
 await as(alice, async () => {
  const ao3 = await save('Shared Name','https://archiveofourown.org/works/571230',15,8)
  const site = await save('Shared Name','https://fiction.example/story',20,3)
  expect(await versions(foreign)).toBeNull()
  const before = await versions(ao3)
  expect(before.versions.map(version => version.id)).toEqual([ao3])
  expect(before.candidates.map(version => version.id)).toEqual([site])
  const alternate = before.candidates[0]
  await expect(change(ao3, {...alternate, id: foreign}, 'link', before.revision)).rejects.toThrow()
  await expect(db.query("update public.library_entries set crosspost_group_id=gen_random_uuid(),crosspost_order=0 where id=$1", [site])).rejects.toThrow('permission denied')
  await change(ao3, alternate, 'link', before.revision)
  await expect(change(ao3, alternate, 'unlink', before.revision)).rejects.toThrow('Versions changed')
  const linked = await versions(ao3)
  expect(linked.versions.map(version => [version.id, version.last_read_chapter, version.sourceOrganization?.notes])).toEqual([
   [ao3,8,'https://archiveofourown.org/works/571230'],[site,3,'https://fiction.example/story'],
  ])
  expect(linked.versions.map(version => version.reading_history)).toEqual([before.versions[0].reading_history,alternate.reading_history])
  expect(linked.versions[0].work.ao3_work_id).toBe(571230)
  const page = await scalar<{ stories: Story[]; total: number }>("public.query_library('{\"mode\":\"library\",\"shelf\":\"all\",\"filters\":{}}',1,25)")
  expect(page.total).toBe(1)
  expect(page.stories.map(version => version.id)).toEqual([ao3])
  const navigation=await scalar<{all:{works:number}}>('public.library_navigation()')
  expect(navigation.all.works).toBe(1)
  await change(ao3, alternate, 'prefer', linked.revision)
  const preferred = await versions(site)
  expect(preferred.versions.map(version => version.id)).toEqual([site,ao3])
  const backup = await scalar<{ version: number; tables: Record<string, unknown> }>('public.export_library_backup()')
  expect(backup.version).toBe(3)
  expect(await scalar('public.preview_library_restore($1)', [backup])).toBeTruthy()
  await expect(scalar('public.preview_library_restore($1)', [{...backup,version:2}])).rejects.toThrow('version 3')
  await change(ao3, alternate, 'unlink', preferred.revision)
  const detached = await versions(ao3)
  expect(detached.versions.map(version => [version.id,version.crosspost_group_id])).toEqual([[ao3,null]])
  await change(ao3, detached.candidates[0], 'link', detached.revision)
  await db.query('delete from public.library_entries where id=$1',[ao3])
  expect((await versions(site)).versions[0]).toMatchObject({id:site,last_read_chapter:3,crosspost_group_id:null})
 })
})

it('transfers only a contiguous prefix of complete reviewed groups and invalidates changed indexes', async () => {
 const source = await as(alice, () => save('Original Edition','https://archiveofourown.org/works/571231',4,1))
 const target = await as(alice, () => save('Alternate Edition','https://archiveofourown.org/works/571232',4,0))
 await db.query("update public.works set verified_chapters=$1 where ao3_work_id=571231", [{1:'101',2:'102',3:'103',4:'104'}])
 await db.query("update public.works set verified_chapters=$1 where ao3_work_id=571232", [{1:'201',2:'202',3:'203',4:'204'}])
 const pair = [source,target].sort()
 const listed = () => scalar<unknown[]>('public.story_chapter_groups($1,$2)', pair)
 await as(alice, async () => {
  const captured = await scalar<StoryVersions>('public.story_versions($1,null,$2)', [source,['https://archiveofourown.org/works/571232']])
  expect(captured.candidates.map(edition=>edition.id)).toEqual([target])
  expect((await versions(source, '571232')).candidates).toEqual([])
  const found=await versions(source,'Alternate Edition')
  await change(source,found.candidates[0],'link',found.revision)
  const linked=await versions(source)
  const [left,right]=pair.map(id=>linked.versions.find(edition=>edition.id===id)!)
  const review=[left.work.verified_chapters,left.metadata.published_chapters,right.work.verified_chapters,right.metadata.published_chapters]
  const saveGroup=(id:string,version:number,sourceIds:string[],targetIds:string[],state:string) => scalar<boolean>(
   'public.write_story_chapter_group($1,$2,$3,$4,$5,$6,$7,$8)',
   [...pair,id,version,...(pair[0]===source ? [sourceIds,targetIds] : [targetIds,sourceIds]),state,review],
  )
  expect(await saveGroup('3a000000-0000-4000-8000-000000000001',0,['101','102'],['201'],'confirmed')).toBe(true)
  expect(await saveGroup('3a000000-0000-4000-8000-000000000002',0,['103'],['202','203'],'confirmed')).toBe(true)
  expect(await saveGroup('3a000000-0000-4000-8000-000000000003',0,['104'],['204'],'unknown')).toBe(true)
  await expect(saveGroup('3a000000-0000-4000-8000-000000000004',0,['101'],['204'],'confirmed')).rejects.toThrow('another group')
  await expect(saveGroup('3a000000-0000-4000-8000-000000000005',0,['201'],['101'],'confirmed')).rejects.toThrow('verified chapter')
  const progress=async (apply=false) => scalar<number>('public.mark_corresponding_chapters_read($1,$2,$3,$4,$5)', [
   source,target,(await versions(source)).revision,JSON.stringify(await listed()),apply,
  ])
  expect(await progress()).toBe(0)
  await db.query('update public.library_entries set last_read_chapter=2 where id=$1',[source])
  const historical=(await versions(target)).versions.find(version=>version.id===target)?.reading_history
  expect(await progress()).toBe(1)
  expect((await versions(target)).versions.find(version=>version.id===target)?.last_read_chapter).toBe(0)
  expect(await progress(true)).toBe(1)
  await db.query('update public.library_entries set last_read_chapter=4 where id=$1',[source])
  expect(await progress(true)).toBe(3)
  expect((await versions(target)).versions.find(version=>version.id===target)?.reading_history).toEqual(historical)
  expect(await saveGroup('3a000000-0000-4000-8000-000000000003',1,['104'],[],'unmatched')).toBe(true)
  expect(await saveGroup('3a000000-0000-4000-8000-000000000003',1,['104'],['204'],'confirmed')).toBe(false)
  expect(await progress(true)).toBe(3)
  const completion=()=>scalar<{status:string|null;override:string|null;prompt:string|null}>('public.story_completion($1)',[source])
  const firstReview=await completion()
  expect(firstReview.status).toBeNull()
  expect(firstReview.prompt).toMatch(/^[a-f0-9]{32}$/)
  await scalar('public.write_story_completion($1,$2,$3,$4)',[source,null,firstReview,firstReview.prompt])
  const dismissed=await completion()
  expect(dismissed).toEqual({status:null,override:null,prompt:null})
  await expect(scalar('public.write_story_completion($1,$2,$3,$4)',[source,'finished',firstReview,firstReview.prompt])).rejects.toThrow('review changed')
  await scalar('public.write_story_completion($1,$2,$3)',[source,'finished',dismissed])
  expect(await completion()).toEqual({status:'finished',override:'finished',prompt:null})
  await db.query("update public.library_entries set metadata_overrides=metadata_overrides||'{\"published_chapters\":5}' where id=$1",[target])
  expect(await completion()).toEqual({status:'finished',override:'finished',prompt:null})
  expect((await versions(target)).versions.find(version=>version.id===target)?.last_read_chapter).toBe(3)
  const backup=await scalar('public.export_library_backup()')
  expect(await scalar('public.preview_library_restore($1)',[backup])).toBeTruthy()
 })
 expect(await as(bob,listed)).toEqual([])
 await db.query("update public.works set verified_chapters=$1 where ao3_work_id=571231", [{1:'101',2:'125',3:'103',4:'104'}])
 await as(alice,async()=>{
  expect(await listed()).toEqual(expect.arrayContaining([expect.objectContaining({state:'confirmed',current:false})]))
  const status=await versions(source)
  await change(source,status.versions.find(version=>version.id===target)!,'unlink',status.revision)
  expect(await listed()).toEqual([])
 })
})

it('reconciles group-owned settings across versions, checked writes, filters, restore, and unlink', async () => {
 const sourceUrl = 'https://fiction.example/first-organization', targetUrl = 'https://fiction.example/second-organization'
 const foreign = await as(bob, () => save('Foreign Work', 'https://fiction.example/foreign-bulk', 7, 2))
 const backup = await as(alice, async () => {
  const source = await save('First Organization',sourceUrl,9,2)
  const target = await save('Second Organization',targetUrl,7,4)
  const { rows: [{ id: custom }, { id: extra }] } = await db.query<{id:string}>(
   "insert into public.collections(name) values ('Shared Picks'),('Extra Picks') returning id")
  await scalar('public.add_stories_to_collections($1,$2)', [[source],[custom]])
  await db.query("update public.collections set last_story_added_at=null where id=$1", [extra])
  await scalar('public.save_library_story_checked($1,$2,$3,$4)', [target,targetUrl,{
   tags: ['Version-only tag'],
  }, { tags: [] }])
  const sourceTagCreated = () => scalar<string>("(select created_at::text from public.library_entry_tags where library_entry_id=$1)",[target])
  const originalTagTime = await sourceTagCreated()
  const review = await versions(source,'Second Organization')
  const alternate = review.candidates[0]
  const organization = { ...blankOrganization, notes: 'Agreed shared note', rating: 4, favorite: true, tags: ['Across sources'], collections: [extra] }
  await expect(scalar('public.write_story_versions($1,$2,$3,$4,$5)', [source,target,'link',review.revision,alternate.updated_at])).rejects.toThrow('Review all shared')
  await change(source,alternate,'link',review.revision,organization)
  expect(await scalar("(select last_story_added_at is not null from public.collections where id=$1)",[extra])).toBe(true)
  const linked = await versions(source)
  const group = linked.versions[0].organizationGroup
  expect(group).toBeTruthy()
  expect(linked.versions.map(storyOrganization)).toEqual([organization,organization])
  expect(linked.versions[0].sourceOrganization?.collections).toEqual([custom])
  expect(linked.versions[1].sourceOrganization?.notes).toBe(targetUrl)
  const query = (shelf: string, filters = {}) => scalar<{total:number;stories:Story[]}>(
   'public.query_library($1,1,25)', [{ mode: 'library', shelf, filters }])
  expect((await query(custom)).total).toBe(0)
  expect((await query(extra)).stories.map(story => story.id)).toEqual([source])
  expect((await query('favorites',{ personalTags: 'Across sources' })).stories.map(story => story.id)).toEqual([source])
  await scalar('public.update_library_entry_checked($1,$2,$3)', [target, { notes: 'Updated shared note', rating: 5 }, { ...organization, organizationGroup: group }])
  await expect(scalar('public.update_library_entry_checked($1,$2,$3)', [source, { notes: 'Stale note' }, { ...organization, organizationGroup: group }])).rejects.toThrow('conflicting fields')
  const current = (await versions(target)).versions.find(story => story.id === target)!
  await scalar('public.save_library_story_checked($1,$2,$3,$4)', [target,targetUrl,{
   tags: ['Edited shared tag'], metadata: { title: 'Renamed Edition' },
  }, { ...storyOrganization(current), organizationGroup: group, metadata: current.metadata_overrides }])
  expect(await sourceTagCreated()).toBe(originalTagTime)
  await scalar('public.update_library_entry_checked($1,$2,$3)', [source, { notes: 'Legacy source note' }, { notes: sourceUrl }])
  await scalar('public.add_stories_to_collections($1,$2)', [[target,source],[custom]])
  const updated = await versions(source)
  expect(updated.versions.map(story => [story.notes,story.personal_rating,story.personalTags])).toEqual([
   ['Updated shared note',5,['Edited shared tag']],['Updated shared note',5,['Edited shared tag']],
  ])
  expect(updated.versions[0].sourceOrganization?.notes).toBe('Legacy source note')
  expect(updated.versions[1].metadata.title).toBe('Renamed Edition')
  expect(updated.versions.map(story => story.last_read_chapter)).toEqual([2,4])
  expect((await query(custom)).stories.map(story => story.id)).toEqual([source])
  const ordinary = await save('Separate Work', 'https://fiction.example/separate-bulk', 5, 1)
  await scalar('public.add_stories_to_collections($1,$2)', [[ordinary], [custom, extra]])
  await expect(scalar('public.remove_stories_from_collection($1,$2)', [[ordinary, foreign], custom])).rejects.toThrow('Choose available stories')
  expect((await query(custom)).total).toBe(2)
  const matches = await scalar<{id:string;organizationGroup:string|null}[]>('public.library_collection_work_ids($1)', [custom])
  expect(matches).toHaveLength(2)
  expect(matches).toEqual(expect.arrayContaining([{id:source,organizationGroup:group},{id:ordinary,organizationGroup:null}]))
  await scalar('public.remove_stories_from_collection($1,$2)', [[target, ordinary], custom])
  await scalar('public.remove_stories_from_collection($1,$2)', [[target, ordinary], custom])
  expect((await query(custom)).total).toBe(0)
  expect((await versions(source)).versions.map(story => story.collectionIds)).toEqual([[extra], [extra]])
  expect((await versions(source)).versions[0].sourceOrganization?.collections).toEqual([custom])
  expect((await versions(ordinary)).versions[0].collectionIds).toEqual([extra])
  await db.query('delete from public.library_entries where id=$1', [ordinary])
  await scalar('public.add_stories_to_collections($1,$2)', [[source], [custom]])
  await db.query('update public.collections set automatic_rules=$2 where id=$1',[extra,automaticCollectionRules({ ...defaultReadingFilters, within: 'Renamed Edition' })])
  expect((await versions(source)).versions[0].collectionIds).toEqual([custom])
  await db.query('update public.collections set automatic_rules=null where id=$1',[extra])
  expect((await versions(source)).versions[0].collectionIds).toEqual(expect.arrayContaining([custom,extra]))
  const backup = await scalar('public.export_library_backup()')
  expect(await scalar('public.preview_library_restore($1)', [backup])).toBeTruthy()
  await db.query('delete from public.collections where id=$1', [extra])
  expect((await versions(source)).versions[0].collectionIds).toEqual([custom])
  const beforeUnlink = await versions(source)
  await change(source,beforeUnlink.versions[1],'unlink',beforeUnlink.revision)
  expect((await versions(source)).versions[0]).toMatchObject({ notes: 'Legacy source note', collectionIds: [custom] })
  expect((await versions(target)).versions[0]).toMatchObject({ notes: targetUrl, personal_rating: null, collectionIds: [], personalTags: ['Version-only tag'] })
  expect(await scalar<number>('(select count(*)::integer from public.crosspost_organization)')).toBe(0)
  return backup
 })
 expect(await as(bob, () => scalar<number>('(select count(*)::integer from public.crosspost_organization)'))).toBe(0)
 const restored = '5a000000-0000-4000-8000-000000000003'
 await db.query('insert into auth.users(id) values($1)',[restored])
 const ids = await scalar<Record<string,string>>('public.restore_library_backup($1,$2,true)',[backup,restored])
 await as(restored, async () => {
  const id = await scalar<string>('(select id from public.library_entries where source_url=$1)',[sourceUrl])
  const result = await versions(id)
  expect(result.versions[0]).toMatchObject({ notes:'Updated shared note', personal_rating:5, personalTags:['Edited shared tag'] })
  expect(result.versions[0].collectionIds).toHaveLength(2)
  expect(result.versions[0].collectionIds.every(id => Object.values(ids).includes(id))).toBe(true)
  expect(result.versions[0].sourceOrganization?.notes).toBe('Legacy source note')
 })
})

it('requires an explicit review before adopting shared settings for an older linked group', async () => {
 const [source,target] = await as(alice, async () => [
  await save('Legacy First Edition','https://fiction.example/legacy-first',5,0),
  await save('Legacy Alternate Edition','https://fiction.example/legacy-second',6,2),
 ])
 await db.query('update public.library_entries set crosspost_group_id=$1,crosspost_order=case when id=$2 then 0 else 1 end where id in ($2,$3)', [
  '5a000000-0000-4000-8000-000000000008',source,target,
 ])
 await as(alice, async () => {
  const older = await versions(source)
  expect(older.versions[0].organizationGroup).toBeUndefined()
  expect(older.versions[0].notes).toBe('https://fiction.example/legacy-first')
  await change(source,older.versions[0],'reconcile',older.revision,{ ...blankOrganization, notes:'Reviewed legacy group' })
  const reviewed = await versions(target)
  expect(reviewed.versions.map(version => version.notes)).toEqual(['Reviewed legacy group','Reviewed legacy group'])
  expect(reviewed.versions[1].sourceOrganization?.notes).toBe('https://fiction.example/legacy-second')
 })
})
