import './activity.css'
import { useSyncExternalStore } from 'react'
import { LoaderCircle } from 'lucide-react'
import { activitySnapshot, subscribeActivity } from '../lib/activity'
import { useActivity } from '../lib/use-activity'

export function LoadingIcon() {
 return <LoaderCircle className="loading-icon" size={18} aria-hidden="true" />
}

/** Dialogs render this in the native top layer, above their backdrop. */
export function ActivityIndicator({ inline = false, busy = false }: { inline?: boolean; busy?: boolean }) {
 const activity = useSyncExternalStore(subscribeActivity, activitySnapshot, () => '')
 if (!activity && !busy) return null
 return <span className={`activity-indicator${inline ? ' activity-indicator-inline' : ''}`} role="progressbar" aria-label="Loading or Processing" aria-valuetext={activity || 'Working…'} aria-live="polite"><LoadingIcon /><span>{activity || 'Working…'}</span></span>
}

export function LoadingStatus({ children }: { children: string }) {
 useActivity(true, children)
 return <p className="loading-status" role="status"><LoadingIcon />{children}</p>
}
