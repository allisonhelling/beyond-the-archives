import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ReadingStatsSettings } from './ReadingStatsSettings'
import { readingSpeedKey, savedReadingSpeed } from './preferences'

beforeEach(() => {
 const values = new Map<string, string>()
 vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: vi.fn((key: string, value: string) => values.set(key, value)) })
})
afterEach(() => vi.unstubAllGlobals())
it('defaults safely, persists custom speed, and reports unavailable storage', () => {
 localStorage.setItem(readingSpeedKey, '-1')
 expect(savedReadingSpeed()).toBe(225)
 render(<ReadingStatsSettings />)
 const input = screen.getByLabelText('Reading Speed (Words per Minute)')
 expect(input).toHaveValue(225)
 fireEvent.change(input, { target: { value: '300' } })
 fireEvent.submit(input.closest('form')!)
 expect(savedReadingSpeed()).toBe(300)
 expect(screen.getByRole('status')).toHaveTextContent('saved on this browser')
 vi.mocked(localStorage.setItem).mockImplementation(() => { throw new Error('blocked') })
 fireEvent.submit(input.closest('form')!)
 expect(screen.getByRole('alert')).toHaveTextContent('Could not save reading speed')
})
it('rejects invalid and fractional reading speeds without overwriting the preference', () => {
 render(<ReadingStatsSettings />)
 const input = screen.getByLabelText('Reading Speed (Words per Minute)')
 for (const value of ['0', '225.5', '2001', '']) {
  fireEvent.change(input, { target: { value } })
  fireEvent.submit(input.closest('form')!)
  expect(screen.getByRole('alert')).toHaveTextContent('whole number between 1 and 2,000')
  expect(localStorage.getItem(readingSpeedKey)).toBeNull()
 }
})
