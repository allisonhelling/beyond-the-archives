import { useId, useState } from 'react'
import { Ellipsis, Info, Download } from 'lucide-react'
import { useDismissible } from '../../src/components/useDismissible'

export function WorkMenu({ onViewDetails, onRemoveDownload }: { onViewDetails: () => void; onRemoveDownload?: () => void }) {
  const [open, setOpen] = useState(false), id = useId()
  const ref = useDismissible<HTMLDetailsElement>(open, () => setOpen(false))
  return <details className="work-menu" ref={ref} open={open} onToggle={event => setOpen(event.currentTarget.open)} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); ref.current?.querySelector('summary')?.focus() }
  }}>
    <summary aria-label="Work Actions" title="Work Actions" aria-expanded={open} aria-controls={open ? id : undefined}><Ellipsis size={20} aria-hidden="true" /></summary>
    {open && <div className="dropdown-panel menu-surface" id={id}><button className="menu-item" onClick={() => { setOpen(false); ref.current?.querySelector('summary')?.focus(); onViewDetails() }}><Info size={16} aria-hidden="true" />View Details</button>{onRemoveDownload && <button className="menu-item" onClick={() => { setOpen(false); ref.current?.querySelector('summary')?.focus(); onRemoveDownload() }}><Download size={16} aria-hidden="true" />Remove Download</button>}</div>}
  </details>
}
