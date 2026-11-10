import { expect, it } from 'vitest'
import defaults from '../src/sample/default-state.json'
import { isReaderSampleSnapshot } from '../src/sample/snapshot'
it('accepts the original self-contained sample EPUBs and explicit empty snapshots',()=>{
 expect(isReaderSampleSnapshot(defaults)).toBe(true)
 expect(defaults.books).toHaveLength(2)
 expect(isReaderSampleSnapshot({version:1,completeSnapshot:true,books:[]})).toBe(true)
})
it.each([null,{}, {version:2,completeSnapshot:true,books:[]}, {version:1,completeSnapshot:false,books:[]}, {version:1,completeSnapshot:true,books:[{file:null}]}, {version:1,completeSnapshot:true,books:[{file:{type:'text/html',base64:'YQ=='}}]}, {version:1,completeSnapshot:true,books:[{file:{type:'application/epub+zip',base64:'broken!'}}]}])('rejects malformed or unsupported sample snapshots: %j',value=>{
 expect(isReaderSampleSnapshot(value)).toBe(false)
})
