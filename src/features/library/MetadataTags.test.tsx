import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { MetadataTags } from './MetadataTags'
import { tagAppearance, tagTextColor } from './display/display-settings'
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


it.each(['filled', 'pill', 'curved', 'sharp', 'bullets', 'commas'] as const)('applies both text modes and custom colors to %s', shape => {
 const appearance = { shape, colors: { relationships: '#123456' }, textColor: 'colored' as const }
 const view = render(<MetadataTags values={['A/B']} category="relationships" appearance={appearance} onTagClick={() => {}} />)
 const group = screen.getByRole('button', { name: 'A/B' }).closest('[data-tag-shape]')
 expect(group).toHaveAttribute('data-tag-text-color', 'colored')
 expect(group).toHaveStyle('--tag-color: #123456')
 view.rerender(<MetadataTags values={['A/B']} category="relationships" appearance={{ ...appearance, textColor: 'black' }} onTagClick={() => {}} />)
 expect(group).toHaveAttribute('data-tag-text-color', 'black')
})
it('uses shape defaults for legacy settings and retains explicit mode across shapes', () => {
 const legacy = tagAppearance('{"tagAppearance":{"shape":"filled","colors":{}}}')
 expect(tagTextColor(legacy)).toBe('black')
 expect(tagTextColor({ ...legacy, shape: 'pill' })).toBe('colored')
 const explicit = tagAppearance('{"tagAppearance":{"shape":"filled","colors":{},"textColor":"black"}}')
 expect(tagTextColor({ ...explicit, shape: 'pill' })).toBe('black')
})
