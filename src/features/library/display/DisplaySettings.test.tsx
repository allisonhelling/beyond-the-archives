import { OtherWorkMetadata } from './OtherWorkMetadata'
import { MemoryRouter } from 'react-router-dom'
import { exampleWork } from './display-examples'
import { workMetadataFields } from './WorkMetadataFields'
import { MetadataTags } from '../MetadataTags'
import { ReadingFilterControls } from '../ReadingFilterControls'
import { defaultReadingFilters } from '../reading-search'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DisplayInfo } from './DisplayInfo'
import { DisplayEditorContext } from './display-editor-context'
import { displayGroups, previewViewports, savePreviewViewports, tagAppearance, displayPreference, displayPreferences, displaySettingsKey, moveDisplaySelection, deleteDisplaySelection, moveDisplayField, removeDisplayLine, separateDisplayField, saveDisplay, type DisplayGroup } from './display-settings'

beforeEach(() => {
  vi.stubGlobal('innerWidth', 1280)
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) })
})
afterEach(() => vi.unstubAllGlobals())

it('starts both layouts from legacy arrangements and saves only the edited profile', () => {
 localStorage.setItem(displaySettingsKey, JSON.stringify({ workTile: { order: ['summary', 'authors'], hidden: ['authors'] } }))
 const desktop = displayPreferences(), mobile = displayPreferences(undefined, 'mobile')
 expect(mobile.workTile).toEqual(desktop.workTile)
 desktop.workTile.hidden = []
 saveDisplay(desktop, 'desktop')
 expect(displayPreferences(undefined, 'mobile').workTile.hidden).toContain('authors')
 const changedMobile = displayPreferences(undefined, 'mobile')
 changedMobile.workInfo.hidden.push('summary')
 saveDisplay(changedMobile, 'mobile')
 expect(displayPreferences(undefined, 'mobile').workInfo.hidden).toContain('summary')
 expect(displayPreferences().workInfo.hidden).not.toContain('summary')
 expect(displayPreferences().workTile.hidden).not.toContain('authors')
})
it('retains shared tag colors and viewport sizes while independently saving layout groups', () => {
 const sizes = { mobile: { width: 430, height: 900 }, desktop: { width: 1366, height: 768 } }
 savePreviewViewports(sizes)
 const mobile = displayPreferences(undefined, 'mobile')
 mobile.tagAppearance.shape = 'sharp'
 saveDisplay(mobile, 'mobile')
 expect(previewViewports()).toEqual(sizes)
 expect(displayPreferences().tagAppearance.shape).toBe('sharp')
 expect(() => savePreviewViewports({ ...sizes, mobile: { width: 100, height: 900 } })).toThrow('Enter whole widths')
 expect(previewViewports()).toEqual(sizes)
})
it('switches mounted tiles to the saved profile when the browser crosses the mobile breakpoint', () => {
 const mobile = displayPreferences(undefined, 'mobile')
 mobile.workTile.hidden.push('authors')
 saveDisplay(mobile, 'mobile')
 render(<DisplayInfo group="workTile">{{ authors: <p>Responsive Author</p> }}</DisplayInfo>)
 expect(screen.getByText('Responsive Author')).toBeVisible()
 act(() => { vi.stubGlobal('innerWidth', 390); window.dispatchEvent(new Event('resize')) })
 expect(screen.queryByText('Responsive Author')).not.toBeInTheDocument()
 act(() => { vi.stubGlobal('innerWidth', 1280); window.dispatchEvent(new Event('resize')) })
 expect(screen.getByText('Responsive Author')).toBeVisible()
})

