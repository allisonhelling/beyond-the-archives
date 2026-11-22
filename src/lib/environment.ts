import { readPublicConfig, type PublicConfig } from './config.ts'
import { isLocalHostname as isLoopback } from './local-app.ts'

// Public identity denylist, never an authorization credential.
export const productionProjectRef = 'pnrdztfydurupcqwumvr'
export const stagingProjectRef = 'vzqrpjzfwcuuiqxanyoy'
export const productionOrganizerOrigin = 'https://beyondthearchives.vercel.app'
export const productionReaderOrigin = 'https://bta-reader.vercel.app'
export const legacyReaderOrigin = 'https://archivesunfolded.vercel.app'
export const productionAppOrigins = [productionOrganizerOrigin, productionReaderOrigin, legacyReaderOrigin]
export type AppEnvironment = 'local' | 'staging' | 'production'
export type EnvironmentConfig = PublicConfig & { environment: AppEnvironment; projectRef: string; organizerUrl: string; readerUrl: string }

export function environmentOrigin(value: unknown, environment: AppEnvironment) {
 if (typeof value !== 'string') throw new Error('Explicit application origins are required.')
 let url: URL
 try { url = new URL(value) } catch { throw new Error('Configure a valid application origin.') }
 if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
   (environment === 'local' ? !isLoopback(url.hostname) || !['http:', 'https:'].includes(url.protocol) : url.protocol !== 'https:' || isLoopback(url.hostname))) throw new Error('Application origin does not match the selected environment.')
 if (environment !== 'production' && productionAppOrigins.some(origin => new URL(origin).hostname === url.hostname)) throw new Error('Production application origins cannot be used outside production.')
 return url.origin
}

export function requireEnvironmentConfig(env: Record<string, unknown>, vercelEnvironment?: string): EnvironmentConfig {
 const isMissing = (key: string) => { const value = env[key]; return typeof value !== 'string' || !value.trim() }
 const required = ['VITE_APP_ENV', 'VITE_SUPABASE_PROJECT_REF', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'] as const
 const missingBackend = required.filter(isMissing)
 if (missingBackend.length) throw new Error(`Set ${missingBackend.join(', ')} for the selected application environment.`)
 const config = readPublicConfig(env)
 const environment = env.VITE_APP_ENV
 const projectRef = env.VITE_SUPABASE_PROJECT_REF
 if (!['local','staging','production'].includes(String(environment)) || typeof projectRef !== 'string') throw new Error('Set VITE_APP_ENV to local, staging, or production.')
 if (!config) throw new Error('Invalid public Supabase configuration. Supply a project URL and publishable key (or legacy anon key).')
 const selected = environment as AppEnvironment
 const url = new URL(config.url)
 if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Configure a backend origin without credentials or paths.')
 if (selected === 'local') {
  if (projectRef !== 'local' || !isLoopback(url.hostname) || url.port !== '54321') throw new Error('Local configuration must use the local Supabase API and local project identity.')
 } else {
  if (!/^[a-z0-9-]{3,63}$/.test(projectRef) || url.origin !== `https://${projectRef}.supabase.co` || (selected === 'production') !== (projectRef === productionProjectRef)) throw new Error('Backend project identity does not match the selected environment.')
 }
 if (vercelEnvironment && (vercelEnvironment === 'production' ? selected !== 'production' : vercelEnvironment === 'preview' ? selected !== 'staging' : selected !== 'local')) throw new Error('Vercel deployment scope does not match the application environment.')
 const originKeys = ['VITE_ORGANIZER_URL', 'VITE_READER_URL'] as const
 const missing = originKeys.filter(isMissing)
 if (missing.length) throw new Error(`Set ${missing.join(' and ')} for the selected application environment.`)
 return { ...config, environment: selected, projectRef,
  organizerUrl: environmentOrigin(env.VITE_ORGANIZER_URL, selected), readerUrl: environmentOrigin(env.VITE_READER_URL, selected) }
}

export function requireRuntimeEnvironmentConfig(env: Record<string, unknown>) {
 const config=requireEnvironmentConfig(env)
 const origins = [config.organizerUrl, config.readerUrl]
 // Existing readers need their original origin to open and sync device-local books.
 if (config.environment === 'production' && config.readerUrl === productionReaderOrigin) origins.push(legacyReaderOrigin)
 if (config.environment!=='local' && !origins.includes(window.location.origin)) throw new Error('Hosted configuration cannot run on this application origin.')
 return config
}
