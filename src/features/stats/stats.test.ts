import { describe, expect, it } from 'vitest'
import { exampleWork } from '../library/display/display-examples'
import type { ChapterReadEvent } from '../library/reading-history'
import { distribution, favorites, heatmap, inPeriod, lengthClass, observations, parsePeriod, periodBounds, periodText, shiftPeriod, statusProgress, timeBuckets, totals, type Period, type StatsWork } from './stats'

const october: Period = { mode: 'monthly', year: 2026, month: 9 }
function event(id: string, chapter: number, at: string, words: number | null, reread = false): ChapterReadEvent {
 return { id, action: 'chapter_read', chapter, chapter_id: null, at, word_count: words, is_reread: reread, status: 'reading' }
}
function work(history: ChapterReadEvent[], overrides: Partial<StatsWork> = {}): StatsWork {
 return { ...exampleWork, created_at: '2026-09-01T12:00:00', key: 'fic', archived: false, reading_history: history, ...overrides }
}
const records = [event('sep', 1, '2026-09-30T23:59:59', 100), event('oct1', 2, '2026-10-01T00:00:00', 200), event('oct2', 1, '2026-10-10T12:00:00', 100, true), event('oct3', 2, '2026-10-10T12:01:00', 200, true), event('oct4', 3, '2026-10-11T12:00:00', null), event('nov', 4, '2026-11-01T00:00:00', 400)]

describe('reading statistics', () => {
 it('uses local calendar boundaries and classifies unique chapters before period filtering', () => {
  const data = inPeriod(observations([work(records)]), october)
  expect(totals(data)).toEqual({ unique: 200, reread: 300, words: 500, unknown: 1, chapters: 4, works: 1 })
  expect(totals(inPeriod(observations([work(records)]), { ...october, mode: 'yearly' })).words).toBe(1000)
  expect(new Date(periodBounds(october)[0]).getDate()).toBe(1)
 })
 it('retains archived consumption without counting restored duplicate events twice', () => {
  const all = observations([work([records[0]], { archived: true, id: 'archived' }), work([records[0], { ...records[1], chapter: 1, chapter_id: '123' }])])
  expect(all).toHaveLength(2)
  expect(all[1].unique).toBe(false)
  expect(totals(all)).toMatchObject({ unique: 100, reread: 200 })
 })
 it('uses fic passes instead of chapter counts and splits multi-tag credit equally', () => {
  const data = inPeriod(observations([work(records)]), october)
  const rows = distribution(data, 'fandoms', 'fics', true)
  expect(rows.map(row => row.value)).toEqual([1, 1])
  expect(distribution(data, 'fandoms', 'fics', false).map(row => row.value)).toEqual([0.5, 0.5])
  expect(distribution(data, 'fandoms', 'words', true).reduce((sum, row) => sum + row.value, 0)).toBe(500)
  expect(favorites(data, 'authors', 'fics')[0].value).toBe(2)
  expect(favorites(data, 'authors', 'words')[0].value).toBe(500)
 })
 it('provides explicit unknown taxonomy and exact length boundaries', () => {
  const data = observations([work([records[0]], { metadata: { ...exampleWork.metadata, fandoms: [] } })])
  expect(distribution(data, 'fandoms', 'fics', true)).toEqual([{ label: 'Unknown', value: 1 }])
  expect([999, 1000, 9999, 10000, 39999, 40000, 100000, 100001, null].map(lengthClass)).toEqual(['Flash Fiction / Drabble', 'Short Story / One-Shot', 'Short Story / One-Shot', 'Novelette / Novella', 'Novelette / Novella', 'Novel Length', 'Novel Length', 'Epic Length', 'Unknown'])
 })
 it('builds daily, monthly, leap-year and heatmap totals from the same selected records', () => {
  const data = inPeriod(observations([work(records)]), october)
  expect(timeBuckets(data, october, true)).toHaveLength(31)
  expect(timeBuckets(data, october, true).reduce((sum, row) => sum + row.value, 0)).toBe(500)
  expect(heatmap(data).flat().reduce((sum, value) => sum + value, 0)).toBe(4)
  expect(timeBuckets([], { mode: 'yearly', year: 2024, month: 0 }, true)).toHaveLength(366)
  expect(timeBuckets([], { ...october, mode: 'yearly' })).toHaveLength(12)
 })
 it('uses status at the period end, including status-only works and excluding later activity', () => {
  const story = work([], { reading_status: 'finished', reading_history: [{ action: 'status', at: '2026-10-03T12:00:00', status: 'reading' }, { action: 'finished', at: '2026-11-01T12:00:00', status: 'finished' }] })
  expect(statusProgress([story], october)).toEqual([{ label: 'reading', value: 1 }])
  expect(statusProgress([work([], { created_at: '2026-12-01T12:00:00' })], october)).toEqual([])
 })
 it('keeps empty data finite and excludes unknown words from estimates', () => {
  expect(totals([]).words).toBe(0)
  expect(distribution(observations([work([records[4]])]), 'rating', 'words', true)).toEqual([])
 })
})
describe('period navigation and entry', () => {
 it('moves across calendar years and preserves the monthly selection on yearly navigation', () => {
  expect(shiftPeriod({ ...october, month: 0 }, -1)).toEqual({ ...october, month: 11, year: 2025 })
  expect(shiftPeriod({ ...october, mode: 'yearly' }, 1)).toEqual({ ...october, mode: 'yearly', year: 2027 })
 })
 it('accepts the saved date order and rejects impossible or partial periods', () => {
  expect(periodText(october, 'DMY')).toBe('10/2026')
  expect(periodText(october, 'YMD')).toBe('2026-10')
  expect(parsePeriod('2026-02', october, 'YMD')).toEqual({ ...october, month: 1 })
  expect(parsePeriod('02/2024', october, 'MDY')).toEqual({ ...october, year: 2024, month: 1 })
  for (const text of ['13/2026', '00/2026', '1/0', '01/0000', '2026-10']) expect(parsePeriod(text, october, 'DMY')).toBeNull()
  expect(parsePeriod('0001', { ...october, mode: 'yearly' }, 'YMD')?.year).toBe(1)
 })
})
