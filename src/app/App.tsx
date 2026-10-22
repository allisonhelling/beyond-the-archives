import { LibrarySyncProvider } from '../features/imports/LibrarySyncProvider'
import { BackupSettings } from '../features/backups/BackupSettings'
import { CsvExportSettings } from '../features/backups/CsvExportSettings'
import { DisplayExamplePage, DisplaySettings } from '../features/library/DisplaySettings'
import { BrowsingPosition } from '../features/library/BrowsingPosition'
import { PageSizeSettings } from '../features/library/pagination'
import { SeriesPage } from '../features/library/SeriesPage'
import { UserscriptSettings } from '../features/imports/UserscriptSettings'
import { ImportPage } from '../features/imports/ImportPage'
import { ExtensionConnection, MetadataSettings } from '../features/imports/MetadataSettings'
import { useEffect, useRef, useState } from 'react'
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, ChevronRight, BookOpen, BookMarked, ChartNoAxesCombined, CircleCheck, History, Layers, LockKeyhole, LogOut, Plus, Settings, ShieldCheck, Sparkles } from 'lucide-react'
import { LibraryProvider } from '../features/library/LibraryProvider'
import { AddStoryPage, LibraryPage, StoryDetailsPage } from '../features/library/LibraryPages'
import { useDismissible } from '../components/useDismissible'
import { Brand } from '../components/Brand'
import { AuthProvider } from '../features/auth/AuthProvider'
import { useAuth } from '../features/auth/auth-context'
import { AuthScreen } from '../features/auth/AuthScreen'
import { authRedirectUrl, supabase } from '../lib/supabase'
import { sampleMode } from '../lib/sample-mode'

const navigation = [
  { to: '/reading', label: 'Currently Reading', mobileLabel: 'Reading', icon: BookOpen },
  { to: '/library', label: 'Library', mobileLabel: 'Library', icon: BookMarked },
  { to: '/add', label: 'Add', mobileLabel: 'Add', icon: Plus },
  { to: '/imports', label: 'Import', icon: History },
  { to: '/stats', label: 'Stats', mobileLabel: 'Stats', icon: ChartNoAxesCombined },
  { to: '/features', label: 'Features', icon: Sparkles },
  { to: '/settings', label: 'Settings', mobileLabel: 'Settings', icon: Settings },
]

function FoundationPage({ kind }: { kind: 'stats' }) {
  const content = {
    stats: { title: 'Reading Stats', heading: 'Your reading, in perspective.', body: 'Reading statistics arrive in Phase 4, after library and progress tracking are available.', icon: ChartNoAxesCombined, phase: 'PHASE 4 · STATISTICS' },
  }[kind]
  const Icon = content.icon
  return <><div className="page-heading"><div><h1>{content.title}</h1></div><span className="private-badge"><LockKeyhole size={13} /> Only you</span></div>
    <div className="foundation-banner"><span className="small-icon"><ShieldCheck size={20} /></span><div><strong>A secure beginning</strong><p>Your library, notes, and reading progress are protected at the database level.</p></div><NavLink to="/features">View roadmap <ArrowRight size={16} /></NavLink></div>
    <section className="empty-state"><div className="empty-art" aria-hidden="true"><span className="art-orbit" /><Icon size={58} strokeWidth={1.1} /><span className="art-spark">✧</span></div><span className="eyebrow accent">{content.phase}</span><h2>{content.heading}</h2><p>{content.body}</p><NavLink className="button secondary" to="/features">See what’s coming <ArrowRight size={16} /></NavLink></section>
    <div className="foundation-notes"><div><ShieldCheck size={19} /><span><strong>Private by design</strong><small>Protected at the database level</small></span></div><div><Layers size={19} /><span><strong>A thoughtful foundation</strong><small>Story metadata and your notes stay separate</small></span></div><div><BookOpen size={19} /><span><strong>Built for the next chapter</strong><small>No invented totals or reading progress</small></span></div></div>
  </>
}

const settingsSections = [
  ['settings-account', 'Account & Security', 'Sign-in details and password recovery'],
  ['settings-browsing', 'Library Browsing', 'Default works per page and date format'],
  ['settings-display', 'Tile and Page Information', 'Customize tags, tiles, and information pages'],
  ['settings-metadata', 'AO3 Metadata Retrieval', 'Choose how story information is retrieved'],
  ['ios-safari-userscript', 'iOS Safari Userscript', 'Set up and manage paired Safari devices'],
  ['settings-backup', 'Export Backup', 'Download, save, or restore a complete library backup'],
  ['settings-csv-export', 'Export CSV', 'Download works, series, and collections in one ZIP'],
  ['settings-coming-soon', 'More in a Later Chapter', 'Upcoming settings and features'],
] as const

