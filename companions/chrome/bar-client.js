// The shared companion uses this small storage/network interface on both browsers.
export function createChromeBarApi(environment) {
 async function request(payload) {
  const response = await chrome.runtime.sendMessage({ type: 'AO3_LIBRARY_BAR', ...(environment && { environment }), ...payload })
  if (!response?.ok) {
   const error = new Error(response?.error ?? 'Reload AO3 after reloading the library extension.')
   if (response?.code === 'ENVIRONMENT_CHANGED') error.code = response.code
   throw error
  }
  return response.value
 }
 return {
  getConfiguration: () => request({ action: 'configuration' }),
  onEnvironmentChange(callback) {
   chrome.runtime.onMessage?.addListener((message, sender) => {
    if (sender.id === chrome.runtime.id && message.type === 'AO3_LIBRARY_ENVIRONMENT_CHANGED') callback(message.environment === 'local' ? 'Local' : 'Hosted')
   })
  },
  getValue: async (key, fallback) => (await request({ action: 'get', key })) ?? fallback,
  setValue: (key, value) => request({ action: 'set', key, value }),
  deleteValue: key => request({ action: 'delete', key }),
  xmlHttpRequest: ({ data }) => request({ action: 'rpc', input: JSON.parse(data) }),
 }
}
