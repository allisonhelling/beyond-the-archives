import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CollectionMembershipDialog } from './CollectionMembershipDialog'
import { blankMetadata, type Collection, type Story } from './model'

const state = vi.hoisted(() => ({ add: vi.fn(), refresh: vi.fn(), stories: [] as Story[], collections: [] as Collection[] }))
vi.mock('./repository', () => ({ addStoriesToCollections: state.add }))
vi.mock('./LibraryProvider', () => ({ useLibrary: () => state }))

const story = { id: 'first', metadata: { ...blankMetadata, title: 'Moonrise', authors: ['Writer'] }, collectionIds: ['existing'] } as Story
const collection = { id: 'existing', name: 'Night reads', default_key: null } as Collection
const showModal = HTMLDialogElement.prototype.showModal, close = HTMLDialogElement.prototype.close
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
afterAll(() => { HTMLDialogElement.prototype.showModal = showModal; HTMLDialogElement.prototype.close = close })
beforeEach(() => {
  vi.clearAllMocks(); state.add.mockResolvedValue(undefined); state.refresh.mockResolvedValue(undefined)
  state.stories = [story, { ...story, id: 'second', metadata: { ...story.metadata, title: 'Daybreak' }, collectionIds: [] }]
  state.collections = [collection, { ...collection, id: 'new', name: 'Weekend reads' }, { ...collection, id: 'default', name: 'Favorites', default_key: 'favorites' }]
})

it('searches custom collections, keeps existing memberships checked, and adds only the chosen memberships', async () => {
  const user = userEvent.setup(), onClose = vi.fn()
  render(<CollectionMembershipDialog story={story} onClose={onClose} />)
  expect(screen.getByRole('checkbox', { name: 'Night reads' })).toBeChecked()
  expect(screen.getByRole('checkbox', { name: 'Night reads' })).toBeDisabled()
  expect(screen.queryByRole('checkbox', { name: 'Favorites' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Add to collections' })).toBeDisabled()
  await user.type(screen.getByRole('searchbox'), 'weekend')
  expect(screen.queryByRole('checkbox', { name: 'Night reads' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('checkbox', { name: 'Weekend reads' }))
  await user.clear(screen.getByRole('searchbox'))
  expect(screen.getByRole('checkbox', { name: 'Weekend reads' })).toBeChecked()
  await user.click(screen.getByRole('button', { name: 'Add to collections' }))
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
  expect(state.add).toHaveBeenCalledWith(['first'], ['new'])
})

it('adds stories from a collection page and searches by title or author', async () => {
  const user = userEvent.setup(), onClose = vi.fn()
  render(<CollectionMembershipDialog collection={collection} onClose={onClose} />)
  expect(screen.getByRole('checkbox', { name: 'Moonrise' })).toBeDisabled()
  await user.type(screen.getByRole('searchbox'), 'writer')
  expect(screen.getAllByRole('checkbox')).toHaveLength(2)
  await user.clear(screen.getByRole('searchbox'))
  await user.type(screen.getByRole('searchbox'), 'daybreak')
  await user.click(screen.getByRole('checkbox', { name: 'Daybreak' }))
  await user.click(screen.getByRole('button', { name: 'Add Story' }))
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
  expect(state.add).toHaveBeenCalledWith(['second'], ['existing'])
})

it('retains selections after a save failure and retries a reload without repeating a successful mutation', async () => {
  const user = userEvent.setup(), onClose = vi.fn()
  state.add.mockRejectedValueOnce(new Error('Offline.'))
  state.refresh.mockRejectedValueOnce(new Error('Reload failed.'))
  render(<CollectionMembershipDialog story={story} onClose={onClose} />)
  await user.click(screen.getByRole('checkbox', { name: 'Weekend reads' }))
  await user.click(screen.getByRole('button', { name: 'Add to collections' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Offline.')
  expect(screen.getByRole('checkbox', { name: 'Weekend reads' })).toBeChecked()
  await user.click(screen.getByRole('button', { name: 'Add to collections' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Reload failed.')
  expect(onClose).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
  expect(state.add).toHaveBeenCalledTimes(2)
})

it('supports an empty library and cancellation without writing', async () => {
  state.stories = []
  const user = userEvent.setup(), onClose = vi.fn()
  render(<CollectionMembershipDialog collection={collection} onClose={onClose} />)
  expect(screen.getByText('No matches found.')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Add Story' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(onClose).toHaveBeenCalledOnce()
  expect(state.add).not.toHaveBeenCalled()
})
