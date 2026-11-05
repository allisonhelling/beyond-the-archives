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

it('skips disabled options when navigating from the keyboard', async () => {
 const user=userEvent.setup()
 render(<Dropdown label="Reader" value="" onChange={() => {}} options={[{value:'future',label:'Future Reader',disabled:true},{value:'ready',label:'Ready Reader'}]} />)
 screen.getByRole('button',{name:'Reader'}).focus()
 await user.keyboard('{ArrowDown}')
 await waitFor(() => expect(screen.getByRole('option',{name:'Ready Reader'})).toHaveFocus())
 await user.keyboard('{ArrowDown}')
 expect(screen.getByRole('option',{name:'Ready Reader'})).toHaveFocus()
 expect(screen.getByRole('option',{name:'Future Reader'})).toBeDisabled()
})

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

it('searches a multi-select without losing selected values or splitting labels containing commas', async () => {
  const user = userEvent.setup()
  function SearchableTags() {
    const [value, setValue] = useState<string[]>([])
    return <Dropdown label="Freeform Tags" multiple searchable showSelections value={value} onChange={setValue} options={[{ value: 'one', label: 'One Tag, With a Comma' }, { value: 'two', label: 'Other Tag' }]} />
  }
  render(<SearchableTags />)
  const trigger = screen.getByRole('button', { name: 'Freeform Tags' })
  await user.click(trigger)
  const search = screen.getByRole('searchbox', { name: 'Search Freeform Tags' })
  await user.type(search, 'comma')
  await user.click(screen.getByRole('checkbox', { name: 'One Tag, With a Comma' }))
  await user.clear(search)
  await user.type(search, 'other')
  await user.click(screen.getByRole('checkbox', { name: 'Other Tag' }))
  await user.keyboard('{Escape}')
  expect(trigger).toHaveTextContent('2 selected')
  expect(trigger).toHaveFocus()
  await user.click(screen.getByRole('button', { name: 'Remove Freeform Tags Filter One Tag, With a Comma' }))
  expect(trigger).toHaveTextContent('Other Tag')
})

it('supports a portaled chapter-title dropdown, keeping option clicks and keyboard focus inside', async () => {
  const user = userEvent.setup()
  function ChapterPicker() {
    const [value, setValue] = useState('one')
    return <div data-testid="chapter-container"><Dropdown label="Choose Chapter" textTrigger portal closeOnSelect value={value} onChange={setValue} options={[{ value: 'one', label: 'Chapter One' }, { value: 'two', label: 'Chapter Two' }]} /><button>Outside</button></div>
  }
  render(<ChapterPicker />)
  const trigger = screen.getByRole('button', { name: 'Choose Chapter' })
  expect(trigger).toHaveTextContent('Chapter One')
  await user.click(trigger)
  const panel = screen.getByRole('listbox', { name: 'Choose Chapter' })
  expect(screen.getByTestId('chapter-container')).not.toContainElement(panel)
  expect(panel).toHaveAttribute('data-portal', 'true')
  await user.click(screen.getByRole('option', { name: 'Chapter Two' }))
  expect(trigger).toHaveTextContent('Chapter Two')
  expect(trigger).toHaveFocus()
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  await user.keyboard('{ArrowDown}')
  await waitFor(() => expect(screen.getByRole('option', { name: 'Chapter Two' })).toHaveFocus())
  await user.keyboard('{ArrowUp}{Enter}')
  expect(trigger).toHaveTextContent('Chapter One')
  await user.click(trigger)
  await user.keyboard('{Escape}')
  expect(trigger).toHaveFocus()
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  await user.click(trigger)
  await user.click(screen.getByRole('button', { name: 'Outside' }))
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
})
