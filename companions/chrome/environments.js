// Storage is scoped to the explicitly selected environment. The background
// controller switches only after all operations have finished.
export function createEnvironmentManager(profiles, defaultId = 'hosted', storage = chrome.storage) {
 let id = defaultId
 const ready = storage.local.get('ao3-environment').then(saved => {
  if (profiles[saved['ao3-environment']]) id = saved['ao3-environment']
 })
 const prefix = () => id === defaultId ? '' : `environment:${id}:`
 const area = source => ({
  async get(keys) {
   await ready
   const names = Array.isArray(keys) ? keys : [keys], scope = prefix()
   const result = await source.get(names.map(key => `${scope}${key}`))
   return Object.fromEntries(names.map(key => [key, result[`${scope}${key}`]]))
  },
  async set(values) {
   await ready
   const scope = prefix()
   return source.set(Object.fromEntries(Object.entries(values).map(([key, value]) => [`${scope}${key}`, value])))
  },
  async remove(keys) {
   await ready
   const scope = prefix()
   return source.remove((Array.isArray(keys) ? keys : [keys]).map(key => `${scope}${key}`))
  },
  async clear() {
   await ready
   const scope = prefix(), result = await source.get(null)
   const keys = Object.keys(result).filter(key => scope ? key.startsWith(scope) : !key.startsWith('environment:') && key !== 'ao3-environment')
   return source.remove(keys)
  },
 })
 return {
  ready, get current() { return { ...profiles[id], id } },
  storage: { local: area(storage.local), session: area(storage.session) },
  async select(next) {
   await ready
   if (!profiles[next]) throw new Error('This environment is not configured. Rebuild the extension with its public settings.')
   await storage.local.set({ 'ao3-environment': next })
   id = next
  },
  list: () => Object.entries(profiles).map(([id, profile]) => ({ id, label: profile.label, appOrigin: profile.appOrigin, backend: profile.backend })),
 }
}

export function configuredEnvironments() {
 return typeof __EXTENSION_ENVIRONMENTS__ === 'undefined' ? null : __EXTENSION_ENVIRONMENTS__
}
