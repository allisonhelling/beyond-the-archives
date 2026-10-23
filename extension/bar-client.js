// The shared companion uses this small storage/network interface on both browsers.
export function createChromeBarApi() {
 async function request(payload) {
  const response = await chrome.runtime.sendMessage({ type: 'AO3_LIBRARY_BAR', ...payload })
  if (!response?.ok) throw new Error(response?.error ?? 'Reload AO3 after reloading the library extension.')
  return response.value
 }
 return {
  getValue: async (key, fallback) => (await request({ action: 'get', key })) ?? fallback,
  setValue: (key, value) => request({ action: 'set', key, value }),
  deleteValue: key => request({ action: 'delete', key }),
  xmlHttpRequest: ({ data }) => request({ action: 'rpc', input: JSON.parse(data) }),
 }
}
