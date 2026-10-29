import { expect, it } from 'vitest'
import { importError } from './import-error'

it.each([
  ['PGRST202', 'Could not find the function', /API schema cache/],
  ['42703', 'column missing does not exist', /connected project/],
  ['42501', 'permission denied for function', /Sign in again/],
  ['PGRST303', 'JWT expired', /Sign in again/],
  ['57014', 'canceling statement due to statement timeout', /time limit/],
  ['40P01', 'deadlock detected', /other library operations/],
  ['', 'TypeError: Failed to fetch', /connection and import history/],
  ['23505', 'duplicate key value violates unique constraint', /Resolve the reported error/],
  ['22023', 'cannot extract elements from a scalar', /Resolve the reported error/],
] as const)('retains the server reason and gives specific advice for %s', (code, message, advice) => {
  const original = { code, message, details: 'Full server details', hint: 'Server hint' }
  const error = importError('Could not import this scan page', original)
  expect(error.message).toContain(message)
  if (code) expect(error.message).toContain(`[${code}]`)
  expect(error.message).toMatch(advice)
  expect(error.cause).toBe(original)
  expect(error.message.includes('migrations')).toBe(['PGRST202', '42703'].includes(code))
})

it('handles an empty server error without inventing a database cause', () => {
  expect(importError('Could not confirm the CSV import', {}).message).toBe('Could not confirm the CSV import. The request could not be confirmed. Check your connection and import history before retrying.')
})
