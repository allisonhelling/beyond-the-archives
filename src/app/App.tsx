import { SampleDataControls } from '../components/SampleDataControls'
import { WaybackPage } from '../features/library/WaybackPage'
import { OfflineProvider } from '../features/offline/OfflineProvider'
import { OfflinePage } from '../features/offline/OfflinePage'
import { clearOfflineSnapshot } from '../features/offline/storage'
import { TagAppearanceSync } from '../features/library/display/TagAppearanceSync'
import { PersonalRatingProvider } from '../features/settings/PersonalRatingSettings'
import { LibrarySyncProvider } from '../features/imports/LibrarySyncProvider'
import { BrowsingPosition } from '../features/library/browsing/BrowsingPosition'
import { ExtensionConnection } from '../features/imports/ExtensionConnection'
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { Download, BookOpen, BookMarked, ChartNoAxesCombined, History, LogOut, Plus, Settings, Sparkles } from 'lucide-react'
import { LibraryProvider } from '../features/library/LibraryProvider'
import { AddStoryPage, AuthorPage, LibraryPage, StoryDetailsPage } from '../features/library/LibraryPages'
import { useDismissible } from '../components/useDismissible'
import { AppFooter } from '../components/AppFooter'
import { Tooltip } from '../components/Tooltip'
import { Brand } from '../components/Brand'
import { AuthProvider } from '../features/auth/AuthProvider'
import { useAuth } from '../features/auth/auth-context'
import { AuthScreen } from '../features/auth/AuthScreen'
import { brandTagline } from '../lib/brand'
import { sampleMode } from '../lib/sample-mode'
import { ActivityIndicator, LoadingIcon, LoadingStatus } from '../components/ActivityIndicator'
import { useActivity } from '../lib/use-activity'
import { usePageTitle } from '../lib/use-page-title'

// Keep the reading and library routes eager; load secondary pages when visited.
const FeaturesPage = lazy(() => import('./FeaturesPage').then(module => ({ default: module.FeaturesPage })))
const StatsPage = lazy(() => import('../features/stats/StatsPage').then(module => ({ default: module.StatsPage })))
const SettingsPage = lazy(() => import('../features/settings/SettingsPage').then(module => ({ default: module.SettingsPage })))
const ImportPage = lazy(() => import('../features/imports/ImportPage').then(module => ({ default: module.ImportPage })))
const SeriesPage = lazy(() => import('../features/library/series/SeriesPage').then(module => ({ default: module.SeriesPage })))
const DisplayExamplePage = lazy(() => import('../features/library/display/DisplaySettings').then(module => ({ default: module.DisplayExamplePage })))

const navigation = [
  { to: '/reading', label: 'Currently Reading', mobileLabel: 'Reading', icon: BookOpen },
  { to: '/library', label: 'Library', mobileLabel: 'Library', icon: BookMarked },
  { to: '/offline', label: 'Offline', mobileLabel: 'Offline', icon: Download },
  { to: '/add', label: 'Add', icon: Plus },
  { to: '/imports', label: 'Import', mobileLabel: 'Import', icon: History },
  { to: '/stats', label: 'Stats', mobileLabel: 'Stats', icon: ChartNoAxesCombined },
  { to: '/features', label: 'Features', icon: Sparkles },
  { to: '/settings', label: 'Settings', mobileLabel: 'Settings', icon: Settings },
]


function TitledPage({ title, children }: { title: string; children: ReactNode }) {
  usePageTitle(title)
  return children
}

