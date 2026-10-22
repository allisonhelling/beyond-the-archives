import { automaticCollectionRules } from './automatic-collections'
import { defaultReadingFilters } from './reading-search'
import { beforeAll, afterAll, beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NewCollectionButton } from './CollectionChoices'
import { NewCollectionDialog } from './NewCollectionDialog'
import type { Collection } from './model'

const state = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn(), remove: vi.fn(), updateMany: vi.fn(), removeMany: vi.fn(), stories: [] as { collectionIds: string[] }[], collections: [] as Collection[] }))
vi.mock('./repository', () => ({ saveCollection: state.save, deleteCollection: state.remove, updateCollections: state.updateMany, deleteCollections: state.removeMany }))
vi.mock('./LibraryProvider', () => ({ useLibrary: () => ({ refresh: state.refresh, refreshCollections: state.refresh, collections: state.collections, stories: state.stories }) }))

const showModal = HTMLDialogElement.prototype.showModal, close = HTMLDialogElement.prototype.close
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
afterAll(() => { HTMLDialogElement.prototype.showModal = showModal; HTMLDialogElement.prototype.close = close })
beforeEach(() => { vi.clearAllMocks(); state.collections = []; state.stories = []; state.save.mockResolvedValue('new-collection'); state.refresh.mockResolvedValue(undefined) })

const collection: Collection = { last_story_added_at: null, id: 'existing', name: 'Night reads', color: '#123456', symbol: 'moon', default_key: null, sort_position: 0, user_id: 'reader', description: null, created_at: '', updated_at: '' }

