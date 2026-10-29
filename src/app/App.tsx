import { TagAppearanceSync } from '../features/library/display/TagAppearanceSync'
import { PersonalRatingProvider } from '../features/settings/PersonalRatingSettings'
import { LibrarySyncProvider } from '../features/imports/LibrarySyncProvider'
import { BrowsingPosition } from '../features/library/browsing/BrowsingPosition'
import { ExtensionConnection } from '../features/imports/ExtensionConnection'
import { lazy, Suspense, useState } from 'react'
import { BrowserRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { BookOpen, BookMarked, ChartNoAxesCombined, History, LockKeyhole, LogOut, Plus, Settings, Sparkles } from 'lucide-react'
import { LibraryProvider } from '../features/library/LibraryProvider'
import { AddStoryPage, AuthorPage, LibraryPage, StoryDetailsPage } from '../features/library/LibraryPages'
import { useDismissible } from '../components/useDismissible'
import { Brand } from '../components/Brand'
import { AuthProvider } from '../features/auth/AuthProvider'
import { useAuth } from '../features/auth/auth-context'
import { AuthScreen } from '../features/auth/AuthScreen'
import { brandTagline } from '../lib/brand'
import { sampleMode } from '../lib/sample-mode'
import { ActivityIndicator, LoadingIcon, LoadingStatus } from '../components/ActivityIndicator'
import { useActivity } from '../lib/use-activity'

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
  { to: '/add', label: 'Add', icon: Plus },
  { to: '/imports', label: 'Import', mobileLabel: 'Import', icon: History },
  { to: '/stats', label: 'Stats', mobileLabel: 'Stats', icon: ChartNoAxesCombined },
  { to: '/features', label: 'Features', icon: Sparkles },
  { to: '/settings', label: 'Settings', mobileLabel: 'Settings', icon: Settings },
]


function Shell() {
  const { session, signOut: endSession } = useAuth()
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
    } catch { setError('Could not sign out. Please try again.') }
    finally { setSigningOut(false) }
  }
  return <div className="app-shell"><BrowsingPosition /><a className="skip-link" href="#main">Skip to content</a><header className="app-header"><Brand /><nav className="desktop-nav" aria-label="Main Navigation">{navigation.filter(item => item.to !== '/features' && item.to !== '/add').map(({ to, label }) => <NavLink key={to} to={to}>{label}</NavLink>)}</nav><div className="header-actions"><div className="add-wrapper"><NavLink className="button primary compact" to="/add?mode=finished">Add Story</NavLink></div><div className="profile-wrapper" ref={profileRef}><button className="avatar profile-trigger" aria-label="Profile Menu" aria-expanded={profileOpen} aria-controls="profile-options" title={session?.user.email} onClick={() => setProfileOpen(!profileOpen)}>{String(profileName).slice(0, 1).toUpperCase()}</button>{profileOpen && <section className="profile-menu menu-surface" id="profile-options" aria-label="Profile Menu"><div className="profile-identity"><strong>{profileName}</strong><p>{session?.user.email}</p></div><NavLink className="profile-action mobile-profile-action" to="/add" onClick={() => setProfileOpen(false)}><Plus size={17} />Add Individual Story</NavLink><NavLink className="profile-action" to="/features" onClick={() => setProfileOpen(false)}><Sparkles size={17} />Features</NavLink><NavLink className="profile-action" to="/settings" onClick={() => setProfileOpen(false)}><Settings size={17} />Settings</NavLink><button className="profile-action" disabled={signingOut} onClick={() => void signOut()}><LogOut size={17} />{signingOut ? 'Logging Out…' : 'Log Out'}</button></section>}</div></div></header>
    <nav id="mobile-navigation" className="mobile-nav" aria-label="Mobile Navigation">{navigation.filter(item => item.mobileLabel).map(({ to, mobileLabel, icon: Icon }) => <NavLink key={to} to={to} onClick={() => setProfileOpen(false)}><Icon size={21} aria-hidden="true" />{mobileLabel}</NavLink>)}</nav>

    <main id="main" className="app-main" tabIndex={-1}>{error && <p role="alert" className="error-message">{error}</p>}<Suspense fallback={<LoadingStatus>Loading page…</LoadingStatus>}><Routes><Route path="/reading" element={<LibraryPage reading />} /><Route path="/library" element={<LibraryPage />} /><Route path="/imports" element={<ImportPage />} /><Route path="/import-fic" element={<Navigate to="/add?import=link" replace />} /><Route path="/add" element={<AddStoryPage />} /><Route path="/series/:id" element={<SeriesPage />} /><Route path="/authors/:name" element={<AuthorPage />} /><Route path="/stories/:id" element={<StoryDetailsPage />} /><Route path="/stats" element={<StatsPage />} /><Route path="/settings" element={<SettingsPage />} /><Route path="/settings/example-work" element={<DisplayExamplePage kind="work" />} /><Route path="/settings/example-series" element={<DisplayExamplePage kind="series" />} /><Route path="/features" element={<FeaturesPage />} /><Route path="*" element={<Navigate to="/reading" replace />} /></Routes></Suspense></main><footer className="app-footer"><span>Keep your AO3 library and reading progress organized.</span><span><LockKeyhole size={12} /> {brandTagline}</span></footer>
  </div>
}

function AuthGate() {
  const { session, authenticated, loading, needsPassword } = useAuth()
  if (sampleMode && authenticated) return <LibraryProvider><LibrarySyncProvider><PersonalRatingProvider><SamplePreview /><Shell /></PersonalRatingProvider></LibrarySyncProvider></LibraryProvider>
  if (loading) return <div className="loading-state" role="status"><LoadingIcon /><p>Opening your reading space…</p></div>
  if (!authenticated || !session || needsPassword) return <AuthScreen />
  return <LibraryProvider key={session.user.id} userId={session.user.id}><LibrarySyncProvider><PersonalRatingProvider userId={session.user.id}><TagAppearanceSync userId={session.user.id} /><Shell /></PersonalRatingProvider></LibrarySyncProvider></LibraryProvider>
}

function SamplePreview() {
  const [busy, setBusy] = useState(false)
  useActivity(busy, 'Resetting sample data…')
  const [error, setError] = useState('')
  async function reset() {
    setBusy(true)
    try {
      const { resetSampleLibrary } = await import('../features/library/sample/repository')
      resetSampleLibrary()
      window.location.assign('/reading')
    } catch { setError('Could not reset the sample library. Check browser storage permissions.'); setBusy(false) }
  }
  return <aside className="sample-preview" aria-label="Local Sample Preview"><span><strong>Sample Library</strong> · Changes stay in this browser. Reading progress is for preview.</span><button className="button secondary compact" disabled={busy} onClick={() => void reset()}>{busy ? 'Resetting…' : 'Reset Sample Data'}</button>{error && <p role="alert">{error}</p>}</aside>
}

export default function App() {
  return <BrowserRouter><AuthProvider><ActivityIndicator /><ExtensionConnection /><AuthGate /></AuthProvider></BrowserRouter>
}
