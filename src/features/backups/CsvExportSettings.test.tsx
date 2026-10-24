import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { CsvExportSettings } from './CsvExportSettings'
import { exportLibraryCsv } from './csv-export'

vi.mock('./csv-export', async importOriginal => ({ ...await importOriginal<typeof import('./csv-export')>(), exportLibraryCsv: vi.fn() }))
beforeEach(() => vi.mocked(exportLibraryCsv).mockReset())

it('supports export all, individual file selection, and prevents empty downloads', async () => {
  render(<CsvExportSettings />)
  const all = screen.getByRole('checkbox', { name: 'Export All' })
  const button = screen.getByRole('button', { name: 'Download CSV ZIP' })
  expect(all).toBeChecked()
  fireEvent.click(all)
  expect(button).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox', { name: /^collections.csv/ }))
  fireEvent.click(button)
  await screen.findByRole('status')
  expect(exportLibraryCsv).toHaveBeenCalledWith(['collections.csv'])
  fireEvent.click(all)
  fireEvent.click(button)
  await waitFor(() => expect(exportLibraryCsv).toHaveBeenLastCalledWith(['works.csv', 'series.csv', 'collections.csv', 'collection_memberships.csv', 'reading_records.csv']))
})

it('locks selection while exporting, prevents repeated downloads, and supports retry after failure', async () => {
  let reject: (error: Error) => void = () => {}
  vi.mocked(exportLibraryCsv).mockImplementationOnce(() => new Promise((_, fail) => { reject = fail }))
  render(<CsvExportSettings />)
  fireEvent.click(screen.getByRole('button', { name: 'Download CSV ZIP' }))
  const pending = screen.getByRole('button', { name: 'Preparing ZIP…' })
  expect(pending).toBeDisabled()
  expect(screen.getByRole('checkbox', { name: 'Export All' })).toBeDisabled()
  fireEvent.click(pending)
  expect(exportLibraryCsv).toHaveBeenCalledOnce()
  reject(new Error('private error'))
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not export your library')
  fireEvent.click(screen.getByRole('button', { name: 'Download CSV ZIP' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Your ZIP download has started.')
})
