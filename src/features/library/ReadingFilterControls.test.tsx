import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { ReadingFilterControls } from './ReadingFilterControls'
import { defaultReadingFilters } from './reading-search'
import { exampleWork } from './display/display-examples'
const relationships=['A/B','A / B','A & B','A & B & C','Friendship','A/','& B',' / ','A and B']
it.each(['saved','remote'])('limits %s relationship suggestions to named ampersand or slash pairs',source=>{
 const story={...exampleWork,metadata:{...exampleWork.metadata,relationship_tags:relationships,character_tags:['Friendship'],additional_tags:['A and B']}}
 const suggestions=source==='remote'?{relationships,characters:['Friendship'],tags:['A and B']}:undefined
 render(<ReadingFilterControls stories={[story]} filters={defaultReadingFilters} onChange={()=>{}} alwaysExpanded suggestions={suggestions} />)
 fireEvent.focus(screen.getByLabelText('Relationships',{exact:true}))
 const menu=within(screen.getByRole('region',{name:'Relationships Suggestions'}))
 expect(new Set(menu.getAllByRole('button').map(button=>button.textContent))).toEqual(new Set(['A & B','A & B & C','A / B','A/B']))
 fireEvent.focus(screen.getByLabelText('Characters',{exact:true}))
 expect(within(screen.getByRole('region',{name:'Characters Suggestions'})).getByRole('button',{name:'Friendship'})).toBeVisible()
 fireEvent.focus(screen.getByLabelText('Tags',{exact:true}))
 expect(within(screen.getByRole('region',{name:'Tags Suggestions'})).getByRole('button',{name:'A and B'})).toBeVisible()
 expect(story.metadata.relationship_tags).toEqual(relationships)
})

it('keeps edits pending until Apply and shows only applied chips', () => {
 const onChange = vi.fn()
 render(<ReadingFilterControls stories={[]} filters={defaultReadingFilters} onChange={onChange} alwaysExpanded />)
 fireEvent.change(screen.getByLabelText('Search Title or Author'), { target: { value: 'Pending title' } })
 fireEvent.click(screen.getByRole('button', { name: 'Favorites' }))
 expect(onChange).not.toHaveBeenCalled()
 expect(screen.getByLabelText('Active Filters')).not.toHaveTextContent('Pending title')
 expect(screen.getByLabelText('Active Filters')).not.toHaveTextContent('Favorites')
 fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
 expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ query: 'Pending title', favorites: true }))
})

it('retains pending selections across external sort updates and clears them explicitly', () => {
 const onChange = vi.fn()
 const props = { stories: [], filters: defaultReadingFilters, onChange, alwaysExpanded: true }
 const view = render(<ReadingFilterControls {...props} />)
 fireEvent.click(screen.getByRole('button', { name: 'Favorites' }))
 view.rerender(<ReadingFilterControls {...props} filters={{ ...defaultReadingFilters, sort: 'alpha' }} />)
 fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
 expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ favorites: true, sort: 'alpha' }))
 fireEvent.click(screen.getAllByRole('button', { name: 'Clear All Filters' })[0])
 expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ favorites: false, sort: 'alpha' }))
 expect(screen.getByRole('button', { name: 'Favorites' })).toHaveAttribute('aria-pressed', 'false')
})

it('discards pending edits when browsing another scope without collapsing the panel', () => {
 const onChange = vi.fn(), props = { stories: [], filters: defaultReadingFilters, onChange }
 const view = render(<ReadingFilterControls {...props} defaultScope="library:all" />)
 fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
 fireEvent.click(screen.getByRole('button', { name: 'Favorites' }))
 view.rerender(<ReadingFilterControls {...props} defaultScope="library:finished" />)
 expect(screen.getByRole('region', { name: 'Library Filters' })).toBeVisible()
 expect(screen.getByRole('button', { name: 'Favorites' })).toHaveAttribute('aria-pressed', 'false')
 expect(onChange).not.toHaveBeenCalled()
})

it('validates pending dates without changing the applied results', () => {
 const onChange = vi.fn()
 render(<ReadingFilterControls stories={[]} filters={defaultReadingFilters} onChange={onChange} alwaysExpanded />)
 fireEvent.change(screen.getByLabelText('From', { exact: true }), { target: { value: '02/31/2026' } })
 expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled()
 expect(screen.getByRole('alert')).toHaveTextContent('valid From date')
 expect(onChange).not.toHaveBeenCalled()
})

it('keeps newer input when a previous Apply finishes after another edit', () => {
 const onChange = vi.fn(), props = { stories: [], filters: defaultReadingFilters, onChange }
 const view = render(<ReadingFilterControls {...props} />)
 const search = screen.getByLabelText('Search Title or Author')
 fireEvent.change(search, { target: { value: 'First search' } })
 fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
 fireEvent.change(search, { target: { value: '' } })
 view.rerender(<ReadingFilterControls {...props} filters={{ ...defaultReadingFilters, query: 'First search' }} />)
 expect(search).toHaveValue('')
 fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
 expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ query: '' }))
})

it('applies the pending search when Enter is pressed', () => {
 const onChange = vi.fn()
 render(<ReadingFilterControls stories={[]} filters={defaultReadingFilters} onChange={onChange} />)
 const input = screen.getByLabelText('Search Title or Author')
 fireEvent.change(input, { target: { value: 'Found Family' } })
 fireEvent.keyDown(input, { key: 'Enter' })
 expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ query: 'Found Family' }))
})