function Shell() {
  const { session, signOut: endSession, error: accountError } = useAuth()
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useDismissible<HTMLDivElement>(profileOpen, () => setProfileOpen(false))
  const profileName = sampleMode ? 'Sample Reader' : [session?.user.user_metadata?.display_name, session?.user.user_metadata?.full_name, session?.user.user_metadata?.name].find(value => typeof value === 'string' && value.trim()) || session?.user.email?.split('@')[0] || 'Reader'
  const [error, setError] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  useActivity(signingOut, 'Signing out…')
  async function signOut() {
    if (signingOut) return
    setSigningOut(true); setError('')
    try {
      await endSession()
      clearOfflineSnapshot()
    } catch { setError('Could not sign out. Please try again.') }
    finally { setSigningOut(false) }
  }
  return <div className="app-shell"><BrowsingPosition /><a className="skip-link" href="#main">Skip to content</a><header className="app-header"><Brand /><nav className="desktop-nav" aria-label="Main Navigation">{navigation.filter(item => item.to !== '/features' && item.to !== '/add').map(({ to, label }) => <NavLink key={to} to={to}>{label}</NavLink>)}</nav><div className="header-actions"><div className="add-wrapper"><Tooltip description="Add Story to Library" placement="bottom" portal>{id => <NavLink className="button primary" aria-describedby={id} to="/add?mode=finished">Add Story</NavLink>}</Tooltip></div><div className="profile-wrapper" ref={profileRef}><button className="avatar profile-trigger" aria-label="Profile Menu" aria-expanded={profileOpen} aria-controls="profile-options" title={session?.user.email} onClick={() => setProfileOpen(!profileOpen)}>{String(profileName).slice(0, 1).toUpperCase()}</button>{profileOpen && <section className="profile-menu menu-surface" id="profile-options" aria-label="Profile Menu"><ActivityIndicator /><div className="profile-identity"><strong>{profileName}</strong><p>{session?.user.email}</p></div><NavLink className="profile-action mobile-profile-action" to="/add" onClick={() => setProfileOpen(false)}><Plus size={17} />Add Individual Story</NavLink><NavLink className="profile-action mobile-profile-action" to="/stats" onClick={() => setProfileOpen(false)}><ChartNoAxesCombined size={17} />Stats</NavLink><NavLink className="profile-action" to="/features" onClick={() => setProfileOpen(false)}><Sparkles size={17} />Features</NavLink><NavLink className="profile-action" to="/settings" onClick={() => setProfileOpen(false)}><Settings size={17} />Settings</NavLink><button className="profile-action" disabled={signingOut} onClick={() => void signOut()}><LogOut size={17} />{signingOut ? 'Logging Out…' : 'Log Out'}</button></section>}</div></div></header>
    <nav id="mobile-navigation" className="mobile-nav" aria-label="Mobile Navigation">{navigation.filter(item => item.mobileLabel && item.to !== '/stats').map(({ to, mobileLabel, icon: Icon }) => <NavLink key={to} to={to} onClick={() => setProfileOpen(false)}><Icon size={21} aria-hidden="true" />{mobileLabel}</NavLink>)}</nav>
    <ActivityIndicator />
    <main id="main" className="app-main" tabIndex={-1}>{(error || accountError) && <p role="alert" className="error-message">{error || accountError}</p>}
      <Suspense fallback={<TitledPage title="Loading Page"><LoadingStatus>Loading page…</LoadingStatus></TitledPage>}>
        <Routes>
          <Route path="/reading" element={<TitledPage title="Currently Reading"><LibraryPage reading /></TitledPage>} />
          <Route path="/library" element={<TitledPage title="Library"><LibraryPage /></TitledPage>} />
          <Route path="/offline" element={<OfflinePage />} />
          <Route path="/wayback" element={<TitledPage title="Wayback Machine"><WaybackPage /></TitledPage>} />
          <Route path="/imports" element={<ImportPage />} />
          <Route path="/import-fic" element={<Navigate to="/add?import=link" replace />} />
          <Route path="/add" element={<TitledPage title="Add Story"><AddStoryPage /></TitledPage>} />
          <Route path="/series/:id" element={<SeriesPage />} />
          <Route path="/authors/:name" element={<AuthorPage />} />
          <Route path="/stories/:id" element={<StoryDetailsPage />} />
          <Route path="/stats" element={<TitledPage title="Reading Stats"><StatsPage /></TitledPage>} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/example-work" element={<TitledPage title="Work Info Page Preview"><DisplayExamplePage kind="work" /></TitledPage>} />
          <Route path="/settings/example-series" element={<TitledPage title="Series Info Page Preview"><DisplayExamplePage kind="series" /></TitledPage>} />
          <Route path="/features" element={<TitledPage title="Features"><FeaturesPage /></TitledPage>} />
          <Route path="*" element={<Navigate to="/reading" replace />} />
        </Routes>
      </Suspense>
    </main><AppFooter tagline={brandTagline} />
  </div>
}

function AuthGate() {
  const { session, authenticated, loading, needsPassword } = useAuth()
  const location = useLocation()
  const [online, setOnline] = useState(navigator.onLine)
  const [authTimedOut, setAuthTimedOut] = useState(false)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update); window.addEventListener('offline', update)
    const timer = setTimeout(() => setAuthTimedOut(true), 8000)
    return () => { clearTimeout(timer); window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])
  if (!online || location.pathname === '/offline' && (loading || !authenticated) || loading && authTimedOut) return <>{location.pathname !== '/offline' && <Navigate to="/offline" replace />}<OfflinePage standalone /></>
  if (!loading && !authenticated && location.pathname !== '/offline') return <AuthScreen offlineLink={<NavLink className="clickable-text auth-offline-link" to="/offline">Open Saved Offline Hub</NavLink>} />

  if (!loading && authenticated && new URLSearchParams(location.search).get('auth') === 'recovery') return <Navigate to="/settings#account" replace />
  if (sampleMode && authenticated) return <LibraryProvider><LibrarySyncProvider><PersonalRatingProvider><SamplePreview /><Shell /></PersonalRatingProvider></LibrarySyncProvider></LibraryProvider>
  if (loading) return <div className="loading-state" role="status"><LoadingIcon /><p>Opening your reading space…</p></div>
  if (!authenticated || !session || needsPassword) return <AuthScreen />
  return <LibraryProvider key={session.user.id} userId={session.user.id}><LibrarySyncProvider><PersonalRatingProvider userId={session.user.id}><TagAppearanceSync userId={session.user.id} /><Shell /></PersonalRatingProvider></LibrarySyncProvider></LibraryProvider>
}

function SamplePreview() {
  return <SampleDataControls title="Sample Library" description="Edits stay in this browser until you update the project’s sample data. Reading progress is for preview." onUpdate={async () => { const { updateSampleLibrary } = await import('../features/library/sample/repository'); await updateSampleLibrary() }} onReset={async () => { const { resetSampleLibrary } = await import('../features/library/sample/repository'); resetSampleLibrary(); window.location.assign('/reading') }} />
}

export default function App() {
  return <BrowserRouter><AuthProvider><ExtensionConnection /><OfflineProvider><AuthGate /></OfflineProvider></AuthProvider></BrowserRouter>
}
