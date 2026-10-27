import { expect, type Locator } from '@playwright/test'

export async function verifyReadingActionOrder(surface: Locator) {
 const count = surface.getByRole('button', { name: 'Edit Chapters Read', exact: true })
 const actions = surface.locator('.complete-chapter, .reading-toggle')
 await expect(count).toBeVisible()
 expect(await actions.count()).toBeGreaterThan(0)
 for (const action of await actions.all()) {
  await expect(action).toBeVisible()
  const progress = (await count.boundingBox())!, button = (await action.boundingBox())!
  expect(button.x).toBeGreaterThanOrEqual(progress.x + progress.width)
  expect(Math.abs(button.y - progress.y)).toBeLessThan(1)
 }
}
