import { useActivity } from '../../../lib/use-activity'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FilePicker } from '../../../components/FilePicker'
import { useLibrary } from '../LibraryProvider'
import { editSnapshot } from '../edit-merge'
import { savedWorkUrl, type Story } from '../model'
import { loadCatalog, loadStories, saveStory } from '../repository'
import { matchMapping, readMapping, type MappingRow } from './mapping'

export function BookFusionImport() {
  const library = useLibrary()
  const [rows, setRows] = useState<MappingRow[]>([]), [stories, setStories] = useState<Story[]>([])
  const [selected, setSelected] = useState<number[]>([]), [results, setResults] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  useActivity(Boolean(busy), 'Processing BookFusion links…')
  const matches = matchMapping(rows, stories)
  async function preview(file: File) {
    setBusy(true); setError(''); setRows([]); setSelected([]); setResults({})
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('Choose a mapping report smaller than 5 MB.')
      const incoming = readMapping(await file.text())
      const catalog = await loadCatalog()
      const ids = matchMapping(incoming, catalog.stories).flatMap(match => match.story ? [match.story.id] : [])
      const full = await loadStories([...new Set(ids)])
      setRows(incoming); setStories(full)
      setSelected(matchMapping(incoming, full).flatMap((match, index) => !match.reason && !match.replacement ? [index] : []))
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not read the mapping report.') }
    finally { setBusy(false) }
  }
  async function save() {
    setBusy(true); setError('')
    try {
      for (const index of selected) {
        const { story, link, reason } = matches[index]
        if (!story || !link || reason || results[index] === 'Saved') continue
        try {
          await saveStory({ id: story.id, base: editSnapshot(story), url: savedWorkUrl(story), metadata: story.metadata, metadataChanges: { bookfusion_link: link }, status: story.reading_status, progress: story.last_read_chapter, notes: story.notes, personalRating: story.personal_rating, favorite: story.is_favorite, rec: story.is_rec, collections: story.collectionIds, tags: story.personalTags })
          setResults(current => ({ ...current, [index]: 'Saved' }))
        } catch (failure) { setResults(current => ({ ...current, [index]: failure instanceof Error ? failure.message : 'Could not save. Review this work manually.' })) }
      }
      await library.refresh()
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not refresh the library.') }
    finally { setSelected([]); setBusy(false) }
  }
  return <section className="settings-card story-form" aria-label="BookFusion Mapping Import"><h2>Link Books from Calibre (Bookfusion)</h2>
    <p>Synchronize EPUBs with BookFusion’s Calibre plugin, then use the export helper to create a mapping CSV. Exact AO3 work IDs match saved works. Titles and authors are for review only. Supply copied book-level URLs where needed; upload identifiers are retained in the report for reference.</p>
    <FilePicker label="BookFusion Mapping CSV" accept=".csv,text/csv" disabled={busy} onChange={files => void preview(files[0])} />
    {!!rows.length && <><p>Review associations before saving. Existing links require explicit selection. Missing matches and duplicate work IDs need manual review. Successful rows stay saved if another row fails.</p>
      <div className="import-results"><table><caption>BookFusion Associations</caption><thead><tr><th>Save</th><th>Work</th><th>BookFusion</th><th>Review</th></tr></thead><tbody>{matches.map((match, index) => <tr key={index}>
        <td><input type="checkbox" aria-label={`Link ${match.row.title || `Row ${index + 1}`}`} disabled={busy || Boolean(match.reason) || results[index] === 'Saved'} checked={selected.includes(index)} onChange={event => setSelected(current => event.target.checked ? [...current, index] : current.filter(value => value !== index))} /></td>
        <td>{match.story ? <Link className="clickable-text" to={`/stories/${match.story.id}`}>{match.story.metadata.title}</Link> : match.row.title}<small>{match.row.author}</small><small>{match.row.link || 'No AO3 URL'}</small></td>
        <td><small>Upload ID: {match.row.bookfusion_id || 'Missing'}</small><label>BookFusion Link<input type="url" disabled={busy || results[index] === 'Saved'} value={match.row.bookfusion_url} onChange={event => { setRows(current => current.map((row, i) => i === index ? { ...row, bookfusion_url: event.target.value } : row)); setSelected(current => current.filter(i => i !== index)) }} /></label></td>
        <td>{results[index] || match.reason || (match.replacement ? 'Existing link will be replaced if selected.' : 'Exact AO3 match. Ready to link.')}</td>
      </tr>)}</tbody></table></div><button className="button primary" disabled={busy || !selected.length} onClick={() => void save()}>{busy ? 'Saving…' : 'Save Selected Links'}</button></>}
    {error && <p role="alert" className="error-message">{error}</p>}
  </section>
}
