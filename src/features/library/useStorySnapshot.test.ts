import { renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import type { Story } from './model'
import { useStorySnapshot } from './useStorySnapshot'
it('retains the full work across catalog refreshes until fresh details arrive, without retaining another work',()=>{
 const full={id:'one',detailsLoaded:true,notes:'Saved notes'} as Story
 const view=renderHook(({story}:{story:Story|undefined})=>useStorySnapshot(story),{initialProps:{story:full as Story|undefined}})
 view.rerender({story:{id:'one',detailsLoaded:false,notes:''} as Story})
 expect(view.result.current).toBe(full)
 const fresh={...full,notes:'New saved notes'}
 view.rerender({story:fresh});expect(view.result.current).toBe(fresh)
 const other={id:'two',detailsLoaded:false} as Story
 view.rerender({story:other});expect(view.result.current).toBe(other)
 view.rerender({story:undefined});expect(view.result.current).toBeUndefined()
})
