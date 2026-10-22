export type DateFormat = 'MDY' | 'DMY' | 'YMD'
export const dateFormatKey = 'between-chapters:date-format:v1'
const locales: Record<DateFormat, string> = { MDY: 'en-US', DMY: 'en-GB', YMD: 'fr-CA' }
let currentFormat: DateFormat = 'MDY'
export function savedDateFormat(): DateFormat {
 try {
  const saved = localStorage.getItem(dateFormatKey)
  if (saved === 'MDY' || saved === 'DMY' || saved === 'YMD') return saved
 } catch { /* Use the current selection if storage is unavailable. */ }
 return currentFormat
}
export function saveDateFormat(value: DateFormat) {
 currentFormat = value
 try { localStorage.setItem(dateFormatKey, value) } catch { /* Retain the selection for this visit. */ }
}
export function isCalendarDate(value: string): boolean {
 return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
}
function formatter(format = savedDateFormat(), options: Intl.DateTimeFormatOptions = {}) {
 return new Intl.DateTimeFormat(locales[format], { year: 'numeric', month: '2-digit', day: '2-digit', ...options })
}
/** Calendar dates keep their original day, including AO3 dates stored as timestamps. */
export function formatDate(value: string | null | undefined, format = savedDateFormat()): string {
 const date = value?.slice(0, 10)
 return date && isCalendarDate(date) ? formatter(format, { timeZone: 'UTC' }).format(new Date(date)) : 'Unknown'
}
/** Audit timestamps retain local time while respecting the chosen date order. */
export function formatDateTime(value: string): string {
 const date = new Date(value)
 return Number.isFinite(date.getTime()) ? formatter(savedDateFormat(), { hour: '2-digit', minute: '2-digit' }).format(date) : 'Unknown'
}
export function ao3Date(value: string | null | undefined, format = savedDateFormat()): string {
 const date = value?.slice(0, 10)
 if (!date || !isCalendarDate(date)) return 'Unknown'
 const display = new Intl.DateTimeFormat(format === 'DMY' ? 'en-GB' : 'en-US', { month: 'short', day: '2-digit', year: 'numeric', timeZone: 'UTC' })
 if (format !== 'YMD') return display.format(new Date(date))
 // Keep the English month name while arranging the calendar fields year first.
 const parts = Object.fromEntries(display.formatToParts(new Date(date)).map(part => [part.type, part.value]))
 return [parts.year, parts.month, parts.day].join(' ')
}
export function datePlaceholder(format = savedDateFormat()): string {
 const labels: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = { year: 'yyyy', month: 'mm', day: 'dd' }
 return formatter(format, { timeZone: 'UTC' }).formatToParts(new Date('2026-10-20')).map(part => labels[part.type] ?? part.value).join('')
}
/** Convert a complete localized filter edit to ISO; leave partial/invalid edits visible. */
export function parseDateText(value: string, format = savedDateFormat()): string {
 const pattern = datePlaceholder(format)
 const separator = pattern.includes('/') ? '/' : '-'
 const fields = pattern.split(separator), values = value.split(separator)
 if (values.length !== 3 || !values.every((part, index) => new RegExp(`^\\d{${fields[index].length}}$`).test(part))) return value
 const parts = Object.fromEntries(fields.map((field, index) => [field, values[index]]))
 const iso = `${parts.yyyy}-${parts.mm}-${parts.dd}`
 return isCalendarDate(iso) ? iso : value
}
export function filterDateText(value: string): string { return isCalendarDate(value) ? formatDate(value) : value }

export function scraperDate(value: string): string | null {
 const text = value.trim()
 if (!text) return null
 if (isCalendarDate(text)) return text
 const match = text.match(/^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/)
 const month = match && ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(match[2].toLowerCase())
 const iso = match && month !== null && month >= 0 ? `${match[3]}-${String(month + 1).padStart(2, '0')}-${match[1].padStart(2, '0')}` : ''
 if (!isCalendarDate(iso)) throw new Error(`Unrecognized AO3 date: ${text}`)
 return iso
}
