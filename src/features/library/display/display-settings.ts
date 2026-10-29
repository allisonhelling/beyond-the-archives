import type { DisplayLayout } from '../../../lib/use-layout'
import { ao3MetadataLabels, metadataLabels, newWorkInfoFields, newWorkTileFields } from './ao3-fields'
export const displaySettingsKey = 'between-chapters:display:v1'
const changeEvent = 'between-chapters:display-changed'
// Each group corresponds to an existing layout area. Titles and action menus stay fixed.
export const displayGroups = {
  workTile: { title: 'Work Tiles', fields: { favorite: 'Favorite Icon', rec: 'Recommended Icon', authors: ao3MetadataLabels.authors, fandoms: ao3MetadataLabels.fandoms, series: ao3MetadataLabels.series, rating: ao3MetadataLabels.rating, words: ao3MetadataLabels.words, chapters: ao3MetadataLabels.chapters, summary: ao3MetadataLabels.summary, relationships: ao3MetadataLabels.relationships, characters: ao3MetadataLabels.characters, tags: ao3MetadataLabels.tags, warnings: ao3MetadataLabels.warnings, personalRating: 'Personal Rating', collections: 'Custom Collections', kudos: ao3MetadataLabels.kudos, notes: 'Private Notes', reading: 'Reading Status', saved: 'Saved Date', updated: ao3MetadataLabels.updated, progress: 'Chapter Progress and Reading Shortcuts', ...metadataLabels(newWorkTileFields) } },
  workHeader: { title: 'Work Pages · Header', fields: { series: 'Series', authors: 'Authors', fandoms: 'Fandoms and AO3 Rating', stats: 'Statistics' } },
  workStats: { title: 'Work Pages · Statistics', fields: { words: 'Word Count', chapters: 'Chapters', publication: 'Publication Status', updated: 'Date Updated' } },
  workPage: { title: 'Work Pages · Sections', fields: { progress: 'Reading and Organization', notes: 'Private Notes', information: 'Story Information', metadata: 'Metadata Controls' } },
  workInfo: { title: 'Work Pages · Story Information', fields: { bookfusion: 'BookFusion Link', summary: ao3MetadataLabels.summary, relationships: ao3MetadataLabels.relationships, characters: ao3MetadataLabels.characters, tags: ao3MetadataLabels.tags, allTags: ao3MetadataLabels.allTags, personalTags: 'Personal Tags', saved: 'Saved Date', chapterHistory: 'Chapter Reading History', edited: 'Last Edited', other: 'Other Metadata', ...metadataLabels(newWorkInfoFields) } },
  workOther: { title: 'Work Pages · Other Metadata', fields: { ...ao3MetadataLabels, checked: 'Metadata Last Checked', canonical: 'Verified Canonical URL', original: 'Original Provided URL', provided: 'Updated Provided URL' } },
  seriesTile: { title: 'Series Tiles', fields: { ...metadataLabels(['category']), favorite: 'Favorite Icon', rec: 'Recommended Icon', authors: 'Authors', fandoms: 'Fandoms', reading: 'Reading Status', count: 'Works in Library', words: 'Word Count', relationships: 'Relationships', characters: 'Characters', tags: 'Additional Tags', warnings: 'AO3 Warnings', personalRating: 'Personal Rating (Average)', collections: 'Custom Collections', kudos: 'AO3 Kudos', description: 'Description', notes: 'Private Notes', creatorNotes: 'Creator Notes', updated: 'Date Updated', begun: 'Series Begun', works: 'Work List' } },
  seriesHeader: { title: 'Series Pages · Header', fields: { authors: 'Authors', fandoms: 'Fandoms', stats: 'Statistics', source: 'Details Source and Last Fetched' } },
  seriesStats: { title: 'Series Pages · Statistics', fields: { words: 'Word Count', publication: 'Publication Status', updated: 'AO3 Series Updated', works: 'Work Count' } },
  seriesPage: { title: 'Series Pages · Sections', fields: { description: 'Description and Creator Notes', progress: 'Reading and Organization', notes: 'Private Notes', works: 'Works in Series', information: 'Series Information' } },
  seriesDescription: { title: 'Series Pages · Description', fields: { description: 'Description', creatorNotes: 'Creator Notes' } },
  seriesInfo: { title: 'Series Pages · Series Information', fields: { ...metadataLabels(['category']), begun: 'Series Begun', saved: 'Saved Date', edited: 'Last Edited', libraryCount: 'Works in Library', words: 'Word Count', relationships: 'Relationships', characters: 'Characters', tags: 'Additional Tags', warnings: 'AO3 Warnings', kudos: 'AO3 Kudos' } },
} as const
export type DisplayGroup = keyof typeof displayGroups
export type DisplayPreference = { order: string[]; hidden: string[]; lines?: Record<string, string[]> }
export function isDisplayFieldHidden(preference: DisplayPreference, field: string) {
 return preference.hidden.includes(field) || Object.entries(preference.lines ?? {}).some(([line, fields]) => fields.includes(field) && preference.hidden.includes(line))
}
export type TagAppearance = { shape: TagShape; colors: Partial<Record<TagCategory, string>> }
export type DisplayPreferences = Record<DisplayGroup, DisplayPreference> & { tagAppearance: TagAppearance }
const defaultHidden: Partial<Record<DisplayGroup, string[]>> = { workTile: ['chapters', 'relationships', 'characters', 'tags', 'notes', 'reading', 'saved', 'updated', 'warnings', 'personalRating', 'collections', 'kudos', ...newWorkTileFields], workInfo: [...newWorkInfoFields], seriesTile: ['category', 'creatorNotes', 'updated', 'begun', 'relationships', 'characters', 'tags', 'warnings', 'personalRating', 'collections', 'kudos'], seriesInfo: ['category', 'libraryCount', 'words', 'relationships', 'characters', 'tags', 'warnings', 'kudos'] }
export const tagColors = {
 relationships: { label: 'Relationships', color: '#6b3f70', example: 'Dick Grayson & Bruce Wayne' }, characters: { label: 'Characters', color: '#355c70', example: 'Bruce Wayne' }, tags: { label: 'Additional Tags', color: '#715443', example: 'Fluff' }, warnings: { label: 'AO3 Warnings', color: '#970000', example: 'No Archive Warnings Apply' }, collections: { label: 'Custom Collections', color: '#4e684c', example: 'Comfort Reads' }, personalTags: { label: 'Personal Tags', color: '#715443', example: 'Read Again' },
} as const
export type TagCategory = keyof typeof tagColors
export const tagShapes = { pill: 'Rounded Pill', curved: 'Curved Rectangles', sharp: 'Sharp Rectangles', bullets: 'Text With Bullet Separators', commas: 'Text With Comma Separators' } as const
export type TagShape = keyof typeof tagShapes
export const shortDisplayDivider = (key: string) => key.startsWith('divider:short-')

