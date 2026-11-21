import { FileOutput } from 'lucide-react'
import { useState } from 'react'
import { ConfirmationDialog } from '../../components/ConfirmationDialog'
import { Tooltip } from '../../components/Tooltip'
import { useLayout } from '../../lib/use-layout'
import { useLibrary } from './LibraryProvider'
import type { Story } from './model'
import { exportWork } from './work-export'

export function ExportWorkMetadata({ story, menu = false, inline = false, disabled = false }: { story: Story; menu?: boolean; inline?: boolean; disabled?: boolean }) {
 const { collections } = useLibrary()
 const mobile = useLayout() === 'mobile'
 const [open, setOpen] = useState(false), [format, setFormat] = useState<'json' | 'csv'>('json')
 const button = (descriptionId?: string) => <button type="button" className={menu ? 'menu-item' : inline ? 'icon-button inline-edit-icon metadata-refresh' : 'button secondary story-metadata-edit'} aria-label={inline ? 'Export Work Metadata' : undefined} aria-describedby={descriptionId} disabled={disabled} onClick={() => setOpen(true)}><FileOutput className="export-work-icon" size={16} aria-hidden="true" />{!inline && (menu ? 'Export Work Metadata' : 'Export Metadata')}</button>
 return <>{menu || mobile ? button() : <Tooltip description="Export Work Metadata">{button}</Tooltip>}
  {open && <ConfirmationDialog className="work-export-dialog" title="Export Work Metadata" confirmLabel="Export" pendingLabel="Exporting…" onClose={() => setOpen(false)} onConfirm={async () => exportWork(story, format, collections)}>
   <p>Download “{story.metadata.title}” with its saved metadata, reading progress, private notes, and personal tags.</p>
   <label className="work-export-format">Export Format<select value={format} onChange={event => setFormat(event.target.value as 'json' | 'csv')}><option value="json">JSON</option><option value="csv">CSV</option></select></label>
  </ConfirmationDialog>}
 </>
}
