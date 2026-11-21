import type { ReactNode } from 'react'

const rangeBounds = ['min', 'max'] as const
export type RangeBound = typeof rangeBounds[number]

export function FilterRange({ label, className, legendAction, children }: {
  label: string; className?: string; legendAction?: ReactNode; children: (bound: RangeBound) => ReactNode
}) {
  return <fieldset className={['filter-range', className].filter(Boolean).join(' ')}>
    <legend>{label}{legendAction}</legend>
    {rangeBounds.map(children)}
  </fieldset>
}

export function NumberFilterRange({ label, range, onChange }: {
  label: string; range?: Partial<Record<RangeBound, string>>; onChange: (bound: RangeBound, value: string) => void
}) {
  return <FilterRange label={label}>{bound => <label key={bound}>
    <span>{bound === 'min' ? 'Min' : 'Max'}</span>
    <input type="number" min="0" step="1" placeholder="Any" aria-label={`${bound === 'min' ? 'Minimum' : 'Maximum'} ${label}`} value={range?.[bound] ?? ''} onChange={event => onChange(bound, event.target.value)} />
  </label>}</FilterRange>
}