it.each(Object.keys(displayGroups) as DisplayGroup[])('previews %s without changing its live display until saved', group => {
  const keys = Object.keys(displayGroups[group].fields)
  const draft = displayPreferences()
  const original = draft[group].order.flatMap(key => draft[group].lines?.[key] ?? [key]).filter(key => !draft[group].hidden.includes(key))
  draft[group] = { order: [keys[1], ...keys.filter(key => key !== keys[1])], hidden: [keys[0]], lines: {} }
  const children = Object.fromEntries(keys.map(key => [key, <p key={key}>{key}</p>]))
  render(<><div data-testid="live"><DisplayInfo group={group}>{children}</DisplayInfo></div><DisplayEditorContext value={{ preferences: draft, groups: [group], selected: null }}><div data-testid="editor"><DisplayInfo group={group}>{children}</DisplayInfo></div></DisplayEditorContext></>)
  const live = () => within(screen.getByTestId('live')).getAllByRole('paragraph').map(node => node.textContent)
  expect(live()).toEqual(original)
  expect(within(screen.getByTestId('editor')).getAllByRole('paragraph').map(node => node.textContent)).toEqual(draft[group].order.filter(key => key !== keys[0]))
  expect(screen.getByTestId('editor').children[0].tagName).toBe('P')
  expect(localStorage.getItem(displaySettingsKey)).toBeNull()
  act(() => saveDisplay(draft))
  expect(live()).toEqual(draft[group].order.filter(key => key !== keys[0]))
})

it('keeps additional tile information hidden by default and preserves explicit additions', () => {
  const preferences = displayPreferences()
  expect(preferences.workTile.hidden).toContain('relationships')
  preferences.workTile.hidden = preferences.workTile.hidden.filter(key => key !== 'relationships')
  saveDisplay(preferences)
  expect(displayPreferences().workTile.hidden).not.toContain('relationships')
})

it('normalizes malformed, duplicate, obsolete and newly added fields', () => {
  const defaults = displayPreference('workTile', '{}')
  for (const raw of ['null', '[]', 'bad json', '{"workTile":{"order":12,"hidden":null}}']) expect(displayPreference('workTile', raw)).toEqual(defaults)
  const normalized = displayPreference('workTile', JSON.stringify({ workTile: { order: ['summary', 'obsolete', 'summary', 1], hidden: ['authors', 'authors', 'obsolete'] } }))
  expect(normalized.order[0]).toBe('summary')
  expect(normalized.order.flatMap(key => normalized.lines?.[key] ?? [key])).toHaveLength(Object.keys(displayGroups.workTile.fields).length)
  expect(normalized.order).not.toContain('obsolete')
  expect(normalized.hidden).toEqual(['authors', 'allTags', ...defaults.hidden])
})

it('does not apply a draft if storage rejects the save', () => {
  const draft = displayPreferences()
  draft.workTile.hidden.push('authors')
  vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded') })
  expect(() => saveDisplay(draft)).toThrow('Quota exceeded')
  expect(displayPreferences().workTile.hidden).not.toContain('authors')
})

it('updates mounted displays when another tab changes settings', () => {
  render(<DisplayInfo group="workTile">{{ authors: <p>Author</p>, summary: <p>Summary</p> }}</DisplayInfo>)
  act(() => {
    localStorage.setItem(displaySettingsKey, JSON.stringify({ workTile: { hidden: ['authors'], order: ['authors', 'summary'] } }))
    window.dispatchEvent(new StorageEvent('storage', { key: displaySettingsKey }))
  })
  expect(screen.queryByText('Author')).not.toBeInTheDocument()
  expect(screen.getByText('Summary')).toBeVisible()
})

it('migrates saved tile fact orders and hidden values into an editable grouped line', () => {
  const preference = displayPreference('workTile', JSON.stringify({ workTile: { order: ['summary', 'facts', 'authors'], hidden: [] }, workTileFacts: { order: ['words', 'series', 'rating'], hidden: ['rating'] } }))
  expect(preference.order.slice(0, 3)).toEqual(['summary', 'line:facts', 'authors'])
  expect(preference.lines?.['line:facts']).toEqual(['words', 'series', 'rating'])
  expect(preference.hidden).toContain('rating')
  const series = displayPreference('seriesTile', JSON.stringify({ seriesTileFacts: { order: ['words', 'works', 'reading'], hidden: ['works'] } }))
  expect(series.lines?.['line:facts']).toEqual(['words', 'count', 'reading'])
  expect(series.hidden).toContain('count')
})

