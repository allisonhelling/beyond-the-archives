import { fireEvent,render,screen,within } from '@testing-library/react'
import { expect,it,vi } from 'vitest'
const records=vi.hoisted(()=>({value:[] as {category:string;name:string;status:string;canonical_name:string|null}[]}))
vi.mock('./tags/useTagResolutions',()=>({useTagResolutions:()=>({records:records.value,unavailable:false})}))
import { SearchSuggestions } from './SearchSuggestions'
it('places verified standard names first, separates other tags, and keeps keyboard selection working',()=>{
 records.value=[{category:'character',name:'Alya Césaire',status:'canonical',canonical_name:'Alya Césaire'},{category:'character',name:'Alya (Miraculous Ladybug)',status:'synonym',canonical_name:'Alya Césaire'}]
 const changed=vi.fn()
 render(<SearchSuggestions label="Characters" placeholder="Search characters" value="" onChange={changed} groups={[{label:'Characters',values:['Alya (Miraculous Ladybug)','Custom Alya']}]} chips multiple keepOpen hideHeadings tagCategory="characters" />)
 const input=screen.getByLabelText('Characters',{exact:true})
 fireEvent.change(input,{target:{value:'miraculous'}})
 const popup=screen.getByRole('region',{name:'Characters Suggestions'})
 const groups=within(popup).getAllByRole('group')
 expect(groups.map(group=>group.getAttribute('aria-label'))).toEqual(['Standard Tags Suggestions','Other / Unverified Tags Suggestions'])
 expect(within(groups[0]).getByRole('button',{name:'Alya Césaire'})).toBeVisible()
 expect(within(groups[1]).getByRole('button',{name:'Alya (Miraculous Ladybug)'})).toBeVisible()
 input.focus();fireEvent.keyDown(input,{key:'ArrowDown'})
 expect(document.activeElement).toBe(within(groups[0]).getByRole('button'))
 fireEvent.click(document.activeElement!)
 expect(changed).toHaveBeenCalledWith('Alya Césaire')
 expect(input).toHaveFocus()
})

it('sorts special-character suggestions last and separates selected tags without bullets', () => {
 records.value = []
 render(<SearchSuggestions label="Tags" placeholder="Search tags" value="Selected, Another" onChange={vi.fn()} groups={[{label:'Tags',values:['!First','Zulu','Alpha','(Other)']}]} chips multiple tagCategory="tags" />)
 fireEvent.focus(screen.getByLabelText('Tags', { exact: true }))
 const popup = screen.getByRole('region', { name: 'Tags Suggestions' })
 expect(within(popup).getAllByRole('button').map(button => button.textContent)).toEqual(['Alpha', 'Zulu', '!First', '(Other)'])
 expect(screen.getByLabelText('Tags Selected Filters').textContent).toBe('Selected Another')
 expect(screen.queryByText(/Standard tags include/)).not.toBeInTheDocument()
})

it('dismisses suggestions with Escape without clearing the search or triggering a parent shortcut', () => {
 records.value = []
 const changed = vi.fn(), parent = vi.fn()
 render(<div onKeyDown={parent}><SearchSuggestions label="Title" placeholder="Search titles" value="Pending search" onChange={changed} groups={[{ label: 'Titles', values: ['Pending search'] }]} /></div>)
 const input = screen.getByLabelText('Title', { exact: true })
 fireEvent.focus(input)
 expect(input).toHaveAttribute('aria-expanded', 'true')
 expect(fireEvent.keyDown(input, { key: 'Escape', cancelable: true })).toBe(false)
 expect(input).toHaveValue('Pending search')
 expect(input).toHaveAttribute('aria-expanded', 'false')
 expect(changed).not.toHaveBeenCalled()
 expect(parent).not.toHaveBeenCalled()
})


it('keeps inline suggestions in place through an outside press and dismisses after its click', () => {
 const clicked = vi.fn()
 render(<><SearchSuggestions label="Title" placeholder="Search titles" value="Pending" onChange={vi.fn()} groups={[{ label: 'Titles', values: ['Pending'] }]} /><button onClick={clicked}>Apply</button></>)
 const input = screen.getByLabelText('Title', { exact: true }), apply = screen.getByRole('button', { name: 'Apply' })
 fireEvent.focus(input)
 fireEvent.pointerDown(apply)
 fireEvent.focusIn(apply)
 expect(input).toHaveAttribute('aria-expanded', 'true')
 fireEvent.pointerUp(apply)
 fireEvent.click(apply)
 expect(clicked).toHaveBeenCalledOnce()
 expect(input).toHaveAttribute('aria-expanded', 'false')
 fireEvent.focus(input)
 fireEvent.focusIn(apply)
 expect(input).toHaveAttribute('aria-expanded', 'false')
})
