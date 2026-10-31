import { ArrowDown, ArrowUp } from 'lucide-react'
import { allTagCategories, allTagOrder, type TagAppearance } from './display-settings'

/** Shared category ordering; individual tags retain their existing source/verification order. */
export function TagOrderSettings({appearance,onChange,disabled=false}:{appearance:TagAppearance;onChange:(next:TagAppearance)=>void;disabled?:boolean}) {
 const order=allTagOrder(appearance.order)
 function move(index:number,direction:number) {
  const next=[...order],target=index+direction
  if(target<0||target>=next.length)return
  const category=next[index]
  next[index]=next[target];next[target]=category
  onChange({...appearance,order:next})
 }
 return <fieldset className="display-tag-order settings-subsection" disabled={disabled}><legend>All Tags Order</legend>
  <p className="field-help">Choose which categories appear first in All Tags. Additional Tags appears first by default. Tags keep their order within each category.</p>
  <ol className="tag-order-list">{order.map((category,index)=><li key={category}><span>{allTagCategories[category]}</span><div className="tag-order-actions">
   <button type="button" className="button secondary" disabled={index===0} aria-label={`Move ${allTagCategories[category]} Up`} onClick={()=>move(index,-1)}><ArrowUp size={16} aria-hidden="true" /></button>
   <button type="button" className="button secondary" disabled={index===order.length-1} aria-label={`Move ${allTagCategories[category]} Down`} onClick={()=>move(index,1)}><ArrowDown size={16} aria-hidden="true" /></button>
  </div></li>)}</ol>
 </fieldset>
}
