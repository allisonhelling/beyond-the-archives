import { publisherName } from './metadata'
import { normalize } from './filters'
import type { CatalogBook } from './model'
export const storageColumnLabels={library:'Library',title:'Title',author:'Author',fandom:'Fandom',date:'Date',size:'Size',rating:'Rating',summary:'Summary',publisher:'Publisher'} as const
export type StorageColumn=keyof typeof storageColumnLabels
export const storageColumns=Object.keys(storageColumnLabels) as StorageColumn[]
export function storageColumnOrder(saved?:readonly string[]):StorageColumn[]{return [...new Set([...(Array.isArray(saved)?saved:[]).filter((key):key is StorageColumn=>storageColumns.includes(key as StorageColumn)),...storageColumns])]}
export function storageValue(book:CatalogBook,column:StorageColumn,cloud:boolean):string|number|undefined {
 switch(column){
  case 'library':return book.hasFile?'Downloaded':cloud?'In Cloud':'Not Downloaded'
  case 'title':return book.metadata.title
  case 'author':return book.metadata.authors.join(', ')
  case 'fandom':return book.metadata.fandoms.join(' · ')
  case 'date':return Number.isNaN(Date.parse(book.importedAt))?undefined:Date.parse(book.importedAt)
  case 'size':return book.fileBytes
  case 'rating':return book.metadata.rating
  case 'summary':return book.metadata.summary
  case 'publisher':return publisherName(book.metadata.publisher)
 }
}
export function storageRows(books:CatalogBook[],query:string,column:StorageColumn,ascending:boolean,cloud:boolean){
 const terms=normalize(query).split(/\s+/).filter(Boolean)
 return books.filter(book=>{const text=normalize(storageColumns.map(key=>storageValue(book,key,cloud)).join(' ')+' '+book.importedAt+' '+new Date(book.importedAt).toLocaleDateString());return terms.every(term=>text.includes(term))}).sort((a,b)=>{
  const av=storageValue(a,column,cloud),bv=storageValue(b,column,cloud)
  if(av===undefined||av==='')return bv===undefined||bv===''?a.id.localeCompare(b.id):1
  if(bv===undefined||bv==='')return -1
  const compared=typeof av==='number'&&typeof bv==='number'?av-bv:String(av).localeCompare(String(bv),undefined,{numeric:true,sensitivity:'base'})
  return (ascending?compared:-compared)||a.id.localeCompare(b.id)
 })
}
export function moveStorageColumn(order:StorageColumn[],source:StorageColumn,target:StorageColumn){
 if(source===target)return order
 const next=order.filter(key=>key!==source);next.splice(order.indexOf(target),0,source);return next
}
