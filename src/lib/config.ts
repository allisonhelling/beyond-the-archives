export type PublicConfig = { url: string; key: string }

export function readPublicConfig(env: Record<string, unknown>): PublicConfig | null {
  const url = env.VITE_SUPABASE_URL
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (typeof url !== 'string' || typeof key !== 'string' || !url || !key) return null
  let parsed: URL
  try { parsed = new URL(url) } catch { return null }
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname))) return null
  // Only a publishable key or legacy anon JWT belongs in a browser bundle.
  if (key.startsWith('sb_publishable_') && !key.includes('replace_me')) return { url, key }
  try {
    const payload = JSON.parse(atob(key.split('.')[1])) as { role?: string }
    return payload.role === 'anon' ? { url, key } : null
  } catch { return null }
}
