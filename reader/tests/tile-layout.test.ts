import { expect, it } from 'vitest'
import { defaultPreferences, defaultTagAppearance } from '../src/model'
import { defaultReaderTile, readerTilePreferences } from '../src/tile-layout'
it('preserves the reader default arrangement and hides unsupported organizer fields',()=>{
 const tile=defaultReaderTile()
 expect(tile.order).toEqual(['authors','fandoms','series','line:facts','allTags','summary','progress'])
 expect(tile.lines?.['line:facts']).toEqual(['words','chapters','rating'])
 expect(tile.hidden).toContain('notes')
 expect(tile.hidden).not.toContain('allTags')
})
it('keeps desktop and mobile layouts independent while sharing the existing preference normalization',()=>{
 const saved={...defaultReaderTile(),order:['summary','authors','fandoms','line:facts','allTags','progress'],hidden:[...defaultReaderTile().hidden,'authors']}
 const preferences={...defaultPreferences,tileLayouts:{desktop:saved}}
 expect(readerTilePreferences(preferences,'desktop',defaultTagAppearance).workTile.order[0]).toBe('summary')
 expect(readerTilePreferences(preferences,'desktop',defaultTagAppearance).workTile.hidden).toContain('authors')
 expect(readerTilePreferences(preferences,'mobile',defaultTagAppearance).workTile.hidden).not.toContain('authors')
 expect(readerTilePreferences(preferences,'mobile',defaultTagAppearance).tagAppearance).toEqual(defaultTagAppearance)
})
