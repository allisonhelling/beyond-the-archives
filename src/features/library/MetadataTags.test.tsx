import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { MetadataTags } from './MetadataTags'
import { TagFilterContext } from './tag-filter-context'

it.each(['filled','curved','sharp','bullets','commas'] as const)('formats the empty placeholder with the chosen %s style', shape => {
 render(<MetadataTags values={[]} shape={shape} />)
 const tag = screen.getByText('No Tags Saved')
 expect(tag).toHaveClass('metadata-tag')
 expect(tag.closest('[data-tag-shape]')).toHaveAttribute('data-tag-shape', shape)
 expect(screen.queryByRole('button')).toBeNull()
})
it('uses dashboard tag filtering and preserves explicit removal behavior', () => {
 const filter = vi.fn(), remove = vi.fn()
 render(<TagFilterContext value={filter}><MetadataTags values={['Found Family']} /><MetadataTags values={['Comfort']} onRemove={remove} /></TagFilterContext>)
 fireEvent.click(screen.getByRole('button', { name: 'Found Family' }))
 expect(filter).toHaveBeenCalledWith('Found Family')
 fireEvent.click(screen.getByRole('button', { name: 'Remove Comfort' }))
 expect(remove).toHaveBeenCalledWith('Comfort')
 expect(filter).toHaveBeenCalledTimes(1)
})
