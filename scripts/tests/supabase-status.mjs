import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { parseLocalSupabaseStatus as parse } from '../supabase-status.mjs'

const legacy = { API_URL: 'http://127.0.0.1:54321', ANON_KEY: 'test-public', SERVICE_ROLE_KEY: 'test-secret' }

test('supports legacy flat CLI JSON', () => {
  assert.deepEqual(parse(JSON.stringify(legacy)), { url: legacy.API_URL, publicKey: 'test-public', secretKey: 'test-secret' })
})
test('supports CLI JSON with a nested env map', () => {
  assert.deepEqual(parse(JSON.stringify({ id: 'test-stack', runtime: 'docker', env: legacy })), { url: legacy.API_URL, publicKey: 'test-public', secretKey: 'test-secret' })
})
test('supports modern publishable and secret key names', () => {
  const settings = { ...legacy, PUBLISHABLE_KEY: 'test-modern-public', SECRET_KEY: 'test-modern-secret' }
  for (const output of [settings, { env: settings }]) assert.deepEqual(parse(JSON.stringify(output)), { url: legacy.API_URL, publicKey: 'test-modern-public', secretKey: 'test-modern-secret' })
})
test('explains partial startup without constructing an undefined URL or exposing keys', () => {
  for (const output of [{ DB_URL: 'private-connection' }, { env: { SERVICE_ROLE_KEY: 'test-sensitive-value' } }]) {
    assert.throws(() => parse(JSON.stringify(output)), error => error.message.includes('did not report an API URL') && !error.message.includes('test-sensitive-value'))
  }
})
test('rejects remote and unsafe URLs before creating any test accounts', () => {
  for (const API_URL of ['https://hosted.supabase.co', 'http://localhost.attacker.test', 'file://localhost/tmp', 'http://user:password@localhost:54321']) assert.throws(() => parse(JSON.stringify({ ...legacy, API_URL })), /only run against the local/)
})
test('reports malformed responses without revealing credentials', () => {
  assert.throws(() => parse('{"SECRET_KEY":"sensitive"'), error => error.message.includes('invalid status JSON') && !error.message.includes('sensitive'))
  for (const output of ['null', '[]', '"unexpected"']) assert.throws(() => parse(output), /unsupported status response/)
  assert.throws(() => parse(JSON.stringify({ ...legacy, API_URL: 'invalid' })), /invalid API URL/)
  assert.throws(() => parse(JSON.stringify({ API_URL: legacy.API_URL })), /did not report the public and server keys/)
})
test('local Auth gates confirmed email signup with the beta hook and disables anonymous accounts', async () => {
  const config = await readFile(new URL('../../supabase/config.toml', import.meta.url), 'utf8')
  const auth = config.match(/^\[auth\]\s*\n([\s\S]*?)(?=^\[|$(?![\s\S]))/m)?.[1]
  const email = config.match(/^\[auth\.email\]\s*\n([\s\S]*?)(?=^\[|$(?![\s\S]))/m)?.[1]
  const hook = config.match(/\[auth\.hook\.before_user_created\]([\s\S]*?)(?=\n\[|$)/)?.[1] || ''
  assert.match(hook, /^enabled\s*=\s*true\s*$/m)
  assert.match(hook, /^uri\s*=\s*"pg-functions:\/\/postgres\/public\/before_user_created"\s*$/m)
  assert.match(auth || '', /^enable_signup\s*=\s*true\s*$/m)
  assert.match(auth || '', /^enable_anonymous_sign_ins\s*=\s*false\s*$/m)
  assert.match(email || '', /^enable_confirmations\s*=\s*true\s*$/m)
  assert.match(email || '', /^enable_signup\s*=\s*true\s*$/m)
})
