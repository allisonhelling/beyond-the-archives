import { confidenceLabels } from './story-source'
export { FandomSelect } from './FandomSelect'
import { TagFilterControl } from './tags/TagFilterControl'
import type { FandomOption } from './FandomSelect'
import { useLayout } from '../../lib/use-layout'
import { InfoTooltip } from '../../components/InfoTooltip'
import { useFilterDraft } from '../../components/useFilterDraft'
import { ActiveFilters } from '../../components/ActiveFilters'
import { Fragment, useId, useMemo, useState, type ReactNode } from 'react'
import { FileText, Heart, Layers3, SlidersHorizontal, Star } from 'lucide-react'
import { ConfirmationDialog } from '../../components/ConfirmationDialog'
import { saveFilterDefaults } from './browsing/filter-defaults'
import { MetadataTags } from './MetadataTags'
import { Dropdown } from '../../components/Dropdown'
import { DateFilterField } from './DateFilterField'
import { SearchSuggestions } from './SearchSuggestions'
import { ratingLabel, ratings, tagNames, type Story } from './model'
import { filterPublicationLabel, readingFilterTags, removeReadingFilter } from './reading-filter-labels'
import { publicationStatuses } from './publication-status'
import { defaultReadingFilters, filterReading, type ReadingFilters } from './reading-search'
import { sampleMode } from '../../lib/sample-mode'

