import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ authenticated: true }))
vi.mock('../auth/auth-context', () => ({ useAuth: () => ({ authenticated: mocks.authenticated }) }))
vi.mock('../../lib/sample-mode', () => ({ sampleMode: false }))
import { ConnectReader } from './ConnectReader'
import { hostedReaderUrl } from '../../lib/reader-connection'
beforeEach(() => { mocks.authenticated = true; vi.stubEnv('VITE_READER_URL', 'https://reader.example/') })
afterEach(() => vi.unstubAllEnvs())
it('opens the reader without creating or sending pairing credentials', () => {
  render(<ConnectReader />)
  expect(screen.getByRole('link', {name:'Open Reader'})).toHaveAttribute('href','https://reader.example/')
  expect(screen.getByRole('link', {name:'Open Reader'})).toHaveAttribute('rel','noreferrer')
})
it('defaults to the hosted reader', () => {
  vi.stubEnv('VITE_READER_URL', '')
  render(<ConnectReader />)
  expect(screen.getByRole('link', {name:'Open Reader'})).toHaveAttribute('href',hostedReaderUrl)
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