function SettingsSectionLabel({ title, description, descriptionId }: { title: string; description: string; descriptionId: string }) {
  return <span className="settings-section-label"><span>{title}</span><small className="muted" id={descriptionId}>{description}</small></span>
}

function SettingsPage() {
  const { session } = useAuth()
  const location = useLocation(), navigate = useNavigate()
  const selectedSection = settingsSections.find(([id]) => location.hash === `#${id}`)?.[0]
  const previousSection = useRef(selectedSection)
  useEffect(() => {
    const target = selectedSection ? document.getElementById(selectedSection)
      : previousSection.current ? document.getElementById(`open-${previousSection.current}`) : null
    if (target?.getClientRects().length) target.focus({ preventScroll: true })
    previousSection.current = selectedSection
  }, [selectedSection])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [activeSection, setActiveSection] = useState<string>(settingsSections[0][0])
  const content = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let frame = 0
    const sections = settingsSections.flatMap(([id]) => { const section = document.getElementById(id); return section ? [section] : [] })
    function update() {
      const boundary = 120
      const atBottom = window.scrollY > 0 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2
      const current = atBottom ? sections.at(-1) : sections.filter(section => section.getBoundingClientRect().top <= boundary).at(-1)
      setActiveSection(current?.id ?? settingsSections[0][0])
    }
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update) }
    const observer = new ResizeObserver(schedule)
    if (content.current) observer.observe(content.current)
    schedule()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule) }
  }, [])
  function jumpToSection(id: string) {
    const section = document.getElementById(id)
    section?.focus({ preventScroll: true })
    section?.scrollIntoView({ block: 'start' })
  }
  async function reset() {
    if (!supabase || !session?.user.email || busy) return
    setBusy(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(session.user.email, { redirectTo: authRedirectUrl() })
      setMessage(error ? 'Could not send a recovery email. Please try again.' : 'Check your email for a password recovery link. Open it in this browser.')
    } catch { setMessage('Could not send a recovery email. Please try again.') }
    finally { setBusy(false) }
  }
  const sections = {
    'settings-account': <section id="settings-account" tabIndex={-1} className="settings-card"><div className="section-title"><LockKeyhole size={21} /><h2>Account & Security</h2></div><dl><div><dt>Signed in as</dt><dd>{session?.user.email}</dd></div><div><dt>Library visibility</dt><dd>Private · invitation only</dd></div></dl><button className="button secondary" onClick={() => void reset()} disabled={busy || sampleMode}>{busy ? 'Sending…' : 'Send password recovery email'}</button>{sampleMode && <p className="muted">Account settings are unavailable in the local sample preview.</p>}{message && <p role="status" className="muted">{message}</p>}</section>,
    'settings-browsing': <PageSizeSettings />,
    'settings-display': <DisplaySettings />,
    'settings-metadata': <MetadataSettings />,
    'ios-safari-userscript': <UserscriptSettings />,
    'settings-backup': <BackupSettings />,
    'settings-csv-export': <CsvExportSettings />,
    'settings-coming-soon': <section id="settings-coming-soon" tabIndex={-1} className="settings-card"><h2>More in a Later Chapter</h2><p className="muted">Import history is available from Add or Import. Email forwarding arrives in Phase 5. Library backup export and restore are available above.</p></section>,
  }
  return <div className="settings-page" data-section-open={Boolean(selectedSection)}>
    <aside className="settings-outline"><nav aria-label="Settings Section Outline"><h2>On This Page</h2><ul>{settingsSections.map(([id, title, description]) => <li key={id}><a aria-label={title} aria-describedby={`outline-description-${id}`} href={`#${id}`} aria-current={activeSection === id ? 'location' : undefined} onClick={event => { event.preventDefault(); jumpToSection(id) }}><SettingsSectionLabel title={title} description={description} descriptionId={`outline-description-${id}`} /></a></li>)}</ul></nav></aside>
    <div className="settings-content" ref={content}>
      <div className="page-heading settings-index-heading"><h1>Settings</h1></div>
      <nav className="settings-section-list" aria-label="Settings sections"><ul>{settingsSections.map(([id, title, description]) => <li key={id}><Link aria-label={title} aria-describedby={`list-description-${id}`} id={`open-${id}`} to={`/settings#${id}`} state={{ settingsIndex: true }}><SettingsSectionLabel title={title} description={description} descriptionId={`list-description-${id}`} /><ChevronRight size={18} aria-hidden="true" /></Link></li>)}</ul></nav>
      <div className="settings-section-back"><button className="button secondary" onClick={() => { if (location.state?.settingsIndex) navigate(-1); else navigate('/settings', { replace: true }) }}><ArrowLeft size={17} aria-hidden="true" />Back to Settings</button></div>
      {settingsSections.map(([id]) => <div key={id} className="settings-section" data-selected={selectedSection === id}>{sections[id]}</div>)}
    </div>
  </div>
}

