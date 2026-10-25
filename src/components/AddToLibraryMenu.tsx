import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { History, Plus } from 'lucide-react'
import { useDismissible } from './useDismissible'

// Preserve the original add menu for screens that need both entry points.
export function AddToLibraryMenu() {
 const navigate = useNavigate()
 const [open, setOpen] = useState(false)
 const ref = useDismissible<HTMLDivElement>(open, () => setOpen(false))
 return <div className="add-wrapper" ref={ref}><button className="button primary compact" aria-expanded={open} aria-controls="add-options" onClick={() => setOpen(!open)}><Plus size={16} /> Add</button>{open && <div id="add-options" className="add-menu menu-surface"><strong>Add to Your Library</strong><button onClick={() => { setOpen(false); navigate('/add') }}><span className="add-option-label"><Plus size={19} aria-hidden="true" />Add Story</span></button><button onClick={() => { setOpen(false); navigate('/imports') }}><span className="add-option-label"><History size={19} aria-hidden="true" />Import History from AO3</span></button></div>}</div>
}
