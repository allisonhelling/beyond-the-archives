export function formatBytes(bytes: number) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'], unit = Math.min(units.length - 1, Math.floor(Math.log(Math.max(1, bytes)) / Math.log(1024)))
  return `${(bytes / 1024 ** unit).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${units[unit]}`
}
export function isStorageFull(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'name' in error && ['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED'].includes(String(error.name)))
}
export const storageFullMessage = 'Browser storage is full. The latest save did not complete. Choose local EPUB downloads to remove, then retry. The reader never automatically deletes your books.'
