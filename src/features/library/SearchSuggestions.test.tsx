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