function FeaturesPage() {
  return <><div className="page-heading"><div><h1>The next chapters</h1></div><span className="status-pill">PHASE 3</span></div><section className="settings-card" aria-labelledby="series-features-heading">
    <h2 id="series-features-heading">Series pages</h2>
    <p><strong>Default series page.</strong> Works in your library are automatically grouped by their AO3 series, keeping their original part numbers. This page uses your saved works to show authors, fandoms, and word totals. Opening it does not download the full AO3 series. Official series totals and completion stay unknown until you load them.</p>
    <p><strong>Loaded AO3 details.</strong> Choose <strong>Load</strong> to save the series description, official statistics, and available work listing from AO3, including works outside your library. Saving these details does not add those works to your library.</p>
    <p><strong>Refresh and Remove.</strong> <strong>Refresh</strong> updates the downloaded series information when you request it; the last-fetched time shows how recent it is. New works are not automatically imported. <strong>Remove</strong> deletes the downloaded details and returns to the default page, keeping your saved works, reading progress, notes, favorites, and collections.</p>
    <p><strong>Review related works.</strong> After a fic import, the <strong>Related Series</strong> popup lets you review a series temporarily and choose individual works to import. Full details are saved only when you choose <strong>Load</strong>.</p>
    <p>Your series reading status follows the works saved in your library. It is separate from whether the author has marked the AO3 series complete.</p>
  </section><section className="roadmap-current"><ShieldCheck size={29} /><div><span className="eyebrow accent">PHASE 1 · FOUNDATION</span><h2>Your private library is ready.</h2><p>Invitation-only sign-in, account recovery, manual story entry, reading progress, favorites, private notes, and collections backed by row-level security.</p><span className="complete-label"><CircleCheck size={16} /> Foundation implemented · Phase 2 library, progress, favorites and collections available</span></div></section><div className="roadmap-grid">{[

    ['03', 'Bring your stories along', 'Bulk AO3 links, persistent import jobs, and respectful metadata retrieval.'],
    ['04', 'Find your next escape', 'Advanced search refinements and reading statistics.'],
    ['05', 'Stay in the story', 'Email-powered chapter notifications and controlled metadata refreshes.'],
    ['06', 'Keep what matters', 'In-app restore, scheduled backups, and production hardening. Complete exports and administrator restore are available in Settings.'],
  ].map(([phase, title, text]) => <section className="roadmap-card" key={phase}><span className="phase-number">{phase}</span><span className="eyebrow">{phase === '03' ? 'IMPLEMENTED · WORKER SETUP REQUIRED' : 'PLANNED'}</span><h2>{title}</h2><p>{text}</p></section>)}</div></>
}

