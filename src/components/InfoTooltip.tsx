import { Info, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Tooltip } from './Tooltip'

export function InfoTooltip({ label, description, icon: Icon = Info, size = 16, placement = 'top', buttonClassName = '' }: { label: string; description: ReactNode; icon?: LucideIcon; size?: number; placement?: 'top' | 'bottom'; buttonClassName?: string }) {
  return <Tooltip info pinOnClick portal description={description} placement={placement}>{(id, pinned) => <button type="button" className={`icon-button inline-edit-icon info-tooltip-trigger ${buttonClassName}`.trim()} aria-label={label} aria-describedby={id} aria-pressed={pinned}><Icon size={size} aria-hidden="true" /></button>}</Tooltip>
}
