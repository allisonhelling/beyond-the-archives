import type { ComponentProps } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Dialog } from '../../src/components/Dialog'
import { SettingsCategoryList } from '../../src/components/SettingsCategoryList'

export const readerSettingsSections = [
 { id: 'account', title: 'Reader Account', description: 'Account, cloud library, and sync conflicts.' },
 { id: 'sync', title: 'Organizer & Sync', description: 'Organizer connection and reading updates.' },
 { id: 'tags', title: 'Tag Format', description: 'Tag shapes, colors, and category order.' },
 { id: 'tiles', title: 'Customize Tiles', description: 'Arrange the information on work tiles.' },
 { id: 'storage', title: 'Manage Local Storage', description: 'Manage downloads and storage protection.' },
] as const
export type ReaderSettingsSection = typeof readerSettingsSections[number]['id']
export function ReaderSettingsIndex() {
 return <main className="reader-settings settings-page"><div className="settings-content"><div className="page-heading settings-index-heading"><h1>Settings</h1></div><SettingsCategoryList sections={readerSettingsSections} renderLink={(section, contents, descriptionId) => <a href={`#settings/${section.id}`} aria-label={section.title} aria-describedby={descriptionId}>{contents}</a>} /></div></main>
}
/** Existing settings bodies serve both desktop dialogs and mobile pages. */
export function ReaderSection({ page = false, children, ...props }: ComponentProps<typeof Dialog> & { page?: boolean }) {
 if (!page) return <Dialog {...props}>{children}</Dialog>
 return <main className="reader-settings settings-content"><button className="button secondary" disabled={props.busy} onClick={props.onClose}><ArrowLeft size={17} aria-hidden="true" />Back to Settings</button><section className={`settings-card reader-settings-section ${props.className ?? ''}`} aria-label={props.title} aria-busy={props.busy}><h2>{props.title}</h2>{children}</section></main>
}
