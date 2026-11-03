import { useWorkMenuPosition } from '../../../components/useWorkMenuPosition'
import { useActivity } from '../../../lib/use-activity'
import { isDisplayFieldHidden } from '../display/display-settings'
import { useState, type ReactNode } from 'react'
import { Check, MoreHorizontal } from 'lucide-react'
import { ConfirmationDialog } from '../../../components/ConfirmationDialog'
import { useDismissible } from '../../../components/useDismissible'
import { DisplayInfo } from '../display/DisplayInfo'
import { useDisplayPreference } from '../display/useDisplayPreference'
import { FavoriteButton, PersonalToggleButton } from '../FavoriteButton'
import { EditCollectionsButton } from '../collections/EditCollectionsButton'
import { EditConflictReview } from '../EditConflictReview'
import { EditConflict, type EditValues } from '../edit-merge'
import { useLibrary } from '../LibraryProvider'
import { seriesReadingStatus, type LibrarySeries } from './series'
import { ensureSeries, finishSeries, updateSeries } from './series-repository'

type Controls = { favorite: ReactNode; actions: ReactNode; collectionsField: ReactNode; finishButton: ReactNode }
export function SeriesControls({ series, children }: { series: LibrarySeries; children: (controls: Controls) => ReactNode }) {
 const { collections, refreshSeries, refresh: refreshWorks } = useLibrary()
 const refresh = () => refreshSeries(series.seriesId)
 const [busy, setBusy] = useState(false), [error, setError] = useState(''), [menuOpen, setMenuOpen] = useState(false), [finishing, setFinishing] = useState(false)
 useActivity(Boolean(busy), 'Updating your series…')
 const [conflict, setConflict] = useState<EditConflict | null>(null)
 const menu = useDismissible<HTMLDetailsElement>(menuOpen, () => setMenuOpen(false))
 useWorkMenuPosition(menu, menuOpen)
 const tilePreference = useDisplayPreference('seriesTile')
 const snapshot = () => ({ rec: series.record?.is_rec ?? false, favorite: series.record?.is_favorite ?? false, collections: series.record?.collectionIds ?? [] })
 async function ensureSaved() { if (!series.record) await ensureSeries(series) }
 function failed(error: unknown) { if (error instanceof EditConflict) setConflict(error); else setError(error instanceof Error ? error.message : 'Could not save series changes.') }
 async function save(values: EditValues, baseline: EditValues = snapshot()) {
  setBusy(true); setError('')
  try { await ensureSaved(); await updateSeries(series.seriesId, values, baseline); await refresh() }
  catch (error) { failed(error) } finally { setBusy(false) }
 }
 const favorite = <FavoriteButton selected={series.record?.is_favorite ?? false} disabled={busy} onChange={favorite => void save({ favorite })} />
 const rec = <PersonalToggleButton kind="rec" selected={series.record?.is_rec ?? false} disabled={busy} onChange={rec => void save({ rec })} />
 const collectionProps = { onRefresh: refresh, selectedIds: series.record?.collectionIds ?? [], disabled: busy, onOpen: () => setMenuOpen(false), description: `Choose collections for “${series.title}”. Individual fics keep their own collections.`, onSave: async (collections: string[], base: string[]) => { await ensureSaved(); await updateSeries(series.seriesId, { collections }, { collections: base }) } }
 const collectionButton = <EditCollectionsButton {...collectionProps} />
 const collectionsField = <EditCollectionsButton {...collectionProps} variant="field" />
 const finishButton = seriesReadingStatus(series) === 'finished' ? null : <button type="button" className="button secondary" disabled={busy} onClick={() => { setMenuOpen(false); setFinishing(true) }}><Check size={16} aria-hidden="true" />Mark as Finished</button>
 const actions = <div className="story-quick-actions"><DisplayInfo group="seriesTile" fields={['favorite', 'rec']}>{{ favorite, rec }}</DisplayInfo><details className="story-menu" ref={menu} open={menuOpen} onToggle={event => setMenuOpen(event.currentTarget.open)}><summary aria-label={`Series Actions for ${series.title}`}><MoreHorizontal size={22} aria-hidden="true" /></summary><div className="menu-surface">{(['favorite', 'rec'] as const).filter(kind => isDisplayFieldHidden(tilePreference, kind)).map(kind => <PersonalToggleButton key={kind} kind={kind} menu selected={kind === 'favorite' ? series.record?.is_favorite ?? false : series.record?.is_rec ?? false} disabled={busy} onChange={selected => void save({ [kind]: selected })} />)}{collectionButton}{finishButton}</div></details></div>
 return <>{children({ favorite, actions, collectionsField, finishButton })}
  {error && <p role="alert" className="error-message">{error}</p>}
  {conflict && <EditConflictReview key={JSON.stringify(conflict.review)} conflict={conflict} collections={collections} onSaved={async () => { setConflict(null); await refresh() }} onError={failed} onCancel={() => setConflict(null)} />}
  {finishing && <ConfirmationDialog title="Finish Series?" confirmLabel="Mark as Finished" pendingLabel="Finishing…" onClose={() => setFinishing(false)} onConfirm={async () => { await ensureSaved(); await finishSeries(series.seriesId); await refreshWorks(series.savedStories.map(story => story.id)); await refresh() }}>
   <p>Marks “{series.title}” and all its works in your library as Finished (aka fully read) </p>
  </ConfirmationDialog>}
 </>
}
