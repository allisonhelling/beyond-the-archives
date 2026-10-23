const actions = new Set(['claim', 'disconnect', 'get', 'save', 'progress', 'refresh_metadata', 'series_get', 'series_save'])
// Allow the existing series RPC's 3 MB input plus its request envelope.
const maxPayloadLength = 4000000

// Keep bar credentials/drafts separate from scan checkpoints and import sessions.
// No message can choose a fetch URL, authorization header, or arbitrary storage key.
export function installBarBridge() {
 chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== 'AO3_LIBRARY_BAR') return
  let page
  try { page = new URL(sender.url) } catch { return }
  if (sender.id !== chrome.runtime.id || sender.frameId !== 0 || !Number.isInteger(sender.tab?.id)
   || page.origin !== 'https://archiveofourown.org'
   || !/^\/(works\/[1-9]\d*(?:\/chapters\/[1-9]\d*)?|series\/[1-9]\d*)\/?$/.test(page.pathname)) return
  void handle(message, page).then(value => respond({ ok: true, value })).catch(() => {
   respond({ ok: false, error: 'The library bar request failed. Check the extension connection and retry; your draft is preserved.' })
  })
  return true
 })
}

async function handle(message, page) {
 if (message.action === 'rpc') {
  const input = message.input
  if (!input || !actions.has(input.p_action) || typeof input.p_secret !== 'string' || input.p_secret.length > 512
   || !Number.isSafeInteger(input.p_work) || input.p_work < 1 || JSON.stringify(input).length > maxPayloadLength) throw new Error('Invalid bar request')
  const seriesPage = page.pathname.startsWith('/series/'), seriesAction = input.p_action.startsWith('series_')
  if (seriesAction && !seriesPage || (!seriesPage || seriesAction) && input.p_work !== Number(page.pathname.split('/')[2])) throw new Error('Work does not match this page')
  const response = await fetch(`${__SUPABASE_URL__}/rest/v1/rpc/userscript_library`, {
   method: 'POST', headers: { apikey: __SUPABASE_KEY__, 'Content-Type': 'application/json' },
   body: JSON.stringify(input), signal: AbortSignal.timeout(20000), credentials: 'omit', redirect: 'error',
  })
  return { status: response.status, responseText: await response.text() }
 }
 const key = message.key
 if (typeof key !== 'string' || key.length > 300 || !(
  ['connection', 'theme', 'rating-info'].some(kind => key === `${kind}:${__SUPABASE_URL__}`)
  || key.startsWith(`draft:${__SUPABASE_URL__}:`))) throw new Error('Invalid bar storage key')
 const storageKey = `ao3-bar:${key}`
 if (message.action === 'get') return (await chrome.storage.local.get(storageKey))[storageKey] ?? null
 if (message.action === 'set') {
  if (JSON.stringify(message.value)?.length > maxPayloadLength || message.value === undefined) throw new Error('Invalid bar storage value')
  await chrome.storage.local.set({ [storageKey]: message.value })
 } else if (message.action === 'delete') await chrome.storage.local.remove(storageKey)
 else throw new Error('Invalid bar storage action')
 return null
}
