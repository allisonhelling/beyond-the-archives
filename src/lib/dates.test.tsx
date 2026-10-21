import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { ao3Date, datePlaceholder, formatDate, formatDateTime, parseDateText, saveDateFormat, savedDateFormat } from './dates'
import { DateFilterField } from '../features/library/DateFilterField'
import { PageSizeSettings } from '../features/library/pagination'

beforeEach(() => {
 const storage = new Map<string, string>()
 vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) })
})
afterEach(() => { saveDateFormat('MDY'); vi.unstubAllGlobals() })
it.each([
 ['MDY', '10/20/2026', 'mm/dd/yyyy', 'Oct 20, 2026'],
 ['DMY', '20/10/2026', 'dd/mm/yyyy', '20 Oct 2026'],
 ['YMD', '2026-10-20', 'yyyy-mm-dd', '2026 Oct 20'],
] as const)('renders and parses %s dates without changing calendar days', (format, display, placeholder, updated) => {
 saveDateFormat(format)
 expect(savedDateFormat()).toBe(format)
 expect(formatDate('2026-10-20T23:59:59-12:00')).toBe(display)
 expect(datePlaceholder()).toBe(placeholder)
 expect(parseDateText(display)).toBe('2026-10-20')
 expect(ao3Date('2026-10-20')).toBe(updated)
 expect(formatDateTime('2026-10-20T12:00:00')).toContain(display)
})
it('rejects impossible dates and preserves incomplete edits', () => {
 for (const value of ['', 'invalid', '2026-02-29', '2026-04-31']) expect(formatDate(value)).toBe('Unknown')
 expect(formatDate('2024-02-29')).toBe('02/29/2024')
 expect(parseDateText('02/29/2026')).toBe('02/29/2026')
 expect(parseDateText('10/2')).toBe('10/2')
})
it('persists settings and keeps the native calendar value in ISO while text follows the preference', () => {
 const settings = render(<PageSizeSettings />)
 fireEvent.change(screen.getByLabelText('Date format'), { target: { value: 'DMY' } })
 expect(savedDateFormat()).toBe('DMY')
 settings.unmount()
 function Filter() { const [value, setValue] = useState('2026-10-20'); return <DateFilterField label="From" value={value} onChange={setValue} /> }
 render(<Filter />)
 expect(screen.getByLabelText('From')).toHaveValue('20/10/2026')
 expect(screen.getByLabelText('Choose from date')).toHaveValue('2026-10-20')
 fireEvent.change(screen.getByLabelText('From'), { target: { value: '21/10/2026' } })
 expect(screen.getByLabelText('Choose from date')).toHaveValue('2026-10-21')
 fireEvent.change(screen.getByLabelText('Choose from date'), { target: { value: '2026-11-01' } })
 expect(screen.getByLabelText('From')).toHaveValue('01/11/2026')
})
