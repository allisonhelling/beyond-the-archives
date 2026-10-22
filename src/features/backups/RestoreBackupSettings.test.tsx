import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { RestoreBackupSettings } from './RestoreBackupSettings'
import { prepareRestore, restoreBackup, type PreparedRestore } from './restore'

vi.mock('./restore', () => ({ prepareRestore: vi.fn(), restoreBackup: vi.fn() }))
const prepared = { name: 'backup.json', backup: {}, preview: { counts: { library_entries: { current: 5, backup: 2 } }, exported_at: '2026-10-21T12:00:00Z', fingerprint: 'hash' } } as unknown as PreparedRestore
const saved = { name: 'backup.json', path: 'alice/backup.json', createdAt: '2026-10-21T12:00:00Z', size: 1 }
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prepareRestore).mockResolvedValue(prepared)
  vi.mocked(restoreBackup).mockResolvedValue('Restored. Reload your library.')
})

it('previews uploaded files, shows replacement counts, and permits cancellation without saving or restoring', async () => {
  const active = vi.fn()
  render(<RestoreBackupSettings backups={[]} disabled={false} onActiveChange={active} onRestored={vi.fn()} />)
  const file = new File(['{}'], 'backup.json')
  fireEvent.change(screen.getByLabelText('Choose backup file'), { target: { files: [file] } })
  const dialog = await screen.findByRole('dialog')
  expect(prepareRestore).toHaveBeenCalledWith(file)
  expect(within(dialog).getByText('5 current → 2 in backup')).toBeInTheDocument()
  expect(restoreBackup).not.toHaveBeenCalled()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(active).toHaveBeenLastCalledWith(false)
})

it('restores a selected saved copy only after confirmation and keeps the dialog open on failure', async () => {
  const refresh = vi.fn().mockResolvedValue(undefined)
  render(<RestoreBackupSettings backups={[saved]} disabled={false} onActiveChange={vi.fn()} onRestored={refresh} />)
  fireEvent.change(screen.getByLabelText('Saved backup to restore'), { target: { value: saved.path } })
  fireEvent.click(screen.getByRole('button', { name: 'Preview Saved Backup' }))
  const dialog = await screen.findByRole('dialog')
  expect(prepareRestore).toHaveBeenCalledWith(saved)
  vi.mocked(restoreBackup).mockRejectedValueOnce(new Error('Could not save safety backup'))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save Safety Backup and Replace Library' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save safety backup')
  expect(refresh).not.toHaveBeenCalled()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save Safety Backup and Replace Library' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(refresh).toHaveBeenCalledOnce()
  expect(screen.getByRole('button', { name: 'Reload Library' })).toBeInTheDocument()
})

it('reports invalid previews without presenting a destructive confirmation', async () => {
  vi.mocked(prepareRestore).mockRejectedValue(new Error('Unsupported backup'))
  render(<RestoreBackupSettings backups={[]} disabled={false} onActiveChange={vi.fn()} onRestored={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('Choose backup file'), { target: { files: [new File(['bad'], 'bad.json')] } })
  expect(await screen.findByRole('alert')).toHaveTextContent('Unsupported backup')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(restoreBackup).not.toHaveBeenCalled()
})
