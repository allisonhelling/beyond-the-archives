// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { ao3TagUrl } from './tag-resolution'
import { parseFandomProfile, resolveFandomRequest, retrieveFandomProfile, type CachedFandomProfile, type FandomProfile } from './fandom-resolution'
import { tagResolutionHandler } from './tag-resolution-handler'
import { readFile } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import manifest from './fixtures/fandoms/manifest.json'

// Synthetic names, markup based on upstream show.html.erb + meta_tag_tree.
// These fixtures verify parser behavior, not live AO3 fandom relationships.
const link = (name: string) => `<a class="tag" href="${new URL(ao3TagUrl(name)).pathname}">${name}</a>`
const page = (body = '', name = 'Fixture Child', category = 'Fandom') => `<div id="main"><div class="tag home profile"><div class="primary header module"><h2 class="heading">${name}</h2></div><p>This tag belongs to the ${category} Category. <a href="/faq/glossary#canonicaldef">canonical</a></p>${body}</div></div>`
const meta = (body: string) => `<div class="meta listbox group"><h3 class="heading">Metatags:</h3><ul class="tags tree index">${body}</ul></div>`
it('reads only explicit direct metatags and canonical aliases, excluding media/parent/subtag lists',()=>{
 const html = page(`<div class="parent fandom listbox group">${link('Fixture Media')}</div><div class="synonym listbox group">${link('Fixture Alias')}</div>${meta(`<li>${link('Fixture Parent')}</li><li><ul class="tags tree index"><li>${link('Fixture Ancestor')}</li></ul></li>`)}<div class="sub listbox">${link('Fixture Child Of Child')}</div>`)
 expect(parseFandomProfile(html,'Fixture Child')).toMatchObject({canonical_name:'Fixture Child',aliases:['Fixture Alias'],metatag_names:['Fixture Parent'],hierarchy_state:'observed',hierarchy_complete:false})
})
it('does not manufacture complete ancestry from missing, empty or malformed sections',()=>{
 expect(parseFandomProfile(page(),'Fixture Child')).toMatchObject({hierarchy_state:'missing',hierarchy_complete:false})
 for (const body of [meta(''),meta('<li>No parent tags</li>'),meta(`<li><a class="tag" href="https://evil.test">Fixture Parent</a></li>`),meta(`<li>${link('Fixture Child')}</li>`),meta(`<li>${link('Fixture Parent')}</li>`).replace('Metatags:','Parent tags:'),meta(`<li>${link('Fixture Parent')}</li>`).repeat(2)]) {
  expect(parseFandomProfile(page(body),'Fixture Child')).toMatchObject({hierarchy_state:'malformed',hierarchy_complete:false,metatag_names:[]})
 }
})
it('rejects wrong identity/category/interstitials and treats synonym targets as awaiting their own profile',()=>{
 for (const html of [page('','Other'),page('','Fixture Child','Character'),'<h2>Checking your browser</h2>']) expect(()=>parseFandomProfile(html,'Fixture Child')).toThrow()
 const alias = page(`<div class="merger module">${link('Fixture Canonical')}</div>`)
 expect(parseFandomProfile(alias,'Fixture Child')).toMatchObject({status:'synonym',canonical_name:'Fixture Canonical',aliases:[],metatag_names:[],hierarchy_complete:false})
})
it('reuses bounded AO3 retrieval and fails conservatively on redirects, malformed profiles and rate limits',async()=>{
 const fetcher = vi.fn(async()=>new Response(page(),{headers:{'content-type':'text/html'}}))
 expect(await retrieveFandomProfile('Fixture Child',fetcher)).toMatchObject({profile:{status:'canonical',hierarchy_complete:false}})
 expect(fetcher).toHaveBeenCalledTimes(1)
 for (const response of [new Response(null,{status:302,headers:{location:'https://evil.test'}}),new Response('<h2>Unavailable</h2>',{headers:{'content-type':'text/html'}}),new Response('Limited',{status:429,headers:{'retry-after':'60'}})]) {
  expect((await retrieveFandomProfile('Fixture Child',async()=>response)).profile).toBeNull()
 }
})
function fixture() {
 let records: CachedFandomProfile[] = []
 const now = Date.parse('2026-11-11T12:00:00Z')
 const store = {
  cached:vi.fn(async(names:string[])=>records.filter(row=>names.includes(row.name))),
  store:vi.fn(async(profile:FandomProfile)=>{records=[...records.filter(row=>row.name!==profile.name),{...profile,attempted_at:new Date(now).toISOString(),checked_at:profile.status==='unverified'?null:new Date(now).toISOString(),disputed:false}]}),
  retrieve:vi.fn(async()=>({profile:parseFandomProfile(page(),'Fixture Child'),failure:null})),
 }
 const pacing = {reserve:vi.fn(async()=>true),pause:vi.fn(async()=>{})}
 return {store,pacing,now}
}
it('processes one profile, uses cached evidence, honors the ten-minute failure cooldown and yields to the global gate',async()=>{
 const {store,pacing,now} = fixture()
 expect(await resolveFandomRequest(['Fixture Child','Other'],store,pacing,now)).toMatchObject({retryAfterMs:35000})
 expect(store.retrieve).toHaveBeenCalledExactlyOnceWith('Fixture Child')
 expect(await resolveFandomRequest(['Fixture Child'],store,pacing,now)).toMatchObject({retryAfterMs:null})
 expect(store.retrieve).toHaveBeenCalledTimes(1)
 pacing.reserve.mockResolvedValue(false)
 await resolveFandomRequest(['Other'],store,pacing,now)
 expect(store.retrieve).toHaveBeenCalledTimes(1)
 pacing.reserve.mockResolvedValue(true)
 store.retrieve.mockResolvedValue({profile:null as unknown as FandomProfile,failure:null})
 await resolveFandomRequest(['Other'],store,pacing,now)
 await resolveFandomRequest(['Other'],store,pacing,now+9*60000)
 expect(store.retrieve).toHaveBeenCalledTimes(2)
 await resolveFandomRequest(['Other'],store,pacing,now+10*60000)
 expect(store.retrieve).toHaveBeenCalledTimes(3)
})
it('routes fandom mode through the existing authentication and bounded request validation',async()=>{
 const {store,pacing,now} = fixture()
 const authenticate = vi.fn(async()=> 'owner')
 const handler = tagResolutionHandler({authenticate,...pacing,fandom:store,cached:async()=>[],store:async()=>{},now:()=>now})
 const request = (body:object,auth=true)=>handler(new Request('https://library.test',{method:'POST',headers:auth?{authorization:'Bearer session'}:{},body:JSON.stringify(body)}))
 expect((await request({category:'fandom',names:['Fixture Child']},false)).status).toBe(401)
 expect(store.cached).not.toHaveBeenCalled()
 expect((await request({category:'fandom',names:Array(9).fill('Fixture Child')})).status).toBe(400)
 expect((await request({category:'fandom',names:['Fixture Child']})).status).toBe(200)
 expect(store.retrieve).toHaveBeenCalledTimes(1)
})
it('verifies canonical, synonym and direct-parent evidence against checksummed historical AO3 profiles',async()=>{
 const parsed = new Map<string,FandomProfile>()
 for (const fixture of manifest) {
  const bytes = gunzipSync(await readFile(new URL(`./fixtures/fandoms/${fixture.filename}`,import.meta.url)))
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(fixture.sha256)
  parsed.set(fixture.name,parseFandomProfile(bytes.toString('utf8'),fixture.name))
 }
 expect(parsed.get('Batman (Comics)')).toMatchObject({status:'canonical',profile_complete:true,hierarchy_complete:true,metatag_names:['Batman - All Media Types','DCU (Comics)']})
 expect(parsed.get('Batman - All Media Types')).toMatchObject({status:'canonical',profile_complete:true,hierarchy_complete:true,metatag_names:['DCU']})
 expect(parsed.get('Batman Universe')).toMatchObject({status:'synonym',canonical_name:'Batman - All Media Types'})
 expect(parsed.get('DCU')).toMatchObject({status:'canonical',profile_complete:true,hierarchy_complete:true,hierarchy_state:'verified_empty',metatag_names:[]})
})
it('accepts intentional omission only in a complete recognized profile and rejects repaired truncations and changed structure',async()=>{
 const html = gunzipSync(await readFile(new URL('./fixtures/fandoms/dcu-profile.html.gz',import.meta.url))).toString('utf8')
 for (const changed of [html.replace(/<\/html>\s*$/,''),html.slice(0,html.indexOf('<div id="footer"')),html.replace('class="parent fandom listbox group"','class="unexpected"'),html.replace('Parent tags (more general):','Parents:'),html.replace('class="tag home profile"','class="tag home profile"><div class="unexpected"><h3>Broader Tags</h3></div>')]) {
  try { expect(parseFandomProfile(changed,'DCU').hierarchy_complete).toBe(false) } catch (error) { expect(error).toBeInstanceOf(Error) }
 }
})
