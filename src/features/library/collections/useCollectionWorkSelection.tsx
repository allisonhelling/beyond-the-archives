import { useEffect, useRef, useState } from 'react'
import { countNoun } from '../../../lib/count-noun'
import type { CollectionWorkTarget } from '../repository'
import type { Collection } from '../model'
import { CollectionMembershipDialog, RemoveSelectedWorksDialog } from './CollectionMembershipDialog'

function selectionEntry(work: CollectionWorkTarget): [string, string] { return [work.organizationGroup ?? work.id, work.id] }

type SelectionState = { scope?: string; works: Map<string, string>; dialog?: 'add' | 'remove'; error?: string; loading?: boolean }
export type TileSelection = { pressed: boolean; disabled: boolean; toggle: () => void }

export function useCollectionWorkSelection({ scope, pageWorks, loadAll, manualCollection, blocked = false }: {
  scope?: string; pageWorks: CollectionWorkTarget[]; loadAll: (signal: AbortSignal) => Promise<CollectionWorkTarget[]>; manualCollection?: Collection; blocked?: boolean
}) {
  const [state, setState] = useState<SelectionState>(() => ({ scope, works: new Map() }))
  const request = useRef<AbortController | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  if (state.scope !== scope) setState({ scope, works: new Map() })
  useEffect(() => () => {
    request.current?.abort()
    request.current = null
  }, [scope])

  if (scope === undefined || state.scope !== scope) return undefined
  const disabled = blocked || Boolean(state.loading)
  const count = state.works.size
  const label = `${count} ${countNoun(count, 'work')}`
  function changeSelection(works: Map<string, string>) {
    setState(current => ({ ...current, works, error: undefined }))
  }
  async function selectAll() {
    if (request.current) return
    const controller = new AbortController()
    request.current = controller
    setState(current => ({ ...current, loading: true, error: undefined }))
    try {
      const works = await loadAll(controller.signal)
      if (!controller.signal.aborted) setState(current => current.scope === scope ? { ...current, works: new Map(works.map(selectionEntry)), loading: false } : current)
    } catch (error) {
      if (!controller.signal.aborted) setState(current => current.scope === scope ? { ...current, loading: false, error: error instanceof Error ? error.message : 'Could not select all works. Try again.' } : current)
    } finally {
      if (request.current === controller) request.current = null
    }
  }
  function closeDialog() {
    setState(current => ({ ...current, dialog: undefined }))
    requestAnimationFrame(() => trigger.current?.focus())
  }
  const toolbar = <>
    <div className="collection-work-actions" role="group" aria-label="Work Selection">
      <button type="button" className="button secondary" disabled={disabled || !pageWorks.length} onClick={() => changeSelection(new Map([...state.works, ...pageWorks.map(selectionEntry)]))}>Select Page</button>
      <button ref={trigger} type="button" className="button secondary" disabled={disabled} onClick={() => void selectAll()}>Select All</button>
      <button type="button" className="button secondary" disabled={disabled || !count} aria-haspopup="dialog" onClick={() => setState(current => ({ ...current, dialog: 'add' }))}>Add to Collection</button>
      {manualCollection && <button type="button" className="button secondary" disabled={disabled || !count} aria-haspopup="dialog" onClick={() => setState(current => ({ ...current, dialog: 'remove' }))}>Remove from Collection</button>}
      <button type="button" className="button secondary" disabled={disabled || !count} onClick={() => changeSelection(new Map())}>Clear Selection</button>
      <span role="status" className="field-help">{state.loading ? 'Selecting Works…' : `${label} selected`}</span>
    </div>
    {state.error && <p role="alert" className="error-message">{state.error}</p>}
    {state.dialog === 'add' && <CollectionMembershipDialog workIds={[...state.works.values()]} onSaved={() => changeSelection(new Map())} onClose={closeDialog} />}
    {state.dialog === 'remove' && manualCollection && <RemoveSelectedWorksDialog ids={[...state.works.values()]} label={label} collection={manualCollection} onClose={closeDialog} onSaved={() => changeSelection(new Map())} />}
  </>
  return {
    toolbar,
    tile: (work: CollectionWorkTarget): TileSelection => {
      const [key, id] = selectionEntry(work)
      return {
        pressed: state.works.has(key),
        disabled,
        toggle: () => setState(current => {
          const works = new Map(current.works)
          if (works.has(key)) works.delete(key)
          else works.set(key, id)
          return { ...current, works, error: undefined }
        }),
      }
    },
  }
}
