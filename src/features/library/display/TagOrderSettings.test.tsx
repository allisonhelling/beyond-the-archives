import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TagOrderSettings } from './TagOrderSettings'
import { allTagOrder, defaultAllTagOrder, saveTagAppearance, sameTagAppearance, tagAppearance } from './display-settings'
import { useTagAppearance } from './useDisplayPreference'
import { ExpandableMetadataTags } from '../ExpandableMetadataTags'
import { workTagGroups } from '../work-tags'
import { blankMetadata } from '../model'
beforeEach(()=>{
 const values=new Map<string,string>()
 vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)})
})
afterEach(()=>vi.unstubAllGlobals())
const metadata={...blankMetadata,additional_tags:['Fluff','Humor'],relationship_tags:['A/B'],character_tags:['Alice'],archive_warnings:['Warning'],categories:['Gen']}
function Example(){
 const appearance=useTagAppearance()
 return <><TagOrderSettings appearance={appearance} onChange={saveTagAppearance}/><ExpandableMetadataTags groups={workTagGroups(metadata)} limit={3}/></>
}
it('normalizes category lists and includes their effective order in sync comparisons',()=>{
 expect(allTagOrder()).toEqual(['tags','relationships','characters','categories','warnings'])
 expect(allTagOrder(['characters','characters','unknown'])).toEqual(['characters','tags','relationships','categories','warnings'])
 expect(tagAppearance(JSON.stringify({tagAppearance:{shape:'filled',colors:{},order:['characters']}})).order).toEqual(allTagOrder(['characters']))
 expect(sameTagAppearance({shape:'filled',colors:{}},{shape:'filled',colors:{},order:defaultAllTagOrder})).toBe(true)
 expect(sameTagAppearance({shape:'filled',colors:{}},{shape:'filled',colors:{},order:allTagOrder(['characters'])})).toBe(false)
})
it('reorders before truncation, saves the chosen order, and preserves category colors and expansion',()=>{
 act(()=>saveTagAppearance({shape:'filled',colors:{characters:'#123456'}}))
 const view=render(<Example/>)
 const values=()=>[...view.container.querySelectorAll('.metadata-tag')].map(tag=>tag.textContent)
 expect(values()).toEqual(['Fluff','Humor','A/B'])
 expect(screen.getByRole('button',{name:'Move Additional Tags Up'})).toBeDisabled()
 fireEvent.click(screen.getByRole('button',{name:'Move Characters Up'}))
 fireEvent.click(screen.getByRole('button',{name:'Move Characters Up'}))
 expect(values()).toEqual(['Alice','Fluff','Humor'])
 fireEvent.click(screen.getByRole('button',{name:'+3 more'}))
 expect(values()).toEqual(['Alice','Fluff','Humor','A/B','Gen','Warning'])
 expect(view.container.querySelector('[data-tag-category="characters"]')).toHaveStyle('--tag-color: #123456')
 view.unmount()
 const next=render(<Example/>)
 expect(next.container.querySelector('.metadata-tag')).toHaveTextContent('Alice')
})
it('disables category editing when the reader follows organizer settings',()=>{
 render(<TagOrderSettings appearance={{shape:'filled',colors:{}}} disabled onChange={()=>{throw new Error('Linked preferences must be read-only')}}/>)
 for(const button of screen.getAllByRole('button'))expect(button).toBeDisabled()
})
