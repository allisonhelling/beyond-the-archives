// Trusted operator utility. Never import into src/ or expose the secret in VITE_*.
import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { gunzipSync } from 'node:zlib'
import { createClient } from '@supabase/supabase-js'

export function parseBackup(file) {
  return JSON.parse((file[0] === 0x1f && file[1] === 0x8b ? gunzipSync(file) : file).toString('utf8'))
}

export async function restoreBackup({ backup, userId, replace = false, url, secret }, clientFactory = createClient) {
  if (!url || !secret || !userId) throw new Error('SUPABASE_URL, SUPABASE_SECRET_KEY, and --user <Auth UUID> are required.')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) throw new Error('--user must be an Auth UUID.')
  if (backup?.format !== 'between-chapters-backup' || ![1, 2].includes(backup.version) || !backup.tables) throw new Error('Unsupported backup format.')
  const client = clientFactory(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: identities, error } = await client.rpc('restore_library_backup', { p_backup: backup, p_user: userId, p_replace: replace })
  if (error) throw new Error(`Restore did not return success. Check the destination before retrying. ${error.message}`)
  const preferences = { ...backup.browser_preferences }
  const sortKey = 'between-chapters:collection-sort:v1'
  // This browser setting contains collection UUIDs; they change across accounts.
  try {
    if (typeof preferences[sortKey] === 'string') {
      const sort = JSON.parse(preferences[sortKey])
      for (const key of ['hiddenAutomatic', 'hiddenCustom']) {
        if (Array.isArray(sort?.[key])) sort[key] = sort[key].map(id => identities?.[id] ?? id)
      }
      preferences[sortKey] = JSON.stringify(sort)
    }
  } catch { /* Preserve absent or malformed settings exactly as exported. */ }
  return { format: 'between-chapters-browser-preferences', version: 1, browser_preferences: preferences }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { values, positionals } = parseArgs({ allowPositionals: true, options: { user: { type: 'string' }, replace: { type: 'boolean' } } })
    if (positionals.length !== 1 || !values.user) {
      throw new Error('Usage: npm run backup:restore -- <backup.json[.gz]> --user <Auth UUID> [--replace]')
    }
    const file = await readFile(positionals[0])
    const backup = parseBackup(file)
    const preferences = await restoreBackup({ backup, userId: values.user, replace: values.replace,
      url: process.env.SUPABASE_URL, secret: process.env.SUPABASE_SECRET_KEY })
    console.log('Database restored. Reload the app and reconnect paired devices as needed.')
    const preferencesPath = `${positionals[0]}.browser-preferences.json`
    try {
      await writeFile(preferencesPath, JSON.stringify(preferences, null, 2), { mode: 0o600 })
      console.log(`Restore browser settings from ${preferencesPath}; see docs/BACKUPS.md.`)
    } catch { throw new Error('Database restore succeeded, but the browser preferences file could not be saved. Check directory permissions before retrying with --replace.') }
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
