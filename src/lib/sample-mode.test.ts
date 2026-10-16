import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

it('requires explicit opt-in during development', async () => {
  vi.stubEnv('DEV', true)
  vi.stubEnv('VITE_SAMPLE_DATA', '')
  expect((await import('./sample-mode')).sampleMode).toBe(false)
  vi.resetModules()
  vi.stubEnv('VITE_SAMPLE_DATA', 'true')
  expect((await import('./sample-mode')).sampleMode).toBe(true)
})

it('never enables sample authentication bypass in production', async () => {
  vi.stubEnv('DEV', false)
  vi.stubEnv('VITE_SAMPLE_DATA', 'true')
  expect((await import('./sample-mode')).sampleMode).toBe(false)
})
