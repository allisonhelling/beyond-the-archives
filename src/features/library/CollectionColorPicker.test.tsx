import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { CollectionColorPicker } from './CollectionColorPicker'

function Picker() {
  const [value, setValue] = useState('#ff0000')
  return <><CollectionColorPicker value={value} onChange={setValue} /><button onClick={() => setValue('#970000')}>Burgundy preset</button></>
}

it('opens a visual picker and keeps hue, shade, and hex entry in sync', async () => {
  const user = userEvent.setup()
  render(<Picker />)
  const trigger = screen.getByRole('button', { name: 'Custom color' })
  expect(screen.queryByRole('textbox', { name: 'Custom color (hex)' })).not.toBeInTheDocument()
  await user.click(trigger)
  expect(trigger).toHaveAttribute('aria-expanded', 'true')
  const hex = screen.getByRole('textbox', { name: 'Custom color (hex)' })
  fireEvent.change(screen.getByRole('slider', { name: 'Hue' }), { target: { value: '120' } })
  expect(hex).toHaveValue('#00ff00')
  expect(trigger).toHaveTextContent('#00ff00')
  fireEvent.change(screen.getByRole('slider', { name: 'Brightness' }), { target: { value: '50' } })
  expect(hex).toHaveValue('#008000')
  fireEvent.change(screen.getByRole('slider', { name: 'Saturation' }), { target: { value: '0' } })
  expect(hex).toHaveValue('#808080')
  await user.clear(hex); await user.type(hex, '#0000ff')
  expect(screen.getByRole('slider', { name: 'Hue' })).toHaveValue('240')
  expect(screen.getByRole('slider', { name: 'Brightness' })).toHaveValue('100')
  await user.click(trigger)
  expect(trigger).toHaveTextContent('#0000ff')
  expect(screen.queryByRole('textbox', { name: 'Custom color (hex)' })).not.toBeInTheDocument()
})

it('retains the hue at black and reflects preset changes when reopened', async () => {
  const user = userEvent.setup()
  render(<Picker />)
  await user.click(screen.getByRole('button', { name: 'Custom color' }))
  fireEvent.change(screen.getByRole('slider', { name: 'Brightness' }), { target: { value: '0' } })
  fireEvent.change(screen.getByRole('slider', { name: 'Hue' }), { target: { value: '120' } })
  fireEvent.change(screen.getByRole('slider', { name: 'Brightness' }), { target: { value: '100' } })
  expect(screen.getByRole('textbox', { name: 'Custom color (hex)' })).toHaveValue('#00ff00')
  await user.click(screen.getByRole('button', { name: 'Burgundy preset' }))
  expect(screen.queryByRole('slider', { name: 'Hue' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Custom color' })).toHaveTextContent('Custom color')
  await user.click(screen.getByRole('button', { name: 'Custom color' }))
  expect(screen.getByRole('slider', { name: 'Hue' })).toHaveValue('0')
})

it('closes on Escape without submitting or closing the enclosing form', async () => {
  const user = userEvent.setup(), submit = vi.fn(event => event.preventDefault())
  render(<form onSubmit={submit}><Picker /></form>)
  const trigger = screen.getByRole('button', { name: 'Custom color' })
  await user.click(trigger)
  await user.keyboard('{Escape}')
  expect(trigger).toHaveFocus()
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
  expect(submit).not.toHaveBeenCalled()
})
