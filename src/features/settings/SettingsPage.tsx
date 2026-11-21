import { BookOpen, DatabaseBackup, Palette, Plug, Shield, Tags } from 'lucide-react'
import { SettingsCategoryList } from '../../components/SettingsCategoryList'
import { Tooltip } from '../../components/Tooltip'
import { ReadingStatsSettings } from '../stats/ReadingStatsSettings'
import { readingStatsSettingsSection } from './settings-sections'
import { PersonalRatingSettings } from './PersonalRatingSettings'
import { DnfCleanupSettings } from './DnfCleanupSettings'
import { dnfCleanupSettingsSection } from './settings-sections'
import { SeriesImportSettings } from '../imports/SeriesImportOptions'
import { displaySettingsSection, displayTagFormatSection, displayTileAndPageSection, accessibilitySettingsSection } from '../library/display/settings-sections'
import { browsingSettingsSection } from '../library/browsing/settings-sections'
import { backupSettingsSection, csvExportSettingsSection } from '../backups/settings-sections'
import { ao3UsernameSettingsSection, metadataSettingsSection, seriesImportSettingsSection, siteMappingsSettingsSection } from '../imports/settings-sections'
import { accountSettingsSection, browserBarSettingsSection, classificationRulesSection, personalRatingSettingsSection, tagExplorerSection } from './settings-sections'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/auth-context'
import { Link, useLocation } from 'react-router-dom'
import { usePageTitle } from '../../lib/use-page-title'
import { Ao3UsernameSettings } from '../imports/Ao3UsernameSettings'
import { SiteMappingsSettings } from '../imports/SiteMappingsSettings'
import { MetadataSettings } from '../imports/MetadataSettings'
import { BackupSettings } from '../backups/BackupSettings'
import { CsvExportSettings } from '../backups/CsvExportSettings'
import { DisplaySettings } from '../library/display/DisplaySettings'
import { BrowsingSettings } from '../library/browsing/BrowsingSettings'
import { BrowserBarSettings } from './BrowserBarSettings'
import { AccountSettings } from './AccountSettings'
import { TagClassificationSettings } from '../library/tags/TagClassificationSettings'
import './settings.css'

type SettingsDestination = { id: string; title: string }
const settingsSections: (SettingsDestination & { description: string; component: () => ReactNode; aliases?: string[]; subsections?: SettingsDestination[] })[] = [
  { ...accountSettingsSection, component: AccountSettings },
  { ...personalRatingSettingsSection, component: PersonalRatingSettings },
  { ...readingStatsSettingsSection, component: ReadingStatsSettings },
  { ...dnfCleanupSettingsSection, component: DnfCleanupSettings },
  { ...browsingSettingsSection, component: BrowsingSettings },
  { ...displaySettingsSection, subsections: [accessibilitySettingsSection, displayTagFormatSection, displayTileAndPageSection], component: DisplaySettings },
  { ...ao3UsernameSettingsSection, component: Ao3UsernameSettings },
  { ...seriesImportSettingsSection, component: SeriesImportSettings },
  { ...metadataSettingsSection, component: MetadataSettings },
  { ...siteMappingsSettingsSection, component: SiteMappingsSettings },
  { ...browserBarSettingsSection, component: BrowserBarSettings },
  { ...tagExplorerSection, subsections: [classificationRulesSection], component: TagClassificationSettings },
  { ...backupSettingsSection, component: BackupSettings },
  { ...csvExportSettingsSection, component: CsvExportSettings },
]

const settingsGroups = [
  { id: 'account', icon: Shield, title: 'Account & Security', description: 'Sign-in details and account security.', sections: [accountSettingsSection.id] },
  { id: 'design', icon: Palette, title: 'Design', description: 'Tile layouts, tag appearance, and display preferences.', sections: [displaySettingsSection.id] },
  { id: 'library', icon: BookOpen, title: 'Library & Reading', description: 'Browsing, ratings, reading statistics, and cleanup.', sections: [browsingSettingsSection.id, personalRatingSettingsSection.id, readingStatsSettingsSection.id, dnfCleanupSettingsSection.id] },
  { id: 'imports', icon: Plug, title: 'Imports & Connections', description: 'AO3 account, metadata, series imports, and browser tools.', sections: [ao3UsernameSettingsSection.id, seriesImportSettingsSection.id, metadataSettingsSection.id, siteMappingsSettingsSection.id, browserBarSettingsSection.id] },
  { id: 'tags', icon: Tags, title: 'Tags & Classification', description: 'Source tag evidence and personal classification rules.', sections: [tagExplorerSection.id] },
  { id: 'backups', icon: DatabaseBackup, title: 'Data & Backups', description: 'Back up, restore, and export your library.', sections: [backupSettingsSection.id, csvExportSettingsSection.id] },
]

