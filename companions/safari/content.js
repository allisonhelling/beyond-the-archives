import { observeLibrary } from '../shared/bar.js'

// Userscripts supplies GM in this script's scope, rather than on globalThis.
if (typeof GM !== 'undefined') observeLibrary(document, { api: GM, browser: 'safari' })
