import { readPublicConfig } from '../src/lib/config.ts'
import { environmentOrigin, requireEnvironmentConfig, productionProjectRef, stagingProjectRef, productionAppOrigins, productionOrganizerOrigin, productionReaderOrigin } from '../src/lib/environment.ts'

export function validateBrowserEnv(env: Record<string, string>, requireEnvironment = false, provider: Record<string, string | undefined> = {}, allowProduction = true) {
  // Fail before Vite can embed a privileged credential, even if it was misnamed.
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith('VITE_')) continue
    if (/SECRET|SERVICE_ROLE|PASSWORD|DATABASE_URL/.test(name) || value.startsWith('sb_secret_')) {
      throw new Error('Privileged credentials cannot use the VITE_ prefix. Remove the credential from browser configuration.')
    }
    try {
      if (JSON.parse(atob(value.split('.')[1])).role === 'service_role') throw new Error('Privileged JWT')
    } catch (error) {
      if (error instanceof Error && error.message === 'Privileged JWT') throw new Error('A privileged JWT was supplied to browser configuration. Use a publishable key.')
    }
  }
  if (!requireEnvironment && (env.VITE_SUPABASE_URL || env.VITE_SUPABASE_PUBLISHABLE_KEY) && !readPublicConfig(env)) {
    throw new Error('Invalid public Supabase configuration. Supply a project URL and publishable key (or legacy anon key).')
  }
  if (requireEnvironment) {
    const hosted = provider.VERCEL === '1' || Boolean(provider.VERCEL_ENV || provider.VERCEL_TARGET_ENV || provider.VERCEL_GIT_COMMIT_REF)
    if (hosted && (!['preview', 'production', 'development'].includes(provider.VERCEL_ENV ?? '') || !provider.VERCEL_GIT_COMMIT_REF?.trim())) throw new Error('Vercel builds require explicit provider environment and Git branch metadata.')
    if (provider.VERCEL_TARGET_ENV && provider.VERCEL_TARGET_ENV !== provider.VERCEL_ENV) throw new Error('Vercel target environment conflicts with the deployment scope.')
    const config = requireEnvironmentConfig(env, provider.VERCEL_ENV)
    if (provider.VERCEL_GIT_COMMIT_REF === 'staging' && (provider.VERCEL_ENV !== 'preview' || config.environment !== 'staging' || config.projectRef !== stagingProjectRef)) throw new Error('The staging branch requires Preview scope and the verified staging backend.')
    if (!allowProduction && config.environment === 'production') throw new Error('Local development servers cannot target production.')
  }
}

type VercelHeaders = { headers: { source: string; headers: { key: string; value: string }[] }[] }

export function stagingBootstrapConfig(config: object, app: 'organizer' | 'reader') {
  return { ...structuredClone(config), framework: null, installCommand: '',
    buildCommand: `node ${app === 'reader' ? '../' : ''}scripts/staging-bootstrap.mjs`,
    outputDirectory: '.staging-bootstrap', rewrites: [], headers: [{ source: '/(.*)', headers: [
      { key: 'Content-Security-Policy', value: "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" },
      { key: 'X-Frame-Options', value: 'DENY' }, { key: 'Cache-Control', value: 'no-store' },
      { key: 'Referrer-Policy', value: 'no-referrer' }, { key: 'X-Content-Type-Options', value: 'nosniff' },
    ] }] }
}

// Derive review artifacts from the existing policy for either hosted target.
// The wrappers validate identities; this shared transformation never deploys.
function hostedVercelConfig<T extends VercelHeaders>(config: T, organizer: string, reader: string, app: 'organizer' | 'reader', projectRef: string): T {
  const sibling = app === 'organizer' ? reader : organizer
  const result = structuredClone(config)
  for (const rule of result.headers) for (const header of rule.headers) {
    if (header.key.toLowerCase() !== 'content-security-policy') continue
    header.value = header.value.replace(/frame-src [^;]+/, `frame-src 'self' ${sibling}`)
    for (const source of ['*', stagingProjectRef, productionProjectRef]) {
      for (const protocol of ['https', 'wss']) header.value = header.value.replaceAll(`${protocol}://${source}.supabase.co`, `${protocol}://${projectRef}.supabase.co`)
    }
    if (rule.source === '/auth/bridge') header.value = header.value.replace(/frame-ancestors [^;]+/, `frame-ancestors ${sibling}`)
  }
  return result
}

export function stagingVercelConfig<T extends VercelHeaders>(config: T, organizerUrl: string, readerUrl: string, app: 'organizer' | 'reader'): T {
  const organizer = environmentOrigin(organizerUrl, 'staging')
  const reader = environmentOrigin(readerUrl, 'staging')
  if (organizer === reader || [organizer, reader].some(origin => !new URL(origin).hostname.endsWith('.vercel.app'))) throw new Error('Provide distinct, verified Vercel branch origins for both staging apps.')
  const result = hostedVercelConfig(config, organizer, reader, app, stagingProjectRef)
  if (productionAppOrigins.some(origin => JSON.stringify(result.headers).includes(origin))) throw new Error('Production application origins remain in the staging header configuration.')
  return result
}

export function productionVercelConfig<T extends VercelHeaders>(config: T, organizerUrl: string, readerUrl: string, app: 'organizer' | 'reader'): T {
  const organizer = environmentOrigin(organizerUrl, 'production')
  const reader = environmentOrigin(readerUrl, 'production')
  if (organizer !== productionOrganizerOrigin || reader !== productionReaderOrigin) throw new Error('Production candidates require the exact configured production app origins.')
  const result = hostedVercelConfig(config, organizer, reader, app, productionProjectRef)
  const headers = JSON.stringify(result.headers)
  if (headers.includes(stagingProjectRef) || headers.includes('-git-staging-') || [...headers.matchAll(/(?:https|wss):\/\/([^/;\s"']+)\.supabase\.co/g)].some(match => match[1] !== productionProjectRef)) throw new Error('Foreign or wildcard backend remains in the production header candidate.')
  return result
}
