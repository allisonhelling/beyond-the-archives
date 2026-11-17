// Read-only provider verification and review artifacts. Never writes live settings.
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { productionProjectRef } from '../src/lib/environment.ts'
import { productionVercelConfig, validateBrowserEnv } from './build-env.ts'
import { stagingManagementToken } from './staging-target.mjs'

export async function productionConfiguration(read) {
 const project = await read('')
 assert.equal(project.ref ?? project.id, productionProjectRef)
 assert.equal(project.name, 'Beyond the Archives')
 assert.equal(project.region, 'us-east-1')
 assert.equal(project.organization_id, 'vosrfpinkplcjgnjmnob')
 assert.equal(project.status, 'ACTIVE_HEALTHY')
 const keys = await read('/api-keys')
 const publicKey = keys.find(key => (key.api_key ?? key.key)?.startsWith('sb_publishable_'))
 assert.ok(publicKey, 'A provider-verified production publishable key is required.')
 const organizer = 'https://beyondthearchives.vercel.app', reader = 'https://archivesunfolded.vercel.app'
 const env = { VITE_APP_ENV: 'production', VITE_SUPABASE_PROJECT_REF: productionProjectRef, VITE_SUPABASE_URL: `https://${productionProjectRef}.supabase.co`, VITE_SUPABASE_PUBLISHABLE_KEY: publicKey.api_key ?? publicKey.key, VITE_ORGANIZER_URL: organizer, VITE_READER_URL: reader }
 validateBrowserEnv(env, true, { VERCEL: '1', VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main' })
 const auth = await read('/config/auth'), secrets = await read('/secrets')
 const desiredAuth = { site_url: organizer, uri_allow_list: `${organizer}/auth/callback,${reader}/auth/callback`, external_anonymous_users_enabled: false, mailer_autoconfirm: false, mfa_totp_enroll_enabled: true, mfa_totp_verify_enabled: true, hook_before_user_created_enabled: true, hook_before_user_created_uri: 'pg-functions://postgres/public/before_user_created' }
 return { env, vercelBindings: ['prj_Rb584lKdVjCt7wikZSF1bTCWAujo', 'prj_EoxUyrPPjVqvdZvsir6OeITXbYWM'].map(projectId => ({ teamId: 'team_mB5Tjb4FpnSFh8QCEAgvtRJV', projectId, environment: 'production', gitBranch: null, values: env })), extension: { EXTENSION_APP_ORIGIN: organizer }, desiredAuth, desiredOrigins: { APP_ORIGIN: organizer, READER_ORIGIN: reader }, runtime: '24.x', verifiedAt: new Date().toISOString(), backendPublicKeyVerified: true,
  authMatches: Object.fromEntries(Object.entries(desiredAuth).map(([name, value]) => [name, auth[name] === value])),
  originNamesPresent: Object.fromEntries(['APP_ORIGIN', 'READER_ORIGIN'].map(name => [name, secrets.some(secret => secret.name === name)])),
  limitations: ['Public key identity verified with Supabase; Vercel effective Production scopes, deployed values, origin secret values and Auth email templates require independent post-application verification.', 'No settings, deployment, SMTP, credentials, signup opening or alias changes are performed.'],
 }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 try {
  assert.equal(process.argv.length, 2)
  const token = process.env.SUPABASE_PRODUCTION_READ_TOKEN || stagingManagementToken({})
  const candidate = await productionConfiguration(async path => {
   const response = await fetch(`https://api.supabase.com/v1/projects/${productionProjectRef}${path}`, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(60000), headers: { Authorization: `Bearer ${token}` } })
   if (!response.ok) throw new Error('Production metadata verification failed.')
   return response.json()
  })
  const directory = new URL(`../artifacts/release/production-config-${candidate.verifiedAt.replaceAll(/[:.]/g, '-')}/`, import.meta.url)
  await mkdir(directory, { recursive: true })
  await writeFile(new URL('configuration.json', directory), JSON.stringify(candidate, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  for (const app of ['organizer', 'reader']) {
   const source = JSON.parse(await readFile(new URL(app === 'organizer' ? '../vercel.json' : '../reader/vercel.json', import.meta.url), 'utf8'))
   const config = productionVercelConfig(source, candidate.env.VITE_ORGANIZER_URL, candidate.env.VITE_READER_URL, app)
   await writeFile(new URL(`${app}.production.vercel.json`, directory), JSON.stringify(config, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  }
  console.log(JSON.stringify({ artifact: directory.pathname.split('/artifacts/')[1], backendPublicKeyVerified: true, authMatches: candidate.authMatches, originNamesPresent: candidate.originNamesPresent, runtime: candidate.runtime, liveSettingsChanged: false }))
 } catch { console.error('Production configuration preparation refused or failed; credential and provider response details withheld.'); process.exitCode = 1 }
}