it('joins, reorders and separates fields without duplicates, preserving visibility', () => {
  const original = displayPreference('workTile', '{}')
  const grouped = moveDisplayField(original, 'authors', 'words')
  expect(grouped.order).not.toContain('authors')
  expect(grouped.lines?.['line:facts']).toEqual(['series', 'rating', 'authors', 'words'])
  expect(moveDisplayField(grouped, 'authors', 'series').lines?.['line:facts']).toEqual(['authors', 'series', 'rating', 'words'])
  const separate = separateDisplayField(grouped, 'authors')
  expect(separate.order[separate.order.indexOf('line:facts') + 1]).toBe('authors')
  expect(separate.lines?.['line:facts']).not.toContain('authors')
  expect(separate.hidden).toEqual(original.hidden)
  const removed = removeDisplayLine(grouped, 'line:facts')
  expect(removed.order).not.toContain('line:facts')
  expect(removed.order).toContain('authors')
  expect(removed.lines).toEqual({})
})

it('normalizes malformed grouped lines and keeps a field in only one location', () => {
  const preference = displayPreference('workTile', JSON.stringify({ workTile: { order: ['line:a', 'line:b', 'authors'], lines: { 'line:a': ['authors', 'authors', 'obsolete'], 'line:b': ['authors', 'fandoms', 'line:a'], broken: ['words'] } } }))
  expect(preference.lines).toEqual({ 'line:a': ['authors'], 'line:b': ['fandoms'] })
  expect(preference.order).not.toContain('authors')
  expect(preference.order).not.toContain('fandoms')
})

it('renders saved grouped lines with separators and hides empty live lines', () => {
  const draft = displayPreferences()
  draft.workTile = moveDisplayField(draft.workTile, 'authors', 'line:facts')
  render(<DisplayEditorContext value={{ preferences: draft, groups: [], selected: null }}><article><DisplayInfo group="workTile">{{ authors: <p>By Rowan</p>, series: <span>Part 1</span>, rating: <span>Teen and Up</span>, words: <span>42,680 words</span> }}</DisplayInfo></article></DisplayEditorContext>)
  const line = document.querySelector('.display-grouped-line')!
  expect(line).toHaveTextContent('Part 1 • Teen and Up • 42,680 words • By Rowan')
  expect(line.querySelectorAll('.display-line-item')).toHaveLength(4)
})

it('keeps newly shown optional fields visible when saved inside a grouped line', () => {
  const preferences = displayPreferences()
  preferences.workTile.hidden = preferences.workTile.hidden.filter(key => key !== 'reading')
  preferences.workTile = moveDisplayField(preferences.workTile, 'reading', 'line:facts')
  saveDisplay(preferences)
  const saved = displayPreferences().workTile
  expect(saved.hidden).not.toContain('reading')
  expect(saved.lines?.['line:facts']).toContain('reading')
})


it('moves a multi-selection into a line in display order and deletes containers independently of their information', () => {
  const original = displayPreference('workTile', '{}')
  const grouped = moveDisplaySelection(original, ['fandoms', 'authors'], 'line:facts')
  expect(grouped.lines?.['line:facts']).toEqual(['series', 'rating', 'words', 'authors', 'fandoms'])
  expect(grouped.order).not.toContain('authors')
  expect(moveDisplaySelection(grouped, ['line:facts', 'authors'], 'words')).toBe(grouped)
  const hidden = deleteDisplaySelection(grouped, ['authors', 'fandoms'])
  expect(hidden.hidden).toEqual(expect.arrayContaining(['authors', 'fandoms']))
  const removed = deleteDisplaySelection({ ...grouped, order: [...grouped.order, 'divider:first', 'divider:second'] }, ['line:facts', 'divider:first'])
  expect(removed.lines).toEqual({})
  expect(removed.order).toContain('authors')
  expect(removed.order).toContain('divider:second')
  expect(removed.order).not.toContain('divider:first')
  expect(removed.hidden).not.toContain('authors')
})

