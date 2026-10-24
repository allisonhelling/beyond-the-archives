import { expect, type Page } from '@playwright/test'

// Shared by the app and Safari companion, which render the same tag editor.
export async function verifyPersonalTagControls(page: Page) {
  const editor = page.locator('.personal-tag-editor')
  const input = editor.getByRole('textbox', { name: 'Personal Tags', exact: true })
  await input.fill('')
  const placeholderWidth = (await input.boundingBox())!.width
  const measureWidth = (await editor.locator('.tag-input-measure').boundingBox())!.width
  expect(Math.abs(placeholderWidth - measureWidth)).toBeLessThan(2)
  await input.fill('A')
  expect(Math.abs((await input.boundingBox())!.width - placeholderWidth)).toBeLessThan(2)
  await input.fill('A sufficiently long tag draft')
  expect((await input.boundingBox())!.width).toBeGreaterThan(placeholderWidth + 30)
  await input.fill('A long tag '.repeat(30))
  expect((await input.boundingBox())!.width).toBeLessThan((await editor.boundingBox())!.width)
  await input.fill('')
  expect(Math.abs((await input.boundingBox())!.width - placeholderWidth)).toBeLessThan(2)
  const handle = editor.getByRole('button', { name: 'Move Tag Typing Position' })
  if (!await handle.isVisible()) return
  const first = (await editor.locator('.removable-tag').first().textContent())!
  const last = (await editor.locator('.removable-tag').last().textContent())!
  await input.fill('Held draft')
  await handle.scrollIntoViewIfNeeded()
  const source = (await handle.boundingBox())!, target = (await editor.getByRole('button', { name: 'Insert Tag at Start', exact: true }).boundingBox())!
  const touch = await page.context().newCDPSession(page)
  let touching = false
  try {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: source.x + source.width / 2, y: source.y + source.height / 2 }] })
    touching = true
    await expect(handle).toHaveAttribute('aria-pressed', 'true')
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: target.x + target.width / 2, y: target.y + target.height / 2 }] })
    await expect(editor.locator('[data-tag-position="0"]')).toHaveAttribute('data-drop-target', 'true')
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    touching = false
    await expect(input).toHaveValue('Held draft')
    await expect(editor.locator('.tag-input-entry')).toHaveAttribute('data-tag-position', '0')
    expect(await editor.locator('.tag-input-entry').evaluate(element => element.nextElementSibling?.textContent)).toBe(first)
    await input.fill('')
    await editor.getByRole('button', { name: `Insert Tag After ${last}`, exact: true }).click()
    await expect(editor.locator('.tag-input-entry')).toHaveAttribute('data-tag-position', String(await editor.locator('.removable-tag').count()))
  } finally {
    if (touching) await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
    await touch.detach()
  }
}
