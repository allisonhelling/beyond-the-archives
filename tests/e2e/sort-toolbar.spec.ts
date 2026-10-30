import { expect, test } from '@playwright/test'
import { fixture, login } from './library-fixture'

test('keeps compact sort icons and labels aligned across toolbar widths', async ({ page }) => {
 await fixture(page); await page.goto('/library'); await login(page)
 for (const path of ['/library', '/reading']) {
  await page.goto(path)
  for (const width of [1280, 1100, 900, 768, 650, 390]) {
   await page.setViewportSize({ width, height: 900 })
   const toolbar = page.getByRole('region', { name: path === '/library' ? 'Library Toolbar' : 'Reading Toolbar' })
   const sort = toolbar.getByRole('button', { name: 'Sort', exact: true })
   await expect(sort).toBeVisible()
   const bounds = (await sort.boundingBox())!, icon = (await sort.locator('.dropdown-label svg').boundingBox())!
   expect(icon.y).toBeGreaterThanOrEqual(bounds.y)
   expect(icon.y + icon.height).toBeLessThanOrEqual(bounds.y + bounds.height)
   if (width > 650) {
    const text = (await sort.locator('.dropdown-label-text').boundingBox())!
    expect(text.x).toBeGreaterThanOrEqual(icon.x + icon.width)
    expect(Math.abs(text.y + text.height / 2 - (icon.y + icon.height / 2))).toBeLessThan(1)
   }
   await sort.click()
   const menu = page.getByRole('listbox', { name: 'Sort', exact: true })
   await expect(menu).toBeVisible()
   const menuBounds = (await menu.boundingBox())!
   expect(menuBounds.x + menuBounds.width).toBeLessThanOrEqual(width)
   for (const option of await menu.getByRole('option').all()) expect(await option.locator('span').evaluate(node => node.getBoundingClientRect().height <= parseFloat(getComputedStyle(node).lineHeight) + 1)).toBe(true)
   await sort.press('Escape')
   expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
 }
})
