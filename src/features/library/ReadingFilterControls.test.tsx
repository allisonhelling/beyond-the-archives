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
 fireEvent.click(screen.getByRole('button', { name: 'Apply Filters' }))
 expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ query: 'Pending title', favorites: true }))
})

it('retains pending selections across external sort updates and clears them explicitly', () => {
 const onChange = vi.fn()
 const props = { stories: [], filters: defaultReadingFilters, onChange, alwaysExpanded: true }
 const view = render(<ReadingFilterControls {...props} />)
 fireEvent.click(screen.getByRole('button', { name: 'Favorites' }))
 view.rerender(<ReadingFilterControls {...props} filters={{ ...defaultReadingFilters, sort: 'alpha' }} />)
 fireEvent.click(screen.getByRole('button', { name: 'Apply Filters' }))
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
 expect(screen.getByRole('button', { name: 'Apply Filters' })).toBeDisabled()
 expect(screen.getByRole('alert')).toHaveTextContent('valid From date')
 expect(onChange).not.toHaveBeenCalled()
})

it('keeps newer input when a previous Apply finishes after another edit', () => {
 const onChange = vi.fn(), props = { stories: [], filters: defaultReadingFilters, onChange }
 const view = render(<ReadingFilterControls {...props} />)
 const search = screen.getByLabelText('Search Title or Author')
 fireEvent.change(search, { target: { value: 'First search' } })
 fireEvent.click(screen.getByRole('button', { name: 'Apply Filters' }))
 fireEvent.change(search, { target: { value: '' } })
 view.rerender(<ReadingFilterControls {...props} filters={{ ...defaultReadingFilters, query: 'First search' }} />)
 expect(search).toHaveValue('')
 fireEvent.click(screen.getByRole('button', { name: 'Apply Filters' }))
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

it('removes individual applied filters immediately while retaining the other selections', () => {
 const onChange = vi.fn()
 const filters = { ...defaultReadingFilters, fandoms: ['First', 'Second'], tags: 'Fluff, Angst', crossovers: 'exclude' as const, sort: 'words' as const }
 render(<ReadingFilterControls stories={[]} filters={filters} onChange={onChange} />)
 fireEvent.click(screen.getByRole('button', { name: 'Remove Filter Fandom: First' }))
 expect(onChange).toHaveBeenLastCalledWith({ ...filters, fandoms: ['Second'] })
 fireEvent.click(screen.getByRole('button', { name: 'Remove Filter Tags: Fluff' }))
 expect(onChange).toHaveBeenLastCalledWith({ ...filters, tags: 'Angst' })
 fireEvent.click(screen.getByRole('button', { name: 'Remove Filter Crossovers Exclude' }))
 expect(onChange).toHaveBeenLastCalledWith({ ...filters, crossovers: 'allowed' })
})

it('converts modes in the existing draft and restores Custom until a flat selection edit, including reversed edits',()=>{
 const onChange=vi.fn(), filters={...defaultReadingFilters,fandoms:['A','B','C'],tagExpressions:{fandoms:{mode:'custom' as const,groups:[['A','B'],['C']]}}}
 const props={stories:[],filters,onChange,fandomOptions:['A','B','C','D'].map(name=>({name,count:1}))}
 render(<ReadingFilterControls {...props} alwaysExpanded />)
 fireEvent.click(screen.getByRole('button',{name:/Select Fandoms/}))
 fireEvent.click(screen.getByRole('tab',{name:'Any'}))
 fireEvent.click(screen.getByRole('tab',{name:'All'}))
 fireEvent.click(screen.getByRole('tab',{name:'Custom'}))
 expect(screen.getByText('A AND B')).toBeVisible()
 expect(onChange).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('tab',{name:'Any'}))
 fireEvent.click(screen.getByRole('checkbox',{name:'D (1)'}))
 fireEvent.click(screen.getByRole('checkbox',{name:'D (1)'}))
 fireEvent.click(screen.getByRole('tab',{name:'Custom'}))
 expect(screen.queryByText('A AND B')).toBeNull()
 expect(screen.getByRole('button',{name:'Group 3'})).toBeVisible()
 fireEvent.click(screen.getByRole('button',{name:'Apply Filters'}))
 expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({tagExpressions:{fandoms:{mode:'custom',groups:[['A'],['B'],['C']]}}}))
})

