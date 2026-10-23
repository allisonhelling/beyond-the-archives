import { mountLibrary } from '../shared/bar.js'

// Userscripts supplies GM in this script's scope, rather than on globalThis.
if (typeof GM !== 'undefined') void mountLibrary(document, location.href, { api: GM, browser: 'safari' }).catch(() => {
 // Userscripts storage unavailable; no credential fallback to page storage.
})
