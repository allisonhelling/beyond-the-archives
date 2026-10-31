import { InfoTooltip } from './InfoTooltip'
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { Tooltip } from './Tooltip'

it('keeps clicked information open across hover and focus changes until clicked again', () => {
 render(<Tooltip pinOnClick description="Information">{id => <button aria-describedby={id}>Info</button>}</Tooltip>)
 const button = screen.getByRole('button', { name: 'Info' })
 fireEvent.mouseEnter(button)
 fireEvent.focus(button)
 fireEvent.click(button)
 fireEvent.mouseLeave(button)
 fireEvent.blur(button)
 expect(screen.getByRole('tooltip')).toBeVisible()
 fireEvent.click(button)
 expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
})

it('keeps action tooltips transient when their buttons are clicked', () => {
 render(<Tooltip description="Action">{id => <button aria-describedby={id}>Run</button>}</Tooltip>)
 const button = screen.getByRole('button', { name: 'Run' })
 fireEvent.mouseEnter(button)
 fireEvent.click(button)
 fireEvent.mouseLeave(button)
 expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
})


it('places portaled tooltips inside their dialog and outside scrolling controls', () => {
 render(<dialog open><div data-testid="controls"><Tooltip portal description="Applies to all series">{id => <button aria-describedby={id}>Select All</button>}</Tooltip></div></dialog>)
 const button = screen.getByRole('button', { name: 'Select All' })
 expect(button).toHaveAccessibleDescription('Applies to all series')
 fireEvent.focus(button)
 const tooltip = screen.getByRole('tooltip')
 expect(tooltip.parentElement).toBe(screen.getByRole('dialog'))
 expect(screen.getByTestId('controls')).not.toContainElement(tooltip)
 fireEvent.blur(button)
 expect(tooltip).not.toBeVisible()
})

it('pins shared info help across blur and clears its pressed state with Escape', () => {
 render(<InfoTooltip label="Date Help" description={<p>Saved AO3 dates.</p>} />)
 const button = screen.getByRole('button', { name: 'Date Help' })
 expect(button).toHaveAccessibleDescription('Saved AO3 dates.')
 expect(button).toHaveAttribute('aria-pressed', 'false')
 fireEvent.click(button)
 fireEvent.mouseLeave(button)
 fireEvent.blur(button)
 expect(button).toHaveAttribute('aria-pressed', 'true')
 expect(screen.getByRole('tooltip')).toBeVisible()
 fireEvent.keyDown(button, { key: 'Escape' })
 expect(button).toHaveAttribute('aria-pressed', 'false')
 expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
})

it('dismisses pinned help on an outside press while preserving clicks inside the help', () => {
 render(<><InfoTooltip label="Search Help" description={<p>Search syntax.</p>} /><button>Clear Filters</button></>)
 const button = screen.getByRole('button', { name: 'Search Help' })
 fireEvent.click(button)
 fireEvent.pointerDown(screen.getByRole('tooltip'))
 expect(button).toHaveAttribute('aria-pressed', 'true')
 fireEvent.pointerDown(screen.getByRole('button', { name: 'Clear Filters' }))
 expect(button).toHaveAttribute('aria-pressed', 'false')
 expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
})
