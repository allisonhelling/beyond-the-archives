import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { BookmarkRec } from './BookmarkRec'

it('toggles a personal Rec independently of the imported AO3 observation', () => {
 const onChange = vi.fn()
 const view = render(<BookmarkRec story={{ is_rec: false }} onChange={onChange} />)
 const button = screen.getByRole('button', { name: 'Mark as Rec' })
 expect(button).toHaveAttribute('aria-pressed', 'false')
 fireEvent.click(button)
 expect(onChange).toHaveBeenCalledWith(true)
 view.rerender(<BookmarkRec story={{ is_rec: true }} onChange={onChange} />)
 fireEvent.click(screen.getByRole('button', { name: 'Remove Rec' }))
 expect(onChange).toHaveBeenLastCalledWith(false)
 view.rerender(<BookmarkRec story={{ is_rec: false }} disabled onChange={onChange} />)
 expect(screen.getByRole('button', { name: 'Mark as Rec' })).toBeDisabled()
})
