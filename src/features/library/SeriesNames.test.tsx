import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, it } from 'vitest'
import { SeriesNames } from './SeriesNames'
import { blankMetadata } from './model'

it('links each same-named series to its own ID and preserves its part number', () => {
 render(<MemoryRouter><SeriesNames metadata={{...blankMetadata,series:['Same series'],series_memberships:[
  {id:77,name:'Same series',url:'https://archiveofourown.org/series/77',position:1},
  {id:88,name:'Same series',url:'https://archiveofourown.org/series/88',position:4},
 ]}} /></MemoryRouter>)
 expect(screen.getAllByRole('link',{name:'Same series'}).map(link=>link.getAttribute('href'))).toEqual(['/series/77','/series/88'])
 expect(screen.getByText('1')).toBeVisible()
 expect(screen.getByText('4')).toBeVisible()
})
it('keeps legacy names readable without turning invalid memberships into links', () => {
 render(<MemoryRouter><SeriesNames metadata={{...blankMetadata,series:['Legacy series'],series_memberships:[{id:77,name:'Legacy series',url:'https://example.com/series/77',position:1}]}} /></MemoryRouter>)
 expect(screen.queryByRole('link')).not.toBeInTheDocument()
 expect(screen.getByText(/Legacy series/)).toBeVisible()
})
