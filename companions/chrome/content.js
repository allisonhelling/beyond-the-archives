import { mountLibrary } from '../shared/bar.js'
import { createChromeBarApi } from './bar-client.js'

void (async () => {
 const config = await createChromeBarApi().getConfiguration()
 await mountLibrary(document, location.href, { api: createChromeBarApi(config.id), browser: 'chrome', config })
})().catch(() => {
 // Extension reloads invalidate existing content scripts. Reload AO3 to reconnect.
})
