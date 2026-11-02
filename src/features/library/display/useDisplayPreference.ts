import { useLayout } from '../../../lib/use-layout'
import { useContext, useMemo, useSyncExternalStore } from 'react'
import { DisplayEditorContext } from './display-editor-context'
import { displayPreference, previewViewports, tagAppearance, displaySnapshot, subscribeDisplay, type DisplayGroup } from './display-settings'
export function usePreviewViewports() {
 const raw = useSyncExternalStore(subscribeDisplay, displaySnapshot, () => '{}')
 return previewViewports(raw)
}
export function useDisplayPreference(group: DisplayGroup) {
  const layout = useLayout()
  const raw = useSyncExternalStore(subscribeDisplay, displaySnapshot, () => '{}')
  const preferences = useContext(DisplayEditorContext)?.preferences
  return useMemo(() => preferences?.[group] ?? displayPreference(group, raw, layout), [preferences, group, raw, layout])
}

/** One appearance applies to tags in every tile and information page. */
export function useTagAppearance() {
  const raw = useSyncExternalStore(subscribeDisplay, displaySnapshot, () => '{}')
  const preferences = useContext(DisplayEditorContext)?.preferences
  return useMemo(() => preferences?.tagAppearance ?? tagAppearance(raw), [preferences, raw])
}
