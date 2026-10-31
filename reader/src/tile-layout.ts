import { displayGroups, displayPreference, displayPreferences, type DisplayPreference, type TagAppearance } from '../../src/features/library/display/display-settings'
import type { DisplayLayout } from '../../src/lib/use-layout'
import type { Preferences } from './model'
export const readerTileFields = ['authors','fandoms','series','rating','words','summary','relationships','characters','tags','warnings','collections','kudos','reading','saved','updated','progress','category','bookmarks','comments','hits','published','language','publication','workId','source','allTags'] as const
export function defaultReaderTile(): DisplayPreference {
  const visible = ['authors','fandoms','series','words','rating','allTags','summary','progress']
  return {order:['authors','fandoms','line:facts','allTags','summary','progress'],hidden:Object.keys(displayGroups.workTile.fields).filter(key=>!visible.includes(key)),lines:{'line:facts':['series','words','rating']}}
}
export function readerTilePreferences(preferences: Preferences, layout: DisplayLayout, appearance: TagAppearance) {
  return {...displayPreferences('{}',layout),workTile:displayPreference('workTile',JSON.stringify({workTile:preferences.tileLayouts?.[layout] ?? defaultReaderTile()}),layout),tagAppearance:appearance}
}
