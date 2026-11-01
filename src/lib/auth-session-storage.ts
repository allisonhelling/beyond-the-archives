const preferences = new Map<string, boolean>()

export function remembersSession(namespace: string) {
 if (preferences.has(namespace)) return preferences.get(namespace)!
 try { return localStorage.getItem(`${namespace}:remember-session`) !== 'false' }
 catch { return preferences.get(namespace) ?? true }
}

export function rememberSession(namespace: string, remember: boolean) {
 preferences.set(namespace, remember)
 try { localStorage.setItem(`${namespace}:remember-session`, String(remember)) } catch { /* Keep this choice in memory when storage is unavailable. */ }
}

/** Preserve existing Auth keys while choosing persistent or tab-only session storage. */
export function authSessionStorage(namespace: string) {
 const memory = new Map<string, string>()
 return {
  getItem(key: string) {
   try { return (remembersSession(namespace) ? localStorage : sessionStorage).getItem(key) ?? memory.get(key) ?? null }
   catch { return memory.get(key) ?? null }
  },
  setItem(key: string, value: string) {
   const remember = remembersSession(namespace)
   try {
    const active = remember ? localStorage : sessionStorage
    active.setItem(key, value)
    memory.delete(key)
   } catch { memory.set(key, value) }
   try { (remember ? sessionStorage : localStorage).removeItem(key) } catch { /* Remove an older persistent copy whenever accessible. */ }
  },
  removeItem(key: string) {
   memory.delete(key)
   for (const name of ['localStorage', 'sessionStorage'] as const) { try { globalThis[name].removeItem(key) } catch { /* Remove every accessible copy. */ } }
  },
 }
}
