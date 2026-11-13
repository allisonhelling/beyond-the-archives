// Run only in a trusted terminal. Never import this module into src/.
import { createClient } from '@supabase/supabase-js'
import { verifiedLocalTarget, assertLocalEndpoint } from '../scripts/local-target.mjs'

export async function inviteUser({ url, secret, email, redirectTo }, clientFactory = createClient, readTarget) {
  if (!email || !redirectTo) throw new Error('SUPABASE_URL, SUPABASE_SECRET_KEY, INVITE_EMAIL, and APP_ORIGIN are required.')
  if (!/^[^@\s]+@example\.test$/.test(email)) throw new Error('Local invitations require a synthetic example.test address.')
  const destination = new URL(redirectTo)
  if (destination.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(destination.hostname)) throw new Error('APP_ORIGIN must use HTTPS outside local development.')
  if (!['localhost','127.0.0.1','[::1]'].includes(destination.hostname)) throw new Error('Invitations are local-only in S1.')
  assertLocalEndpoint(url || 'http://127.0.0.1:54321')
  const target = await verifiedLocalTarget({url,secret},readTarget)
  const client = clientFactory(target.url, target.secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await client.auth.admin.inviteUserByEmail(email, { redirectTo: `${destination.origin}/auth/callback` })
  if (error) throw new Error('Invitation failed. Check project configuration and the email delivery log.')
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    await inviteUser({ url: process.env.SUPABASE_URL, secret: process.env.SUPABASE_SECRET_KEY,
      email: process.env.INVITE_EMAIL, redirectTo: process.env.APP_ORIGIN })
    console.log('Invitation sent. No credentials have been written to disk.')
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
