import { useState } from 'react'
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { ArrowRight, BookOpen, BookMarked, ChartNoAxesCombined, ChevronDown, CircleCheck, Layers, LockKeyhole, LogOut, Menu, Plus, Settings, ShieldCheck, Sparkles, X } from 'lucide-react'
import { Brand } from '../components/Brand'
import { AuthProvider } from '../features/auth/AuthProvider'
import { useAuth } from '../features/auth/auth-context'
import { AuthScreen } from '../features/auth/AuthScreen'
import { authRedirectUrl, supabase } from '../lib/supabase'

const navigation = [
  { to: '/reading', label: 'Currently Reading', icon: BookOpen },
  { to: '/library', label: 'Library', icon: BookMarked },
  { to: '/stats', label: 'Stats', icon: ChartNoAxesCombined },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/features', label: 'Features', icon: Sparkles },
]

function FoundationPage({ kind }: { kind: 'reading' | 'library' | 'stats' }) {
  const content = {
    reading: { title: 'Currently Reading', intro: 'A little escape, one chapter at a time.', heading: 'A new chapter starts here.', body: 'Your private reading space is ready. Saving stories and tracking your next chapter arrive in Phase 2.', icon: BookOpen, phase: 'PHASE 2 · READING TRACKER' },
    library: { title: 'Your Library', intro: 'A home for all the worlds you want to keep.', heading: 'Room for your favorite stories.', body: 'The library foundation is in place. Manual story entry, shelves, and favorites arrive in Phase 2.', icon: BookMarked, phase: 'PHASE 2 · CORE LIBRARY' },
    stats: { title: 'Reading Stats', intro: 'Every chapter is part of your story.', heading: 'Your reading, in perspective.', body: 'Reading statistics arrive in Phase 4, after library and progress tracking are available.', icon: ChartNoAxesCombined, phase: 'PHASE 4 · STATISTICS' },
  }[kind]
  const Icon = content.icon
  return <><div className="page-heading"><div><span className="eyebrow accent">YOUR PRIVATE READING SPACE</span><h1>{content.title}</h1><p>{content.intro}</p></div><span className="private-badge"><LockKeyhole size={13} /> Only you</span></div>
    <div className="foundation-banner"><span className="small-icon"><ShieldCheck size={20} /></span><div><strong>A secure beginning</strong><p>Your account and database foundation are in place. Library tools are the next chapter.</p></div><NavLink to="/features">View roadmap <ArrowRight size={16} /></NavLink></div>
    <section className="empty-state"><div className="empty-art" aria-hidden="true"><span className="art-orbit" /><Icon size={58} strokeWidth={1.1} /><span className="art-spark">✧</span></div><span className="eyebrow accent">{content.phase}</span><h2>{content.heading}</h2><p>{content.body}</p><NavLink className="button secondary" to="/features">See what’s coming <ArrowRight size={16} /></NavLink></section>
    <div className="foundation-notes"><div><ShieldCheck size={19} /><span><strong>Private by design</strong><small>Protected at the database level</small></span></div><div><Layers size={19} /><span><strong>A thoughtful foundation</strong><small>Story metadata and your notes stay separate</small></span></div><div><BookOpen size={19} /><span><strong>Built for the next chapter</strong><small>No invented totals or reading progress</small></span></div></div>
  </>
}

function SettingsPage() {
  const { session } = useAuth()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  async function reset() {
    if (!supabase || !session?.user.email || busy) return
    setBusy(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(session.user.email, { redirectTo: authRedirectUrl() })
      setMessage(error ? 'Could not send a recovery email. Please try again.' : 'Check your email for a password recovery link. Open it in this browser.')
    } catch { setMessage('Could not send a recovery email. Please try again.') }
    finally { setBusy(false) }
  }
  return <><div className="page-heading"><div><span className="eyebrow accent">MAKE YOURSELF AT HOME</span><h1>Settings</h1><p>Your account, your space.</p></div></div><section className="settings-card"><div className="section-title"><LockKeyhole size={21} /><h2>Account & security</h2></div><dl><div><dt>Signed in as</dt><dd>{session?.user.email}</dd></div><div><dt>Library visibility</dt><dd>Private · invitation only</dd></div></dl><button className="button secondary" onClick={() => void reset()} disabled={busy}>{busy ? 'Sending…' : 'Send password recovery email'}</button>{message && <p role="status" className="muted">{message}</p>}</section><section className="settings-card"><h2>More in a later chapter</h2><p className="muted">Importer settings arrive in Phase 3, email forwarding in Phase 5, and complete backup and restore in Phase 6.</p></section></>
}

