import { GripVertical } from 'lucide-react'
import { Children, Fragment, cloneElement, isValidElement, useContext, type HTMLAttributes, type ReactElement, type ReactNode } from 'react'
import { useDisplayPreference } from './useDisplayPreference'
import { DisplayEditorContext } from './display-editor-context'
import { isDisplayFieldHidden, displayGroups, displayFieldLabel, displayDivider, shortDisplayDivider, displayLine, type DisplayGroup } from './display-settings'

/** Annotate the real elements in editor previews without changing their layout. */
function editable(node: ReactNode, group: DisplayGroup, field: string, selected: boolean, moving = false): ReactNode {
  if (!isValidElement(node)) return node
  const element = node as ReactElement<HTMLAttributes<HTMLElement>>
  if (element.type === Fragment) return <>{Children.map(element.props.children, child => editable(child, group, field, selected, moving))}</>
  const attributes = { className: `${element.props.className ?? ''}${moving && (element.type !== 'hr' || displayDivider(field)) ? ' display-drop-shadow' : ''}`.trim(), 'data-display-group': group, 'data-display-field': field, 'data-display-selected': selected, 'data-display-moving': moving || undefined, tabIndex: 0, 'aria-label': `${displayFieldLabel(group, field)} (${displayGroups[group].title})` }
  return typeof element.type === 'string'
    ? cloneElement(element, attributes)
    : <div {...attributes} className={`display-edit-contents${moving ? ' display-drop-shadow' : ''}`}>{element}</div>
}
export function DisplayInfo({ group, children, separator, fields }: { group: DisplayGroup; children: Partial<Record<string, ReactNode>>; separator?: ReactNode; fields?: string[] }) {
  const editor = useContext(DisplayEditorContext)
  const preference = useDisplayPreference(group)
  const drop = editor?.dropPreview?.group === group ? editor.dropPreview : undefined
  const { order, hidden, lines = {} } = drop?.preference ?? preference
  const editing = editor?.groups.includes(group)
  const hasContent = (key: string) => !hidden.includes(key) && children[key] != null && children[key] !== false
  const renderField = (key: string) => {
    let node = children[key]
    if (!editing) return node
    if (isValidElement<{ children?: ReactNode }>(node) && node.type === Fragment && !Children.toArray(node.props.children).length) node = <p className="muted">No {displayFieldLabel(group, key)?.toLowerCase()} saved.</p>
    return editable(node, group, key, (editor?.selectedFields ?? (editor?.selected ? [editor.selected] : [])).some(field => field.group === group && field.field === key), editor?.dropPreview?.group === group && editor.dropPreview.fields.includes(key))
  }
  const entries = fields ? fields.filter(key => hasContent(key) && !isDisplayFieldHidden(preference, key)) : order.filter(key => displayLine(key) || displayDivider(key) ? !hidden.includes(key) : hasContent(key))
  function renderEntry(key: string, index: number) {
    if (displayDivider(key)) {
      const divider = <hr className={`story-summary-divider display-custom-divider${shortDisplayDivider(key) ? ' display-short-divider' : ''}`} />
      return <Fragment key={key}>{editing ? editable(divider, group, key, (editor?.selectedFields ?? []).some(field => field.group === group && field.field === key), editor?.dropPreview?.group === group && editor.dropPreview.fields.includes(key)) : divider}</Fragment>
    }
    if (!displayLine(key)) return <Fragment key={key}>{index > 0 && separator}{renderField(key)}</Fragment>
    const fields = (lines[key] ?? []).filter(hasContent)
    if (!fields.length && !editing) return null
    const content = <div className={`display-grouped-line${group.endsWith('Tile') ? ' story-facts' : ''}`} data-display-line={editing ? key : undefined}>
      {editing && <button type="button" className="display-line-handle" aria-label="Select Grouped Line" title="Select Grouped Line"><GripVertical size={12} aria-hidden="true" /></button>}
      {fields.map((field, position) => <Fragment key={field}><div className="display-line-item">{position > 0 && <span className="info-separator"> • </span>}{renderField(field)}</div></Fragment>)}
      {editing && !fields.length && <span className="display-line-placeholder">Grouped Line — drag or click information here</span>}
    </div>
    return <Fragment key={key}>{editing ? editable(content, group, key, (editor?.selectedFields ?? (editor?.selected ? [editor.selected] : [])).some(field => field.group === group && field.field === key), editor?.dropPreview?.group === group && editor.dropPreview.fields.includes(key)) : content}</Fragment>
  }
  return <>{entries.map((key, index) => <Fragment key={key}>{renderEntry(key, index)}</Fragment>)}</>
}
