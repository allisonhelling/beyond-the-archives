import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { saveDateFormat, savedDateFormat } from '../../../lib/dates'
import { DateFilterField } from '../DateFilterField'
import { BrowsingSettings } from './BrowsingSettings'

beforeEach(() => {
 const storage = new Map<string, string>()
 vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) })
})
afterEach(() => { saveDateFormat('MDY'); vi.unstubAllGlobals() })
it('persists settings and keeps the native calendar value in ISO while text follows the preference', () => {
 const settings = render(<BrowsingSettings />)
 fireEvent.change(screen.getByLabelText('Date Format'), { target: { value: 'DMY' } })
 expect(savedDateFormat()).toBe('DMY')
 settings.unmount()
 function Filter() { const [value, setValue] = useState('2026-10-20'); return <DateFilterField label="From" value={value} onChange={setValue} /> }
 render(<Filter />)
 expect(screen.getByLabelText('From')).toHaveValue('20/10/2026')
 expect(screen.getByLabelText('Choose From Date')).toHaveValue('2026-10-20')
 fireEvent.change(screen.getByLabelText('From'), { target: { value: '21/10/2026' } })
 expect(screen.getByLabelText('Choose From Date')).toHaveValue('2026-10-21')
 fireEvent.change(screen.getByLabelText('Choose From Date'), { target: { value: '2026-11-01' } })
 expect(screen.getByLabelText('From')).toHaveValue('01/11/2026')
})