it('reuses saved custom colors as swatches without duplicates or default-collection colors', async () => {
  state.collections = [collection,
    { ...collection, id: 'duplicate', color: '#123456' },
    { ...collection, id: 'upper', color: '#AbCdEf' },
    { ...collection, id: 'lower', color: '#abcdef' },
    { ...collection, id: 'preset', color: '#970000' },
    { ...collection, id: 'default', default_key: 'favorites', color: '#654321' },
    { ...collection, id: 'invalid', color: 'red' },
  ]
  const user = userEvent.setup()
  render(<NewCollectionButton />)
  await user.click(screen.getByRole('button', { name: 'New collection' }))
  expect(screen.getAllByRole('radio', { name: '#123456' })).toHaveLength(1)
  expect(screen.getAllByRole('radio', { name: '#abcdef' })).toHaveLength(1)
  expect(screen.getAllByRole('radio', { name: 'Burgundy' })).toHaveLength(1)
  expect(screen.queryByRole('radio', { name: '#654321' })).not.toBeInTheDocument()
  expect(screen.queryByRole('radio', { name: 'red' })).not.toBeInTheDocument()
  await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Shared color')
  await user.click(screen.getByRole('radio', { name: '#abcdef' }))
  expect(screen.getByRole('radio', { name: '#abcdef' })).toBeChecked()
  expect(screen.getByLabelText('Collection preview').querySelector('.collection-spine')).toHaveStyle('--cover-color: #abcdef')
  await user.click(screen.getByRole('button', { name: 'Create collection' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(state.save).toHaveBeenCalledWith('Shared color', undefined, { color: '#abcdef', symbol: 'flask' }, '')
})

it('edits an existing collection using the shared appearance form and retries save failures', async () => {
  const user = userEvent.setup(), onClose = vi.fn()
  state.save.mockRejectedValueOnce(new Error('Name already exists.'))
  render(<NewCollectionDialog collection={collection} onClose={onClose} />)
  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Night reads')
  await user.click(screen.getByRole('button', { name: 'Custom color' }))
  expect(screen.getByRole('textbox', { name: 'Custom color (hex)' })).toHaveValue('#123456')
  expect(screen.getByRole('radio', { name: 'Moon' })).toBeChecked()
  await user.clear(screen.getByRole('textbox', { name: 'Name' }))
  await user.type(screen.getByRole('textbox', { name: 'Name' }), 'New name')
  await user.click(screen.getByRole('button', { name: 'Save changes' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Name already exists')
  expect(onClose).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
  expect(state.save).toHaveBeenLastCalledWith('New name', 'existing', { color: '#123456', symbol: 'moon' }, '')
})

it('confirms deletion and retries a reload failure without deleting twice', async () => {
  state.stories = [{ collectionIds: ['existing'] }]
  const user = userEvent.setup(), onClose = vi.fn(), onDeleted = vi.fn()
  state.refresh.mockRejectedValueOnce(new Error('Reload failed.'))
  render(<NewCollectionDialog collection={collection} onClose={onClose} onDeleted={onDeleted} />)
  await user.click(screen.getByRole('button', { name: 'Delete' }))
  const confirmation = screen.getByRole('dialog', { name: 'Delete collection?' })
  await user.click(within(confirmation).getByRole('button', { name: 'Delete' }))
  expect(await within(confirmation).findByRole('alert')).toHaveTextContent('Reload failed')
  expect(onClose).not.toHaveBeenCalled()
  await user.click(within(confirmation).getByRole('button', { name: 'Delete' }))
  await waitFor(() => expect(onDeleted).toHaveBeenCalledOnce())
  expect(state.remove).toHaveBeenCalledOnce()
  expect(state.remove).toHaveBeenCalledWith('existing')
  expect(onClose).toHaveBeenCalledOnce()
})

it('previews and saves the chosen name, color, and symbol, then restores trigger focus', async () => {
  const user = userEvent.setup(), onCreated = vi.fn()
  render(<NewCollectionButton onCreated={onCreated} />)
  const trigger = screen.getByRole('button', { name: 'New collection' })
  await user.click(trigger)
  const dialog = screen.getByRole('dialog', { name: 'New collection' })
  expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveFocus()
  await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Night reads')
  await user.click(within(dialog).getByRole('radio', { name: 'Navy' }))
  await user.click(within(dialog).getByRole('radio', { name: 'Moon' }))
  const preview = within(dialog).getByLabelText('Collection preview')
  expect(preview).toHaveTextContent('Night reads')
  expect(preview.querySelector('.collection-spine')).toHaveStyle('--cover-color: #2e415c')
  expect(preview.querySelector('.lucide-moon')).not.toBeNull()
  await user.click(within(dialog).getByRole('button', { name: 'Create collection' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(state.save).toHaveBeenCalledWith('Night reads', undefined, { color: '#2e415c', symbol: 'moon' }, '')
  expect(state.refresh).toHaveBeenCalledOnce()
  expect(onCreated).toHaveBeenCalledWith('new-collection')
  expect(trigger).toHaveFocus()
})

it('cancels without saving and starts with an empty name when reopened', async () => {
  const user = userEvent.setup()
  render(<NewCollectionButton iconOnly />)
  await user.click(screen.getByRole('button', { name: 'New collection' }))
  await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Discard this')
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(state.save).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'New collection' }))
  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('')
})

it('keeps the popup and choices available after a save failure', async () => {
  state.save.mockRejectedValueOnce(new Error('That collection name already exists.'))
  const user = userEvent.setup()
  render(<NewCollectionButton />)
  await user.click(screen.getByRole('button', { name: 'New collection' }))
  await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Comfort reads')
  await user.click(screen.getByRole('button', { name: 'Create collection' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('already exists')
  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Comfort reads')
  expect(screen.getByRole('textbox', { name: 'Name' })).toBeEnabled()
})

it('retries a failed reload without creating a duplicate collection', async () => {
  state.refresh.mockRejectedValueOnce(new Error('Could not reload library.'))
  const user = userEvent.setup()
  render(<NewCollectionButton />)
  await user.click(screen.getByRole('button', { name: 'New collection' }))
  await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Keep this')
  await user.click(screen.getByRole('button', { name: 'Create collection' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not reload')
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(state.save).toHaveBeenCalledOnce()
  expect(state.refresh).toHaveBeenCalledTimes(2)
})

it('creates collections from a story form without nesting or submitting that form', async () => {
  const user = userEvent.setup(), submitStory = vi.fn(event => event.preventDefault())
  render(<form onSubmit={submitStory}><input aria-label="Story title" required /><NewCollectionButton iconOnly /></form>)
  await user.click(screen.getByRole('button', { name: 'New collection' }))
  const dialog = screen.getByRole('dialog', { name: 'New collection' })
  expect(dialog.closest('form')).toBeNull()
  await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'New shelf')
  await user.click(within(dialog).getByRole('button', { name: 'Create collection' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(state.save).toHaveBeenCalledOnce()
  expect(submitStory).not.toHaveBeenCalled()
})

it('deletes empty collections directly and retries reload without repeating deletion', async () => {
  state.refresh.mockRejectedValueOnce(new Error('Reload failed.'))
  const onClose = vi.fn(), onDeleted = vi.fn(), user = userEvent.setup()
  render(<NewCollectionDialog collection={collection} onClose={onClose} onDeleted={onDeleted} />)
  await user.click(screen.getByRole('button', { name: 'Delete' }))
  expect(screen.queryByRole('dialog', { name: 'Delete collection?' })).not.toBeInTheDocument()
  expect(await screen.findByRole('alert')).toHaveTextContent('Reload failed')
  expect(onClose).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Delete' }))
  await waitFor(() => expect(onDeleted).toHaveBeenCalledOnce())
  expect(state.remove).toHaveBeenCalledOnce()
})

it('edits and clears a single collection summary', async () => {
  const onClose = vi.fn(), user = userEvent.setup()
  render(<NewCollectionDialog collection={{ ...collection, description: 'Existing summary' }} onClose={onClose} />)
  expect(screen.getByRole('textbox', { name: 'Summary' })).toHaveValue('Existing summary')
  await user.clear(screen.getByRole('textbox', { name: 'Summary' }))
  await user.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
  expect(state.save).toHaveBeenCalledWith('Night reads', 'existing', { color: '#123456', symbol: 'moon' }, '')
})

it('bulk edits only chosen appearance fields and excludes names and summaries', async () => {
  const onClose = vi.fn(), user = userEvent.setup()
  render(<NewCollectionDialog selectedCollections={[collection, { ...collection, id: 'second', name: 'Other', description: 'Keep this' }]} onClose={onClose} />)
  expect(screen.queryByRole('textbox', { name: 'Name' })).not.toBeInTheDocument()
  expect(screen.queryByRole('textbox', { name: 'Summary' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  await user.click(screen.getByRole('checkbox', { name: 'Change symbol' }))
  await user.click(screen.getByRole('radio', { name: 'Leaf' }))
  await user.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
  expect(state.updateMany).toHaveBeenCalledWith(['existing', 'second'], { symbol: 'leaf' })
  expect(state.save).not.toHaveBeenCalled()
})

it('converts an existing manual collection to automatic filters without changing its identity or appearance', async () => {
 const user = userEvent.setup(), onClose = vi.fn()
 render(<NewCollectionDialog collection={collection} onClose={onClose} />)
 const automatic = screen.getByRole('checkbox',{name:'Automatic collection'})
 expect(automatic).toBeEnabled()
 await user.click(automatic)
 expect(screen.getByText(/Saving replaces the manually chosen works/)).toBeVisible()
 fireEvent.change(screen.getByRole('searchbox',{name:'Search author'}),{target:{value:'Comfort'}})
 await user.click(screen.getByRole('heading',{name:'Edit collection'}))
 await user.click(screen.getByRole('button',{name:'Save changes'}))
 await waitFor(()=>expect(onClose).toHaveBeenCalledOnce())
 expect(state.save).toHaveBeenCalledWith('Night reads','existing',{color:'#123456',symbol:'moon'},'',expect.objectContaining({filters:expect.objectContaining({query:'Comfort'})}))
})


it('warns before turning automatic collections off and saves removal of the rules only on Save', async () => {
 const user=userEvent.setup(), closeEditor=vi.fn()
 const automatic={...collection,automatic_rules:automaticCollectionRules({...defaultReadingFilters,tags:'Fluff'})} as unknown as Collection
 render(<NewCollectionDialog collection={automatic} onClose={closeEditor} />)
 const toggle=screen.getByRole('checkbox',{name:'Automatic collection'})
 await user.click(toggle)
 let confirmation=screen.getByRole('dialog',{name:'Turn Off Automatic Collection?'})
 expect(confirmation).toHaveTextContent('New works will no longer be added automatically')
 await user.click(within(confirmation).getByRole('button',{name:'Cancel'}))
 expect(toggle).toBeChecked()
 await user.click(toggle)
 confirmation=screen.getByRole('dialog',{name:'Turn Off Automatic Collection?'})
 await user.click(within(confirmation).getByRole('button',{name:'Keep Works and Turn Off'}))
 expect(toggle).not.toBeChecked()
 expect(screen.queryByRole('group',{name:'Collection Filters'})).not.toBeInTheDocument()
 expect(state.save).not.toHaveBeenCalled()
 await user.click(screen.getByRole('button',{name:'Save changes'}))
 expect(state.save).toHaveBeenCalledWith(collection.name,collection.id,{color:collection.color,symbol:collection.symbol},'',null)
})
