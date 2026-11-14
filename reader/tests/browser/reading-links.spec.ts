import { expect, test } from '@playwright/test'
import { epubFiles } from '../../../src/test/epub-fixture'
import { createZip } from '../../../src/lib/zip'

for (const width of [390, 1280]) test(`opens web URLs from EPUB text without leaving the reader at ${width}px`, async ({ page, context }) => {
 await page.setViewportSize({ width, height: 844 })
 const url = 'https://archiveofourown.org/works/23818510'
 await context.route(url, route => route.fulfill({ contentType: 'text/html', body: '<h1>Linked Work</h1>' }))
 const files = epubFiles()
 files[files.length - 1].content = `<html><body><h2>Chapter 1: Links</h2><p><strong>URL: ${url}</strong></p><p><a href="https://example.com/original">Existing Link</a></p></body></html>`
 await page.goto('/')
 await page.getByLabel('Import EPUB File').setInputFiles({ name: 'links.epub', mimeType: 'application/epub+zip', buffer: Buffer.from(await createZip(files).arrayBuffer()) })
 await page.getByRole('button', { name: 'Contents', exact: true }).click()
 await page.getByRole('complementary', { name: 'Contents', exact: true }).getByRole('button', { name: '1. Links', exact: true }).click()
 for (const layout of ['scroll', 'pages']) {
  if (layout === 'pages') {
   await page.getByRole('button', { name: 'Display', exact: true }).click()
   await page.getByRole('switch', { name: 'Scrolling View', exact: true }).uncheck()
   await page.getByRole('button', { name: 'Display', exact: true }).click()
  }
  const content = page.getByLabel('Book Content'), link = content.getByRole('link', { name: url, exact: true })
  await expect(link).toHaveAttribute('href', url)
  await expect(content.getByRole('link', { name: 'Existing Link', exact: true })).toHaveAttribute('href', 'https://example.com/original')
  const before = await content.evaluate(element => ({ top: element.scrollTop, left: element.scrollLeft }))
  const popup = page.waitForEvent('popup')
  await link.click()
  const opened = await popup
  await expect(opened).toHaveURL(url)
  await opened.close()
  await expect(page.getByRole('button', { name: 'Display', exact: true })).toBeVisible()
  expect(await content.evaluate(element => ({ top: element.scrollTop, left: element.scrollLeft }))).toEqual(before)
 }
 await page.reload()
 await expect(page.getByLabel('Book Content')).toBeVisible()
 await expect(page.getByLabel('Book Content').getByRole('link', { name: url, exact: true })).toBeVisible()
})
