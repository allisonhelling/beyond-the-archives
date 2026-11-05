import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { Dialog } from './Dialog'

it('locks background scrolling until the last nested dialog closes and restores its position', () => {
 const y = vi.spyOn(window, 'scrollY', 'get').mockReturnValue(320)
 const scroll = vi.mocked(window.scrollTo)
 scroll.mockClear()
 const outer = render(<Dialog title="Outer" onClose={() => {}}>Details</Dialog>)
 expect(document.body.style.position).toBe('fixed')
 expect(document.body.style.top).toBe('-320px')
 const inner = render(<Dialog title="Inner" onClose={() => {}}>Confirm</Dialog>)
 inner.unmount()
 expect(document.body.style.position).toBe('fixed')
 expect(scroll).not.toHaveBeenCalled()
 outer.unmount()
 expect(document.body.style.position).toBe('')
 expect(scroll).toHaveBeenCalledWith(0, 320)
 y.mockRestore()
})

it('sends its top-edge action to the dialog scroll container', () => {
 render(<Dialog title="Details" topEdgeLabel="Go to Details Top" onClose={() => {}}>Content</Dialog>)
 const element = screen.getByRole('dialog')
 const scroll = vi.fn()
 element.scrollTo = scroll
 fireEvent.click(screen.getByRole('button', { name: 'Go to Details Top' }))
 expect(scroll).toHaveBeenCalledWith({ top: 0, behavior: 'instant' })
})
