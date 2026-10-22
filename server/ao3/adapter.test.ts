// @vitest-environment node
import { readFileSync } from 'node:fs'
import { expect, it, vi } from 'vitest'
import { failure, parseMetadata, retrieveMetadata } from './adapter'
import { validateMetadata } from './metadata-service'
import { runWorkerOnce } from './worker'
const fixture=(name:string)=>readFileSync(new URL(`./fixtures/${name}.html`,import.meta.url),'utf8')
const parse=(name='work')=>parseMetadata(fixture(name),123,'https://archiveofourown.org/works/123')
it('extracts authors, categorized tags, fandoms, dates, series and unknown totals from a saved fixture',()=>{
 const result=validateMetadata(parse())
 expect(result.metadata).toMatchObject({title:'A & B',additional_tags:['Zulu tag','Adventure','Middle tag'],authors:['One','Two'],author_links:{One:'https://archiveofourown.org/users/One/pseuds/One'},fandoms:['Fandom One','Fandom Two'],relationship_tags:['A/B'],archive_warnings:['No Archive Warnings Apply'],word_count:12345,published_chapters:6,is_complete:false,ao3_updated_at:'2024-02-02T00:00:00Z',series_memberships:[{id:77,position:2}]})
 expect(result.metadata?.total_chapters).toBeUndefined();expect(result.chapters['6']).toBe('960');expect(result.chapters['2']).toBe('920')
})
it('preserves missing fields as absent and fails safely on changed HTML or identity',()=>{
 expect(parse('partial')).toMatchObject({category:'partial',metadata:{title:'Partial title'}})
 expect(parseMetadata('<h2>Changed title</h2>',123,'https://archiveofourown.org/works/123')).toMatchObject({category:'parser_failure',metadata:null})
 expect(parseMetadata(fixture('work'),999,'https://archiveofourown.org/works/999').metadata).toBeNull()
 expect(parse('restricted').category).toBe('restricted')
})
it.each([
 ['<p>First paragraph.</p><p>Second paragraph.</p>', 'First paragraph.\n\nSecond paragraph.'],
 ['<p>First line.<br>Second line.<br /><br>After a blank line.</p>', 'First line.\nSecond line.\n\nAfter a blank line.'],
 ['\n  <p>Some <em>emphasized</em>\n    text &amp; <strong>more</strong>.</p>\n  <p>Next paragraph.</p>\n', 'Some emphasized text & more.\n\nNext paragraph.'],
 ['An introduction.<div>Another block.<br>Another line.</div>A conclusion.', 'An introduction.\n\nAnother block.\nAnother line.\n\nA conclusion.'],
 ['<p>&lt;script&gt; remains text.</p><script>unwanted()</script><style>p { color: red }</style>', '<script> remains text.'],
])('preserves summary paragraph and line boundaries from %s', (html, expected) => {
 const page = fixture('work').replace('<p>A summary &amp; more.</p>', html)
 const result = validateMetadata(parseMetadata(page, 123, 'https://archiveofourown.org/works/123'))
 expect(result.metadata?.summary).toBe(expected)
})
it('validates unsafe adapter values and ambiguous chapter maps without destroying data',()=>{
 const result=parse();result.metadata!.rating='bad';result.metadata!.word_count=-1;result.chapters={'1':'100','2':'100'}
 const safe=validateMetadata(result);expect(safe.metadata?.rating).toBeUndefined();expect(safe.metadata?.word_count).toBeUndefined();expect(safe.chapters).toEqual({})
})
it.each([[404,'unavailable',false],[410,'unavailable',false],[401,'restricted',false],[403,'blocked',true],[429,'rate_limited',true],[503,'temporary_unavailable',true]] as const)('classifies HTTP %s without live requests',async(status,category,retryable)=>{
 const request=vi.fn<typeof fetch>().mockResolvedValue(new Response('',{status,headers:{'retry-after':'7200'}}))
 const result=await retrieveMetadata({workId:123,normalizedUrl:'https://archiveofourown.org/works/123'},request)
 expect(result).toMatchObject({category,retryable,metadata:null});expect(request).toHaveBeenCalledTimes(1)
})
it('never follows an offsite, login or changed-identity redirect',async()=>{
 for(const location of ['https://evil.test/works/123','/users/login','/works/456']) {
  const request=vi.fn<typeof fetch>().mockResolvedValue(new Response('',{status:302,headers:{location}}))
  expect((await retrieveMetadata({workId:123,normalizedUrl:'https://archiveofourown.org/works/123'},request)).metadata).toBeNull();expect(request).toHaveBeenCalledTimes(1)
 }
})
it('handles timeout, oversized pages, challenges, wrong MIME and empty bodies',async()=>{
 const request=vi.fn<typeof fetch>().mockRejectedValue(new DOMException('Timeout','TimeoutError'))
 expect((await retrieveMetadata({workId:123,normalizedUrl:'https://archiveofourown.org/works/123'},request)).category).toBe('timeout')
 for(const [body,type,category] of [['x'.repeat(4000001),'text/html','parser_failure'],['captcha','text/html','blocked'],['{}','application/json','parser_failure']] as const) {
  const result=await retrieveMetadata({workId:123,normalizedUrl:'https://archiveofourown.org/works/123'},vi.fn<typeof fetch>().mockResolvedValue(new Response(body,{headers:{'content-type':type}})))
  expect(result.category).toBe(category)
 }
})
it('bounds a worker execution to one claim and one result commit',async()=>{
 const claim=vi.fn().mockResolvedValue({id:'j',token:'t',workId:123,attempt:1}),finish=vi.fn().mockResolvedValue(true),retrieve=vi.fn().mockResolvedValue(parse())
 expect(await runWorkerOnce({claim,finish},retrieve)).toEqual({claimed:true,committed:true});expect(claim).toHaveBeenCalledTimes(1);expect(retrieve).toHaveBeenCalledTimes(1);expect(finish).toHaveBeenCalledTimes(1)
 claim.mockResolvedValue(null);await runWorkerOnce({claim,finish},retrieve);expect(retrieve).toHaveBeenCalledTimes(1)
})
it('isolates adapter exceptions and lets failed database commits recover by lease',async()=>{
 const claim=vi.fn().mockResolvedValue({id:'j',token:'t',workId:123,attempt:1}),finish=vi.fn().mockResolvedValue(true)
 await runWorkerOnce({claim,finish},vi.fn().mockRejectedValue(new Error('bad parser')))
 expect(finish.mock.calls[0][1]).toEqual(failure('parser_failure','Metadata adapter failed. The saved work remains editable.'))
 finish.mockRejectedValue(new Error('db unavailable'));await expect(runWorkerOnce({claim,finish},vi.fn().mockResolvedValue(parse()))).rejects.toThrow('db unavailable')
})

