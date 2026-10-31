import { expect, type Page } from '@playwright/test'
import { createZip } from '../../../src/lib/zip'
import { epubFiles } from '../../../src/test/epub-fixture'
export async function importBook(page:Page,title:string,series?:string){
 const files=epubFiles({source:`urn:isbn:${title}`})
 if(series)files[2].content=files[2].content.replace('</metadata>',`<meta name="calibre:series" content="${series}"/></metadata>`)
 for(const file of files)file.content=file.content.replaceAll('Recovered &amp; Remembered',title).replaceAll('Recovered Series',series??'Recovered Series')
 await page.getByLabel('Import EPUB File').setInputFiles({name:`${title}.epub`,mimeType:'application/epub+zip',buffer:Buffer.from(await createZip(files).arrayBuffer())})
 await expect(page.getByLabel('Book Content')).toBeVisible()
 await page.getByRole('button',{name:'← Bookshelf',exact:true}).click()
}