export function SettingsPage() {
  const location = useLocation()
  const { session } = useAuth()
  const [outlineOpen, setOutlineOpen] = useState(true)
  const toggleLabel = outlineOpen ? 'Collapse Sidebar' : 'Expand Sidebar'
  const anchor = location.hash.slice(1)
  const section = settingsSections.find(({ id, aliases, subsections }) =>
    id === anchor || aliases?.includes(location.hash) || subsections?.some(item => item.id === anchor)
  )
  const activeDestination = section?.aliases?.includes(location.hash) ? section.id : anchor
  const group = settingsGroups.find(group => location.hash === `#${group.id}` || section && group.sections.includes(section.id))
  usePageTitle(group?.title ?? 'Settings')
  const previousGroup = useRef(group?.id)
  useEffect(() => {
    const target = group ? document.getElementById(section ? anchor : `settings-category-${group.id}`)
      : previousGroup.current ? document.getElementById(`open-${previousGroup.current}`) : null
    target?.focus({ preventScroll: true })
    previousGroup.current = group?.id
    if (section) target?.scrollIntoView?.({ block: 'start' })
    else window.scrollTo(0, 0)
  }, [group, section, anchor, location.key])
  return <div className="settings-page" data-section-open={Boolean(group)} data-outline-open={outlineOpen}>
    <aside className="settings-outline" hidden={!group}>
      <Tooltip description={toggleLabel} placement="bottom" portal>{() =>
        <button type="button" className="settings-outline-toggle disclosure-toggle" aria-label={toggleLabel} aria-expanded={outlineOpen} aria-controls="settings-category-navigation" onClick={() => setOutlineOpen(open => !open)}>
          {outlineOpen && <span>{toggleLabel}</span>}
        </button>
      }</Tooltip>
      <nav id="settings-category-navigation" aria-label="Settings Categories">
        <ul>{settingsGroups.map(({ id, icon: Icon, title, sections }) => {
          const destinations = settingsSections.filter(item => sections.includes(item.id)).flatMap(item => item.subsections ?? [item])
            .filter(item => item.title !== title && (item.id !== classificationRulesSection.id || session?.user.id))
          return <li key={id}>
            <Tooltip description={title} placement="bottom" portal>{() =>
              <Link className="settings-outline-category" to={`/settings#${id}`} aria-label={title} aria-current={group?.id === id && !section ? 'location' : undefined} data-active={group?.id === id}>
                <Icon size={18} aria-hidden="true" />
                {outlineOpen && <span>{title}</span>}
              </Link>
            }</Tooltip>
            {outlineOpen && destinations.length > 0 && <ul className="settings-outline-subsections">{destinations.map(item => <li key={item.id}>
              <Tooltip description={item.title} placement="bottom" portal>{() =>
                <Link to={`/settings#${item.id}`} aria-label={item.title} aria-current={item.id === activeDestination ? 'location' : undefined}>
                  {item.title}
                </Link>
              }</Tooltip>
            </li>)}</ul>}
          </li>
        })}</ul>
      </nav>
    </aside>
    <div className="settings-content">
      <div className="page-heading settings-index-heading"><h1>Settings</h1></div>
      <SettingsCategoryList sections={settingsGroups} renderLink={({ id, title }, contents, descriptionId) => <Link aria-label={title} aria-describedby={descriptionId} id={`open-${id}`} to={`/settings#${id}`}>{contents}</Link>} />
      {settingsGroups.map(({ id, title, sections }) => <div key={id} className="settings-section" data-selected={group?.id === id} hidden={group?.id !== id}><h1 id={`settings-category-${id}`} tabIndex={-1}>{title}</h1>{settingsSections.filter(section => sections.includes(section.id)).map(({ id, component: Section }) => <Section key={id} />)}</div>)}
    </div>
  </div>
}
