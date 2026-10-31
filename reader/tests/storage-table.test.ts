import { expect, it } from 'vitest'
import { blankMetadata, type CatalogBook } from '../src/model'
import { storageColumnOrder, storageColumns, storageRows, storageValue, moveStorageColumn } from '../src/storage-table'
const alpha:CatalogBook={id:'a',workId:null,active:true,hasFile:true,fileBytes:100,metadata:{...blankMetadata,title:'Álpha',authors:['Anna'],fandoms:['A Fandom'],summary:'A summary',rating:'Explicit',publisher:'A Press'},importedAt:'2026-01-01',metadataAt:'2026-01-01',position:{chapter:'one',fraction:0},collections:[],status:'to_read',chapterCount:1,wordCount:10,completedCount:0}
const beta:CatalogBook={...alpha,id:'b',hasFile:false,fileBytes:200,metadata:{...alpha.metadata,title:'Beta',authors:['Ben'],fandoms:['B Fandom'],summary:'B summary',rating:'Mature',publisher:'B Press'},importedAt:'2026-02-01'}
it.each(storageColumns)('sorts %s in both directions',column=>{
 expect(storageRows([beta,alpha],'',column,true,true).map(book=>book.id)).toEqual(['a','b'])
 expect(storageRows([alpha,beta],'',column,false,true).map(book=>book.id)).toEqual(['b','a'])
})
it('searches all displayed metadata without accents and combines terms',()=>{
 expect(storageRows([alpha,beta],'alpha anna press','title',true,true)).toEqual([alpha])
 expect(storageRows([alpha,beta],'2026-02-01','date',true,true)).toEqual([beta])
 expect(storageRows([alpha,beta],'in cloud','title',true,true)).toEqual([beta])
 expect(storageValue(beta,'library',false)).toBe('Not Downloaded')
})
it('keeps unknown sizes last even when descending',()=>{
 const missing={...alpha,id:'unknown',fileBytes:undefined}
 expect(storageRows([missing,alpha,beta],'','size',false,true).map(book=>book.id)).toEqual(['b','a','unknown'])
})
it('normalizes saved columns and reorders without losing or duplicating fields',()=>{
 const order=storageColumnOrder(['publisher','title','publisher','unknown'])
 expect(order.slice(0,2)).toEqual(['publisher','title'])
 expect(order).toHaveLength(9)
 expect(moveStorageColumn(order,'publisher','title').slice(0,2)).toEqual(['title','publisher'])
 expect(moveStorageColumn(order,'title','publisher').slice(0,2)).toEqual(['title','publisher'])
})

it('uses AO3 publisher labels for existing snapshots in search and sort',()=>{
 const book={...alpha,metadata:{...alpha.metadata,publisher:'archiveofourown.org'}}
 expect(storageValue(book,'publisher',false)).toBe('AO3')
 expect(storageRows([book,beta],'AO3','publisher',true,false)).toEqual([book])
 expect(storageRows([book,beta],'','publisher',true,false)).toEqual([book,beta])
})
