import type { BookDetails, Preferences } from './model'
export type CloudValue = { key: string; value: unknown; revision: number }
export type CloudEdit = { id: string; key: string; value: unknown; base: number }
export const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
export function cloudBookFields(book: BookDetails): Record<string, unknown> {
  // Organizer pairing, copied organizer state, and layout-dependent pixels never leave this installation.
  const { account: _account, remote: _remote, hasFile: _file, position, history, completed, notes, status, active, ...manifest } = book
  void _account; void _remote; void _file
  return { manifest, position: { chapter: position.chapter, fraction: position.fraction, textOffset: position.textOffset }, completed, notes, status, active, ...Object.fromEntries(history.map(event => [`history:${event.id}`, event])) }
}
export function cloudPreferences(preferences: Preferences) {
  const { tagSyncAccount: _account, ...value } = preferences
  void _account
  return value
}
