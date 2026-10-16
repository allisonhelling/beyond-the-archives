import { useId } from 'react'
import { Star } from 'lucide-react'

export function StarRating({ value, onChange }: { value: number | null; onChange: (value: number | null) => void }) {
  const id = useId()
  return <fieldset className="personal-rating"><legend>Personal rating</legend><div className="rating-controls">
    <div className="rating-stars" role="radiogroup" aria-label="Personal rating">{[1, 2, 3, 4, 5].map(number => <label className="rating-star" key={number} title={`${number}/5`}>
      <input type="radio" name={id} value={number} checked={value === number} aria-label={`${number} out of 5 stars`} onChange={() => onChange(number)} />
      <Star size={25} aria-hidden="true" fill={value !== null && number <= value ? 'currentColor' : 'none'} />
    </label>)}</div>
    <span className="rating-value" aria-live="polite">{value ? `${value}/5` : 'Unrated'}</span>
    {value !== null && <button type="button" className="text-button clear-rating" onClick={() => onChange(null)}>Clear rating</button>}
  </div></fieldset>
}
