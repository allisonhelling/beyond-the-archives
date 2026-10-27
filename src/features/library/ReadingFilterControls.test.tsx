import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it } from 'vitest'
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
