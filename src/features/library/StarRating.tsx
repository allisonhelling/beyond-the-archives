import { useId, useState, type ReactNode } from 'react'
import { Check, Pencil, Star } from 'lucide-react'
import { Tooltip } from '../../components/Tooltip'

export function StarRating({ value, onChange, onSave, onEdit, disabled = false, headingClassName = '', info, clearLabel = 'Clear rating' }: { value: number | null; onChange?: (value: number | null) => void; onSave?: (value: number | null) => Promise<boolean>; onEdit?: () => void; disabled?: boolean; headingClassName?: string; info?: ReactNode; clearLabel?: string }) {
  const id = useId()
  const [hovered, setHovered] = useState<number | null>(null)
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState(value)
  const rating = onSave && editing ? draft : value
  const interactive = onSave ? editing : Boolean(onChange)
  const preview = Math.max(rating ?? 0, interactive ? hovered ?? 0 : 0)
  function change(next: number | null) { if (onSave) setDraft(next); else onChange?.(next) }
  async function toggleEditing() {
    if (!onSave) return
    if (!editing) { onEdit?.(); setDraft(value); setHovered(null); setEditing(true) }
    else if (await onSave(draft)) { setHovered(null); setEditing(false) }
  }
  const starIcons = [1, 2, 3, 4, 5].map(number => <Star key={number} size={25} className="rating-star-icon" aria-hidden="true" fill={number <= preview ? 'currentColor' : 'none'} />)
  const savedStars = <div className="rating-stars" role="img" aria-label={rating ? `${rating} out of 5 stars` : 'Unrated'}>{starIcons.map((icon, index) => <span className="rating-star" key={index}>{icon}</span>)}</div>
  if (!onChange && !onSave) return savedStars
  const clearRating = interactive && rating !== null && <button type="button" className="text-button clear-rating" onClick={() => change(null)}>{clearLabel}</button>
  return <fieldset className="personal-rating" disabled={disabled}><legend><span className={`rating-heading ${headingClassName}`}>Personal Rating{onSave && <Tooltip description={editing ? 'Save changes' : 'Edit'}>{descriptionId => <button type="button" className="icon-button inline-edit-icon" aria-label={editing ? 'Save rating changes' : 'Edit personal rating'} aria-describedby={descriptionId} aria-expanded={editing} disabled={disabled} onClick={() => void toggleEditing()}>{editing ? <Check size={14} aria-hidden="true" /> : <Pencil size={13} aria-hidden="true" />}</button>}</Tooltip>}</span></legend><div className="rating-controls">
    {interactive ? <div className="rating-stars" role="radiogroup" aria-label="Personal rating" onMouseLeave={() => setHovered(null)}>{[1, 2, 3, 4, 5].map(number => <label className="rating-star" key={number} title={`${number}/5`} data-preview={hovered !== null && (number <= (rating ?? 0)) !== (number <= hovered) || undefined} onMouseEnter={() => setHovered(number)}>
      <input type="radio" name={id} value={number} checked={rating === number} aria-label={`${number} out of 5 stars`} onChange={() => change(number)} />
      {starIcons[number - 1]}
    </label>)}</div> : savedStars}
    <span className="rating-value" aria-live="polite">{rating ? `${rating}/5` : 'Unrated'}</span>
    {info ? <span className="rating-actions">{clearRating}{info}</span> : clearRating}
  </div></fieldset>
}
