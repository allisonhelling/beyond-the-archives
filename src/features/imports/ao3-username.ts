import { useAuth } from '../auth/auth-context'
import { sampleMode } from '../../lib/sample-mode'

export const ao3UsernamePattern = '[a-zA-Z0-9_]{1,40}'

export function normalizeAo3Username(value: string) {
 const username = value.trim()
 if (!new RegExp(`^${ao3UsernamePattern}$`).test(username)) throw new Error('Enter your AO3 username, using letters, numbers, and underscores, without a URL.')
 return username
}

// Like display preferences, this is stored on this browser; isolate account and sample data.
export function useAo3Username() {
 const { session } = useAuth()
 const key = `between-chapters:ao3-username:${sampleMode ? 'sample' : session?.user.id ?? 'local'}`
 function read() { try { return localStorage.getItem(key) ?? '' } catch { return '' } }
 function save(value: string) {
  if (value.trim()) localStorage.setItem(key, normalizeAo3Username(value))
  else localStorage.removeItem(key)
 }
 return { read, save }
}

