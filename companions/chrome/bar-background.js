const actions = new Set(['claim', 'disconnect', 'get', 'save', 'progress', 'refresh_metadata', 'series_get', 'series_save', 'rating_get', 'rating_save'])
// Allow the existing series RPC's 3 MB input plus its request envelope.
const maxPayloadLength = 4000000

// Keep bar credentials/drafts separate from scan checkpoints and import sessions.
// No message can choose a fetch URL, authorization header, or arbitrary storage key.
export function installBarBridge(environments = null, switching = () => false) {
 let pending = 0
 chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== 'AO3_LIBRARY_BAR') return
  let page
  try { page = new URL(sender.url) } catch { return }
  if (sender.id !== chrome.runtime.id || sender.frameId !== 0 || !Number.isInteger(sender.tab?.id)
   || page.origin !== 'https://archiveofourown.org') return
  pending += 1
  void (async () => {
   await environments?.ready
   const config = environments?.current ?? { backend: __SUPABASE_URL__, publicKey: __SUPABASE_KEY__, appOrigin: __APP_ORIGIN__ }
   if (message.action === 'configuration') return config
   if (switching()) throw new Error('Environment changed. Reload AO3 to use the selected library; your draft is preserved.')
   if (environments && message.environment !== config.id) {
    // Open editors may continue preserving drafts for their original environment.
    const old = environments.list().find(profile => profile.id === message.environment)
    if (old && message.action === 'set' && message.key?.startsWith(`draft:${old.backend}:`)) return handle(message, page, old)
    throw new Error('Environment changed. Reload AO3 to use the selected library; your draft is preserved.')
   }
   return handle(message, page, config)
  })().then(value => respond({ ok: true, value })).catch(error => {
   const changed = error.message.startsWith('Environment changed.')
   respond({ ok: false, ...(changed && { code: 'ENVIRONMENT_CHANGED' }), error: changed ? error.message : 'The library bar request failed. Check the extension connection and retry; your draft is preserved.' })
  }).finally(() => { pending -= 1 })
  return true
 })
 return { busy: () => pending > 0 }
}

async function handle(message, page, config) {
 if (message.action === 'rpc') {
  const input = message.input
  if (!input || !actions.has(input.p_action) || typeof input.p_secret !== 'string' || input.p_secret.length > 512
   || !Number.isSafeInteger(input.p_work) || input.p_work < 1 || JSON.stringify(input).length > maxPayloadLength) throw new Error('Invalid bar request')
  const seriesId = page.pathname.match(/^\/series\/([1-9]\d*)\/?$/)?.[1]
  const workId = page.pathname.match(/^\/works\/([1-9]\d*)(?:\/chapters\/[1-9]\d*)?\/?$/)?.[1]
  const seriesAction = input.p_action.startsWith('series_')
  if (seriesAction ? !seriesId || input.p_work !== Number(seriesId) : workId && input.p_work !== Number(workId)) throw new Error('Work does not match this page')
  const response = await fetch(`${config.backend}/rest/v1/rpc/userscript_library`, {
   method: 'POST', headers: { apikey: config.publicKey, 'Content-Type': 'application/json' },
   body: JSON.stringify(input), signal: AbortSignal.timeout(20000), credentials: 'omit', redirect: 'error',
  })
  return { status: response.status, responseText: await response.text() }
 }
 const key = message.key
 if (typeof key !== 'string' || key.length > 300 || !(
  ['connection', 'theme', 'rating-info'].some(kind => key === `${kind}:${config.backend}`)
  || key.startsWith(`draft:${config.backend}:`))) throw new Error('Invalid bar storage key')
 const storageKey = `ao3-bar:${key}`
 if (message.action === 'get') return (await chrome.storage.local.get(storageKey))[storageKey] ?? null
 if (message.action === 'set') {
  if (JSON.stringify(message.value)?.length > maxPayloadLength || message.value === undefined) throw new Error('Invalid bar storage value')
  await chrome.storage.local.set({ [storageKey]: message.value })
 } else if (message.action === 'delete') await chrome.storage.local.remove(storageKey)
 else throw new Error('Invalid bar storage action')
 return null
}
