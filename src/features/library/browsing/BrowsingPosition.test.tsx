import { act, fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, Link, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BrowsingPosition } from './BrowsingPosition'

let frames: FrameRequestCallback[]
const scrollDescriptor = Object.getOwnPropertyDescriptor(window, 'scrollY')!
beforeEach(() => {
 frames = []
 vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frames.push(callback); return frames.length })
 vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
 vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
 vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(4000)
})
afterEach(() => { vi.restoreAllMocks(); Object.defineProperty(window, 'scrollY', scrollDescriptor) })
function flushFrame() { act(() => { const pending = frames; frames = []; pending.forEach(callback => callback(0)) }) }

it.each(['/library?shelf=favorites&page=2', '/reading?shelf=view_all', '/authors/Writer', '/series/77'].flatMap(path => [true,false].map(back => ({path,back}))))(
 'restores the pre-navigation scroll and focus from $path after details (browser Back: $back)', async ({path,back}) => {
 const router = createMemoryRouter([{
  element: <><BrowsingPosition /><Outlet /></>,
  children: [
   { path: '/stories/:id', element: <p>Work Details</p> },
   { path: '*', element: <Link id="work-link" to="/stories/one">Open Work</Link> },
  ],
 }], {initialEntries:[path]})
 const view = render(<RouterProvider router={router} />)
 flushFrame()
 Object.defineProperty(window, 'scrollY', {configurable:true,value:640})
 fireEvent.scroll(window)
 screen.getByRole('link', {name:'Open Work'}).focus()
 // The destination's shorter DOM can clamp the browser before layout cleanup.
 Object.defineProperty(window, 'scrollY', {configurable:true,value:0})
 await act(() => router.navigate('/stories/one'))
 flushFrame()
 await act(() => back ? router.navigate(-1) : router.navigate(path))
 flushFrame()
 expect(window.scrollTo).toHaveBeenLastCalledWith(0,640)
 expect(screen.getByRole('link', {name:'Open Work'})).toHaveFocus()
 view.unmount(); router.dispose()
})
