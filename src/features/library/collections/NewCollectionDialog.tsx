import { automaticCollectionRules, collectionRules } from './automatic-collections'
import { defaultReadingFilters, type ReadingFilters } from '../reading-search'
import { ReadingFilterControls } from '../ReadingFilterControls'
import { CollectionVisibilityButton } from './CollectionVisibility'
import { ChevronDown } from 'lucide-react'
import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { useDismissible } from '../../../components/useDismissible'
import { ConfirmationDialog } from '../../../components/ConfirmationDialog'
import type { Collection } from '../model'
import { Dialog } from '../../../components/Dialog'
import { CollectionColorPicker } from './CollectionColorPicker'
import { CollectionSpineLabel } from './CollectionSpineLabel'
import { collectionColorPattern, collectionColors, collectionSymbols, getCollectionColors, type CollectionAppearance } from './collection-appearance'
import { useLibrary } from '../LibraryProvider'
import { saveCollection, updateCollections } from '../repository'
import { collectionDeleteLabel as deleteLabel, useCollectionDeletion } from './useCollectionDeletion'

function AppearanceOptions({ label, disabled, children }: { label: string; disabled: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const id = useId(), trigger = useRef<HTMLButtonElement>(null)
  const ref = useDismissible<HTMLFieldSetElement>(open, () => { if (!trigger.current?.closest('fieldset')?.querySelector(':invalid')) setOpen(false) })
  return <fieldset className="collection-appearance-options" disabled={disabled} ref={ref} onInvalidCapture={() => setOpen(true)} onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus() }
  }}>
    <legend>{label}</legend>
    <button ref={trigger} type="button" className="button secondary collection-appearance-trigger" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>Choose {label}<ChevronDown size={16} /></button>
    <div className="collection-appearance-panel" id={id} data-open={open || undefined}>{children}</div>
  </fieldset>
}

