import { useEffect } from 'react'
import { offlineStories } from './storage'
import { Link } from 'react-router-dom'
import { Brand } from '../../components/Brand'
import { RetainedLibraryProvider } from '../library/LibraryProvider'
import { StoryCard } from '../library/LibraryPages'
import { ReadingDashboard } from '../library/ReadingDashboard'
import { useOffline } from './OfflineProvider'
import { ReaderControls } from './ReaderControls'
export function OfflinePage({ standalone = false }: { standalone?: boolean }) {
  const { snapshot, refresh } = useOffline()
  useEffect(() => {
    const update = () => { if (!document.hidden) void refresh() }
    update()
    const timer = window.setInterval(update, 30000)
    return () => window.clearInterval(timer)
  }, [refresh])
  const stories = offlineStories(snapshot)
  const content = <><div className="page-heading"><h1>Offline</h1><p>Browse downloaded and cloud-saved works in your reader. Cloud-only EPUBs require an internet connection to download; the reader checks local availability when opened.</p></div><ReaderControls hub />
    {!snapshot && <p>No retained library is available. Initial setup requires connectivity: sign in online, connect the reader, sync its reports, and load this organizer.</p>}
    {standalone && <p>Locally retained information is available without an active online session. Account operations require an online sign-in. Anyone using this browser profile can view these saved reports.</p>}
    <RetainedLibraryProvider stories={stories}><ReadingDashboard localOnly mode="library" stories={stories} showActions={false} renderStory={(story, linkId) => <StoryCard key={story.id} story={story} linkId={linkId} readerBookId={snapshot?.cloudBooks?.find(book => story.id === `reader-cloud-${book.id}`)?.id} readOnly />} /></RetainedLibraryProvider></>
  return standalone ? <div className="app-shell"><header className="app-header"><Brand /><Link to="/auth">Online Sign-In</Link></header><main className="app-main">{content}</main></div> : content
}
