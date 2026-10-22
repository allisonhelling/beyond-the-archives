import { beforeEach, expect, it, vi } from 'vitest'
const {rpc,session,settings,invoke}=vi.hoisted(()=>({rpc:vi.fn(),session:vi.fn(),settings:vi.fn(),invoke:vi.fn()}))
vi.mock('../../lib/supabase',()=>({supabase:{rpc,auth:{getSession:session},from:()=>({select:()=>({eq:()=>({maybeSingle:settings})})}),functions:{invoke}}}))
vi.mock('../library/repository',()=>({allRows:vi.fn()}))
import { previewSeries, submitImport } from './repository'
beforeEach(()=>{rpc.mockReset();invoke.mockReset()})
it('explains a missing Phase 3 migration instead of suggesting a one-link batch is too large',async()=>{
 rpc.mockResolvedValue({data:null,error:{code:'PGRST202',message:'Internal database details'}})
 await expect(submitImport('https://archiveofourown.org/works/123')).rejects.toThrow('The connected Supabase database is missing the Phase 3 importer.')
})
it('separates permission failures from connection failures without exposing raw database errors',async()=>{
 rpc.mockResolvedValue({data:null,error:{code:'42501',message:'Internal database details'}})
 await expect(submitImport('https://archiveofourown.org/works/123')).rejects.toThrow('Import access was denied.')
 rpc.mockResolvedValue({data:null,error:{message:'Internal database details'}})
 await expect(submitImport('https://archiveofourown.org/works/123')).rejects.toThrow('Could not confirm the import.')
})
it('validates empty and oversized submissions before contacting the database',async()=>{
 await expect(submitImport('no links')).rejects.toThrow('Paste at least one')
 await expect(submitImport(Array.from({length:2001},(_,n)=>`https://archiveofourown.org/works/${n+1}`).join('\n'))).rejects.toThrow('Use at most 2,000 URLs per submission.')
 expect(rpc).not.toHaveBeenCalled()
})
it('returns the saved batch ID and retains the submitted URLs',async()=>{
 rpc.mockResolvedValue({data:'batch',error:null})
 const original='https://archiveofourown.org/works/123/chapters/456?view_adult=true#main'
 await expect(submitImport(original)).resolves.toBe('batch')
 expect(rpc).toHaveBeenCalledWith('submit_import_urls',{p_urls:[original],p_update_reading_location:true})
})

it('can request metadata without changing an existing reading location',async()=>{
 rpc.mockResolvedValue({data:'batch',error:null})
 await submitImport('https://archiveofourown.org/works/123/chapters/456',false)
 expect(rpc).toHaveBeenCalledWith('submit_import_urls',{p_urls:['https://archiveofourown.org/works/123/chapters/456'],p_update_reading_location:false})
})

it('requires series review before any database import is created', async()=>{
 await expect(submitImport('https://archiveofourown.org/series/77')).rejects.toThrow('Review series')
 expect(rpc).not.toHaveBeenCalled()
})

it('submits the chosen status and reviewed series with the work URLs atomically',async()=>{
 rpc.mockResolvedValue({data:'batch',error:null})
 await submitImport('https://archiveofourown.org/works/123',true,'finished',[77])
 expect(rpc).toHaveBeenCalledWith('submit_import_urls',{p_urls:['https://archiveofourown.org/works/123'],p_update_reading_location:true,p_reading_status:'finished',p_series_ids:[77]})
})

it('explains the required migration when import status support is missing',async()=>{
 rpc.mockResolvedValue({data:null,error:{code:'PGRST202'}})
 await expect(submitImport('https://archiveofourown.org/works/123',true,'to_read')).rejects.toThrow('Apply the latest database migrations')
})

it('fetches a temporary preview without writing any series metadata', async () => {
 session.mockResolvedValue({data:{session:{user:{id:'reader'}}}})
 settings.mockResolvedValue({data:{retrieval_mode:'worker'},error:null})
 const preview = {seriesId:77,normalizedUrl:'https://archiveofourown.org/series/77',title:'Series',works:[]}
 invoke.mockResolvedValue({data:{preview},error:null})
 await expect(previewSeries(preview.normalizedUrl)).resolves.toMatchObject(preview)
 expect(invoke).toHaveBeenCalledWith('series-preview',{body:{url:preview.normalizedUrl}})
 expect(rpc).not.toHaveBeenCalled()
})

it('follows every Next link and deduplicates overlapping works before returning the preview', async () => {
 session.mockResolvedValue({data:{session:{user:{id:'reader'}}}})
 settings.mockResolvedValue({data:{retrieval_mode:'worker'},error:null})
 const url = 'https://archiveofourown.org/series/77'
 const first = {seriesId:77,normalizedUrl:url,title:'Series',works:[{workId:101}],nextUrl:url+'?page=2'}
 invoke.mockResolvedValueOnce({data:{preview:first},error:null})
  .mockResolvedValueOnce({data:{preview:{...first,works:[{workId:101},{workId:102}],nextUrl:url+'?page=3'}},error:null})
  .mockResolvedValueOnce({data:{preview:{...first,works:[{workId:103}],nextUrl:undefined}},error:null})
 const preview = await previewSeries(url)
 expect(preview.works.map(work=>work.workId)).toEqual([101,102,103])
 expect(preview.nextUrl).toBeUndefined()
 expect(invoke.mock.calls.map(call=>call[1].body.url)).toEqual([url,url+'?page=2',url+'?page=3'])
 expect(rpc).not.toHaveBeenCalled()
})
it('rejects repeated pagination instead of returning an incomplete preview', async () => {
 session.mockResolvedValue({data:{session:{user:{id:'reader'}}}})
 settings.mockResolvedValue({data:{retrieval_mode:'worker'},error:null})
 const url = 'https://archiveofourown.org/series/77'
 invoke.mockResolvedValue({data:{preview:{seriesId:77,works:[],nextUrl:url}},error:null})
 await expect(previewSeries(url)).rejects.toThrow('repeated page')
 expect(invoke).toHaveBeenCalledTimes(1)
})

it('respects the hosted retrieval gate between series pages', async () => {
 vi.useFakeTimers()
 try {
  session.mockResolvedValue({data:{session:{user:{id:'reader'}}}})
  settings.mockResolvedValue({data:{retrieval_mode:'worker'},error:null})
  const url = 'https://archiveofourown.org/series/77'
  invoke.mockResolvedValueOnce({data:{preview:{seriesId:77,works:[],nextUrl:url+'?page=2'},nextPageDelayMs:35_000},error:null})
   .mockResolvedValueOnce({data:{preview:{seriesId:77,works:[]}},error:null})
  const result = previewSeries(url)
  await vi.advanceTimersByTimeAsync(34_999)
  expect(invoke).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1)
  await result
  expect(invoke).toHaveBeenCalledTimes(2)
 } finally { vi.useRealTimers() }
})
