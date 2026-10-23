import { afterEach, expect, it, vi } from 'vitest'
import { createChromeBarApi } from './bar-client.js'

afterEach(() => vi.unstubAllGlobals())
it('adapts shared companion storage and RPC calls to internal extension messages', async () => {
 const sendMessage = vi.fn(async () => ({ ok: true, value: null }))
 vi.stubGlobal('chrome', { runtime: { sendMessage } })
 const api = createChromeBarApi()
 expect(await api.getValue('theme:backend', 'light')).toBe('light')
 await api.setValue('theme:backend', 'dark')
 await api.deleteValue('draft:backend:alice:123')
 const input = { p_action: 'get', p_work: 123 }
 await api.xmlHttpRequest({ data: JSON.stringify(input) })
 expect(sendMessage.mock.calls.map(([message]) => message)).toEqual([
  { type: 'AO3_LIBRARY_BAR', action: 'get', key: 'theme:backend' },
  { type: 'AO3_LIBRARY_BAR', action: 'set', key: 'theme:backend', value: 'dark' },
  { type: 'AO3_LIBRARY_BAR', action: 'delete', key: 'draft:backend:alice:123' },
  { type: 'AO3_LIBRARY_BAR', action: 'rpc', input },
 ])
 sendMessage.mockResolvedValueOnce({ ok: false, error: 'Storage unavailable' })
 await expect(api.setValue('key', 'value')).rejects.toThrow('Storage unavailable')
})
