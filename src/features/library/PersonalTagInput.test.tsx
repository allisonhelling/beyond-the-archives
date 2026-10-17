import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { PersonalTagHelp, PersonalTagInput } from './PersonalTagInput'

function Editor() {
  const [tags, setTags] = useState(['Comfort', 'Revisit'])
  return <PersonalTagInput value={tags} onChange={setTags} />
}
it('shows the tag instructions in a focusable help tooltip', async () => {
  const user = userEvent.setup()
  render(<><span>Personal tags</span><PersonalTagHelp /><Editor /></>)
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
