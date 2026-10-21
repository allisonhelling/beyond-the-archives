import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLibrary } from './LibraryProvider'
import type { Story } from './model'
import { readingGroups, type GroupBy } from './reading-search'

type Row = { key: string; heading?: string; count?: number; group?: string; stories?: Story[] }
/** Variable-height rows reuse the ordinary grid/cards. A focused row stays
 * mounted outside the visible range so menus and keyboard focus remain valid. */
export function LibraryResults({ stories, groupBy, renderStory }: { stories: Story[]; groupBy: GroupBy; renderStory: (story: Story, linkId?: string) => ReactNode }) {
 const { rowHeights } = useLibrary()
 const container=useRef<HTMLDivElement>(null)
 const focusTarget=useRef<{ story: string; id: string; tag: string; label: string | null } | null>(null)
 const [viewport,setViewport]=useState({top:0,bottom:window.innerHeight,width:window.innerWidth,columns:window.matchMedia?.('(max-width: 760px)').matches?1:2})
 const [measurement,setMeasurement]=useState(0),[focused,setFocused]=useState<string|null>(null)
 const windowed=stories.length>100
 const groups=useMemo(()=>readingGroups(stories,groupBy),[stories,groupBy])
 const rows=useMemo(()=>groups.flatMap(([name,group,key])=>{
  const rows:Row[]=name?[{key:`heading:${key}`,heading:name,count:group.length}]:[]
  for(let i=0;i<group.length;i+=viewport.columns) {
   const stories=group.slice(i,i+viewport.columns)
   rows.push({group:key,key:JSON.stringify([key,stories.map(story=>story.id)]),stories})
  }
  return rows
 }),[groups,viewport.columns])
 const offsets=useMemo(()=>{
  const values=[0]
  for(const row of rows) values.push(values.at(-1)!+(rowHeights.get(`${viewport.width}:${row.key}`)??(row.heading?60:600)))
  return values
  // Measurement changes signal updates to the bounded shared height cache.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[rows,rowHeights,measurement,viewport.width])
 useLayoutEffect(()=>{
  if(!windowed)return
  let frame=0
  function update(){
   const element=container.current
   if(!element)return
   const bounds=element.getBoundingClientRect()
   setViewport(previous=>{
    const next={top:-bounds.top,bottom:window.innerHeight-bounds.top,width:Math.round(bounds.width),columns:window.matchMedia('(max-width: 760px)').matches?1:2}
    return Object.keys(next).every(key=>next[key as keyof typeof next]===previous[key as keyof typeof next])?previous:next
   })
  }
  const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(update)}
  const observer=new ResizeObserver(schedule)
  if(container.current)observer.observe(container.current)
  update();window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule)
  return()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule)}
 },[windowed])
 useLayoutEffect(()=>{
  if(!windowed||!container.current)return
  const observer=new ResizeObserver(entries=>{
   let changed=false
   for(const entry of entries){
    const key=`${viewport.width}:${(entry.target as HTMLElement).dataset.rowKey!}`,height=entry.target.getBoundingClientRect().height
    if(height>0&&Math.abs((rowHeights.get(key)??0)-height)>1){rowHeights.set(key,height);changed=true}
   }
   while(rowHeights.size>2000)rowHeights.delete(rowHeights.keys().next().value!)
   if(changed)setMeasurement(value=>value+1)
  })
  container.current.querySelectorAll('[data-row-key]').forEach(element=>observer.observe(element))
  return()=>observer.disconnect()
 })
 useLayoutEffect(()=>{
  const saved=focusTarget.current
  if(!saved||!windowed||document.activeElement!==document.body)return
  const card=container.current?.querySelector<HTMLElement>(`[data-story-id="${CSS.escape(saved.story)}"]`)
  const element=saved.id?document.getElementById(saved.id):card?.querySelector<HTMLElement>(saved.label?`${saved.tag}[aria-label="${CSS.escape(saved.label)}"]`:saved.tag)
  element?.focus({preventScroll:true})
 },[viewport.columns,windowed])
 if(!windowed)return <>{groups.map(([name,group,key])=><section key={key} className="reading-group">{name&&<h2>{name} <span>({group.length})</span></h2>}<div className="story-grid">{group.map(story=>renderStory(story,`result-link-${encodeURIComponent(key)}-${story.id}`))}</div></section>)}</>
 const visible:number[]=[]
 const overscan=1000
 for(let i=0;i<rows.length;i++)if(offsets[i+1]>=viewport.top-overscan&&offsets[i]<=viewport.bottom+overscan||rows[i].stories?.some(story=>story.id===focused))visible.push(i)
 // Include initial rows while the container's position is being measured.
 if(!visible.length)visible.push(0)
 const children:ReactNode[]=[]
 let previous=0
 for(const index of visible){
  if(index>previous)children.push(<div key={`gap:${index}`} aria-hidden="true" style={{height:offsets[index]-offsets[previous]}} />)
  const row=rows[index]
  children.push(<div className="results-window-row" key={row.key} data-row-key={row.key} onFocusCapture={event=>{
   const element=event.target as HTMLElement,story=element.closest<HTMLElement>('[data-story-id]')?.dataset.storyId
   if(story){focusTarget.current={story,id:element.id,tag:element.tagName.toLowerCase(),label:element.getAttribute('aria-label')};setFocused(story)}
  }} onBlurCapture={event=>{if(event.relatedTarget&&!event.currentTarget.contains(event.relatedTarget as Node)){setFocused(null);focusTarget.current=null}}}>{row.heading?<section className="reading-group"><h2>{row.heading} <span>({row.count})</span></h2></section>:<div className="story-grid">{row.stories!.map(story=>renderStory(story,`result-link-${encodeURIComponent(row.group??'')}-${story.id}`))}</div>}</div>)
  previous=index+1
 }
 if(previous<rows.length)children.push(<div key="remaining" aria-hidden="true" style={{height:offsets.at(-1)!-offsets[previous]}} />)
 return <><p className="muted results-search-hint">Use library search to search every result. Browser Find searches currently displayed cards.</p><div ref={container} className="results-window" data-virtualized="true">{children}</div></>
}
