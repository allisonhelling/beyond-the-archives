import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(()=>({rpc:vi.fn()}))
vi.mock('../../lib/supabase',()=>({supabase:{rpc:mocks.rpc}}))
vi.mock('../../lib/sample-mode',()=>({sampleMode:false}))
import { PersonalRatingProvider, PersonalRatingSettings } from './PersonalRatingSettings'
import { StarRating } from '../library/StarRating'
let saved:string|null
beforeEach(()=>{
 saved='My original explanation'; vi.clearAllMocks()
 mocks.rpc.mockImplementation(async (_name:string,args?:{p_input:{text:string;base:string|null}})=>{
  if(args) {
   if(args.p_input.base!==saved) return {data:null,error:{code:'40001'}}
   saved=args.p_input.text
  }
  return {data:{ratingInfo:saved},error:null}
 })
})
function show() { render(<PersonalRatingProvider userId="alice"><PersonalRatingSettings /><StarRating value={3} onChange={vi.fn()} /></PersonalRatingProvider>) }
it('loads account text, saves changes for all rating editors, and hides help for blank text',async()=>{
 show()
 const input=screen.getByLabelText('Personal rating info text')
 await waitFor(()=>expect(input).toHaveValue(saved))
 expect(screen.getByRole('button',{name:'Personal rating info'})).toHaveAccessibleDescription(saved!)
 fireEvent.change(input,{target:{value:'5 stars: Love it!\n4 stars: Enjoyed'}})
 fireEvent.click(screen.getByRole('button',{name:'Save Rating Info'}))
 await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('saved'))
 expect(mocks.rpc).toHaveBeenCalledWith('personal_rating_settings',{p_input:{text:saved,base:'My original explanation'}})
 expect(screen.getByRole('button',{name:'Personal rating info'})).toHaveAccessibleDescription(saved!)
 fireEvent.change(input,{target:{value:''}})
 fireEvent.click(screen.getByRole('button',{name:'Save Rating Info'}))
 await waitFor(()=>expect(screen.queryByRole('button',{name:'Personal rating info'})).not.toBeInTheDocument())
})
it('refreshes from another device without losing the local draft or overwriting a newer saved explanation',async()=>{
 show()
 const input=screen.getByLabelText('Personal rating info text')
 await waitFor(()=>expect(input).toHaveValue(saved))
 fireEvent.change(input,{target:{value:'Unsaved local draft'}})
 saved='Changed on Safari'
 fireEvent(window,new Event('focus'))
 await waitFor(()=>expect(screen.getByRole('button',{name:'Personal rating info'})).toHaveAccessibleDescription(saved!))
 expect(input).toHaveValue('Unsaved local draft')
 fireEvent.click(screen.getByRole('button',{name:'Save Rating Info'}))
 await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('changed on another device'))
 expect(saved).toBe('Changed on Safari')
 expect(input).toHaveValue('Unsaved local draft')
 fireEvent.click(screen.getByRole('button',{name:'Use saved explanation'}))
 expect(input).toHaveValue(saved)
})
