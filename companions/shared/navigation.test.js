// @vitest-environment-options {"url":"https://archiveofourown.org/works/123/chapters/104"}
import { afterEach, expect, it, vi } from 'vitest'
import { waitFor } from '@testing-library/dom'
import { observeLibrary } from './bar'

let stop
const work = chapter => `<h2 class="title">Story</h2><div class="summary"><p>Summary</p></div><dl class="work meta"><dd class="chapters">5/5</dd></dl><div id="chapters"><div class="chapter" id="chapter-${chapter}"><div class="userstuff">Private chapter text</div></div></div>`
afterEach(() => { stop?.(); vi.unstubAllGlobals(); document.body.replaceChildren() })
it('waits for AO3 content, then replaces a stale chapter bar without duplicating controls', async () => {
 vi.stubGlobal('__SUPABASE_URL__', 'https://backend.test')
 vi.stubGlobal('__SUPABASE_KEY__', 'public-key')
 vi.stubGlobal('__APP_ORIGIN__', 'https://organizer.test')
 vi.stubGlobal('__SCRIPT_VERSION__', 'test')
 vi.stubGlobal('__BRAND_ICON__', '<svg></svg>')
 document.body.innerHTML = '<main id="main"></main>'
 const api = { getValue: async (_, fallback) => fallback }
 stop = observeLibrary(document, { api })
 await new Promise(resolve => setTimeout(resolve, 60))
 expect(document.getElementById('ao3-library-companion')).toBeNull()
 document.querySelector('#main').innerHTML = `<div id="workskin">${work(4)}</div><div id="kudos"></div>`
 await waitFor(() => expect(document.getElementById('ao3-library-companion')).not.toBeNull())
 const previous = document.getElementById('ao3-library-companion')
 history.pushState(null, '', '/works/123/chapters/105')
 document.querySelector('#workskin').innerHTML = work(5)
 await waitFor(() => expect(document.getElementById('ao3-library-companion')).not.toBe(previous))
 expect(document.querySelectorAll('#ao3-library-companion')).toHaveLength(1)
 expect(document.querySelectorAll('#ao3-library-progress')).toHaveLength(1)
 expect(document.getElementById('ao3-library-progress')).not.toHaveAttribute('hidden')
})
