import { expect, type Locator } from '@playwright/test'

/** Exercise real clicks and computed styles in the shared built companion UI. */
export async function verifyReadUndo(top: Locator, bottom: Locator, readLabel: string, before: string, after: string) {
 const bars = [top, bottom]
 const originalThemes = await Promise.all(bars.map(bar => bar.getAttribute('data-theme')))
 for (const [theme, undoBar] of [['light', bottom], ['dark', top]] as const) {
  for (const bar of bars) await bar.evaluate((element, value) => { (element as HTMLElement).dataset.theme = value }, theme)
  await bottom.getByRole('button', { name: readLabel, exact: true }).click()
  for (const bar of bars) {
   await expect(bar.locator('.chapter-progress')).toHaveText(after)
   const undo = bar.getByRole('button', { name: 'Undo', exact: true })
   await expect(undo).toBeVisible()
   await expect(undo).toBeEnabled()
   await expect(undo).toHaveCSS('text-decoration-line', 'underline')
   const bounds = (await undo.boundingBox())!
   expect(bounds.height).toBeGreaterThanOrEqual(44)
   expect(bounds.width).toBeGreaterThanOrEqual(44)
   const contrast = await undo.evaluate(element => {
    const style = getComputedStyle(element)
    const luminance = (color: string) => (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(value => {
     const channel = Number(value) / 255
     return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4
    }).reduce((total, value, index) => total + value * [.2126, .7152, .0722][index], 0)
    const foreground = luminance(style.color), background = luminance(style.backgroundColor)
    return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05)
   })
   expect(contrast).toBeGreaterThanOrEqual(4.5)
  }
  await undoBar.getByRole('button', { name: 'Undo', exact: true }).click()
  for (const bar of bars) {
   await expect(bar.locator('.chapter-progress')).toHaveText(before)
   await expect(bar.getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0)
   await expect(bar.getByText('Read Marking Undone', { exact: true })).toBeVisible()
  }
 }
 for (const [index, bar] of bars.entries()) await bar.evaluate((element, theme) => {
  if (theme === null) element.removeAttribute('data-theme')
  else element.setAttribute('data-theme', theme)
 }, originalThemes[index])
}
