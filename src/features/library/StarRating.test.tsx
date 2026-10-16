import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { StarRating } from './StarRating'

afterEach(cleanup)

it('previews hovered stars without changing the saved rating and restores it on leave', () => {
  const onChange = vi.fn()
  const { container } = render(<StarRating value={2} onChange={onChange} />)
  expect(container.querySelectorAll('svg[fill="currentColor"]')).toHaveLength(2)
  fireEvent.mouseEnter(screen.getByTitle('4/5'))
  expect(container.querySelectorAll('.rating-star[data-preview]')).toHaveLength(2)
  expect(container.querySelectorAll('svg[fill="currentColor"]')).toHaveLength(4)
  expect(screen.getByText('2/5')).toBeVisible()
  expect(onChange).not.toHaveBeenCalled()
  fireEvent.mouseLeave(screen.getByRole('radiogroup'))
  expect(container.querySelectorAll('.rating-star[data-preview]')).toHaveLength(0)
  expect(container.querySelectorAll('svg[fill="currentColor"]')).toHaveLength(2)
  fireEvent.click(screen.getByRole('radio', { name: '4 out of 5 stars' }))
  expect(onChange).toHaveBeenCalledWith(4)
})


it.each([
  { saved: 3, hovered: 2, filled: 3, lighter: [3] },
  { saved: 3, hovered: 5, filled: 5, lighter: [4, 5] },
  { saved: 3, hovered: 3, filled: 3, lighter: [] },
  { saved: null, hovered: 2, filled: 2, lighter: [1, 2] },
])('highlights only differences for saved $saved and hovered $hovered', ({ saved, hovered, filled, lighter }) => {
  const onChange = vi.fn()
  const { container } = render(<StarRating value={saved} onChange={onChange} />)
  fireEvent.mouseEnter(screen.getByTitle(`${hovered}/5`))
  expect(container.querySelectorAll('svg[fill="currentColor"]')).toHaveLength(filled)
  const lightStars = [...container.querySelectorAll('.rating-star[data-preview] input')].map(input => Number((input as HTMLInputElement).value))
  expect(lightStars).toEqual(lighter)
  expect(onChange).not.toHaveBeenCalled()
})


it('renders saved ratings as a noninteractive star visual', () => {
  const { container, rerender } = render(<StarRating value={4} />)
  expect(screen.getByRole('img', { name: '4 out of 5 stars' })).toBeVisible()
  expect(container.querySelectorAll('svg[fill="currentColor"]')).toHaveLength(4)
  expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  rerender(<StarRating value={null} />)
  expect(screen.getByRole('img', { name: 'Unrated' })).toBeVisible()
  expect(container.querySelectorAll('svg[fill="currentColor"]')).toHaveLength(0)
})


it('disables rating changes and clearing while saving', () => {
  render(<StarRating value={3} onChange={vi.fn()} disabled />)
  for (const star of screen.getAllByRole('radio')) expect(star).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Clear rating' })).toBeDisabled()
})


it('edits a rating draft and saves only when the checkmark is clicked', async () => {
  const onSave = vi.fn().mockResolvedValue(true)
  render(<StarRating value={3} onSave={onSave} />)
  expect(screen.getByRole('img', { name: '3 out of 5 stars' })).toBeVisible()
  expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Clear rating' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Edit personal rating' }))
  fireEvent.click(screen.getByRole('radio', { name: '5 out of 5 stars' }))
  expect(onSave).not.toHaveBeenCalled()
  expect(screen.getByRole('radio', { name: '5 out of 5 stars' })).toBeChecked()
  fireEvent.click(screen.getByRole('button', { name: 'Save rating changes' }))
  await waitFor(() => expect(onSave).toHaveBeenCalledWith(5))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Edit personal rating' })).toBeVisible())
  expect(screen.queryByRole('button', { name: 'Clear rating' })).not.toBeInTheDocument()
})

it('keeps a cleared draft editable when saving fails and allows a retry', async () => {
  const onSave = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  const { rerender } = render(<StarRating value={3} onSave={onSave} />)
  fireEvent.click(screen.getByRole('button', { name: 'Edit personal rating' }))
  fireEvent.click(screen.getByRole('button', { name: 'Clear rating' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save rating changes' }))
  await waitFor(() => expect(onSave).toHaveBeenCalledWith(null))
  expect(screen.getByRole('button', { name: 'Save rating changes' })).toBeVisible()
  rerender(<StarRating value={3} onSave={onSave} disabled />)
  expect(screen.getByRole('button', { name: 'Save rating changes' })).toBeDisabled()
  rerender(<StarRating value={3} onSave={onSave} />)
  fireEvent.click(screen.getByRole('button', { name: 'Save rating changes' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Edit personal rating' })).toBeVisible())
  expect(onSave).toHaveBeenCalledTimes(2)
})
