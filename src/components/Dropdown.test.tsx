import { useState } from 'react'
import { expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Dropdown } from './Dropdown'

function PublicationFilter() {
  const [value, setValue] = useState<string[]>([])
  return <><Dropdown label="Publication Status" multiple value={value} onChange={setValue} options={[
    { value: 'complete', label: 'Complete' }, { value: 'abandoned', label: 'Abandoned' },
  ]} /><button>Outside</button></>
}

it('supports multiple checkbox selections, keyboard navigation, dismissal, and clearing', async () => {
  const user = userEvent.setup()
  render(<PublicationFilter />)
  const trigger = screen.getByRole('button', { name: 'Publication Status' })
  expect(trigger).toHaveTextContent('All')
  trigger.focus()
  await user.keyboard('{ArrowDown}')
  const complete = screen.getByRole('checkbox', { name: 'Complete' })
  await waitFor(() => expect(complete).toHaveFocus())
  await user.keyboard(' {ArrowDown} ')
  const abandoned = screen.getByRole('checkbox', { name: 'Abandoned' })
  expect(complete).toBeChecked()
  expect(abandoned).toBeChecked()
  expect(abandoned).toHaveFocus()
  await user.keyboard('{Escape}')
  expect(trigger).toHaveFocus()
  expect(trigger).toHaveTextContent('2 selected')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await user.click(trigger)
  await user.click(screen.getByRole('checkbox', { name: 'Complete' }))
  await user.click(screen.getByRole('checkbox', { name: 'Abandoned' }))
  expect(trigger).toHaveTextContent('All')
  await user.click(screen.getByRole('button', { name: 'Outside' }))
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
})
