import { expect, type Page } from '@playwright/test'
export { fixture } from './library-transport-fixture'

export async function login(page: Page) { await page.getByLabel('Username or Email').fill('reader@example.com'); await page.getByLabel('Password', { exact: true }).fill('Test-password-123!'); await page.getByRole('button', { name: 'Sign In', exact: true }).click(); await expect(page.getByRole('button', { name: 'Profile Menu', exact: true })).toBeVisible() }

export async function selectLibraryShelf(page: Page, name: string) {
  const shelves = page.getByRole('navigation', { name: 'Library Shelves', exact: true })
  const spine = shelves.getByRole('button', { name, exact: true })
  if (!await spine.isVisible()) await shelves.getByRole('button', { name: 'Show All Collections', exact: true }).click()
  const opensEditor = await spine.getAttribute('aria-haspopup') === 'dialog'
  await spine.click()
  // Editing opens a dialog; browsing must commit the chosen shelf first.
  if (!opensEditor) await expect(spine).toHaveAttribute('aria-pressed', 'true')
}