export function NewCollectionDialog({ onClose, onCreated, collection, selectedCollections, onDeleted, hidden = false, onVisibilityChange }: { onClose: () => void; onCreated?: (id: string) => void; collection?: Collection; selectedCollections?: Collection[]; onDeleted?: () => void; hidden?: boolean; onVisibilityChange?: () => void }) {
  const { refreshCollections: refresh, collections, stories } = useLibrary()
  const bulk = selectedCollections !== undefined
  const targets = selectedCollections ?? (collection ? [collection] : [])
  const targetIds = targets.map(item => item.id)
  const [automatic, setAutomatic] = useState(Boolean(collection?.automatic_rules))
  const [filters, setFilters] = useState<ReadingFilters>(() => ({ ...defaultReadingFilters, ...collectionRules(collection ?? {})?.filters }))
  const [summary, setSummary] = useState(collection?.description ?? '')
  const [applyColor, setApplyColor] = useState(!bulk), [applySymbol, setApplySymbol] = useState(!bulk)
  const colors = getCollectionColors(collections)
  const [name, setName] = useState(collection?.name ?? ''), [color, setColor] = useState<string>(targets[0]?.color ?? collectionColors[0].value)
  const [symbol, setSymbol] = useState<string>(targets[0]?.symbol ?? collectionSymbols[0].value)
  const [saving, setSaving] = useState(false), [error, setError] = useState('')
  const deletion = useCollectionDeletion(targets, bulk, () => { onDeleted?.(); onClose() })
  const { removed, confirming: confirmDelete } = deletion
  const busy = saving || deletion.busy
  const [confirmStopAutomatic, setConfirmStopAutomatic] = useState(false)
  const deleteRef = useRef<HTMLButtonElement>(null)
  const wasConfirmingDelete = useRef(false)
  useEffect(() => {
    if (wasConfirmingDelete.current && !confirmDelete) deleteRef.current?.focus()
    wasConfirmingDelete.current = confirmDelete
  }, [confirmDelete])
  const nameRef = useRef<HTMLInputElement>(null)
  const [createdId, setCreatedId] = useState<string | null>(null)
  const selectedSymbol = collectionSymbols.find(option => option.value === symbol)!
  async function create(event: FormEvent) {
    event.preventDefault(); event.stopPropagation(); setSaving(true); setError('')
    try {
      // A reload failure can be retried without creating the same collection twice.
      let id = createdId
      if (!id) {
        if (bulk) {
          const changes: Partial<CollectionAppearance> = { ...(applyColor && { color }), ...(applySymbol && { symbol }) }
          await updateCollections(targetIds, changes)
          id = targets[0].id
        } else id = await saveCollection(name, collection?.id, { color, symbol }, summary, ...(automatic ? [automaticCollectionRules(filters)] as const : collection?.automatic_rules ? [null] as const : [] as const))
        setCreatedId(id)
      }
      await refresh()
      // Picker callers can assign only manual collections; automatic membership follows the rules.
      if (!bulk && !automatic) onCreated?.(id)
      onClose()
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not save collection.') }
    finally { setSaving(false) }
  }
  function closeEditor() { if (removed) onDeleted?.(); onClose() }
  function requestDelete() { setError(''); return deletion.requestDelete() }
  const fieldsDisabled = busy || createdId !== null || removed
  return <><Dialog title={bulk ? `Edit ${targets.length} Collections` : collection ? 'Edit Collection' : 'New Collection'} className="collection-dialog" titleAction={collection && onVisibilityChange ? <CollectionVisibilityButton hidden={hidden} disabled={busy || createdId !== null} onClick={onVisibilityChange} /> : undefined} busy={busy} onClose={closeEditor} initialFocusRef={nameRef}>
    <form onSubmit={event => void create(event)}>
      <div className="collection-dialog-content">
        <fieldset className="collection-dialog-fields" disabled={fieldsDisabled}>
          {bulk ? <p>Choose which fields to change for the selected collections. Names stay unchanged.</p> : <label className="collection-name-field">Name<input ref={nameRef} name="name" required value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Comfort reads" /></label>}
          {!bulk && <label className="collection-name-field">Summary<textarea name="summary" rows={3} value={summary} onChange={event => setSummary(event.target.value)} placeholder="What brings these stories together?" /></label>}
          {!bulk && <label className="check-label"><input type="checkbox" checked={automatic} onChange={event => { if (!event.target.checked && collection?.automatic_rules) setConfirmStopAutomatic(true); else setAutomatic(event.target.checked) }} />Automatic Collection</label>}
          {!bulk && !automatic && collection?.automatic_rules && <p className="field-help">Saving will keep the currently matching works in this collection, remove its filters, and stop automatic additions.</p>}
          {!bulk && automatic && <p className="field-help">Includes saved works that match all chosen filters. Matching works are included automatically as you add or update them.{collection && !collection.automatic_rules && ' Saving replaces the manually chosen works with matching works.'}</p>}
        </fieldset>
        {!bulk && automatic && <fieldset className="collection-rule-filters" disabled={fieldsDisabled}><legend>Collection Filters</legend><ReadingFilterControls defaultScope={collection?.id ? `library:${collection.id}` : undefined} stories={stories} filters={filters} onChange={setFilters} alwaysExpanded automaticCollection /></fieldset>}
        <div className="collection-preview" aria-label="Collection Preview"><div className="collection-spine" data-spine-design={automatic ? 'lunar-phases' : undefined} style={{ '--cover-color': new RegExp(collectionColorPattern).test(color) ? color : collectionColors[0].value } as CSSProperties}><CollectionSpineLabel design={automatic ? 'lunar-phases' : undefined} name={bulk ? `${targets.length} Collections` : name.trim() || 'Your collection'} Icon={selectedSymbol.Icon} /></div></div>
        <fieldset className="collection-dialog-fields collection-dialog-appearance" disabled={fieldsDisabled}>
          {bulk && <label className="check-label"><input type="checkbox" checked={applyColor} onChange={event => setApplyColor(event.target.checked)} />Change Color</label>}

          <AppearanceOptions label="Color" disabled={!applyColor}><div className="collection-color-options">{colors.map(option => <label className="collection-color-option" key={option.value} title={option.label} style={{ '--cover-color': option.value } as CSSProperties}><input type="radio" name="collection-color" value={option.value} checked={color.toLowerCase() === option.value} onChange={() => setColor(option.value)} /><span className="sr-only">{option.label}</span></label>)}</div><CollectionColorPicker value={color} onChange={setColor} disabled={fieldsDisabled || !applyColor} /></AppearanceOptions>
          {bulk && <label className="check-label"><input type="checkbox" checked={applySymbol} onChange={event => setApplySymbol(event.target.checked)} />Change Symbol</label>}
          <AppearanceOptions label="Symbol" disabled={!applySymbol}><div className="collection-symbol-options">{collectionSymbols.map(({ value, label, Icon }) => <label className="collection-symbol-option" key={value} title={label}><input type="radio" name="collection-symbol" value={value} checked={symbol === value} onChange={() => setSymbol(value)} /><Icon size={20} strokeWidth={1.5} aria-hidden="true" /><span className="sr-only">{label}</span></label>)}</div></AppearanceOptions>
        </fieldset>
      </div>
      {(error || deletion.error) && <p role="alert" className="error-message">{error || deletion.error}</p>}
      <div className="form-actions">{targets.length > 0 && <button ref={deleteRef} className="button secondary" type="button" disabled={busy || createdId !== null} onClick={() => void requestDelete()}>{deleteLabel}</button>}<button className="button secondary" type="button" disabled={busy} onClick={closeEditor}>Cancel</button><button className="button primary" type="submit" disabled={busy || removed || (bulk && !applyColor && !applySymbol)}>{busy ? (targets.length ? 'Saving…' : 'Creating…') : createdId ? 'Try Again' : targets.length ? 'Save Changes' : 'Create Collection'}</button></div>
    </form>
  </Dialog>{confirmStopAutomatic && <ConfirmationDialog title="Turn Off Automatic Collection?" confirmLabel="Keep Works and Turn Off" pendingLabel="Updating…" onClose={() => setConfirmStopAutomatic(false)} onConfirm={async () => { setAutomatic(false); setFilters({ ...defaultReadingFilters }) }}><p>Saving will remove this collection’s filter settings and keep the works that currently match. New works will no longer be added automatically.</p><p>This takes effect when you save the collection. Canceling the editor leaves it automatic.</p></ConfirmationDialog>}{deletion.confirmation}</>
}