it('persists multiple dividers and valid category colors without accepting arbitrary styles', () => {
  const preferences = displayPreferences()
  preferences.workTile.order.push('divider:first', 'divider:second')
  preferences.tagAppearance.colors = { relationships: '#123abc', characters: 'red' }
  saveDisplay(preferences)
  const saved = displayPreferences().workTile
  expect(saved.order).toEqual(expect.arrayContaining(['divider:first', 'divider:second']))
  expect(displayPreferences().tagAppearance.colors).toEqual({ relationships: '#123abc' })
  render(<DisplayInfo group="workTile">{{ authors: <p>Author</p> }}</DisplayInfo>)
  expect(document.querySelectorAll('.display-custom-divider')).toHaveLength(2)
})


it('defaults tags to bullet-separated colored text and persists every selected shape', () => {
 const preferences=displayPreferences()
 expect(preferences.tagAppearance.shape).toBe('bullets')
 const view=render(<MetadataTags values={['Fluff','Humor']} />)
 expect(view.container).toHaveTextContent('Fluff • Humor')
 for (const shape of ['pill','curved','sharp','bullets','commas'] as const) {
  preferences.tagAppearance.shape=shape
  act(()=>saveDisplay(preferences))
  expect(view.container.querySelector('[data-tag-shape]')).toHaveAttribute('data-tag-shape',shape)
  expect(displayPreferences().tagAppearance.shape).toBe(shape)
 }
 expect(view.container).toHaveTextContent('Fluff, Humor')
 expect(tagAppearance('{"workTile":{"tagShape":"unsafe"}}').shape).toBe('bullets')
})
it('uses the chosen tag appearance for removable filter bubbles', () => {
 const preferences = displayPreferences(), remove = vi.fn()
 preferences.tagAppearance = { shape: 'sharp', colors: { relationships: '#123abc' } }
 act(() => saveDisplay(preferences))
 const view = render(<MetadataTags values={['A/B']} category="relationships" onRemove={remove} removeLabel={value => `Remove Relationships Filter ${value}`} />)
 expect(view.container.querySelector('[data-tag-shape]')).toHaveAttribute('data-tag-shape', 'sharp')
 expect(view.container.querySelector('[data-tag-category]')).toHaveStyle('--tag-color: #123abc')
 fireEvent.click(screen.getByRole('button', { name: 'Remove Relationships Filter A/B' }))
 expect(remove).toHaveBeenCalledWith('A/B')
})

it('colors active filter tags by category and updates them when settings are saved', () => {
 const preferences = displayPreferences()
 preferences.tagAppearance = { shape: 'sharp', colors: { relationships: '#123abc', characters: '#456def', tags: '#789abc' } }
 act(() => saveDisplay(preferences))
 render(<ReadingFilterControls stories={[]} filters={{ ...defaultReadingFilters, relationship: 'A/B', characters: 'A', tags: 'Fluff', rating: ['Teen And Up Audiences'], personalRating: ['1'] }} onChange={vi.fn()} />)
 const active = within(screen.getByLabelText('Active Filters'))
 const tag = (label: string) => active.getByText(label).closest('.categorized-tags')
 for (const [label, color] of [['Relationships: A/B', '#123abc'], ['Characters: A', '#456def'], ['Tags: Fluff', '#789abc'], ['Content Rating: Teen and Up', 'var(--color-link)'], ['Rating: 1/5', 'var(--color-link)']]) {
  expect(tag(label)).toHaveStyle(`--tag-color: ${color}`)
  expect(tag(label)).toHaveAttribute('data-tag-shape', 'sharp')
 }
 preferences.tagAppearance.colors.relationships = '#abcdef'
 act(() => saveDisplay(preferences))
 expect(tag('Relationships: A/B')).toHaveStyle('--tag-color: #abcdef')
})

