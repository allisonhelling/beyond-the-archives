import type { ReactNode } from 'react'
import type { useTagGroupDraft } from './useTagGroupDraft'

/** Category-independent composition; callers supply their existing tag picker. */
export function TagGroupEditor({ label, draft, renderChoices }: {
  label: string
  draft: ReturnType<typeof useTagGroupDraft>
  renderChoices: (props: { selected: string[]; onChange: (tags: string[]) => void; label: string }) => ReactNode
}) {
  return <div className="tag-group-editor">
    <p>Match all tags in a group, or any group.</p>
    {draft.groups.map((group, index) => <div key={index} className="tag-expression-group">
      {index > 0 && <p className="filter-label">OR</p>}
      <div className="form-actions">
        <button type="button" className={`button ${index === draft.active ? 'primary' : 'secondary'}`} aria-pressed={index === draft.active} onClick={() => draft.select(index)}>Group {index + 1}</button>
        <button type="button" className="button secondary" aria-label={`Remove Group ${index + 1}`} onClick={() => draft.remove(index)}>Remove Group</button>
      </div>
      <p>{group.length ? group.join(' AND ') : `Choose ${label.toLowerCase()} for this group.`}</p>
    </div>)}
    <button type="button" className="button secondary" onClick={draft.add}>Add Group</button>
    {draft.groups.length > 0 && <div role="group" aria-label={`Group ${draft.active + 1} ${label}`}>
      {renderChoices({ selected: draft.groups[draft.active], onChange: draft.update, label: `Search Group ${draft.active + 1} ${label}` })}
    </div>}
  </div>
}
