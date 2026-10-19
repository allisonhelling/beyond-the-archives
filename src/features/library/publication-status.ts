import { BookCheck, BookX, NotebookPen, createLucideIcon } from 'lucide-react'

// Keep Lucide's book silhouette and stroke styling, without interior page lines.
const BookQuestion = createLucideIcon('BookQuestion', [
  ['path', { d: 'M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 1 4 19.5Z', strokeDasharray: '3 3', key: 'outline' }],
  ['path', { d: 'M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4', strokeWidth: '2.5', key: 'question' }],
  ['circle', { cx: '12', cy: '17', r: '1.6', fill: 'currentColor', stroke: 'none', key: 'dot' }],
])

export const publicationStatuses = {
  complete: { label: 'Complete on AO3', Icon: BookCheck },
  in_progress: { label: 'In Progress on AO3', Icon: NotebookPen },
  abandoned: { label: 'Abandoned', Icon: BookX },
  unknown: { label: 'AO3 publication status unknown', Icon: BookQuestion },
} as const