it('shows a drop shadow in the same slot used by the move operation without saving the draft', () => {
 const preferences=displayPreferences()
 const projected=moveDisplaySelection(preferences.workTile,['fandoms'],'authors')
 const view=render(<DisplayEditorContext value={{preferences,groups:['workTile'],selected:null,dropPreview:{group:'workTile',preference:projected,fields:['fandoms']}}}><div className="display-edit-surface"><DisplayInfo group="workTile">{{authors:<p>Author</p>,fandoms:<p>Fandom</p>,summary:<p>Summary</p>}}</DisplayInfo></div></DisplayEditorContext>)
 const shadow=view.container.querySelector('.display-drop-shadow')!
 expect(shadow).toHaveTextContent('Fandom')
 expect(shadow.nextElementSibling).toHaveTextContent('Author')
 expect(localStorage.getItem(displaySettingsKey)).toBeNull()
})


it('migrates surface-specific appearance into one validated site-wide preference', () => {
 const raw=JSON.stringify({workTile:{colors:{relationships:'#123abc'},tagShape:'bullets'},seriesTile:{colors:{tags:'#aabbcc',warnings:'invalid'},tagShape:'curved'}})
 const preferences=displayPreferences(raw)
 expect(preferences.tagAppearance).toEqual({shape:'curved',colors:{relationships:'#123abc',tags:'#aabbcc'}})
 expect(preferences.workTile).not.toHaveProperty('colors')
 expect(preferences.seriesTile).not.toHaveProperty('tagShape')
 expect(tagAppearance(JSON.stringify({...JSON.parse(raw),tagAppearance:{shape:'sharp',colors:{warnings:'#970000'}}}))).toEqual({shape:'sharp',colors:{warnings:'#970000'}})
})

it('renders fixed tile controls without duplicating grouped lines and dividers from the tile body', () => {
 const preferences = displayPreferences()
 preferences.workTile.order.push('line:empty', 'divider:test')
 preferences.workTile.lines = { ...preferences.workTile.lines, 'line:empty': [] }
 render(<DisplayEditorContext value={{ preferences, groups: ['workTile'], selected: null }}><div data-testid="header"><DisplayInfo group="workTile" fields={['favorite', 'rec']}>{{ favorite: <button>Favorite</button>, rec: <button>Recommended</button> }}</DisplayInfo></div><div data-testid="body"><DisplayInfo group="workTile">{{ authors: <p>Author</p> }}</DisplayInfo></div></DisplayEditorContext>)
 expect(within(screen.getByTestId('header')).getAllByRole('button')).toHaveLength(2)
 expect(screen.getByTestId('header').querySelector('.display-grouped-line, hr')).toBeNull()
 expect(screen.getByTestId('body').querySelectorAll('[data-display-field="line:empty"]')).toHaveLength(1)
 expect(screen.getByTestId('body').querySelectorAll('hr')).toHaveLength(1)
})


it('labels hidden series in active library filters and switches to Show Series when selected', () => {
 const props = { stories: [], filters: { ...defaultReadingFilters }, onChange: vi.fn() }
 const view = render(<ReadingFilterControls {...props} />)
 expect(screen.getByLabelText('Active Filters')).toHaveTextContent('Hide Series')
 view.rerender(<ReadingFilterControls {...props} filters={{ ...props.filters, showSeries: true }} />)
 expect(screen.getByLabelText('Active Filters')).toHaveTextContent('Show Series')
 expect(screen.getByLabelText('Active Filters')).not.toHaveTextContent('Hide Series')
 view.rerender(<ReadingFilterControls {...props} mode="reading" />)
 expect(screen.queryByLabelText('Active Filters')).not.toBeInTheDocument()
 view.rerender(<ReadingFilterControls {...props} automaticCollection />)
 expect(screen.queryByLabelText('Active Filters')).not.toBeInTheDocument()
})

