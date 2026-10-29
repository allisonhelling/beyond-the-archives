import { StrictMode } from 'react'
import { act, render, screen, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import { ActivityIndicator, LoadingStatus } from './ActivityIndicator'
import { Dialog } from './Dialog'
import { activitySnapshot, beginActivity } from '../lib/activity'
import { useActivity } from '../lib/use-activity'

function Operation({ busy, label }: { busy: boolean; label: string }) {
 useActivity(busy, label)
 return null
}

it('keeps concurrent activity visible and releases operations on completion and unmount in StrictMode', () => {
 const view = (saving: boolean, importing: boolean) => <StrictMode><ActivityIndicator /><Operation busy={saving} label="Saving your note…" /><Operation busy={importing} label="Importing selected works…" /></StrictMode>
 const mounted = render(view(true, true))
 expect(screen.getByRole('progressbar', { name: 'Loading or Processing' })).toHaveTextContent('Importing selected works…')
 mounted.rerender(view(true, false))
 expect(screen.getByRole('progressbar')).toHaveTextContent('Saving your note…')
 mounted.rerender(view(false, false))
 expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
 mounted.rerender(view(true, false))
 mounted.unmount()
 expect(activitySnapshot()).toBe('')
})

it('shows active work inside the open native dialog and ignores duplicate cleanup', () => {
 const mounted = render(<Dialog title="Choose Works From Series" onClose={() => {}}>Review</Dialog>)
 let finish!: () => void
 act(() => { finish = beginActivity('Importing selected works…') })
 const indicator = within(screen.getByRole('dialog')).getByRole('progressbar')
 expect(indicator).toBeVisible()
 expect(indicator).toHaveTextContent('Importing selected works…')
 expect(indicator.querySelector('.loading-icon')).toHaveAttribute('aria-hidden', 'true')
 act(() => { finish(); finish() })
 expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
 mounted.unmount()
})

it('gives a busy dialog a visible fallback and clears lazy-page activity when content mounts', () => {
 const mounted = render(<Dialog title="Save Changes" busy onClose={() => {}}>Changes</Dialog>)
 expect(within(screen.getByRole('dialog')).getByRole('progressbar')).toHaveTextContent('Working…')
 mounted.rerender(<><ActivityIndicator /><LoadingStatus>Loading page…</LoadingStatus></>)
 expect(screen.getByRole('status')).toHaveTextContent('Loading page…')
 expect(screen.getByRole('progressbar')).toHaveTextContent('Loading page…')
 mounted.rerender(<ActivityIndicator />)
 expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
})