it('edits scoped Custom groups, ignores empty placeholders, retains draft across dismissal and clears immediately',()=>{
 const onChange=vi.fn()
 render(<ReadingFilterControls stories={[]} filters={{...defaultReadingFilters,sort:'words',groupBy:'author'}} onChange={onChange} fandomOptions={['A','B','C'].map(name=>({name,count:1}))} alwaysExpanded />)
 fireEvent.click(screen.getByRole('button',{name:'Select Fandoms'}))
 fireEvent.click(screen.getByRole('tab',{name:'Custom'}))
 fireEvent.click(screen.getByRole('button',{name:'Add Group'}))
 fireEvent.click(screen.getByRole('checkbox',{name:'A (1)'}))
 fireEvent.click(screen.getByRole('checkbox',{name:'B (1)'}))
 fireEvent.click(screen.getByRole('button',{name:'Add Group'}))
 fireEvent.click(screen.getByRole('checkbox',{name:'C (1)'}))
 fireEvent.click(screen.getByRole('button',{name:'Add Group'}))
 fireEvent.click(screen.getByRole('tab',{name:'Any'}))
 fireEvent.click(screen.getByRole('tab',{name:'Custom'}))
 expect(screen.getByText('A AND B')).toBeVisible()
 fireEvent.keyDown(screen.getByRole('tab',{name:'Custom'}),{key:'Escape'})
 expect(screen.queryByRole('tab',{name:'Custom'})).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:/Select Fandoms/}))
 expect(screen.getByText('A AND B')).toBeVisible()
 fireEvent.click(screen.getByRole('button',{name:'Apply Filters'}))
 expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({tagExpressions:{fandoms:{mode:'custom',groups:[['A','B'],['C']]}}}))
 fireEvent.click(screen.getAllByRole('button',{name:'Clear All Filters'})[0])
 expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({tagExpressions:{},fandoms:[],sort:'words',groupBy:'author'}))
})

it('keeps the automatic collection menu open while its enclosing form owns the draft',()=>{
 const onChange=vi.fn(), props={stories:[],onChange,automaticCollection:true,alwaysExpanded:true,fandomOptions:['A','B'].map(name=>({name,count:1}))}
 const view=render(<ReadingFilterControls {...props} filters={defaultReadingFilters} />)
 fireEvent.click(screen.getByRole('button',{name:'Fandoms'}))
 fireEvent.click(screen.getByRole('tab',{name:'Custom'}))
 view.rerender(<ReadingFilterControls {...props} filters={onChange.mock.lastCall![0]} />)
 expect(screen.getByRole('button',{name:'Add Group'})).toBeVisible()
 fireEvent.click(screen.getByRole('button',{name:'Add Group'}))
 fireEvent.click(screen.getByRole('checkbox',{name:'A (1)'}))
 view.rerender(<ReadingFilterControls {...props} filters={onChange.mock.lastCall![0]} />)
 expect(screen.getByRole('checkbox',{name:'A (1)'})).toBeChecked()
 fireEvent.click(screen.getByRole('checkbox',{name:'B (1)'}))
 view.rerender(<ReadingFilterControls {...props} filters={onChange.mock.lastCall![0]} />)
 expect(screen.getByText('A AND B')).toBeVisible()
 fireEvent.click(screen.getByRole('tab',{name:'Any'}))
 view.rerender(<ReadingFilterControls {...props} filters={onChange.mock.lastCall![0]} />)
 fireEvent.click(screen.getByRole('tab',{name:'Custom'}))
 expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({tagExpressions:{fandoms:{mode:'custom',groups:[['A','B']]}}}))
})

