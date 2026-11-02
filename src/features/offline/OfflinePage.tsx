import { Link } from 'react-router-dom'
import { Brand } from '../../components/Brand'
import { RetainedLibraryProvider } from '../library/LibraryProvider'
import { StoryCard } from '../library/LibraryPages'
import { ReadingDashboard } from '../library/ReadingDashboard'
import { useOffline } from './OfflineProvider'
import { ReaderControls } from './ReaderControls'
export function OfflinePage({ standalone = false }: { standalone?: boolean }) {
  const { snapshot } = useOffline()
  const works = new Set(snapshot?.readers.flatMap(reader => reader.works) ?? [])
  const stories = snapshot?.stories.filter(story => works.has(String(story.work.ao3_work_id))) ?? []
  const content = <><div className="page-heading"><h1>Offline</h1><p>A convenient entrance to your offline library. The reader confirms availability and opens the EPUB.</p></div><ReaderControls hub />
    {!snapshot && <p>No retained library is available. Initial setup requires connectivity: sign in online, connect the reader, sync its reports, and load this organizer.</p>}
    {standalone && <p>Locally retained information is available without an active online session. Account operations require an online sign-in. Anyone using this browser profile can view these saved reports.</p>}
    <RetainedLibraryProvider stories={stories}><ReadingDashboard localOnly mode="library" stories={stories} showActions={false} renderStory={(story, linkId) => <StoryCard key={story.id} story={story} linkId={linkId} readOnly />} /></RetainedLibraryProvider></>
  return standalone ? <div className="app-shell"><header className="app-header"><Brand /><Link to="/auth">Online Sign-In</Link></header><main className="app-main">{content}</main></div> : content
}
