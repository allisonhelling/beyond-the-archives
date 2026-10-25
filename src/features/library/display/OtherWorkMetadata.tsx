import { formatDateTime } from '../../../lib/dates'
import { savedWorkUrl, type Story } from '../model'
import { DisplayInfo } from './DisplayInfo'
import { isDisplayFieldHidden } from './display-settings'
import { useDisplayPreference } from './useDisplayPreference'
import { workMetadataFields } from './WorkMetadataFields'

function ExternalUrl({ url, fallback = 'Unverified' }: { url: string | null; fallback?: string }) {
  let clickable = false
  try {
    const parsed = new URL(url ?? '')
    clickable = parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch { /* Missing or invalid legacy URLs remain plain text. */ }
  return clickable ? <a className="metadata-link" href={url!} target="_blank" rel="noreferrer">{url}</a> : <>{fallback}</>
}

/** Keep undisplayed AO3 fields in one editable area, using the same field renderers. */
export function OtherWorkMetadata({ story, expanded = false }: { story: Story; expanded?: boolean }) {
  const header = useDisplayPreference('workHeader'), stats = useDisplayPreference('workStats')
  const page = useDisplayPreference('workPage'), info = useDisplayPreference('workInfo')
  const shown = new Set<string>()
  for (const field of ['authors', 'series']) if (!isDisplayFieldHidden(header, field)) shown.add(field)
  if (!isDisplayFieldHidden(header, 'fandoms')) { shown.add('fandoms'); shown.add('rating') }
  if (!isDisplayFieldHidden(header, 'stats')) for (const field of ['words', 'chapters', 'publication', 'updated']) if (!isDisplayFieldHidden(stats, field)) shown.add(field)
  if (!isDisplayFieldHidden(page, 'information')) for (const field of info.order.concat(Object.values(info.lines ?? {}).flat())) if (!isDisplayFieldHidden(info, field)) shown.add(field)
  const remaining = Object.fromEntries(Object.entries(workMetadataFields(story, 'info')).filter(([field]) => !shown.has(field)))
  return <div><dt className="sr-only">Other Metadata</dt><dd><details className="details-disclosure" open={expanded || undefined}><summary>Other Metadata</summary><p className="muted">Manually entered values are private field-level overrides.</p>
    <dl className="metadata-list"><DisplayInfo group="workOther">{{
      ...remaining,
      checked: <div><dt>Metadata Last Checked</dt><dd>{story.work.last_metadata_check ? formatDateTime(story.work.last_metadata_check) : 'Never'}</dd></div>,
      canonical: <div><dt>Verified Canonical URL</dt><dd><ExternalUrl url={story.work.canonical_url} /></dd></div>,
      original: <div><dt>Original Provided URL</dt><dd><ExternalUrl url={story.original_url} fallback="Unavailable" /></dd></div>,
      provided: savedWorkUrl(story) !== story.original_url && <div><dt>Updated Provided URL</dt><dd><ExternalUrl url={savedWorkUrl(story)} /></dd></div>,
    }}</DisplayInfo></dl>
  </details></dd></div>
}
