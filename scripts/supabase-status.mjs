// Accept both legacy flat status JSON and newer CLI responses with an env map.
// Never include the response or credential values in error messages.
export function parseLocalSupabaseStatus(output) {
  let status
  try { status = JSON.parse(output) } catch {
    throw new Error('Supabase returned invalid status JSON. Run npm run db:start and retry.')
  }
  if (!status || typeof status !== 'object' || Array.isArray(status)) {
    throw new Error('Supabase returned an unsupported status response.')
  }
  const settings = status.env ?? status
  const url = settings.API_URL
  const publicKey = settings.PUBLISHABLE_KEY || settings.ANON_KEY
  const secretKey = settings.SECRET_KEY || settings.SERVICE_ROLE_KEY
  if (typeof url !== 'string' || !url) {
    throw new Error('Local Supabase did not report an API URL. Run npm run db:start successfully before running integration tests; a running database alone is insufficient.')
  }
  let parsed
  try { parsed = new URL(url) } catch {
    throw new Error('Local Supabase reported an invalid API URL.')
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || parsed.username || parsed.password) {
    throw new Error('Integration tests only run against the local Supabase stack.')
  }
  if (typeof publicKey !== 'string' || !publicKey || typeof secretKey !== 'string' || !secretKey) {
    throw new Error('Local Supabase did not report the public and server keys required for integration tests. Run npm run db:start successfully and retry.')
  }
  return { url, publicKey, secretKey }
}