it.each(['tile', 'info'] as const)('renders every selectable AO3 field in the %s layout, including known zero statistics', layout => {
 const group = layout === 'tile' ? 'workTile' : 'workInfo'
 localStorage.setItem(displaySettingsKey, JSON.stringify({ [group]: { order: Object.keys(displayGroups[group].fields), hidden: [] } }))
 const story = { ...exampleWork, metadata: { ...exampleWork.metadata, categories: ['M/M'], language: 'English', bookmark_count: 0, comment_count: 123, hits: 4567 } }
 render(<MemoryRouter><DisplayInfo group={group}>{workMetadataFields(story, layout)}</DisplayInfo></MemoryRouter>)
 expect(screen.getAllByText('M/M')[0]).toBeVisible()
 expect(screen.getByText('0 bookmarks')).toBeVisible()
 expect(screen.getByText('123 comments')).toBeVisible()
 expect(screen.getByText('4,567 hits')).toBeVisible()
 expect(screen.getByText(/English/)).toBeVisible()
 expect(screen.getByRole('link', { name: 'View on AO3' })).toHaveAttribute('href', story.original_url)
 expect(screen.getAllByText(/2017/).length).toBeGreaterThan(0)
})

it('shows all tags by default while keeping other added AO3 fields hidden', () => {
 render(<MemoryRouter><DisplayInfo group="workTile">{workMetadataFields({ ...exampleWork, metadata: { ...exampleWork.metadata, categories: ['M/M'], language: 'English' } }, 'tile')}</DisplayInfo></MemoryRouter>)
 expect(screen.queryByText(/^Category:/)).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button', { name: /more$/ }))
 expect(screen.getByText('M/M')).toBeVisible()
 expect(screen.queryByText(/English/)).not.toBeInTheDocument()
 expect(screen.getByText(/66,463 words/)).toBeVisible()
})


it('expands other metadata in the example and fills it with AO3 fields omitted elsewhere', () => {
 render(<MemoryRouter><OtherWorkMetadata story={exampleWork} expanded /></MemoryRouter>)
 expect(screen.getByText('Other Metadata', { selector: 'summary' }).parentElement).toHaveAttribute('open')
 expect(screen.getByText('AO3 Warnings')).toBeVisible()
 expect(screen.getByText('Date Published')).toBeVisible()
 expect(screen.getByText('Language')).toBeVisible()
 expect(screen.queryByText('Authors')).not.toBeInTheDocument()
 expect(screen.queryByText('Date Updated')).not.toBeInTheDocument()
})

it('uses the same editable fields and grouped lines for other metadata', () => {
 const draft = displayPreferences('{}')
 draft.workInfo.hidden = draft.workInfo.hidden.filter(field => field !== 'language')
 draft.workOther = { ...draft.workOther, hidden: ['warnings'], order: ['line:stats', ...draft.workOther.order.filter(field => !['kudos', 'bookmarks'].includes(field))], lines: { 'line:stats': ['kudos', 'bookmarks'] } }
 const { container } = render(<MemoryRouter><DisplayEditorContext value={{ preferences: draft, groups: ['workOther'], selected: null }}><OtherWorkMetadata story={exampleWork} expanded /></DisplayEditorContext></MemoryRouter>)
 expect(screen.queryByText('AO3 Warnings')).not.toBeInTheDocument()
 expect(screen.queryByText('Language')).not.toBeInTheDocument()
 expect(container.querySelector('[data-display-group="workOther"][data-display-field="kudos"]')).toBeVisible()
 expect(container.querySelector('[data-display-line="line:stats"]')).toBeVisible()
})

