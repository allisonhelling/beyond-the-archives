import { describe, expect, it } from 'vitest'
import { readPublicConfig } from './config'
import { validateBrowserEnv } from '../../scripts/build-env'

const url = 'https://example.supabase.co'
const jwt = (role: string) => `header.${btoa(JSON.stringify({ role }))}.signature`
describe('public configuration boundary', () => {
  it('fails closed without complete configuration', () => {
    for (const env of [{}, { VITE_SUPABASE_URL: url }, { VITE_SUPABASE_URL: 'invalid', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }]) expect(readPublicConfig(env)).toBeNull()
  })
  it('accepts publishable keys and legacy anon keys', () => {
    for (const key of ['sb_publishable_test', jwt('anon')]) expect(readPublicConfig({ VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: key })).toEqual({ url, key })
  })
  it('rejects secret keys, service-role JWTs, and unknown tokens', () => {
    for (const key of ['sb_secret_test', jwt('service_role'), jwt('authenticated'), 'garbage', 'sb_publishable_replace_me']) expect(readPublicConfig({ VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: key })).toBeNull()
  })
  it('requires TLS except on the local development loopback', () => {
    expect(readPublicConfig({ VITE_SUPABASE_URL: 'http://example.com', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' })).toBeNull()
    expect(readPublicConfig({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' })).not.toBeNull()
  })
  it('rejects misprefixed secrets before Vite can embed them in a bundle', () => {
    const unsafeEnvironments: Record<string, string>[] = [
      { VITE_SUPABASE_SECRET_KEY: 'secret-value' },
      { VITE_MISNAMED_VALUE: 'sb_secret_sensitive' },
      { VITE_MISNAMED_VALUE: jwt('service_role') },
      { VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: jwt('service_role') },
    ]
    for (const env of unsafeEnvironments) expect(() => validateBrowserEnv(env)).toThrow(/[Pp]rivileged/)
    expect(() => validateBrowserEnv({})).not.toThrow()
    expect(() => validateBrowserEnv({ VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' })).not.toThrow()
  })
})
