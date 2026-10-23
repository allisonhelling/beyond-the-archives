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
import { displayGroups, tagAppearance, displayPreference, displayPreferences, displaySettingsKey, moveDisplaySelection, deleteDisplaySelection, moveDisplayField, removeDisplayLine, separateDisplayField, saveDisplay, type DisplayGroup } from './display-settings'

beforeEach(() => {
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) })
})
afterEach(() => vi.unstubAllGlobals())

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
  expect(normalized.hidden).toEqual(['authors', ...defaults.hidden])
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
 const view = render(<MetadataTags values={['A/B']} category="relationships" onRemove={remove} removeLabel={value => `Remove Relationships filter ${value}`} />)
 expect(view.container.querySelector('[data-tag-shape]')).toHaveAttribute('data-tag-shape', 'sharp')
 expect(view.container.querySelector('[data-tag-category]')).toHaveStyle('--tag-color: #123abc')
 fireEvent.click(screen.getByRole('button', { name: 'Remove Relationships filter A/B' }))
 expect(remove).toHaveBeenCalledWith('A/B')
})

it('colors active filter tags by category and updates them when settings are saved', () => {
 const preferences = displayPreferences()
 preferences.tagAppearance = { shape: 'sharp', colors: { relationships: '#123abc', characters: '#456def', tags: '#789abc' } }
 act(() => saveDisplay(preferences))
 render(<ReadingFilterControls stories={[]} filters={{ ...defaultReadingFilters, relationship: 'A/B', characters: 'A', tags: 'Fluff', rating: ['Teen And Up Audiences'], personalRating: ['1'] }} onChange={vi.fn()} />)
 const active = within(screen.getByLabelText('Active filters'))
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
 const projected=moveDisplaySelection(preferences.workTile,['authors'],'fandoms')
 const view=render(<DisplayEditorContext value={{preferences,groups:['workTile'],selected:null,dropPreview:{group:'workTile',preference:projected,fields:['authors']}}}><div className="display-edit-surface"><DisplayInfo group="workTile">{{authors:<p>Author</p>,fandoms:<p>Fandom</p>,summary:<p>Summary</p>}}</DisplayInfo></div></DisplayEditorContext>)
 const shadow=view.container.querySelector('.display-drop-shadow')!
 expect(shadow).toHaveTextContent('Author')
 expect(shadow.previousElementSibling).toHaveTextContent('Fandom')
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
 expect(screen.getByLabelText('Active filters')).toHaveTextContent('Hide Series')
 view.rerender(<ReadingFilterControls {...props} filters={{ ...props.filters, showSeries: true }} />)
 expect(screen.getByLabelText('Active filters')).toHaveTextContent('Show Series')
 expect(screen.getByLabelText('Active filters')).not.toHaveTextContent('Hide Series')
 view.rerender(<ReadingFilterControls {...props} mode="reading" />)
 expect(screen.queryByLabelText('Active filters')).not.toBeInTheDocument()
 view.rerender(<ReadingFilterControls {...props} automaticCollection />)
 expect(screen.queryByLabelText('Active filters')).not.toBeInTheDocument()
})

it.each(['tile', 'info'] as const)('renders every selectable AO3 field in the %s layout, including known zero statistics', layout => {
 const group = layout === 'tile' ? 'workTile' : 'workInfo'
 localStorage.setItem(displaySettingsKey, JSON.stringify({ [group]: { order: Object.keys(displayGroups[group].fields), hidden: [] } }))
 const story = { ...exampleWork, metadata: { ...exampleWork.metadata, categories: ['M/M'], language: 'English', bookmark_count: 0, comment_count: 123, hits: 4567 } }
 render(<MemoryRouter><DisplayInfo group={group}>{workMetadataFields(story, layout)}</DisplayInfo></MemoryRouter>)
 expect(screen.getByText('M/M')).toBeVisible()
 expect(screen.getByText('0 bookmarks')).toBeVisible()
 expect(screen.getByText('123 comments')).toBeVisible()
 expect(screen.getByText('4,567 hits')).toBeVisible()
 expect(screen.getByText(/English/)).toBeVisible()
 expect(screen.getByRole('link', { name: 'View on AO3' })).toHaveAttribute('href', story.original_url)
 expect(screen.getAllByText(/2017/).length).toBeGreaterThan(0)
})

it('keeps added AO3 fields hidden until selected, preserving saved layouts', () => {
 render(<MemoryRouter><DisplayInfo group="workTile">{workMetadataFields({ ...exampleWork, metadata: { ...exampleWork.metadata, categories: ['M/M'], language: 'English' } }, 'tile')}</DisplayInfo></MemoryRouter>)
 expect(screen.queryByText('M/M')).not.toBeInTheDocument()
 expect(screen.queryByText(/English/)).not.toBeInTheDocument()
 expect(screen.getByText(/66,463 words/)).toBeVisible()
})