it('retrieves a public fixture through the bounded fetch adapter without credentials',async()=>{
 const request=vi.fn<typeof fetch>().mockResolvedValue(new Response(fixture('work'),{headers:{'content-type':'text/html'}}))
 const result=await retrieveMetadata({workId:123,normalizedUrl:'https://archiveofourown.org/works/123'},request)
 expect(result.metadata?.title).toBe('A & B')
 expect(request.mock.calls[0][1]).toMatchObject({redirect:'manual'})
 expect(request.mock.calls[0][1]).not.toHaveProperty('credentials')
})

it('extracts and validates kudos, including zero, without treating missing metadata as zero', () => {
 for (const [text, expected] of [['1,234', 1234], ['0', 0], ['', undefined], ['unknown', undefined]] as const) {
  const html = fixture('work').replace('<dd class="words">', `<dd class="kudos">${text}</dd><dd class="words">`)
  expect(validateMetadata(parseMetadata(html, 123, 'https://archiveofourown.org/works/123')).metadata?.kudos).toBe(expected)
 }
 for (const kudos of [-1, 1.5, 2147483648]) {
  const result = parse(); result.metadata!.kudos = kudos
  expect(validateMetadata(result).metadata?.kudos).toBeUndefined()
 }
})

it('reads chapter release dates from the verified work index and leaves incomplete indexes unconfirmed', async () => {
 const { parseChapterDates } = await import('./chapter-dates')
 const { withChapterDates } = await import('./adapter')
 const index = '<ol class="chapter index"><li><a href="/works/123/chapters/910">1. Beginning</a><span class="datetime">(2024-01-01)</span></li><li><a href="/works/123/chapters/920">2. Next</a><span class="datetime">(02 Feb 2024)</span></li><li><a href="/works/999/chapters/930">3. Other work</a><span class="datetime">(2024-03-01)</span></li></ol>'
 expect(parseChapterDates(index, 123, 2)).toEqual({ '1': '2024-01-01', '2': '2024-02-02' })
 const result = parse(); result.metadata!.published_chapters = 2
 expect(withChapterDates(result, index, 123).metadata?.chapter_dates).toEqual({ '1': '2024-01-01', '2': '2024-02-02' })
 result.metadata!.published_chapters = 3
 expect(withChapterDates(result, index, 123)).toMatchObject({ category: 'chapter_dates_unavailable', retryable: true })
 expect(validateMetadata({ ...result, metadata: { ...result.metadata!, chapter_dates: { '1': '2024-01-01', '2': '2024-02-31', '4': '2024-01-01' } } }).metadata?.chapter_dates).toEqual({ '1': '2024-01-01' })
})
