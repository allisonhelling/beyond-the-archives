import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { TagGroupEditor } from './TagGroupEditor'
import { useTagGroupDraft } from './useTagGroupDraft'
import type { TagExpression } from './tag-expressions'

function CharacterEditor({ onChange }: { onChange: (expression: TagExpression) => void }) {
  const [expression, setExpression] = useState<TagExpression>({ mode: 'custom', groups: [] })
  const draft = useTagGroupDraft(expression, next => { setExpression(next); onChange(next) })
  return <TagGroupEditor label="Characters" draft={draft} renderChoices={({ selected, onChange, label }) => <fieldset>
    <legend>{label}</legend>
    {['Hero', 'Villain'].map(tag => <label key={tag}><input type="checkbox" checked={selected.includes(tag)} onChange={() => onChange(selected.includes(tag) ? selected.filter(value => value !== tag) : [...selected, tag])} />{tag}</label>)}
  </fieldset>} />
}

it('reuses group editing for another category and preserves blank group positions while editing', () => {
  const onChange = vi.fn()
  render(<CharacterEditor onChange={onChange} />)
  const add = screen.getByRole('button', { name: 'Add Group' })
  fireEvent.click(add)
  fireEvent.click(add)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Hero' }))
  expect(screen.getByRole('button', { name: 'Group 2' })).toHaveAttribute('aria-pressed', 'true')
  expect(within(screen.getByRole('group', { name: 'Group 2 Characters' })).getByRole('checkbox', { name: 'Hero' })).toBeChecked()
  expect(onChange).toHaveBeenLastCalledWith({ mode: 'custom', groups: [['Hero']] })

  fireEvent.click(screen.getByRole('button', { name: 'Group 1' }))
  expect(screen.getByRole('checkbox', { name: 'Hero' })).not.toBeChecked()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Villain' }))
  expect(onChange).toHaveBeenLastCalledWith({ mode: 'custom', groups: [['Villain'], ['Hero']] })
  fireEvent.click(screen.getByRole('checkbox', { name: 'Villain' }))
  expect(screen.getByRole('button', { name: 'Group 1' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('checkbox', { name: 'Hero' })).not.toBeChecked()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Hero' }))
  // A tag may participate in different groups, but each group owns its selection.
  expect(onChange).toHaveBeenLastCalledWith({ mode: 'custom', groups: [['Hero'], ['Hero']] })
  fireEvent.click(screen.getByRole('button', { name: 'Remove Group 1' }))
  expect(onChange).toHaveBeenLastCalledWith({ mode: 'custom', groups: [['Hero']] })
  fireEvent.click(screen.getByRole('button', { name: 'Remove Group 1' }))
  expect(onChange).toHaveBeenLastCalledWith({ mode: 'custom', groups: [] })
  expect(screen.queryByRole('checkbox')).toBeNull()
})
