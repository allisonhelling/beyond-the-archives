import { useRef } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { useCollectionDrag } from './useCollectionDrag'

function Shelf({ enabled, moved, onMove }: { enabled: boolean; moved: boolean; onMove: () => Promise<void> }) {
 const ref = useRef<HTMLDivElement>(null)
 useCollectionDrag(ref, enabled, onMove)
 return <div ref={ref}>{(moved ? [['Beta'], ['Alpha']] : [['Alpha'], ['Beta']]).map((row,index) =>
  <div key={index} className="collection-shelf-row">{row.map(name => <div key={name} data-collection-id={name}>
   <button className="collection-spine" disabled={!enabled}>{name}</button>
  </div>)}</div>)}</div>
}

it.each(['resolve', 'reject'] as const)('restores keyboard focus after an asynchronous move settles (%s) and replaces the button across rows', async outcome => {
 let finish!: () => void, fail!: () => void
 const pending = new Promise<void>((resolve,reject) => { finish = resolve; fail = () => reject(new Error('Could not reorder')) })
 const onMove = vi.fn(() => pending)
 const view = render(<Shelf enabled moved={false} onMove={onMove} />)
 const original = screen.getByRole('button', { name: 'Beta' })
 original.focus()
 fireEvent.keyDown(original, { key: 'ArrowLeft', altKey: true })
 expect(onMove).toHaveBeenCalledWith('Beta', 'Alpha')
 view.rerender(<Shelf enabled={false} moved={false} onMove={onMove} />)
 // Persistence can re-enable the shelf before the final order is committed.
 view.rerender(<Shelf enabled moved={false} onMove={onMove} />)
 view.rerender(<Shelf enabled moved onMove={onMove} />)
 expect(screen.getByRole('button', { name: 'Beta' })).not.toBe(original)
 await act(async () => { if (outcome === 'resolve') finish(); else fail(); await pending.catch(() => {}) })
 expect(screen.getByRole('button', { name: 'Beta' })).toHaveFocus()
})