function FeaturesPage() {
  return <><div className="page-heading"><div><span className="eyebrow accent">BUILT WITH INTENTION</span><h1>The next chapters</h1><p>A thoughtful foundation for a lasting library.</p></div><span className="status-pill">PHASE 1</span></div><section className="roadmap-current"><ShieldCheck size={29} /><div><span className="eyebrow accent">PHASE 1 · FOUNDATION</span><h2>A private place to begin.</h2><p>Invitation-only sign-in, account recovery, protected navigation, and twelve database tables with row-level security.</p><span className="complete-label"><CircleCheck size={16} /> Foundation implemented</span></div></section><div className="roadmap-grid">{[
    ['02', 'Your library, your way', 'Manual story entry, reading progress, favorites, notes, and shelves.'],
    ['03', 'Bring your stories along', 'Bulk AO3 links, persistent import jobs, and respectful metadata retrieval.'],
    ['04', 'Find your next escape', 'Advanced search, series organization, and reading statistics.'],
    ['05', 'Stay in the story', 'Email-powered chapter notifications and controlled metadata refreshes.'],
    ['06', 'Keep what matters', 'Complete backups and restore, optional extension, and production hardening.'],
  ].map(([phase, title, text]) => <section className="roadmap-card" key={phase}><span className="phase-number">{phase}</span><span className="eyebrow">PLANNED</span><h2>{title}</h2><p>{text}</p></section>)}</div></>
}

function Shell() {
  const { session } = useAuth()
  const location = useLocation()
  const [openPath, setOpenPath] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [error, setError] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  const mobileOpen = openPath === location.pathname
  async function signOut() {
    if (!supabase || signingOut) return
    setSigningOut(true); setError('')
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    } catch { setError('Could not sign out. Please try again.') }
    finally { setSigningOut(false) }
  }
  return <div className="app-shell"><a className="skip-link" href="#main">Skip to content</a><header className="app-header"><Brand /><nav className="desktop-nav" aria-label="Main navigation">{navigation.map(({ to, label }) => <NavLink key={to} to={to}>{label}</NavLink>)}</nav><div className="header-actions"><span className="avatar" title={session?.user.email}>{session?.user.email?.slice(0, 1).toUpperCase() || 'R'}</span><button className="icon-button mobile-toggle" aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={mobileOpen} aria-controls="mobile-navigation" onClick={() => setOpenPath(mobileOpen ? null : location.pathname)}>{mobileOpen ? <X size={21} /> : <Menu size={21} />}</button><button className="icon-button" title="Sign out" aria-label="Sign out" disabled={signingOut} onClick={() => void signOut()}><LogOut size={18} /></button></div></header>
    {mobileOpen && <nav id="mobile-navigation" className="mobile-nav" aria-label="Mobile navigation">{navigation.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} onClick={() => setOpenPath(null)}><Icon size={17} />{label}</NavLink>)}</nav>}
    <div className="workspace-bar"><span><span className="status-dot" /> PERSONAL LIBRARY</span><div className="add-wrapper"><button className="button primary compact" aria-expanded={addOpen} aria-controls="add-options" onClick={() => setAddOpen(!addOpen)}><Plus size={16} /> Add <ChevronDown size={14} /></button>{addOpen && <div id="add-options" className="add-menu"><strong>A later chapter</strong><button disabled>Save for Later <small>Phase 2</small></button><button disabled>Starting a Fic <small>Phase 2</small></button><button disabled>Import History from AO3 <small>Phase 3</small></button><button className="text-button" onClick={() => setAddOpen(false)}>Close</button></div>}</div></div>
    <main id="main" className="app-main" tabIndex={-1}>{error && <p role="alert" className="error-message">{error}</p>}<Routes><Route path="/reading" element={<FoundationPage kind="reading" />} /><Route path="/library" element={<FoundationPage kind="library" />} /><Route path="/stats" element={<FoundationPage kind="stats" />} /><Route path="/settings" element={<SettingsPage />} /><Route path="/features" element={<FeaturesPage />} /><Route path="*" element={<Navigate to="/reading" replace />} /></Routes></main><footer className="app-footer"><span>For the stories you can’t put down.</span><span><LockKeyhole size={12} /> A private AO3 reading companion</span></footer>
  </div>
}

function AuthGate() {
  const { session, loading, needsPassword } = useAuth()
  if (loading) return <div className="loading-state" role="status"><BookOpen size={32} strokeWidth={1.4} /><p>Opening your reading space…</p></div>
  if (!session || needsPassword) return <AuthScreen />
  return <Shell />
}

export default function App() {
  return <BrowserRouter><AuthProvider><AuthGate /></AuthProvider></BrowserRouter>
}