it('replaces an unrelated pending expression on browser history navigation',()=>{
 const onChange=vi.fn(), props={stories:[],onChange,fandomOptions:['A','B'].map(name=>({name,count:1}))}
 const view=render(<ReadingFilterControls {...props} filters={defaultReadingFilters} navigationKey="first" />)
 fireEvent.click(screen.getByRole('button',{name:'Select Fandoms'}))
 fireEvent.click(screen.getByRole('checkbox',{name:'A (1)'}))
 fireEvent.click(screen.getByRole('tab',{name:'Custom'}))
 view.rerender(<ReadingFilterControls {...props} filters={{...defaultReadingFilters,fandoms:['B']}} navigationKey="history" />)
 fireEvent.click(screen.getByRole('button',{name:'Apply Filters'}))
 expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({fandoms:['B'],tagExpressions:{}}))
})

it('can remove a Custom group tag even when it is absent from the current facet options',()=>{
 const onChange=vi.fn(), filters={...defaultReadingFilters,tagExpressions:{fandoms:{mode:'custom' as const,groups:[['Absent','A']]}}}
 render(<ReadingFilterControls stories={[]} filters={filters} onChange={onChange} fandomOptions={[{name:'A',count:1}]} />)
 fireEvent.click(screen.getByRole('button',{name:/Select Fandoms/}))
 fireEvent.click(screen.getByRole('checkbox',{name:'Absent (0)'}))
 fireEvent.click(screen.getByRole('button',{name:'Apply Filters'}))
 expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({tagExpressions:{fandoms:{mode:'custom',groups:[['A']]}}}))
})

it('preserves the reader selector’s existing external matching-control slot',async()=>{
 const {FandomSelect}=await import('./ReadingFilterControls')
 render(<FandomSelect options={[]} selected={[]} onChange={()=>{}} matchingControl={<span>Reader Match Options</span>} modeControl={<span>Menu Mode Options</span>} />)
 expect(screen.getByText('Reader Match Options')).toBeVisible()
 expect(screen.queryByText('Menu Mode Options')).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'Select Fandoms'}))
 expect(screen.getByText('Menu Mode Options')).toBeVisible()
})

it('retains ordered blank Custom groups across dismissal without persisting placeholders', () => {
 const onChange = vi.fn()
 render(<ReadingFilterControls stories={[]} filters={defaultReadingFilters} onChange={onChange} fandomOptions={['A','B'].map(name => ({name,count:1}))} />)
 fireEvent.click(screen.getByRole('button', {name:'Select Fandoms'}))
 fireEvent.click(screen.getByRole('tab', {name:'Custom'}))
 fireEvent.click(screen.getByRole('button', {name:'Add Group'}))
 fireEvent.click(screen.getByRole('button', {name:'Add Group'}))
 fireEvent.click(screen.getByRole('checkbox', {name:'B (1)'}))
 expect(screen.getByRole('button', {name:'Group 2'})).toHaveAttribute('aria-pressed','true')
 fireEvent.keyDown(screen.getByRole('tab', {name:'Custom'}), {key:'Escape'})
 fireEvent.click(screen.getByRole('button', {name:/Select Fandoms/}))
 fireEvent.click(screen.getByRole('button', {name:'Group 1'}))
 expect(screen.getByRole('checkbox', {name:'B (1)'})).not.toBeChecked()
 fireEvent.click(screen.getByRole('checkbox', {name:'A (1)'}))
 fireEvent.click(screen.getByRole('button', {name:'Add Group'}))
 fireEvent.click(screen.getByRole('button', {name:'Apply Filters'}))
 expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({tagExpressions:{fandoms:{mode:'custom',groups:[['A'],['B']]}}}))
})
