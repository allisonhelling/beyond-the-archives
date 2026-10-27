// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { ao3TagUrl, parseTagResolution, retrieveTagResolution } from './tag-resolution'
import { tagResolutionHandler } from './tag-resolution-handler'
import type { TagResolution } from '../../src/features/library/tags/tag-resolution'
const canonical='Alya Césaire',alias='Alya (Miraculous Ladybug)'
const page=(name:string,body:string,category='Character')=>`<div id="main"><div class="tag home profile"><div class="primary"><h2 class="heading">${name}</h2></div><p>This tag belongs to the ${category} Category. ${body.includes('canonical')?'<a href="/faq/glossary#canonicaldef">canonical</a>':''}</p>${body}</div></div>`
const link=(name:string)=>`<a class="tag" href="${new URL(ao3TagUrl(name)).pathname}">${name}</a>`
it('verifies canonical identity/category and reads synonyms without including broader or child tags',()=>{
 const html=page(canonical,`canonical<div class="synonym listbox">${link(alias)}</div><div class="sub listbox">${link('Protective Alya')}</div><div class="meta listbox">${link('Miraculous Characters')}</div><div class="child listbox">${link('Related Character')}</div>`)
 expect(parseTagResolution(html,canonical,'character').map(r=>[r.name,r.status,r.canonical_name])).toEqual([[canonical,'canonical',canonical],[alias,'synonym',canonical]])
 expect(()=>parseTagResolution(html,'Alya','character')).toThrow('identity')
 expect(()=>parseTagResolution(html,canonical,'relationship')).toThrow('category')
 expect(()=>parseTagResolution('<h2>Checking your browser</h2>',canonical,'character')).toThrow('identity')
})
it('follows only the explicit merger and keeps unresolved custom tags separate',()=>{
 const html=page(alias,`<div class="merger module">${link(canonical)}</div>`)
 expect(parseTagResolution(html,alias,'character')).toMatchObject([{name:alias,status:'synonym',canonical_name:canonical},{name:canonical,status:'canonical'}])
 expect(parseTagResolution(page('Custom','<p>This tag has not been marked common and cannot be filtered.</p>'),'Custom','character')).toMatchObject([{status:'custom',canonical_name:null}])
 expect(()=>parseTagResolution(page(alias,`<div class="merger"><a class="tag" href="https://evil.test/tags/Alya">Alya</a></div>`),alias,'character')).toThrow('link')
})
it('uses AO3 tag escaping and the existing bounded retrieval without following redirects',async()=>{
 expect(ao3TagUrl('A/B & C.? #')).toContain('A*s*B%20*a*%20C*d**q*%20*h*')
 const fetcher=vi.fn(async()=>new Response(page(canonical,'canonical'),{headers:{'content-type':'text/html'}}))
 expect(await retrieveTagResolution(canonical,'character',fetcher)).toMatchObject({records:[{status:'canonical'}],failure:null})
 expect(fetcher.mock.calls).toHaveLength(1)
 const redirected=await retrieveTagResolution(canonical,'character',async()=>new Response(null,{status:302,headers:{location:'https://evil.test'}}))
 expect(redirected.records).toEqual([])
})
function fixture(){
 let cached:TagResolution[]=[]
 const deps={authenticate:vi.fn(async()=> 'alice'),cached:vi.fn(async()=>cached),store:vi.fn(async(_user:string,rows:TagResolution[])=>{cached=[...cached,...rows]}),reserve:vi.fn(async()=>true),pause:vi.fn(async()=>{}),retrieve:vi.fn(async()=>({records:parseTagResolution(page(canonical,'canonical'),canonical,'character'),failure:null})),now:()=>Date.now()}
 const handler=tagResolutionHandler(deps)
 const request=(body:unknown,token='session')=>handler(new Request('https://library.test',{method:'POST',headers:{authorization:`Bearer ${token}`},body:JSON.stringify(body)}))
 return{deps,request}
}
it('authenticates cache access, processes only one missing tag per request, and serves cached evidence without retrieval',async()=>{
 const {deps,request}=fixture()
 const first=await request({category:'character',names:[canonical,alias]})
 expect(first.status).toBe(200);expect(deps.retrieve).toHaveBeenCalledExactlyOnceWith(canonical,'character')
 expect(await first.json()).toMatchObject({retryAfterMs:35000})
 await request({category:'character',names:[canonical]})
 expect(deps.retrieve).toHaveBeenCalledTimes(1)
 deps.authenticate.mockResolvedValue(null as unknown as string)
 expect((await request({category:'character',names:[canonical]})).status).toBe(401)
 expect(deps.cached).toHaveBeenCalledTimes(3)
})
it('yields to metadata retrieval, rejects malformed batches and preserves unknown classification on unavailable pages',async()=>{
 const {deps,request}=fixture();deps.reserve.mockResolvedValue(false)
 expect(await(await request({category:'character',names:[canonical]})).json()).toMatchObject({records:[],retryAfterMs:35000})
 expect(deps.retrieve).not.toHaveBeenCalled()
 expect((await request({category:'personal',names:[canonical]})).status).toBe(400)
 expect((await request({category:'character',names:Array(9).fill(canonical)})).status).toBe(400)
 deps.reserve.mockResolvedValue(true);deps.retrieve.mockResolvedValue({records:[],failure:null})
 await request({category:'character',names:[canonical]})
 expect(deps.store).toHaveBeenCalledWith('alice',expect.arrayContaining([expect.objectContaining({status:'unverified',canonical_name:null})]))
})
