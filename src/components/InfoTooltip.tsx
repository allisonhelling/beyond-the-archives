import { Info } from 'lucide-react'
import type { ReactNode } from 'react'
import { Tooltip } from './Tooltip'

export function InfoTooltip({ label, description, size = 16, placement = 'top', buttonClassName = '' }: { label: string; description: ReactNode; size?: number; placement?: 'top' | 'bottom'; buttonClassName?: string }) {
  return <Tooltip info pinOnClick portal description={description} placement={placement}>{(id, pinned) => <button type="button" className={`icon-button inline-edit-icon info-tooltip-trigger ${buttonClassName}`.trim()} aria-label={label} aria-describedby={id} aria-pressed={pinned}><Info size={size} aria-hidden="true" /></button>}</Tooltip>
}
