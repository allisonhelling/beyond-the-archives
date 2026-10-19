import { useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { PersonalTagInput } from './PersonalTagInput'

function Editor() {
  const [tags, setTags] = useState(['Comfort', 'Revisit'])
  return <PersonalTagInput value={tags} onChange={setTags} />
}
it('shows the tag instructions in a focusable help tooltip', async () => {
  const user = userEvent.setup()
  render(<><span>Personal tags</span><Editor /></>)
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Personal tags help' }))
  expect(screen.getByRole('tooltip')).toHaveTextContent('Press Enter to add a tag. Use arrow keys to move between tags; Backspace selects, then deletes the previous tag.')
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
})
it('adds unique tags with Enter, commits a draft on leaving, and deletes clicked chips', async () => {
  const user = userEvent.setup()
  render(<><Editor /><button>Outside</button></>)
  const input = screen.getByRole('textbox', { name: 'Personal tags' })
  await user.type(input, 'New tag{Enter}new TAG{Enter}')
  expect(screen.getAllByRole('button', { name: /^Delete personal tag/ })).toHaveLength(3)
  await user.type(input, 'Another')
  await user.click(screen.getByRole('button', { name: 'Outside' }))
  expect(screen.getByRole('button', { name: 'Delete personal tag Another' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Delete personal tag Comfort' }))
  expect(screen.queryByRole('button', { name: 'Delete personal tag Comfort' })).not.toBeInTheDocument()
})
it('inserts between chips and requires two Backspaces to remove the previous chip', async () => {
  const user = userEvent.setup()
  render(<Editor />)
  await user.click(screen.getByRole('textbox', { name: 'Personal tags' }))
  await user.keyboard('{ArrowLeft}{Backspace}')
  const first = screen.getByRole('button', { name: 'Delete personal tag Comfort' })
  expect(first).toHaveClass('tag-selected')
  expect(screen.getByRole('button', { name: 'Delete personal tag Revisit' })).not.toHaveClass('tag-selected')
  await user.keyboard('{Backspace}')
  expect(screen.queryByRole('button', { name: 'Delete personal tag Comfort' })).not.toBeInTheDocument()
  await user.keyboard('Inserted{Enter}')
  expect(screen.getAllByRole('button', { name: /^Delete personal tag/ }).map(button => button.textContent)).toEqual(['Inserted', 'Revisit'])
  await user.click(screen.getByRole('button', { name: 'Insert tag at start' }))
  await user.keyboard('First{Enter}')
  expect(screen.getAllByRole('button', { name: /^Delete personal tag/ }).map(button => button.textContent)).toEqual(['First', 'Inserted', 'Revisit'])
})


afterEach(() => vi.unstubAllGlobals())
it('selects mobile tags before deleting and clears selection when switching tags or leaving', async () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
  const user = userEvent.setup()
  render(<><Editor /><button>Outside</button></>)
  const first = screen.getByRole('button', { name: 'Delete personal tag Comfort' })
  const second = screen.getByRole('button', { name: 'Delete personal tag Revisit' })
  await user.click(first)
  expect(first).toHaveClass('tag-selected')
  expect(first).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getAllByRole('button', { name: /^Delete personal tag/ })).toHaveLength(2)
  await user.click(second)
  expect(first).not.toHaveClass('tag-selected')
  expect(second).toHaveClass('tag-selected')
  await user.click(screen.getByRole('button', { name: 'Outside' }))
  expect(second).not.toHaveClass('tag-selected')
  await user.click(second)
  expect(second).toHaveClass('tag-selected')
  await user.click(second)
  expect(screen.queryByRole('button', { name: 'Delete personal tag Revisit' })).not.toBeInTheDocument()
  expect(first).not.toHaveClass('tag-selected')
  expect(screen.getByRole('textbox', { name: 'Personal tags' })).toHaveFocus()
})

it('moves the typing position after a hold and preserves the draft when cancelled or dropped', () => {
  vi.useFakeTimers()
  try {
    const { container } = render(<Editor />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Personal tags' }), { target: { value: 'Keep draft' } })
    const handle = screen.getByRole('button', { name: 'Move tag typing position' })
    Object.assign(handle, { setPointerCapture: vi.fn(), hasPointerCapture: () => true, releasePointerCapture: vi.fn() })
    for (const slot of container.querySelectorAll<HTMLElement>('[data-tag-position]')) {
      const left = Number(slot.dataset.tagPosition) * 100
      vi.spyOn(slot, 'getBoundingClientRect').mockReturnValue({ left, top: 0, width: 20, height: 24 } as DOMRect)
    }
    function pointer(type: string, x: number) {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true }, button: { value: 0 }, clientX: { value: x }, clientY: { value: 12 } })
      fireEvent(handle, event)
    }
    for (const commit of [false, true]) {
      pointer('pointerdown', 210)
      expect(handle).toHaveAttribute('aria-pressed', 'false')
      act(() => { vi.advanceTimersByTime(300) })
      expect(handle).toHaveAttribute('aria-pressed', 'true')
      pointer('pointermove', 10)
      expect(container.querySelector('[data-tag-position="0"]')).toHaveAttribute('data-drop-target', 'true')
      pointer(commit ? 'pointerup' : 'pointercancel', 10)
      expect(screen.getByRole('textbox', { name: 'Personal tags' })).toHaveValue('Keep draft')
      expect(container.querySelector('.tag-input-entry')).toHaveAttribute('data-tag-position', commit ? '0' : '2')
      expect(screen.getAllByRole('button', { name: /^Delete personal tag/ }).map(button => button.textContent)).toEqual(['Comfort', 'Revisit'])
    }
    expect(screen.getByRole('textbox', { name: 'Personal tags' })).toHaveFocus()
  } finally { vi.useRealTimers() }
})

it('shows only touch instructions in mobile tag help beside the input', async () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
  const user = userEvent.setup()
  const { container } = render(<Editor />)
  await user.click(screen.getByRole('button', { name: 'Personal tags help' }))
  const tooltip = screen.getByRole('tooltip')
  expect(tooltip).toHaveTextContent('Hold the grip beside the typing field')
  expect(tooltip).toHaveTextContent('Tap a tag to select it, then tap it again to delete it.')
  expect(tooltip).not.toHaveTextContent(/Enter|arrow keys|Backspace|On mobile/)
  expect(container.querySelector('.personal-tag-editor')).toContainElement(screen.getByRole('button', { name: 'Personal tags help' }))
})

it('keeps the same focused input when submitting consecutive tags without scrolling focus', async () => {
  const user = userEvent.setup()
  render(<Editor />)
  const input = screen.getByRole('textbox', { name: 'Personal tags' })
  const focus = vi.spyOn(HTMLInputElement.prototype, 'focus')
  await user.type(input, 'First added{Enter}')
  expect(screen.getByRole('textbox', { name: 'Personal tags' })).toBe(input)
  expect(input).toHaveFocus()
  expect(focus).toHaveBeenLastCalledWith({ preventScroll: true })
  await user.type(input, 'Second added{Enter}')
  expect(screen.getByRole('textbox', { name: 'Personal tags' })).toBe(input)
  expect(input).toHaveFocus()
  expect(screen.getAllByRole('button', { name: /^Delete personal tag/ }).map(button => button.textContent)).toEqual(['Comfort', 'Revisit', 'First added', 'Second added'])
})
