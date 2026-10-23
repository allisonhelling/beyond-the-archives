export const pageSizes = [25, 50, 100, 250] as const
export type PageSize = typeof pageSizes[number]
export const pageSizeKey = 'between-chapters:page-size:v1'
export function pageSize(value: unknown): PageSize | undefined { return pageSizes.find(size => String(size) === String(value)) }
export function savedPageSize(): PageSize {
  try { return pageSize(localStorage.getItem(pageSizeKey)) ?? 50 } catch { return 50 }
}