let fallback = '{}'
export function displaySnapshot() {
  try { return localStorage.getItem(displaySettingsKey) ?? '{}' } catch { return fallback }
}
export function subscribeDisplay(listener: () => void) {
  window.addEventListener(changeEvent, listener)
  window.addEventListener('storage', listener)
  return () => { window.removeEventListener(changeEvent, listener); window.removeEventListener('storage', listener) }
}

export const viewportPresets = {
 'iphone-se': { label: 'iPhone SE', width: 320, height: 568 },
 'iphone-13': { label: 'iPhone 13 / 14', width: 390, height: 844 },
 'iphone-14-pro': { label: 'iPhone 14 Pro', width: 393, height: 852 },
 'pixel-7': { label: 'Pixel 7', width: 412, height: 915 },
 tablet: { label: 'Tablet', width: 768, height: 1024 },
 laptop: { label: 'Laptop', width: 1280, height: 800 },
 desktop: { label: 'Desktop', width: 1440, height: 900 },
} as const
export type PreviewViewport = { width: number; height: number }
export function previewViewports(raw = displaySnapshot()): Record<DisplayLayout, PreviewViewport> {
 let saved: { previewViewports?: Partial<Record<DisplayLayout, PreviewViewport>> } = {}
 try { saved = JSON.parse(raw) ?? {} } catch { /* Use standard viewport sizes. */ }
 return Object.fromEntries((['mobile', 'desktop'] as const).map(layout => {
  const value = saved.previewViewports?.[layout]
  const size = value && validViewport(value) ? value : viewportPresets[layout === 'mobile' ? 'iphone-13' : 'desktop']
  return [layout, { width: size.width, height: size.height }]
 })) as Record<DisplayLayout, PreviewViewport>
}
export function validViewport(value: PreviewViewport) {
 return Number.isInteger(value.width) && value.width >= 280 && value.width <= 3840 && Number.isInteger(value.height) && value.height >= 320 && value.height <= 3840
}
export function savePreviewViewports(viewports: Record<DisplayLayout, PreviewViewport>) {
 if (!Object.values(viewports).every(validViewport)) throw new Error('Enter whole widths from 280 to 3,840 and heights from 320 to 3,840 pixels.')
 let saved: Record<string, unknown> = {}
 try { saved = JSON.parse(displaySnapshot()) ?? {} } catch { /* Repair malformed preferences. */ }
 writeDisplay({ ...saved, previewViewports: viewports })
}
const tileFacts: Partial<Record<DisplayGroup, string[]>> = { workTile: ['series', 'rating', 'words'], seriesTile: ['reading', 'count', 'words'] }
export const displayDivider = (key: string) => /^divider:[a-zA-Z0-9-]{1,80}$/.test(key)
export const displayLine = (key: string) => /^line:[a-zA-Z0-9-]{1,80}$/.test(key)
export function displayFieldLabel(group: DisplayGroup, field: string) {
  return displayLine(field) ? 'Grouped Line' : shortDisplayDivider(field) ? 'Short Divider' : displayDivider(field) ? 'Divider' : (displayGroups[group].fields as Record<string, string>)[field]
}

