import { useState } from 'react'
import { normalizeTagExpression, uniqueTags, type TagExpression } from './tag-expressions'

/** Keep editing placeholders in place, outside the executable expression.
 * The menu controller owns this hook so closing its popover retains the draft.
 */
export function useTagGroupDraft(expression: TagExpression, onChange: (expression: TagExpression) => void) {
  const key = JSON.stringify(expression)
  const initialGroups = expression.mode === 'custom' ? expression.groups : []
  const [state, setState] = useState({ key, groups: initialGroups, active: 0 })
  let current = state
  if (state.key !== key) {
    current = { key, groups: initialGroups, active: 0 }
    setState(current)
  }
  function edit(groups: string[][], active: number) {
    const next = normalizeTagExpression({ mode: 'custom', groups })!
    setState({ key: JSON.stringify(next), groups, active })
    onChange(next)
  }
  return {
    groups: current.groups,
    active: current.active,
    select: (active: number) => setState({ ...current, active }),
    add: () => setState({ ...current, groups: [...current.groups, []], active: current.groups.length }),
    remove: (index: number) => edit(current.groups.filter((_, i) => i !== index),
      Math.max(0, current.active - Number(index <= current.active))),
    update: (tags: string[]) => edit(current.groups.map((group, index) => index === current.active ? uniqueTags(tags) : group), current.active),
  }
}