function TitleAuthorSearch({ value, onChange, stories, authorOnly }: { value: string; onChange: (value: string) => void; stories: Story[]; authorOnly: boolean }) {
  const groups = useMemo(() => [
    ...(!authorOnly ? [{ label: 'Titles', values: stories.map(story => story.metadata.title) }] : []),
    { label: 'Authors', values: stories.flatMap(story => story.metadata.authors) },
  ], [stories, authorOnly])
  const label = authorOnly ? 'Search Author' : 'Search Title or Author'
  return <SearchSuggestions label={label} placeholder={authorOnly ? label : 'Search Title, Author, or AO3 Work ID'} value={value} onChange={onChange} hideLabel keepOpen groups={groups} />
}
export function ReadingFilterControls({ stories, filters: appliedFilters, onChange, mode = 'library', orderingControls, sortControl, availabilityControl, suggestions, fandomOptions, alwaysExpanded = false, automaticCollection = false, worksOnly = false, defaultScope, navigationKey }: {
  worksOnly?: boolean; defaultScope?: string; navigationKey?: string; stories: Story[]; filters: ReadingFilters; onChange(filters: ReadingFilters): void; mode?: 'reading' | 'library' | 'series'; orderingControls?: ReactNode; sortControl?: ReactNode; availabilityControl?: ReactNode
  suggestions?: { relationships: string[]; characters: string[]; tags: string[]; personalTags?: string[] }; fandomOptions?: FandomOption[]; alwaysExpanded?: boolean; automaticCollection?: boolean
}) {
  const mobile = useLayout(650) === 'mobile'
  const [draft, setDraft] = useFilterDraft(appliedFilters, `${mode}:${defaultScope}:${navigationKey}`)
  // Collection rules are already a draft saved by the enclosing collection form.
  const filters = automaticCollection ? appliedFilters : draft
  const editFilters = automaticCollection ? onChange : setDraft
  const [restorationEpoch, setRestorationEpoch] = useState(0)
  const restorationKey = JSON.stringify([automaticCollection ? null : appliedFilters, mode, defaultScope, navigationKey, restorationEpoch])
  const [confirmLibraryDefault, setConfirmLibraryDefault] = useState(false)
  const [defaultMessage, setDefaultMessage] = useState('')
  let draftError = ''
  if (!automaticCollection) {
    try { filterReading([], filters) } catch (error) { draftError = (error as Error).message }
  }
  const defaultLabel = defaultScope?.startsWith('author:') ? 'Author' : 'Collection'
  function saveDefault(library = false) {
    saveFilterDefaults(filters, library ? undefined : defaultScope ?? `${mode}:all`)
    setDefaultMessage(library ? 'Library default saved for all categories on this browser.' : `${defaultLabel} default saved on this browser.`)
  }
  const [expanded, setExpanded] = useState(alwaysExpanded)
  const filterId = useId(), helpId = `${filterId}-help`
  const { localRelationships, localCharacters, localTags, localPersonalTags, localFandoms } = useMemo(() => {
    const fandomCounts = new Map<string, number>()
    for (const story of stories) for (const name of new Set(story.metadata.fandoms)) fandomCounts.set(name, (fandomCounts.get(name) ?? 0) + 1)
    return {
      localRelationships: stories.flatMap(story => tagNames(story.metadata, 'relationship')),
      localCharacters: stories.flatMap(story => tagNames(story.metadata, 'character')),
      localPersonalTags: stories.flatMap(story => story.personalTags),
      localTags: stories.flatMap(story => tagNames(story.metadata, 'freeform')),
      localFandoms: [...fandomCounts].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name)),
    }
  }, [stories])
  const relationships = (suggestions?.relationships ?? localRelationships).filter(tag => /\S\s*[&/]\s*\S/.test(tag))
  const characters = suggestions?.characters ?? localCharacters
  const additionalTags = suggestions?.tags ?? localTags
  const fandoms = fandomOptions ?? localFandoms
  function applyFilters() { setRestorationEpoch(value => value + 1); onChange(filters) }
  function clearFilters() {
    setRestorationEpoch(value => value + 1)
    const next = { ...defaultReadingFilters, sort: appliedFilters.sort, groupBy: appliedFilters.groupBy, ...(appliedFilters.randomSeed && { randomSeed: appliedFilters.randomSeed }) }
    setDraft(next); onChange(next)
  }
  function change<K extends keyof ReadingFilters>(key: K, value: ReadingFilters[K]) { editFilters({ ...filters, [key]: value }) }
  const publicationLabel = (value: keyof typeof publicationStatuses) => filterPublicationLabel(value, mode === 'series')
  const activeFilters = readingFilterTags(appliedFilters, { authorOnly: automaticCollection, series: mode === 'series', seriesVisibility: mode === 'library' && !worksOnly })
  const personalTagsControl = <SearchSuggestions label="Personal Tags" placeholder="Search personal tags" value={filters.personalTags ?? ''} onChange={value => change('personalTags', value)} groups={[{ label: 'Personal Tags', values: suggestions?.personalTags ?? localPersonalTags }]} multiple chips keepOpen hideHeadings />
  const workTypeControls = ([['oneShot', 'One-Shot'], ['crossovers', 'Crossovers']] as const).map(([key, label]) => <Dropdown key={key} fitContent label={label} labelHelp={key === 'crossovers' ? <InfoTooltip label="Crossover Classification Help" placement="bottom" description={`Uses verified AO3 fandom relationships. Only includes verified crossovers; Exclude keeps works with unresolved relationships. Results may change as evidence is refreshed.${sampleMode ? ' Sample mode uses simulated hierarchy evidence for demonstration.' : ''}`} /> : undefined} value={filters[key] ?? 'allowed'} onChange={value => change(key, value as ReadingFilters[typeof key])} options={[{ value: 'allowed', label: 'Allowed' }, { value: 'only', label: 'Only' }, { value: 'exclude', label: 'Exclude' }]} closeOnSelect />)
  const filterToggle = !alwaysExpanded && <button type="button" className={`button filter-toggle ${expanded ? 'primary' : 'secondary'}`} aria-expanded={expanded} aria-controls={filterId} onClick={() => setExpanded(!expanded)}><SlidersHorizontal size={17} /><span className="filter-toggle-label"><span>{expanded ? 'Hide' : 'Filters'}</span></span></button>
  const publicationControl = <Dropdown fitContent label={mode !== 'reading' ? 'Publication Status' : 'Work Status'} multiple value={filters.publication} onChange={value => change('publication', value as ReadingFilters['publication'])} options={Object.entries(publicationStatuses).filter(([value]) => mode !== 'series' || ['complete', 'in_progress', 'unknown'].includes(value)).map(([value]) => ({ value, label: publicationLabel(value as keyof typeof publicationStatuses) }))} />
  const membershipToggles = <>
      <button type="button" className={`button ${filters.excludeLaterSeries ? 'primary' : 'secondary'}`} aria-pressed={Boolean(filters.excludeLaterSeries)} onClick={() => change('excludeLaterSeries', !filters.excludeLaterSeries)}><Layers3 size={17} />Exclude Later Series Works</button>
      <button type="button" className={`button ${filters.inSeries ? 'primary' : 'secondary'}`} aria-pressed={filters.inSeries} onClick={() => change('inSeries', !filters.inSeries)}><Layers3 size={17} />In a Series</button>
      <button type="button" className={`button favorite ${filters.favorites ? 'primary' : 'secondary'}`} aria-pressed={filters.favorites} onClick={() => change('favorites', !filters.favorites)}><Star size={17} fill={filters.favorites ? 'currentColor' : 'none'} />Favorites</button>
      <button type="button" className={`button ${filters.personalNotes ? 'primary' : 'secondary'}`} aria-pressed={Boolean(filters.personalNotes)} onClick={() => change('personalNotes', !filters.personalNotes)}><FileText size={17} />Personal Notes</button>
      <button type="button" className={`button ${filters.recs ? 'primary' : 'secondary'}`} aria-pressed={Boolean(filters.recs)} onClick={() => change('recs', !filters.recs)}><Heart size={17} fill={filters.recs ? 'currentColor' : 'none'} />Recs</button>
  </>
  return <>
    <section onKeyDown={event => { if (!automaticCollection && !draftError && event.key === 'Enter' && event.target instanceof HTMLInputElement && !event.defaultPrevented) { event.preventDefault(); applyFilters() } }} data-mode={mode} className={`reading-toolbar${alwaysExpanded ? ' reading-toolbar-rules' : ''}`} aria-label={mode === 'series' ? 'Series Toolbar' : mode === 'library' ? 'Library Toolbar' : 'Reading Toolbar'}>
      {orderingControls}
      <TitleAuthorSearch value={filters.query} onChange={query => change('query', query)} stories={stories} authorOnly={automaticCollection} />
      {sortControl && <div className="toolbar-sort">{sortControl}</div>}
      <TagFilterControl key={restorationKey + "fandoms"} filters={filters} onChange={editFilters} category="fandoms" restorationKey={restorationKey} label={automaticCollection ? 'Fandoms' : 'Select Fandoms'} fandomOptions={fandoms} />
      <div className="toolbar-actions">{mode === 'library' && !automaticCollection && !worksOnly && <button type="button" className={`button series-toggle ${filters.showSeries ? 'primary' : 'secondary'}`} aria-pressed={Boolean(filters.showSeries)} onClick={() => change('showSeries', !filters.showSeries)}><Layers3 size={17} />Show Series</button>}
      {!automaticCollection && <button type="button" className="button primary apply-filters" disabled={Boolean(draftError)} onClick={() => applyFilters()}>Apply Filters</button>}
      {filterToggle}</div>
    </section>
    {expanded && <section className="reading-filters" id={filterId} aria-label={mode === 'series' ? 'Series Filters' : mode === 'library' ? 'Library Filters' : 'Reading Filters'}><div className="filter-grid">
      <TagFilterControl key={restorationKey + "relationship"} filters={filters} onChange={editFilters} category="relationship" restorationKey={restorationKey} label="Relationships" placeholder="e.g. Castiel/Dean" suggestions={relationships} />
      <TagFilterControl key={restorationKey + "characters"} filters={filters} onChange={editFilters} category="characters" restorationKey={restorationKey} label="Characters" placeholder="Search characters" suggestions={characters} />
      <TagFilterControl key={restorationKey + "tags"} filters={filters} onChange={editFilters} category="tags" restorationKey={restorationKey} label="Tags" placeholder="Search additional tags" suggestions={additionalTags} />

      {automaticCollection && personalTagsControl}

      <div className="filter-choice-row">
      {!automaticCollection && personalTagsControl}
      <Dropdown fitContent label="Content Rating" multiple value={filters.rating} onChange={value => change('rating', value)} options={ratings.map(rating => ({ value: rating, label: ratingLabel(rating) }))} />
      <Dropdown fitContent label="Rating" multiple value={filters.personalRating ?? []} onChange={value => change('personalRating', value)} options={[1, 2, 3, 4, 5].map(value => ({ value: String(value), label: `${value}/5` })).concat({ value: 'unrated', label: 'Unrated' })} />
      {mobile ? <div className="filter-publication-controls">{workTypeControls}{publicationControl}</div> : workTypeControls}
      {availabilityControl}
      {mode !== 'series' && <>{([['countConfidence', 'Chapter Count Confidence'], ['publicationConfidence', 'Publication Status Confidence']] as const).map(([key, label]) => <Dropdown key={key} fitContent label={label} value={filters[key] || 'any'} onChange={value => change(key, value === 'any' ? '' : value as ReadingFilters[typeof key])} options={Object.entries(confidenceLabels).map(([value, label]) => ({ value, label }))} closeOnSelect />)}<label className="check-label"><input type="checkbox" checked={filters.needsCompletionVerification ?? false} onChange={event => change('needsCompletionVerification', event.target.checked)} />Needs Completion Verification</label></>}
      {!automaticCollection && membershipToggles}
      </div>
      <div className={automaticCollection ? "filter-date-options" : "filter-date-only"}>
        {automaticCollection && <div className="filter-choice-row filter-membership-toggles">{membershipToggles}</div>}
      <div className="updated-filter-section"><div className="updated-filter-row">{!mobile && publicationControl}<div className="updated-filter-heading"><span className="filter-label" id={`${filterId}-updated`}>Last Updated on AO3</span><InfoTooltip label="Last Updated on AO3 Help" placement="bottom" size={18} description="Last updated uses saved AO3 dates in UTC; stories without an AO3 date are excluded by date filters." /></div><div className="updated-filter" role="group" aria-labelledby={`${filterId}-updated`}><DateFilterField label="From" value={filters.updatedAfter} onChange={value => change('updatedAfter', value)} /><DateFilterField label="Through" value={filters.updatedBefore} onChange={value => change('updatedBefore', value)} /></div></div></div>
      </div>
    </div><div className="within-search"><div className="within-search-row"><div className="within-search-field"><label><span className="filter-name">Search Within Results</span><input onKeyDown={event => { if (!automaticCollection && !draftError && event.key === 'Enter') { event.preventDefault(); applyFilters() } }} type="search" placeholder="Search Within Results" aria-describedby={helpId} value={filters.within} onChange={e => change('within', e.target.value)} /></label>

      <InfoTooltip label="Search Syntax and Modes" placement="bottom" size={18} description={<div id={helpId}><p><strong>Any Field</strong> combines saved titles, authors, fandoms, AO3 tags, personal tags, summaries, notes, ratings, statuses, and URLs. <strong>Summary</strong> searches only the fic’s summary. <strong>Notes</strong> searches only your private notes.</p><ul><li><code>book*</code> — any characters: book, books, booking.</li><li><code>Harry Potter</code> — AND: both terms must occur.</li><li><code>Harry || Potter</code> — OR: either or both terms.</li><li><code>"Harry Lockhart"</code> — words in exact sequence.</li><li><code>Harry -Lockhart</code> — include Harry, exclude Lockhart.</li></ul><p>AND and NOT apply before OR. Use a backslash to escape literal symbols, such as <code>\*</code>, <code>\-</code>, <code>\"</code>, <code>\|</code>, or <code>\\</code>. Matching ignores case and accents. Searches stay within the selected {mode === 'library' ? 'shelf' : 'tile'} and filters.</p></div>} /></div>
      <Dropdown label="Search In" value={filters.scope} onChange={value => change('scope', value as ReadingFilters['scope'])} options={[{ value: 'any', label: 'Any Field' }, { value: 'summary', label: 'Summary' }, { value: 'notes', label: 'Notes' }]} />
    </div></div><div className="form-actions"><div className="filter-default-actions"><button type="button" className="button secondary" disabled={automaticCollection && !defaultScope} title={automaticCollection && !defaultScope ? 'Save the Collection First' : undefined} onClick={() => { try { saveDefault() } catch { setDefaultMessage('Could not save defaults. Check browser storage and retry.') } }}>Save as {defaultLabel} Default</button><button type="button" className="button secondary" onClick={() => setConfirmLibraryDefault(true)}>Save as Library Default</button></div><div className="filter-reset-actions"><button type="button" className="button secondary" onClick={clearFilters}>Clear All Filters</button>{filterToggle}</div></div>{defaultMessage && <p role="status">{defaultMessage}</p>}</section>}
    {draftError && <p role="alert">{draftError}</p>}
    {confirmLibraryDefault && <ConfirmationDialog title="Save as Library Default?" confirmLabel="Save as Library Default" pendingLabel="Saving…" onClose={() => setConfirmLibraryDefault(false)} onConfirm={async () => saveDefault(true)}><p>The current filters will become the default for all collections and categories, replacing any collection defaults saved on this browser.</p></ConfirmationDialog>}
    {activeFilters.length > 0 && <ActiveFilters onClear={clearFilters}>{activeFilters.map((tag, index) => <Fragment key={tag.label}>{index > 0 && <span aria-hidden="true" className={`info-separator${tag.category && tag.category === activeFilters[index - 1].category ? ' filter-category-separator' : ' filter-category-boundary'}`} data-tag-category={tag.category}><MetadataTags values={['•']} category={tag.category ?? null} shape="bullets" /></span>}<MetadataTags values={[tag.label]} category={tag.category ?? null} removeLabel={label => `Remove Filter ${label}`} onRemove={() => { const next = removeReadingFilter(appliedFilters, tag); setDraft(next); onChange(next) }} /></Fragment>)}</ActiveFilters>}
  </>
}
