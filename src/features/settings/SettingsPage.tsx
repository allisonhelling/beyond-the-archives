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
import { accountSettingsSection, browserBarSettingsSection, personalRatingSettingsSection } from './settings-sections'
import { useEffect, useRef, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
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
]

const settingsGroups = [
  { id: 'account', title: 'Account', description: 'Sign-in details and account security.', sections: [accountSettingsSection.id] },
  { id: 'design', title: 'Design', description: 'Tile layouts, tag appearance, and display preferences.', sections: [displaySettingsSection.id] },
  { id: 'library', title: 'Library & Reading', description: 'Browsing, ratings, reading statistics, and cleanup.', sections: [browsingSettingsSection.id, personalRatingSettingsSection.id, readingStatsSettingsSection.id, dnfCleanupSettingsSection.id] },
  { id: 'imports', title: 'Imports & Connections', description: 'AO3 account, metadata, series imports, and browser tools.', sections: [ao3UsernameSettingsSection.id, seriesImportSettingsSection.id, metadataSettingsSection.id, browserBarSettingsSection.id] },
  { id: 'backups', title: 'Data & Backups', description: 'Back up, restore, and export your library.', sections: [backupSettingsSection.id, csvExportSettingsSection.id] },
]

export function SettingsPage() {
  const location = useLocation()
  const section = settingsSections.find(({ id, aliases }) => location.hash === `#${id}` || aliases?.includes(location.hash))
  const group = settingsGroups.find(group => location.hash === `#${group.id}` || section && group.sections.includes(section.id))
  const previousGroup = useRef(group?.id)
  useEffect(() => {
    const target = group ? document.getElementById(section?.id ?? `settings-category-${group.id}`)
      : previousGroup.current ? document.getElementById(`open-${previousGroup.current}`) : null
    target?.focus({ preventScroll: true })
    previousGroup.current = group?.id
    if (section) target?.scrollIntoView?.({ block: 'start' })
    else window.scrollTo(0, 0)
  }, [group, section])
  return <div className="settings-page" data-section-open={Boolean(group)}>
    <aside className="settings-outline"><nav aria-label="Settings Categories"><h2><Link to="/settings" aria-current={!group ? 'page' : undefined}>Settings Categories</Link></h2><ul>{settingsGroups.map(({ id, title, description }) => <li key={id}><Link aria-label={title} aria-describedby={`outline-description-${id}`} to={`/settings#${id}`} aria-current={group?.id === id ? 'location' : undefined}><SettingsSectionLabel title={title} description={description} descriptionId={`outline-description-${id}`} /></Link></li>)}</ul></nav></aside>
    <div className="settings-content">
      <div className="page-heading settings-index-heading"><h1>Settings</h1></div>
      <SettingsCategoryList sections={settingsGroups} renderLink={({ id, title }, contents, descriptionId) => <Link aria-label={title} aria-describedby={descriptionId} id={`open-${id}`} to={`/settings#${id}`}>{contents}</Link>} />
      {settingsGroups.map(({ id, title, sections }) => <div key={id} className="settings-section" data-selected={group?.id === id} hidden={group?.id !== id}><h1 id={`settings-category-${id}`} tabIndex={-1}>{title}</h1>{settingsSections.filter(section => sections.includes(section.id)).map(({ id, component: Section }) => <Section key={id} />)}</div>)}
    </div>
  </div>
}
