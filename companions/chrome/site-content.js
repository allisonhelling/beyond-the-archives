import { isStoryField, validSelector } from '../../src/features/imports/site-mapping.ts'
import { extractStory, readSelected, selectable, selectorFor } from './site-extraction'

if (!globalThis.__btaSiteEditorInstalled) {
 globalThis.__btaSiteEditorInstalled = true
 let teardown
 chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || message?.type !== 'BTA_SITE_OPEN') return
  teardown?.()
  if (message.url !== location.href) { respond({ ok: false }); return }
  teardown = mountEditor(message)
  respond({ ok: true })
 })
}

function mountEditor({ url, nonce, rules, panelUrl, manualUrl }) {
 const events = new AbortController(), signal = events.signal
 const origin = document.activeElement
 const host = document.createElement('div'), root = host.attachShadow({ mode: 'closed' })
 // The form lives in the extension's own origin so the source site cannot
 // read personal fields or observe their input events.
 host.style.cssText = 'all:initial!important;position:fixed!important;inset:0 0 0 auto!important;width:min(440px,calc(100vw - 36px))!important;z-index:2147483647!important;'
 const frame = document.createElement('iframe')
 frame.title = 'Beyond the Archives Story Editor'
 frame.src = `${panelUrl}#${nonce}`
 frame.style.cssText = 'display:block;width:100%;height:100%;border:0;background:#fff;box-shadow:-5px 0 18px #0003;'
 const markerHost = document.createElement('div'), markerRoot = markerHost.attachShadow({ mode: 'closed' })
 markerHost.style.cssText = 'all:initial!important;position:fixed!important;pointer-events:none!important;inset:0!important;z-index:2147483646!important;'
 const highlight = document.createElement('div')
 highlight.style.cssText = 'position:fixed;pointer-events:none;display:none;box-sizing:border-box;border:3px solid #0a788b;background:#16a9c02b;'
 markerRoot.append(highlight); root.append(frame); document.documentElement.append(markerHost, host)
 let selecting = false, chosen = null, hovered = null, candidates = []
 const fallback = document.createElement('aside')
 fallback.setAttribute('role', 'status')
 fallback.style.cssText = 'position:absolute;inset:0 0 auto;padding:16px;background:#fcf7f5;color:#382b2b;font:16px system-ui;'
 const manual = document.createElement('a'), close = document.createElement('button')
 manual.href = manualUrl; manual.target = '_blank'; manual.rel = 'noopener noreferrer'; manual.textContent = 'Open Manual Entry'
 close.type = 'button'; close.textContent = 'Close'; close.addEventListener('click', stop, { signal })
 fallback.append('The browser could not load this editor. ', manual, ' ', close)
 const loadTimer = setTimeout(() => root.append(fallback), 4000)
 function draw(element) {
  const rect = element?.getBoundingClientRect()
  highlight.style.display = rect ? 'block' : 'none'
  if (!rect) return
  Object.assign(highlight.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` })
 }
 function reset() { selecting = false; chosen = hovered = null; candidates = []; draw(null) }
 function stop() {
  reset()
  events.abort()
  chrome.runtime.onMessage.removeListener(command)
  clearTimeout(loadTimer)
  clearInterval(checkRoute)
  markerHost.remove(); host.remove()
  if (document.activeElement === document.body && origin instanceof HTMLElement && origin.isConnected) origin.focus({ preventScroll: true })
 }
 function signalPanel(action, selection) {
  void chrome.runtime.sendMessage({ type: 'BTA_SITE_INTERNAL', action, nonce, selection }).catch(() => {})
 }
 function pageEvent(event) { return selecting && !event.composedPath().includes(host) && event.isTrusted }
 function blockActivation(event) {
  if (!pageEvent(event) || ![0, -1].includes(event.button)) return
  event.preventDefault(); event.stopImmediatePropagation()
 }
 function selectElement(element) {
  if (!selectable(element)) return
  candidates = selectorFor(document, element)
  if (!candidates.length) return signalPanel('selection', { found: false })
  chosen = element; hovered = null; selecting = false; draw(chosen)
  signalPanel('selection', { found: true, selectors: candidates })
  frame.focus({ preventScroll: true })
 }
 function command(message, sender, respond) {
  if (sender.id !== chrome.runtime.id || message?.type !== 'BTA_SITE_COMMAND' || message.nonce !== nonce) return
  if (location.href !== url) { stop(); respond({ ok: false }); return }
  switch (message.action) {
  case 'capture':
   clearTimeout(loadTimer); fallback.remove()
   try { respond({ ok: true, ...extractStory(document, url, rules) }) }
   catch { reset(); respond({ ok: false, observations: {}, validations: [] }) }
   return
  case 'select':
   reset()
   if (Array.isArray(message.selectors)) {
    candidates = message.selectors.filter(validSelector).slice(0, 3)
    try { chosen = candidates.length ? document.querySelector(candidates[0]) : null } catch { chosen = null }
    if (selectable(chosen)) draw(chosen)
    else { chosen = null; candidates = [] }
   }
   selecting = !chosen && message.paused !== true
   host.style.setProperty('width', selecting ? 'min(440px, 62vw)' : 'min(440px, calc(100vw - 36px))', 'important')
   if (selecting) frame.blur()
   break
  case 'highlight': {
   if (!isStoryField(message.field)) return
   const rule = rules.find(item => item.field === message.field)
   if (!rule) break
   const selector = rule.selectors.find(candidate => readSelected(document, rule.field, candidate, rule.strip))
   if (selector) { chosen = document.querySelector(selector); draw(chosen) }
   break
  }
  case 'preview': {
   const strip = typeof message.strip === 'string' ? message.strip.slice(0, 80) : ''
   if (!chosen?.isConnected || !isStoryField(message.field)) { respond({ ok: false }); return }
   respond({ ok: true, text: readSelected(document, message.field, candidates[0], strip) })
   return
  }
  case 'close': stop(); break
  default: return
  }
  respond({ ok: true })
 }
 chrome.runtime.onMessage.addListener(command)
 const capture = { capture: true, signal }
 for (const name of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'auxclick']) window.addEventListener(name, blockActivation, capture)
 window.addEventListener('pointermove', event => {
  if (!pageEvent(event)) return
  hovered = selectable(event.target) ? event.target : null
  draw(hovered)
 }, capture)
 window.addEventListener('click', event => {
  if (!pageEvent(event)) return
  blockActivation(event)
  selectElement(event.target)
 }, capture)
 window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && (selecting || chosen)) {
   event.preventDefault(); event.stopImmediatePropagation(); reset(); signalPanel('cancel-selection'); frame.focus({ preventScroll: true })
  } else if (event.key === 'Enter' && pageEvent(event) && selectable(event.target)) {
   event.preventDefault(); event.stopImmediatePropagation(); selectElement(event.target)
  }
 }, capture)
 window.addEventListener('scroll', () => draw(hovered ?? chosen), capture)
 window.addEventListener('resize', () => draw(hovered ?? chosen), { signal })
 window.addEventListener('pagehide', stop, { signal })
 window.navigation?.addEventListener('currententrychange', () => { if (location.href !== url) stop() }, { signal })
 const checkRoute = setInterval(() => { if (location.href !== url || !host.isConnected) stop() }, 250)
 return stop
}
