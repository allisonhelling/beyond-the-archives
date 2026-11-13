import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ authenticated: true }))
vi.mock('../auth/auth-context', () => ({ useAuth: () => ({ authenticated: mocks.authenticated }) }))
vi.mock('../../lib/sample-mode', () => ({ sampleMode: false }))
import { ConnectReader } from './ConnectReader'
beforeEach(() => { mocks.authenticated = true; vi.stubEnv('VITE_READER_URL', 'http://127.0.0.1:5174/') })
afterEach(() => vi.unstubAllEnvs())
it('opens the reader without creating or sending pairing credentials', () => {
  render(<ConnectReader />)
  expect(screen.getByRole('link', {name:'Open Reader'})).toHaveAttribute('href','http://127.0.0.1:5174/')
  expect(screen.getByRole('link', {name:'Open Reader'})).toHaveAttribute('rel','noreferrer')
})
it('rejects a missing reader origin without selecting production', () => {
  vi.stubEnv('VITE_READER_URL', '')
  expect(() => render(<ConnectReader />)).toThrow()
})
it('keeps local reader configuration on the existing app URL path', () => {
  vi.stubEnv('VITE_READER_URL', 'http://127.0.0.1:5174/')
  render(<ConnectReader />)
  expect(screen.getByRole('link', {name:'Open Reader'})).toHaveAttribute('href','http://127.0.0.1:5174/')
})
it('requires authentication', () => {
  mocks.authenticated = false
  render(<ConnectReader />)
  expect(screen.getByRole('link', {name:'Open Reader'})).toHaveAttribute('aria-disabled','true')
})
