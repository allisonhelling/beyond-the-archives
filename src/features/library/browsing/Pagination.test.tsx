import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { Pagination } from './Pagination'

it('commits valid page numbers only on Enter and follows external navigation', () => {
 const onPage = vi.fn()
 const props = { page: 1, pages: 12, total: 120, size: 10, onPage, inlinePage: true }
 const view = render(<Pagination {...props} />)
 const input = screen.getByRole('spinbutton', { name: 'Go to Page' })
 fireEvent.change(input, { target: { value: '12' } })
 fireEvent.blur(input)
 expect(onPage).not.toHaveBeenCalled()
 fireEvent.keyDown(input, { key: 'Enter' })
 expect(onPage).toHaveBeenLastCalledWith(12)
 view.rerender(<Pagination {...props} page={12} />)
 view.rerender(<Pagination {...props} page={1} />)
 expect(input).toHaveValue(1)
 onPage.mockClear()
 for (const value of ['', '0', '13', '1.5']) {
  fireEvent.change(input, { target: { value } })
  fireEvent.keyDown(input, { key: 'Enter' })
 }
 expect(onPage).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button', { name: 'Next' }))
 expect(onPage).toHaveBeenCalledWith(2)
})

it('shows supplied entry ranges for pages with variable sizes', () => {
 render(<Pagination page={2} pages={2} total={44} size={30} range={{ start: 29, end: 44 }} onPage={() => {}} />)
 expect(screen.getByRole('status')).toHaveTextContent('29–44 of 44 works')
})


it('keeps Next and page jumps available while the last known exact total is stale', () => {
 const onPage = vi.fn()
 const view = render(<Pagination page={1} pages={1} total={4} size={25} stale onPage={onPage} />)
 expect(screen.getByRole('status')).toHaveTextContent('of 4')
 expect(screen.getByRole('status')).toHaveTextContent('Updating…')
 fireEvent.click(screen.getByRole('button', {name:'Next'}))
 expect(onPage).toHaveBeenLastCalledWith(2)
 const input = screen.getByRole('spinbutton', {name:'Go to Page'})
 expect(input).not.toHaveAttribute('max')
 fireEvent.change(input,{target:{value:'7'}})
 fireEvent.keyDown(input,{key:'Enter'})
 expect(onPage).toHaveBeenLastCalledWith(7)
 view.rerender(<Pagination page={1} pages={1} total={4} size={25} stale countError onPage={onPage} />)
 expect(screen.getByRole('status')).toHaveTextContent('of 4')
 expect(screen.getByRole('status')).toHaveTextContent('Couldn’t update')
 view.rerender(<Pagination page={1} pages={1} total={4} size={25} onPage={onPage} />)
 expect(screen.getByRole('button', {name:'Next'})).toBeDisabled()
 expect(input).toHaveAttribute('max','1')
})

it('does not substitute zero for an unavailable count', () => {
 render(<Pagination page={1} pages={1} size={25} stale countError onPage={vi.fn()} />)
 expect(screen.getByRole('status')).toHaveTextContent('Count unavailable')
 expect(screen.getByRole('status')).not.toHaveTextContent('0 results')
})
