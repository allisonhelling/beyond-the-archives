import { parseCsv } from '../../imports/ao3-csv'
import { parseWorkUrl, type Story } from '../model'
import { safeBookFusionLink } from './bookfusion'

export type MappingRow = { link: string; title: string; author: string; bookfusion_id: string; bookfusion_url: string }
export function readMapping(text: string): MappingRow[] {
  const rows = parseCsv(text, ['link', 'title', 'author', 'bookfusion_id', 'bookfusion_url'])
  if (!rows.length || rows.length > 2000) throw new Error('Choose a mapping report containing 1–2,000 books.')
  return rows.map(row => ({ link: row.link.trim(), title: row.title, author: row.author, bookfusion_id: row.bookfusion_id.trim(), bookfusion_url: row.bookfusion_url.trim() }))
}
export function matchMapping(rows: MappingRow[], stories: Story[]) {
  const workIds = rows.map(row => { try { return parseWorkUrl(row.link).workId } catch { return null } })
  const counts = new Map<number | null, number>()
  for (const id of workIds) counts.set(id, (counts.get(id) ?? 0) + 1)
  const byWork = new Map<number, Story[]>()
  for (const story of stories) {
    const id = story.work.ao3_work_id
    if (id !== null) byWork.set(id, [...(byWork.get(id) ?? []), story])
  }
  return rows.map((row, index) => {
    const workId = workIds[index]
    const matches = workId === null ? [] : byWork.get(workId) ?? []
    const story = matches.length === 1 ? matches[0] : undefined
    const duplicate = workId !== null && counts.get(workId)! > 1
    const link = safeBookFusionLink({ url: row.bookfusion_url, kind: 'book' })
    const reason = !workId ? 'Missing or invalid AO3 work URL.' : duplicate ? 'Multiple report rows refer to this AO3 work. Review manually.' : !story ? 'No unique saved AO3 work matches.' : !link ? 'Paste a book-level BookFusion link; an upload identifier alone cannot resolve it.' : ''
    const existing = story?.metadata.bookfusion_link
    const replacement = Boolean(existing && JSON.stringify(existing) !== JSON.stringify(link))
    return { row, story, reason, replacement, link }
  })
}