it('saves collection filters directly and requires confirmation for all-category defaults', () => {
 render(<ReadingFilterControls stories={[]} filters={{...defaultReadingFilters, personalTags:'Comfort'}} defaultScope="library:favorites" onChange={vi.fn()} alwaysExpanded />)
 fireEvent.click(screen.getByRole('button', {name:'Save as Collection Default'}))
 expect(screen.getByRole('status')).toHaveTextContent('Collection default saved')
 expect(localStorage.getItem('between-chapters:filter-defaults:v1')).toContain('library:favorites')
 fireEvent.click(screen.getByRole('button', {name:'Save as Library Default'}))
 const dialog = within(screen.getByRole('dialog', {name:'Save as Library Default?'}))
 expect(dialog.getByText(/default for all collections and categories/)).toBeVisible()
 expect(localStorage.getItem('between-chapters:filter-defaults:v1')).toContain('library:favorites')
 fireEvent.click(dialog.getByRole('button', {name:'Cancel'}))
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('places default fandoms below the author line and expandable tags below grouped facts', () => {
 const fields = workMetadataFields(exampleWork, 'tile')
 const view = render(<MemoryRouter><DisplayInfo group="workTile" heading={<h2>Work Heading</h2>}>{fields}</DisplayInfo></MemoryRouter>)
 const heading = screen.getByRole('heading', { name: 'Work Heading' })
 const fandoms = screen.getByText(exampleWork.metadata.fandoms.join(' · '))
 const authors = view.container.querySelector('.authors')!
 expect(heading.compareDocumentPosition(authors) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
 expect(authors.compareDocumentPosition(fandoms) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
 const tags = view.container.querySelector('.expandable-metadata-tags')!
 expect(view.container.querySelector('.display-grouped-line')!.compareDocumentPosition(tags) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
 expect(tags.querySelectorAll('.metadata-tag')).toHaveLength(7)
 fireEvent.click(within(tags as HTMLElement).getByRole('button', { name: /more$/ }))
 expect(tags.querySelectorAll('.metadata-tag').length).toBeGreaterThan(7)
 fireEvent.click(within(tags as HTMLElement).getByRole('button', { name: 'Show Less' }))
 expect(tags.querySelectorAll('.metadata-tag')).toHaveLength(7)
})

it('preserves custom tile order and visibility when all tags belong to a grouped line', () => {
 const raw = JSON.stringify({ workTile: { order: ['authors', 'fandoms', 'line:custom'], hidden: [], lines: { 'line:custom': ['words', 'allTags'] } } })
 const preference = displayPreference('workTile', raw)
 expect(preference.order.slice(0, 3)).toEqual(['authors', 'fandoms', 'line:custom'])
 expect(preference.hidden).not.toContain('allTags')
 expect(preference.lines?.['line:custom']).toEqual(['words', 'allTags'])
})

it.each(['sharp', 'filled'] as const)('colors %s tile tags by category, excludes fandoms, and preserves uncategorized tags', shape => {
 localStorage.setItem(displaySettingsKey, JSON.stringify({ tagAppearance: { shape, colors: { relationships: '#123abc', characters: '#456def', tags: '#789abc', warnings: '#aa0011' } } }))
 const metadata = { ...exampleWork.metadata, fandoms: ['Batman'], ao3_tags: ['Batman', 'A/B', 'Alice', 'Fluff', 'Shared Tag', 'Uncategorized', 'Extra One', 'Extra Two', 'Fandom: Other'], archive_warnings: ['Warning'], relationship_tags: ['A/B'], character_tags: ['Alice'], categories: ['Gen'], additional_tags: ['Fluff', 'Batman', 'Shared Tag'] }
 const view = render(<MemoryRouter>{workMetadataFields({ ...exampleWork, metadata }, 'tile').allTags}</MemoryRouter>)
 const list = view.container.querySelector('.expandable-metadata-tags')!
 expect(list.querySelectorAll('.metadata-tag')).toHaveLength(7)
 fireEvent.click(within(list as HTMLElement).getByRole('button', { name: '+2 more' }))
 expect(list.querySelectorAll('.metadata-tag')).toHaveLength(9)
 for (const [category, color] of Object.entries({ warnings: '#aa0011', relationships: '#123abc', characters: '#456def', tags: '#789abc' })) {
  const tags = list.querySelector(`.metadata-tag[data-tag-category="${category}"]`)!
  expect(tags).toHaveStyle(`--tag-color: ${color}`)
  expect(tags.closest('.metadata-tags')).toHaveAttribute('data-tag-shape', shape)
  expect(tags.closest('.metadata-tags')).toHaveStyle('--tag-filled-color: #789abc')
 }
 expect(list).not.toHaveTextContent('Batman')
 expect(list).not.toHaveTextContent('Fandom: Other')
 expect(list).toHaveTextContent('Uncategorized')
 fireEvent.click(within(list as HTMLElement).getByRole('button', { name: 'Show Less' }))
 expect(list.querySelectorAll('.metadata-tag')).toHaveLength(7)
})
