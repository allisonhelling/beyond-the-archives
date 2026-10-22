import { createContext } from 'react'
import type { DisplayGroup, DisplayPreferences, DisplayPreference } from './display-settings'
export type DisplayField = { group: DisplayGroup; field: string }
export const DisplayEditorContext = createContext<{
  preferences: DisplayPreferences
  groups: readonly DisplayGroup[]
  selected: DisplayField | null
  selectedFields?: DisplayField[]
  dropPreview?: { group: DisplayGroup; preference: DisplayPreference; fields: string[] }
} | null>(null)
