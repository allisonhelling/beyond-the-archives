import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'

export type SettingsCategory = { id: string; title: string; description: string }
export function SettingsSectionLabel({ title, description, descriptionId }: Omit<SettingsCategory, 'id'> & { descriptionId: string }) {
 return <span className="settings-section-label"><span>{title}</span><small className="muted" id={descriptionId}>{description}</small></span>
}
export function SettingsCategoryList({ sections, renderLink }: { sections: readonly SettingsCategory[]; renderLink: (section: SettingsCategory, contents: ReactNode, descriptionId: string) => ReactNode }) {
 return <nav className="settings-section-list" aria-label="Settings Sections"><ul>{sections.map(section => {
  const id = `list-description-${section.id}`
  return <li key={section.id}>{renderLink(section, <><SettingsSectionLabel {...section} descriptionId={id} /><ChevronRight size={18} aria-hidden="true" /></>, id)}</li>
 })}</ul></nav>
}
