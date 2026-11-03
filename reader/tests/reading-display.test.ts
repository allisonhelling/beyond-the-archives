import { expect, it } from 'vitest'
import { defaultPreferences, readerChapterLabel, type Chapter } from '../src/model'
import { readerColors, closestNotch, readingNotches } from '../src/reading-display'
it('preserves automatic dark colors and validates custom colors', () => {
 expect(readerColors({ ...defaultPreferences, dark: true }).background).toBe('#111111')
 expect(readerColors({ ...defaultPreferences, theme: 'sepia', textColor: '#123456', linkColor: 'invalid' })).toEqual({ text: '#123456', link: '#805024', background: '#f7f0e3' })
 expect(closestNotch(17.28, readingNotches.size)).toBe(2)
 expect(closestNotch(755, readingNotches.width)).toBe(2)
})
it('numbers prose sections once and uses a plain title page label', () => {
 const chapters = [{ id: 'intro', kind: 'frontmatter', title: 'Information', number: null }, { id: 'one', title: 'Chapter 1: Home', number: 1 }, { id: 'two', title: 'Away', number: 2 }] as Chapter[]
 expect(chapters.map(chapter => readerChapterLabel(chapter, chapters))).toEqual(['Title Page', '1. Home', '2. Away'])
})

it('restarts chapter numbering for each anthology work', () => {
 const chapters = [
  { id: 'a-title', kind: 'frontmatter', title: 'First Work', workStart: true, workTitle: 'First Work' },
  { id: 'a-one', title: 'Home', workTitle: 'First Work' },
  { id: 'b-title', kind: 'frontmatter', title: 'Second Work', workStart: true, workTitle: 'Second Work' },
  { id: 'b-one', title: 'Away', workTitle: 'Second Work' },
 ] as Chapter[]
 expect(chapters.map(chapter => readerChapterLabel(chapter, chapters))).toEqual(['Title Page', '1. Home', 'Title Page', '1. Away'])
})
