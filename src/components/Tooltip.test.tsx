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
