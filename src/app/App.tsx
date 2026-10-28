import { PersonalRatingProvider } from '../features/settings/PersonalRatingSettings'
import { LibrarySyncProvider } from '../features/imports/LibrarySyncProvider'
import { BrowsingPosition } from '../features/library/browsing/BrowsingPosition'
import { ExtensionConnection } from '../features/imports/ExtensionConnection'
import { lazy, Suspense, useState } from 'react'
import { BrowserRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { ArrowRight, BookOpen, BookMarked, ChartNoAxesCombined, CircleCheck, History, Layers, LockKeyhole, LogOut, Plus, Settings, ShieldCheck, Sparkles } from 'lucide-react'
import { LibraryProvider } from '../features/library/LibraryProvider'
import { AddStoryPage, AuthorPage, LibraryPage, StoryDetailsPage } from '../features/library/LibraryPages'
import { useDismissible } from '../components/useDismissible'
import { Brand } from '../components/Brand'
import { AuthProvider } from '../features/auth/AuthProvider'
import { useAuth } from '../features/auth/auth-context'
import { AuthScreen } from '../features/auth/AuthScreen'
import { brandTagline } from '../lib/brand'
import { sampleMode } from '../lib/sample-mode'

// Keep the reading and library routes eager; load secondary pages when visited.
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

function FoundationPage({ kind }: { kind: 'stats' }) {
  const content = {
    stats: { title: 'Reading Stats', heading: 'Your Reading, in Perspective.', body: 'Reading statistics arrive in Phase 4, after library and progress tracking are available.', icon: ChartNoAxesCombined, phase: 'PHASE 4 · STATISTICS' },
  }[kind]
  const Icon = content.icon
  return <><div className="page-heading"><div><h1>{content.title}</h1></div><span className="private-badge"><LockKeyhole size={13} /> Only you</span></div>
    <div className="foundation-banner"><span className="small-icon"><ShieldCheck size={20} /></span><div><strong>A Secure Beginning</strong><p>Your library, notes, and reading progress are protected at the database level.</p></div><NavLink to="/features">View Roadmap <ArrowRight size={16} /></NavLink></div>
    <section className="empty-state"><div className="empty-art" aria-hidden="true"><span className="art-orbit" /><Icon size={58} strokeWidth={1.1} /><span className="art-spark">✧</span></div><span className="eyebrow accent">{content.phase}</span><h2>{content.heading}</h2><p>{content.body}</p><NavLink className="button secondary" to="/features">See What’s Coming <ArrowRight size={16} /></NavLink></section>
    <div className="foundation-notes"><div><ShieldCheck size={19} /><span><strong>Private by Design</strong><small>Protected at the database level</small></span></div><div><Layers size={19} /><span><strong>A Thoughtful Foundation</strong><small>Story metadata and your notes stay separate</small></span></div><div><BookOpen size={19} /><span><strong>Built for the Next Chapter</strong><small>No invented totals or reading progress</small></span></div></div>
  </>
}


function FeaturesPage() {
  return <><div className="page-heading"><div><h1>The Next Chapters</h1></div><span className="status-pill">PHASE 3</span></div><section className="settings-card" aria-labelledby="series-features-heading">
    <h2 id="series-features-heading">Series Pages</h2>
    <p><strong>Default Series Page.</strong> Works in your library are automatically grouped by their AO3 series, keeping their original part numbers. This page uses your saved works to show authors, fandoms, and word totals. Opening it does not download the full AO3 series. Official series totals and completion stay unknown until you load them.</p>
    <p><strong>Loaded AO3 Details.</strong> Choose <strong>Load</strong> to save the series description, official statistics, and available work listing from AO3, including works outside your library. Saving these details does not add those works to your library.</p>
    <p><strong>Refresh and Remove.</strong> <strong>Refresh</strong> updates the downloaded series information when you request it; the last-fetched time shows how recent it is. New works are not automatically imported. <strong>Remove</strong> deletes the downloaded details and returns to the default page, keeping your saved works, reading progress, notes, favorites, and collections.</p>
    <p><strong>Review Related Works.</strong> After a fic import, the <strong>Related Series</strong> popup lets you review a series temporarily and choose individual works to import. Full details are saved only when you choose <strong>Load</strong>.</p>
    <p>Your series reading status follows the works saved in your library. It is separate from whether the author has marked the AO3 series complete.</p>
  </section><section className="roadmap-current"><ShieldCheck size={29} /><div><span className="eyebrow accent">PHASE 1 · FOUNDATION</span><h2>Your Private Library Is Ready.</h2><p>Invitation-only sign-in, account recovery, manual story entry, reading progress, favorites, private notes, and collections backed by row-level security.</p><span className="complete-label"><CircleCheck size={16} /> Foundation implemented · Phase 2 library, progress, favorites and collections available</span></div></section><div className="roadmap-grid">{[

    ['03', 'Bring Your Stories Along', 'Bulk AO3 links, persistent import jobs, and respectful metadata retrieval.'],
    ['04', 'Find Your Next Escape', 'Advanced search refinements and reading statistics.'],
    ['05', 'Stay in the Story', 'Email-powered chapter notifications and controlled metadata refreshes.'],
    ['06', 'Keep What Matters', 'In-app restore, scheduled backups, and production hardening. Complete exports and administrator restore are available in Settings.'],
  ].map(([phase, title, text]) => <section className="roadmap-card" key={phase}><span className="phase-number">{phase}</span><span className="eyebrow">{phase === '03' ? 'IMPLEMENTED · WORKER SETUP REQUIRED' : 'PLANNED'}</span><h2>{title}</h2><p>{text}</p></section>)}</div></>
}

function Shell() {
  const { session, signOut: endSession } = useAuth()
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useDismissible<HTMLDivElement>(profileOpen, () => setProfileOpen(false))
  const profileName = sampleMode ? 'Sample Reader' : [session?.user.user_metadata?.display_name, session?.user.user_metadata?.full_name, session?.user.user_metadata?.name].find(value => typeof value === 'string' && value.trim()) || session?.user.email?.split('@')[0] || 'Reader'
  const [error, setError] = useState('')
  const [signingOut, setSigningOut] = useState(false)
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

    <main id="main" className="app-main" tabIndex={-1}>{error && <p role="alert" className="error-message">{error}</p>}<Suspense fallback={<p role="status">Loading page…</p>}><Routes><Route path="/reading" element={<LibraryPage reading />} /><Route path="/library" element={<LibraryPage />} /><Route path="/imports" element={<ImportPage />} /><Route path="/import-fic" element={<Navigate to="/add?import=link" replace />} /><Route path="/add" element={<AddStoryPage />} /><Route path="/series/:id" element={<SeriesPage />} /><Route path="/authors/:name" element={<AuthorPage />} /><Route path="/stories/:id" element={<StoryDetailsPage />} /><Route path="/stats" element={<FoundationPage kind="stats" />} /><Route path="/settings" element={<SettingsPage />} /><Route path="/settings/example-work" element={<DisplayExamplePage kind="work" />} /><Route path="/settings/example-series" element={<DisplayExamplePage kind="series" />} /><Route path="/features" element={<FeaturesPage />} /><Route path="*" element={<Navigate to="/reading" replace />} /></Routes></Suspense></main><footer className="app-footer"><span>Keep your AO3 library and reading progress organized.</span><span><LockKeyhole size={12} /> {brandTagline}</span></footer>
  </div>
}

function AuthGate() {
  const { session, authenticated, loading, needsPassword } = useAuth()
  if (sampleMode && authenticated) return <LibraryProvider><LibrarySyncProvider><PersonalRatingProvider><SamplePreview /><Shell /></PersonalRatingProvider></LibrarySyncProvider></LibraryProvider>
  if (loading) return <div className="loading-state" role="status"><BookOpen size={32} strokeWidth={1.4} /><p>Opening your reading space…</p></div>
  if (!authenticated || !session || needsPassword) return <AuthScreen />
  return <LibraryProvider key={session.user.id} userId={session.user.id}><LibrarySyncProvider><PersonalRatingProvider userId={session.user.id}><Shell /></PersonalRatingProvider></LibrarySyncProvider></LibraryProvider>
}

function SamplePreview() {
  const [busy, setBusy] = useState(false)
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
  return <BrowserRouter><AuthProvider><ExtensionConnection /><AuthGate /></AuthProvider></BrowserRouter>
}
