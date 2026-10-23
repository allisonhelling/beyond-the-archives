import { mountLibrary } from '../userscript/main.js'
import { createChromeBarApi } from './bar-client.js'

void mountLibrary(document, location.href, { api: createChromeBarApi(), browser: 'chrome' }).catch(() => {
 // Extension reloads invalidate existing content scripts. Reloading AO3 reconnects.
})
