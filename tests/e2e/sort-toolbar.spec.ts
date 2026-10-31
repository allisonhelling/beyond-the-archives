import { expect, test } from '@playwright/test'
import { fixture, login } from './library-fixture'

test('places Sort beside pagination on desktop and fandoms on phones with aligned icons and labels', async ({ page }) => {
 await fixture(page); await page.goto('/library'); await login(page)
 for (const path of ['/library', '/reading']) {
  await page.goto(path)
  for (const width of [1280, 1100, 900, 768, 650, 390]) {
   await page.setViewportSize({ width, height: 900 })
   const toolbar = page.getByRole('region', { name: path === '/library' ? 'Library Toolbar' : 'Reading Toolbar' })
   const mobile = width <= 650
   const navigation = page.locator('.pagination-inline')
   await expect((mobile ? navigation : toolbar).getByRole('button', { name: 'Sort', exact: true })).toHaveCount(0)
   const sort = (mobile ? toolbar : navigation).getByRole('button', { name: 'Sort', exact: true })
   await expect(sort).toBeVisible()
   // A resize can reflow and adjust scrolling between separate locator reads.
   await expect(async () => {
    const { bounds, icon, text } = await sort.evaluate(button => ({
     bounds: button.getBoundingClientRect().toJSON(),
     icon: button.querySelector('.dropdown-label svg')!.getBoundingClientRect().toJSON(),
     text: button.querySelector('.dropdown-label-text')!.getBoundingClientRect().toJSON(),
    }))
    expect(icon.y).toBeGreaterThanOrEqual(bounds.y)
    expect(icon.y + icon.height).toBeLessThanOrEqual(bounds.y + bounds.height)
    if (width > 650) {
     expect(text.x).toBeGreaterThanOrEqual(icon.x + icon.width)
     expect(Math.abs(text.y + text.height / 2 - (icon.y + icon.height / 2))).toBeLessThan(1)
    }
   }).toPass({ timeout: 5000 })
   await expect(async () => {
    const sortBounds = (await sort.boundingBox())!
    if (mobile) {
     const fandoms = (await toolbar.getByRole('button', { name: 'Select Fandoms', exact: true }).boundingBox())!
     expect(sortBounds.x + sortBounds.width).toBeLessThanOrEqual(fandoms.x)
     expect(Math.abs(sortBounds.y - fandoms.y)).toBeLessThan(2)
    } else {
     const pager = (await navigation.locator('.pagination-controls').boundingBox())!
     expect(sortBounds.x).toBeGreaterThanOrEqual(pager.x + pager.width)
     expect(Math.abs(sortBounds.y + sortBounds.height / 2 - pager.y - pager.height / 2)).toBeLessThan(2)
    }
   }).toPass({timeout:5000})
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
