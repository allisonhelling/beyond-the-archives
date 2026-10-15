import { readPublicConfig } from '../src/lib/config'

export function validateBrowserEnv(env: Record<string, string>) {
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
  if ((env.VITE_SUPABASE_URL || env.VITE_SUPABASE_PUBLISHABLE_KEY) && !readPublicConfig(env)) {
    throw new Error('Invalid public Supabase configuration. Supply a project URL and publishable key (or legacy anon key).')
  }
}
