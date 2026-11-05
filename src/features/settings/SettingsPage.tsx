import { SettingsCategoryList, SettingsSectionLabel } from '../../components/SettingsCategoryList'
import { ReadingStatsSettings } from '../stats/ReadingStatsSettings'
import { readingStatsSettingsSection } from './settings-sections'
import { PersonalRatingSettings } from './PersonalRatingSettings'
import { DnfCleanupSettings } from './DnfCleanupSettings'
import { dnfCleanupSettingsSection } from './settings-sections'
import { SeriesImportSettings } from '../imports/SeriesImportOptions'
import { displaySettingsSection } from '../library/display/settings-sections'
import { browsingSettingsSection } from '../library/browsing/settings-sections'
import { backupSettingsSection, csvExportSettingsSection } from '../backups/settings-sections'
import { ao3UsernameSettingsSection, metadataSettingsSection, seriesImportSettingsSection } from '../imports/settings-sections'
import { accountSettingsSection, browserBarSettingsSection, comingSoonSettingsSection, personalRatingSettingsSection } from './settings-sections'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Ao3UsernameSettings } from '../imports/Ao3UsernameSettings'
import { MetadataSettings } from '../imports/MetadataSettings'
import { BackupSettings } from '../backups/BackupSettings'
import { CsvExportSettings } from '../backups/CsvExportSettings'
import { DisplaySettings } from '../library/display/DisplaySettings'
import { BrowsingSettings } from '../library/browsing/BrowsingSettings'
import { BrowserBarSettings } from './BrowserBarSettings'
import { AccountSettings } from './AccountSettings'
import './settings.css'

const settingsSections: { id: string; title: string; description: string; component: () => ReactNode; aliases?: string[] }[] = [
  { ...accountSettingsSection, component: AccountSettings },
  { ...personalRatingSettingsSection, component: PersonalRatingSettings },
  { ...readingStatsSettingsSection, component: ReadingStatsSettings },
  { ...dnfCleanupSettingsSection, component: DnfCleanupSettings },
  { ...browsingSettingsSection, component: BrowsingSettings },
  { ...displaySettingsSection, component: DisplaySettings },
  { ...ao3UsernameSettingsSection, component: Ao3UsernameSettings },
  { ...seriesImportSettingsSection, component: SeriesImportSettings },
  { ...metadataSettingsSection, component: MetadataSettings },
  { ...browserBarSettingsSection, component: BrowserBarSettings },
  { ...backupSettingsSection, component: BackupSettings },
  { ...csvExportSettingsSection, component: CsvExportSettings },
  { ...comingSoonSettingsSection, component: ComingSoonSettings },
]

export function SettingsPage() {
  const location = useLocation(), navigate = useNavigate()
  const selectedSection = settingsSections.find(({ id, aliases }) => location.hash === `#${id}` || aliases?.includes(location.hash))?.id
  const previousSection = useRef(selectedSection)
  useEffect(() => {
    const target = selectedSection ? document.getElementById(selectedSection)
      : previousSection.current ? document.getElementById(`open-${previousSection.current}`) : null
    if (target?.getClientRects().length) target.focus({ preventScroll: true })
    previousSection.current = selectedSection
  }, [selectedSection])
  const [activeSection, setActiveSection] = useState<string>(settingsSections[0].id)
  const content = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let frame = 0
    const sections = settingsSections.flatMap(({ id }) => { const section = document.getElementById(id); return section ? [section] : [] })
    function update() {
      const boundary = 120
      const atBottom = window.scrollY > 0 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2
      const current = atBottom ? sections.at(-1) : sections.filter(section => section.getBoundingClientRect().top <= boundary).at(-1)
      setActiveSection(current?.id ?? settingsSections[0].id)
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
  return <div className="settings-page" data-section-open={Boolean(selectedSection)}>
    <aside className="settings-outline"><nav aria-label="Settings Section Outline"><h2>On This Page</h2><ul>{settingsSections.map(({ id, title, description }) => <li key={id}><a aria-label={title} aria-describedby={`outline-description-${id}`} href={`#${id}`} aria-current={activeSection === id ? 'location' : undefined} onClick={event => { event.preventDefault(); jumpToSection(id) }}><SettingsSectionLabel title={title} description={description} descriptionId={`outline-description-${id}`} /></a></li>)}</ul></nav></aside>
    <div className="settings-content" ref={content}>
      <div className="page-heading settings-index-heading"><h1>Settings</h1></div>
      <SettingsCategoryList sections={settingsSections} renderLink={({ id, title }, contents, descriptionId) => <Link aria-label={title} aria-describedby={descriptionId} id={`open-${id}`} to={`/settings#${id}`} state={{ settingsIndex: true }}>{contents}</Link>} />
      <div className="settings-section-back"><button className="button secondary" onClick={() => { if (location.state?.settingsIndex) navigate(-1); else navigate('/settings', { replace: true }) }}><ArrowLeft size={17} aria-hidden="true" />Back to Settings</button></div>
      {settingsSections.map(({ id, component: Section }) => <div key={id} className="settings-section" data-selected={selectedSection === id}><Section /></div>)}
    </div>
  </div>
}

function ComingSoonSettings() {
  return <section id={comingSoonSettingsSection.id} tabIndex={-1} className="settings-card"><h2>{comingSoonSettingsSection.title}</h2><p className="muted">Import history is available from Add or Import. Email forwarding arrives in Phase 5. Library backup export and restore are available above.</p></section>
}
