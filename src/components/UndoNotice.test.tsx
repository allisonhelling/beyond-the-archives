import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UndoNotice } from './UndoNotice'

afterEach(() => { cleanup(); vi.useRealTimers() })

describe('UndoNotice', () => {
  it('expires after a configurable duration without undoing the action', () => {
    vi.useFakeTimers()
    const undo = vi.fn(), dismiss = vi.fn()
    render(<UndoNotice id="example" message="Shelf renamed." durationMs={2000} onUndo={undo} onDismiss={dismiss} />)
    act(() => vi.advanceTimersByTime(1999))
    expect(dismiss).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(dismiss).toHaveBeenCalledWith('example')
    expect(undo).not.toHaveBeenCalled()
  })

  it('shows undo errors and allows a retry before dismissing', async () => {
    const undo = vi.fn().mockRejectedValueOnce(new Error('Try again.')).mockResolvedValueOnce(undefined), dismiss = vi.fn()
    render(<UndoNotice id="example" message="Shelf renamed." undoLabel="Restore name" onUndo={undo} onDismiss={dismiss} />)
    fireEvent.click(screen.getByRole('button', { name: 'Restore name' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Try again.')
    expect(dismiss).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Restore name' }))
    await waitFor(() => expect(dismiss).toHaveBeenCalledWith('example'))
    expect(undo).toHaveBeenCalledTimes(2)
  })

  it('dismisses without undoing', () => {
    const undo = vi.fn(), dismiss = vi.fn()
    render(<UndoNotice id="example" message="Shelf renamed." dismissLabel="Close shelf update" onUndo={undo} onDismiss={dismiss} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close shelf update' }))
    expect(dismiss).toHaveBeenCalledWith('example')
    expect(undo).not.toHaveBeenCalled()
  })
})
