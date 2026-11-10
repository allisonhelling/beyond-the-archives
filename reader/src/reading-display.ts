import type { Preferences } from './model'

export const readingFonts = {
  default: { label: 'Georgia', family: 'var(--font-serif)' },
  georgia: { label: 'Georgia', family: 'Georgia, serif' },
  palatino: { label: 'Palatino', family: 'Palatino, "Palatino Linotype", "Book Antiqua", serif' },
  sans: { label: 'System Sans', family: 'system-ui, sans-serif' },
  mono: { label: 'Monospace', family: 'ui-monospace, monospace' },
} as const
export const readingThemes = {
  system: { label: 'Automatic', text: '#382b2b', link: '#970000', background: '#fffefa' },
  light: { label: 'White', text: '#222222', link: '#0645ad', background: '#ffffff' },
  night: { label: 'Black', text: '#eeeeee', link: '#9cc4ff', background: '#111111' },
  sepia: { label: 'Sepia', text: '#574234', link: '#805024', background: '#f7f0e3' },
  charcoal: { label: 'Charcoal', text: '#e0e0e0', link: '#a8caff', background: '#333333' },
  gray: { label: 'Gray', text: '#292929', link: '#153d7c', background: '#bdbdbd' },
} as const
export const readingNotches = { size: [14, 16, 17.28, 18, 20, 22, 24, 26, 28, 30], width: [480, 600, 720, 840, 960, 1100] } as const
export const lineSpacings = [1.3, 1.5, 1.75, 2, 2.25] as const
export function closestNotch(value: number, choices: readonly number[]) {
  return choices.reduce((best, choice, index) => Math.abs(choice - value) < Math.abs(choices[best] - value) ? index : best, 0)
}
export function readerColors(preferences: Preferences) {
  const theme = readingThemes[preferences.theme ?? 'system'] ?? readingThemes.system
  const base = (!preferences.theme || preferences.theme === 'system') && preferences.dark ? readingThemes.night : theme
  const color = (value: string | undefined, fallback: string) => value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback
  return { text: color(preferences.textColor, base.text), link: color(preferences.linkColor, base.link), background: color(preferences.backgroundColor, base.background) }
}
