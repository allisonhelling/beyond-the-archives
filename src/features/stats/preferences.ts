export const readingSpeedKey = 'between-chapters:reading-speed:v1'
export function validReadingSpeed(value: number) { return Number.isInteger(value) && value >= 1 && value <= 2000 }
export function savedReadingSpeed(): number {
 try { const value = Number(localStorage.getItem(readingSpeedKey)); if (validReadingSpeed(value)) return value } catch { /* Use the default when storage is unavailable. */ }
 return 225
}
