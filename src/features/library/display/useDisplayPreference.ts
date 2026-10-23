import { useContext, useSyncExternalStore } from 'react'
import { DisplayEditorContext } from './display-editor-context'
import { displayPreference, tagAppearance, displaySnapshot, subscribeDisplay, type DisplayGroup } from './display-settings'
export function useDisplayPreference(group: DisplayGroup) {
  const raw = useSyncExternalStore(subscribeDisplay, displaySnapshot, () => '{}')
  return useContext(DisplayEditorContext)?.preferences[group] ?? displayPreference(group, raw)
}

/** One appearance applies to tags in every tile and information page. */
export function useTagAppearance() {
  const raw = useSyncExternalStore(subscribeDisplay, displaySnapshot, () => '{}')
  return useContext(DisplayEditorContext)?.preferences.tagAppearance ?? tagAppearance(raw)
}
