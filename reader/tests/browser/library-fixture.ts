import { expect, type Page } from '@playwright/test'
import { createZip } from '../../../src/lib/zip'
import { epubFiles } from '../../../src/test/epub-fixture'
export async function importBook(page:Page,title:string,series?:string,author='Recovered Author'){
 const files=epubFiles({source:`urn:isbn:${title}`})
 if(series)files[2].content=files[2].content.replace('</metadata>',`<meta name="calibre:series" content="${series}"/></metadata>`)
 for(const file of files)file.content=file.content.replaceAll('Recovered &amp; Remembered',title).replaceAll('Recovered Series',series??'Recovered Series').replaceAll('Recovered Author',author)
 await page.getByLabel('Import EPUB File').setInputFiles({name:`${title}.epub`,mimeType:'application/epub+zip',buffer:Buffer.from(await createZip(files).arrayBuffer())})
 await expect(page.getByLabel('Book Content')).toBeVisible()
 await page.getByRole('button',{name:'← Bookshelf',exact:true}).click()
}

export async function connectOrganizer(page: Page) {
  await page.getByRole('button', { name: 'Profile Menu', exact: true }).click()
  await page.getByRole('button', { name: 'Organizer & Sync', exact: true }).click()
  await page.getByText('Advanced Troubleshooting', {exact:true}).click()
  await page.getByRole('button', {name:'Enter Legacy Pairing Code',exact:true}).click()
  await page.getByLabel('Device Name (Optional)', { exact: true }).fill('Test Reader')
  await page.getByLabel('Pairing Code', { exact: true }).fill('a'.repeat(64))
  await page.getByRole('dialog').getByRole('button', { name: 'Connect Organizer', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}