export function displayPreference(group: DisplayGroup, raw: string, layout: DisplayLayout = 'desktop'): DisplayPreference {
  const keys = Object.keys(displayGroups[group].fields)
  let saved: Record<string, { order?: unknown; hidden?: unknown; lines?: unknown }> = {}
  try { saved = JSON.parse(raw) ?? {} } catch { /* Malformed preferences use defaults. */ }
  const profiles = saved as unknown as { mobile?: Record<string, { order?: unknown; hidden?: unknown; lines?: unknown }> }
  if (layout === 'mobile' && profiles.mobile && typeof profiles.mobile === 'object') saved = { ...saved, ...profiles.mobile }
  const value = saved[group]
  const strings = (input: unknown) => Array.isArray(input) ? input.filter((key): key is string => typeof key === 'string') : []
  let order = strings(value?.order)
  let hidden = strings(value?.hidden)
  let inputLines = value?.lines
  // Preserve existing tile layouts while making their facts individually movable.
  if (tileFacts[group] && (!inputLines || typeof inputLines !== 'object' || Array.isArray(inputLines))) {
    const legacy = saved[group === 'workTile' ? 'workTileFacts' : 'seriesTileFacts']
    const convert = (field: string) => group === 'seriesTile' && field === 'works' ? 'count' : field
    const facts = [...new Set([...strings(legacy?.order).map(convert).filter(key => tileFacts[group]!.includes(key)), ...tileFacts[group]!])]
    inputLines = { 'line:facts': facts }
    order = order.length ? order.map(key => key === 'facts' ? 'line:facts' : key) : keys.map(key => key === tileFacts[group]![0] ? 'line:facts' : key)
    hidden = [...hidden.map(key => key === 'facts' ? 'line:facts' : key), ...strings(legacy?.hidden).map(convert)]
  }
  const assigned = new Set<string>()
  const lines = Object.fromEntries(Object.entries(inputLines && typeof inputLines === 'object' && !Array.isArray(inputLines) ? inputLines : {}).filter(([id]) => displayLine(id)).map(([id, fields]) => [id, strings(fields).filter(key => { if (!keys.includes(key) || assigned.has(key)) return false; assigned.add(key); return true })]))
  hidden = [...new Set([...hidden.filter(key => keys.includes(key) || Object.hasOwn(lines, key) || displayDivider(key)), ...(defaultHidden[group] ?? []).filter(key => !strings(value?.order).includes(key) && !assigned.has(key))])]
  return { order: [...new Set([...order, ...Object.keys(lines), ...keys])].filter(key => (keys.includes(key) || Object.hasOwn(lines, key) || displayDivider(key)) && !assigned.has(key)), hidden, lines }

}

/** The same move operation supports click, keyboard, mouse and touch editing. */
export function moveDisplayField(preference: DisplayPreference, source: string, destination: string): DisplayPreference {
  return moveDisplaySelection(preference, [source], destination)
}

