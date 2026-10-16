import { BookCheck, CircleHelp, NotebookPen } from 'lucide-react'

export const publicationStatuses = {
  complete: { label: 'Complete on AO3', Icon: BookCheck },
  in_progress: { label: 'In Progress on AO3', Icon: NotebookPen },
  unknown: { label: 'AO3 publication status unknown', Icon: CircleHelp },
} as const
