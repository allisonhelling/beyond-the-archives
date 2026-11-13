import { readPublicConfig, type PublicConfig } from './config.ts'
import { isLocalHostname as isLoopback } from './local-app.ts'

// Public identity denylist, never an authorization credential.
export const productionProjectRef = 'pnrdztfydurupcqwumvr'
export type AppEnvironment = 'local' | 'staging' | 'production'
export type EnvironmentConfig = PublicConfig & { environment: AppEnvironment; projectRef: string; organizerUrl: string; readerUrl: string }

export function environmentOrigin(value: unknown, environment: AppEnvironment) {
 if (typeof value !== 'string') throw new Error('Explicit application origins are required.')
 let url: URL
 try { url = new URL(value) } catch { throw new Error('Configure a valid application origin.') }
 if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
   (environment === 'local' ? !isLoopback(url.hostname) || !['http:', 'https:'].includes(url.protocol) : url.protocol !== 'https:' || isLoopback(url.hostname))) throw new Error('Application origin does not match the selected environment.')
 if (environment !== 'production' && ['beyondthearchives.vercel.app', 'archivesunfolded.vercel.app'].includes(url.hostname)) throw new Error('Production application origins cannot be used outside production.')
 return url.origin
}

export function requireEnvironmentConfig(env: Record<string, unknown>, vercelEnvironment?: string): EnvironmentConfig {
 const config = readPublicConfig(env)
 const environment = env.VITE_APP_ENV
 const projectRef = env.VITE_SUPABASE_PROJECT_REF
 if (!config || !['local','staging','production'].includes(String(environment)) || typeof projectRef !== 'string') throw new Error('Set explicit environment, project reference, backend and public key configuration.')
 const selected = environment as AppEnvironment
 const url = new URL(config.url)
 if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Configure a backend origin without credentials or paths.')
 if (selected === 'local') {
  if (projectRef !== 'local' || !isLoopback(url.hostname) || url.port !== '54321') throw new Error('Local configuration must use the local Supabase API and local project identity.')
 } else {
  if (!/^[a-z0-9-]{3,63}$/.test(projectRef) || url.origin !== `https://${projectRef}.supabase.co` || (selected === 'production') !== (projectRef === productionProjectRef)) throw new Error('Backend project identity does not match the selected environment.')
 }
 if (vercelEnvironment && (vercelEnvironment === 'production' ? selected !== 'production' : vercelEnvironment === 'preview' ? selected !== 'staging' : selected !== 'local')) throw new Error('Vercel deployment scope does not match the application environment.')
 return { ...config, environment: selected, projectRef,
  organizerUrl: environmentOrigin(env.VITE_ORGANIZER_URL, selected), readerUrl: environmentOrigin(env.VITE_READER_URL, selected) }
}

export function requireRuntimeEnvironmentConfig(env: Record<string, unknown>) {
 const config=requireEnvironmentConfig(env)
 if (config.environment==='production' && ![config.organizerUrl,config.readerUrl].includes(window.location.origin)) throw new Error('Production configuration cannot run on this application origin.')
 return config
}
