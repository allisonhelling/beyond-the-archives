import { Heart } from 'lucide-react'
import { Tooltip } from '../../components/Tooltip'
import { bookmarkRec, type Story } from './model'

export function BookmarkRec({ story }: { story: Pick<Story, 'source_bookmark'> }) {
 const rec = bookmarkRec(story)
 const label = rec === true ? 'AO3 bookmark Rec' : rec === false ? 'AO3 bookmark is not a Rec' : 'AO3 bookmark Rec unknown'
 return <Tooltip description={rec === null ? 'AO3 does not expose the Rec setting for this bookmark.' : label}>{id => <span className="icon-button bookmark-rec" role="img" aria-label={label} aria-describedby={id} tabIndex={0} data-rec={rec === null ? 'unknown' : String(rec)}><Heart size={20} fill={rec === true ? 'currentColor' : 'none'} aria-hidden="true" /></span>}</Tooltip>
}