function Shell() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [addOpen, setAddOpen] = useState(false)
  const addRef = useDismissible<HTMLDivElement>(addOpen, () => setAddOpen(false))
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useDismissible<HTMLDivElement>(profileOpen, () => setProfileOpen(false))
  const profileName = sampleMode ? 'Sample Reader' : [session?.user.user_metadata?.display_name, session?.user.user_metadata?.full_name, session?.user.user_metadata?.name].find(value => typeof value === 'string' && value.trim()) || session?.user.email?.split('@')[0] || 'Reader'
  const [error, setError] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  async function signOut() {
    if (!supabase || signingOut) return
    setSigningOut(true); setError('')
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    } catch { setError('Could not sign out. Please try again.') }
    finally { setSigningOut(false) }
  }
  return <div className="app-shell"><BrowsingPosition /><a className="skip-link" href="#main">Skip to content</a><header className="app-header"><Brand /><nav className="desktop-nav" aria-label="Main navigation">{navigation.filter(item => item.to !== '/features' && item.to !== '/add').map(({ to, label }) => <NavLink key={to} to={to}>{label}</NavLink>)}</nav><div className="header-actions"><div className="add-wrapper" ref={addRef}><button className="button primary compact" aria-expanded={addOpen} aria-controls="add-options" onClick={() => setAddOpen(!addOpen)}><Plus size={16} /> Add</button>{addOpen && <div id="add-options" className="add-menu menu-surface"><strong>Add to your library</strong><button onClick={() => { setAddOpen(false); navigate('/add') }}><span className="add-option-label"><Plus size={19} aria-hidden="true" />Add Story</span></button><button onClick={() => { setAddOpen(false); navigate('/imports') }}><span className="add-option-label"><History size={19} aria-hidden="true" />Import History from AO3</span></button></div>}</div><div className="profile-wrapper" ref={profileRef}><button className="avatar profile-trigger" aria-label="Profile menu" aria-expanded={profileOpen} aria-controls="profile-options" title={session?.user.email} onClick={() => setProfileOpen(!profileOpen)}>{String(profileName).slice(0, 1).toUpperCase()}</button>{profileOpen && <section className="profile-menu menu-surface" id="profile-options" aria-label="Profile menu"><div className="profile-identity"><strong>{profileName}</strong><p>{session?.user.email}</p></div><NavLink className="profile-action mobile-profile-action" to="/imports" onClick={() => setProfileOpen(false)}><History size={17} />Import History from AO3</NavLink><NavLink className="profile-action" to="/features" onClick={() => setProfileOpen(false)}><Sparkles size={17} />Features</NavLink><NavLink className="profile-action" to="/settings" onClick={() => setProfileOpen(false)}><Settings size={17} />Settings</NavLink><button className="profile-action" disabled={signingOut || sampleMode} onClick={() => void signOut()}><LogOut size={17} />{signingOut ? 'Logging out…' : 'Log out'}</button></section>}</div></div></header>
    <nav id="mobile-navigation" className="mobile-nav" aria-label="Mobile navigation">{navigation.filter(item => item.mobileLabel).map(({ to, mobileLabel, icon: Icon }) => <NavLink key={to} to={to} onClick={() => { setAddOpen(false); setProfileOpen(false) }}><Icon size={21} aria-hidden="true" />{mobileLabel}</NavLink>)}</nav>

    <main id="main" className="app-main" tabIndex={-1}>{error && <p role="alert" className="error-message">{error}</p>}<Routes><Route path="/reading" element={<LibraryPage reading />} /><Route path="/library" element={<LibraryPage />} /><Route path="/imports" element={<ImportPage />} /><Route path="/import-fic" element={<Navigate to="/add?import=link" replace />} /><Route path="/add" element={<AddStoryPage />} /><Route path="/series/:id" element={<SeriesPage />} /><Route path="/stories/:id" element={<StoryDetailsPage />} /><Route path="/stats" element={<FoundationPage kind="stats" />} /><Route path="/settings" element={<SettingsPage />} /><Route path="/settings/example-work" element={<DisplayExamplePage kind="work" />} /><Route path="/settings/example-series" element={<DisplayExamplePage kind="series" />} /><Route path="/features" element={<FeaturesPage />} /><Route path="*" element={<Navigate to="/reading" replace />} /></Routes></main><footer className="app-footer"><span>For the stories you can’t put down.</span><span><LockKeyhole size={12} /> A private AO3 reading companion</span></footer>
  </div>
}

function AuthGate() {
  const { session, loading, needsPassword } = useAuth()
  if (sampleMode) return <LibraryProvider><LibrarySyncProvider><SamplePreview /><Shell /></LibrarySyncProvider></LibraryProvider>
  if (loading) return <div className="loading-state" role="status"><BookOpen size={32} strokeWidth={1.4} /><p>Opening your reading space…</p></div>
  if (!session || needsPassword) return <AuthScreen />
  return <LibraryProvider key={session.user.id} userId={session.user.id}><LibrarySyncProvider><Shell /></LibrarySyncProvider></LibraryProvider>
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
  return <aside className="sample-preview" aria-label="Local sample preview"><span><strong>Sample library</strong> · Changes stay in this browser. Reading progress is for preview.</span><button className="button secondary compact" disabled={busy} onClick={() => void reset()}>{busy ? 'Resetting…' : 'Reset sample data'}</button>{error && <p role="alert">{error}</p>}</aside>
}

export default function App() {
  return <BrowserRouter><AuthProvider><ExtensionConnection /><AuthGate /></AuthProvider></BrowserRouter>
}