export function separateDisplayField(preference: DisplayPreference, field: string): DisplayPreference {
  const parent = Object.keys(preference.lines ?? {}).find(id => preference.lines![id].includes(field))
  if (!parent) return preference
  const order = [...preference.order]
  order.splice(order.indexOf(parent) + 1, 0, field)
  return { ...preference, order, lines: { ...preference.lines, [parent]: preference.lines![parent].filter(key => key !== field) } }
}
export function removeDisplayLine(preference: DisplayPreference, line: string): DisplayPreference {
  const lines = { ...preference.lines }, order = [...preference.order]
  order.splice(order.indexOf(line), 1, ...(lines[line] ?? [])); delete lines[line]
  return { ...preference, order, lines, hidden: preference.hidden.filter(key => key !== line) }
}
export function tagAppearance(raw: string): TagAppearance {
  let saved: Record<string, unknown> = {}
  try { const parsed = JSON.parse(raw); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) saved = parsed } catch { /* Use default appearance. */ }
  const global = saved.tagAppearance as Partial<TagAppearance> | undefined
  const legacy = (Object.keys(displayGroups) as DisplayGroup[]).map(group => saved[group] as { colors?: TagAppearance['colors']; tagShape?: TagShape } | undefined).filter(Boolean)
  const shape = global ? global.shape : legacy.find(value => value?.tagShape && value.tagShape !== 'bullets')?.tagShape
  const colors = global ? global.colors : Object.assign({}, ...legacy.map(value => value?.colors ?? {}).reverse())
  return { shape: typeof shape === 'string' && Object.hasOwn(tagShapes, shape) ? shape as TagShape : 'bullets', colors: Object.fromEntries(Object.entries(colors && typeof colors === 'object' ? colors : {}).filter(([category, color]) => Object.hasOwn(tagColors, category) && typeof color === 'string' && /^#[a-fA-F0-9]{6}$/.test(color))) }
}
export function displayPreferences(raw = displaySnapshot(), layout: DisplayLayout = 'desktop'): DisplayPreferences {
  return { ...Object.fromEntries((Object.keys(displayGroups) as DisplayGroup[]).map(group => [group, displayPreference(group, raw, layout)])), tagAppearance: tagAppearance(raw) } as DisplayPreferences
}

/** Commit the entire draft in one write, then notify mounted work and series views. */
export function saveDisplay(preferences: DisplayPreferences, layout: DisplayLayout = 'desktop') {
  let saved: Record<string, unknown> = {}
  try { saved = JSON.parse(displaySnapshot()) ?? {} } catch { /* Repair malformed preferences. */ }
  if (layout === 'desktop' && !saved.mobile) {
    const mobile: Partial<DisplayPreferences> = { ...displayPreferences(displaySnapshot(), 'mobile') }
    delete mobile.tagAppearance
    saved.mobile = mobile
  }
  const { tagAppearance, ...groups } = preferences
  writeDisplay({ ...saved, ...(layout === 'mobile' ? { mobile: groups } : groups), tagAppearance })
}
function writeDisplay(preferences: object) {
  const raw = JSON.stringify(preferences)
  localStorage.setItem(displaySettingsKey, raw)
  fallback = raw
  window.dispatchEvent(new Event(changeEvent))
}

/** Apply one operation to a stable, ordered selection, without moving containers into themselves. */
export function moveDisplaySelection(preference: DisplayPreference, sources: string[], destination: string): DisplayPreference {
 const selected = new Set(sources), originalLines = preference.lines ?? {}
 const parent = (field: string) => Object.keys(originalLines).find(id => originalLines[id].includes(field))
 const ordered = preference.order.flatMap(key => [key, ...(originalLines[key] ?? [])]).filter(key => selected.has(key) && !selected.has(parent(key) ?? ''))
 const targetLine = displayLine(destination) ? destination : parent(destination)
 if (!ordered.length || selected.has(destination) || targetLine && selected.has(targetLine)) return preference
 const lines = Object.fromEntries(Object.entries(originalLines).map(([id, fields]) => [id, fields.filter(field => !selected.has(field))]))
 const order = preference.order.filter(field => !selected.has(field))
 if (targetLine && ordered.every(field => !displayLine(field) && !displayDivider(field))) {
  const target = lines[targetLine], index = displayLine(destination) ? target.length : target.indexOf(destination)
  const after = !displayLine(destination) && ordered.every(field => parent(field) === targetLine) && originalLines[targetLine].indexOf(ordered[0]) < originalLines[targetLine].indexOf(destination)
  target.splice(index + (after ? 1 : 0), 0, ...ordered)
 } else {
  const target = targetLine ?? destination, index = order.indexOf(target)
  const after = preference.order.indexOf(parent(ordered[0]) ?? ordered[0]) < preference.order.indexOf(target)
  order.splice(index + (after ? 1 : 0), 0, ...ordered)
 }
 return { ...preference, order, lines }
}
export function deleteDisplaySelection(preference: DisplayPreference, fields: string[]): DisplayPreference {
 let result = preference
 for (const field of fields) {
  if (displayLine(field)) result = removeDisplayLine(result, field)
  else if (displayDivider(field)) result = { ...result, order: result.order.filter(key => key !== field), hidden: result.hidden.filter(key => key !== field) }
  else result = { ...result, hidden: [...new Set([...result.hidden, field])] }
 }
 return result
}
