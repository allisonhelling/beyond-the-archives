import { EditConflictReview } from '../../src/features/library/EditConflictReview'
import type { EditConflict } from '../../src/features/library/edit-merge'
import { useState } from 'react'
import { Info } from 'lucide-react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { PersonalTagInput } from '../../src/features/library/PersonalTagInput'
import { StarRating } from '../../src/features/library/StarRating'
import { parseLines } from '../../src/features/library/model'

type Draft = { tags: string; rating: number | '' }

function PersonalControls({ draft, onChange, ratingInfo }: { draft: Draft; onChange: () => void; ratingInfo: string }) {
  const [tags, setTags] = useState(parseLines(draft.tags)), [rating, setRating] = useState<number | null>(draft.rating === '' ? null : Number(draft.rating))
  return <div className="companion-personal-controls">
    <div className="personal-tags-field"><p>Personal Tags</p><PersonalTagInput inlineHelp value={tags} onChange={value => { setTags(value); draft.tags = value.join('\n'); onChange() }} /></div>
    <StarRating clearLabel="Clear Rating" value={rating} info={ratingInfo.trim() ? <details className="field-info rating-info"><summary role="button" aria-label="Personal rating info"><Info aria-hidden="true" /></summary><span>{ratingInfo}</span></details> : null} onChange={value => { setRating(value); draft.rating = value ?? ''; onChange() }} />
  </div>
}

export function mountPersonalControls(container: HTMLElement, draft: Draft, onChange: () => void, ratingInfo: string) {
  const root = createRoot(container)
  const updateRatingInfo = (text: string) => flushSync(() => root.render(<PersonalControls draft={draft} onChange={onChange} ratingInfo={text} />))
  updateRatingInfo(ratingInfo)
  return { unmount: () => root.unmount(), updateRatingInfo }
}

export function mountConflictReview(container: HTMLElement, props: { conflict: EditConflict; collections: { id: string; name: string }[]; onSaved: (result: unknown) => Promise<void>; onError: (error: unknown) => void; onCancel: () => void }) {
  const root = createRoot(container)
  flushSync(() => root.render(<EditConflictReview {...props} />))
  return () => root.unmount()
}
