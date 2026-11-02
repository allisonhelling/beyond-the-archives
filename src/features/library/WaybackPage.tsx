import { Landmark } from 'lucide-react'
import { Tooltip } from '../../components/Tooltip'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useActivity } from '../../lib/use-activity'
import { parseWorkUrl } from '../imports/urls'

export function WaybackLink({ url, menu = false }: { url: string; menu?: boolean }) {
 try { parseWorkUrl(url) } catch { return null }
 return <Tooltip description="View in Wayback Machine">{descriptionId => <Link className={menu ? 'menu-item' : 'button secondary'} aria-label="View in Wayback Machine" aria-describedby={descriptionId} to={`/wayback?${new URLSearchParams({ url })}`} target="_blank" rel="noreferrer"><Landmark size={16} aria-hidden="true" />Wayback</Link>}</Tooltip>
}
export function WaybackPage() {
 const [params] = useSearchParams(), input = params.get('url') ?? ''
 const [attempt, setAttempt] = useState(0), [result, setResult] = useState<{ input: string; attempt: number; message: string }>()
 const busy = result?.input !== input || result?.attempt !== attempt, message = result?.message ?? ''
 useActivity(busy, 'Searching Wayback Machine…')
 let normalized = ''
 try { normalized = parseWorkUrl(input).normalizedUrl } catch { /* Unsupported link has no destination. */ }
 const calendar = normalized ? `https://web.archive.org/web/*/${normalized}` : ''
 useEffect(() => {
  const controller = new AbortController()
  void (async () => {
   try {
    if (!normalized) throw new Error('This link does not identify an AO3 work.')
    if (!supabase) throw new Error('Archive lookup requires an online organizer connection.')
    const { data, error } = await supabase.functions.invoke('wayback-lookup', { body: { url: input }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]) })
    if (controller.signal.aborted) return
    if (error) throw new Error('Could not check Wayback Machine. Try again or browse the snapshot calendar.')
    if (data?.kind === 'calendar') {
     setResult({ input, attempt, message: data.reason === 'not_found' ? 'No snapshots were found for the checked work links. You can still browse the snapshot calendar.' : data.reason === 'unverified' ? 'No usable page was found among the recent snapshots checked. Older captures may be available in the calendar.' : 'Wayback Machine could not be fully checked. Try again later or browse the snapshot calendar.' })
    } else {
     const result = typeof data?.url === 'string' ? parseWorkUrl(data.url) : null
     if (!result?.archiveUrl || result.normalizedUrl !== normalized || !['work', 'adult_warning'].includes(data.kind)) throw new Error('The archive returned an unexpected link. Browse the snapshot calendar instead.')
     window.location.replace(result.archiveUrl)
    }
   } catch (error) { if (!controller.signal.aborted) setResult({ input, attempt, message: error instanceof Error ? error.message : 'Wayback lookup failed. Try again later.' }) }
  })()
  return () => controller.abort()
 }, [input, normalized, attempt])
 return <section className="settings-card"><h1>Wayback Machine</h1>{busy ? <p role="status">Checking recent archived snapshots…</p> : <><p role="status">{message}</p><div className="form-actions">{calendar && <a className="button secondary" href={calendar} rel="noreferrer">Browse Snapshot Calendar</a>}{normalized && <button className="button secondary" onClick={() => setAttempt(value => value + 1)}>Try Again</button>}</div></>}<p>Adult-content warnings are allowed. Archived login screens cannot unlock a story, and an opening work page does not guarantee every chapter was captured.</p></section>
}
