const form = document.getElementById('environment-form')
const select = document.getElementById('environment')
const message = document.getElementById('message')
const button = form.querySelector('button')
let state
async function request(action, environment) {
 const result = await chrome.runtime.sendMessage({ type: 'AO3_LIBRARY_ENVIRONMENT', action, environment })
 if (!result?.ok) throw new Error(result?.error ?? 'Could not read extension settings. Reload this page and retry.')
 return result
}
function describe() {
 const profile = state.profiles.find(profile => profile.id === select.value)
 document.getElementById('target').textContent = `${profile.label}: ${profile.appOrigin}`
 button.disabled = select.value === state.current
 document.getElementById('library').href = `${state.profiles.find(profile => profile.id === state.current).appOrigin}/settings`
}
select.addEventListener('change', describe)
form.addEventListener('submit', async event => {
 event.preventDefault(); button.disabled = true; message.textContent = ''
 try {
  await request('select', select.value)
  state.current = select.value; describe()
  message.textContent = 'Environment saved. Reload your AO3 tabs to use it. Your other environment’s connection and drafts are retained.'
 } catch (error) { message.textContent = error.message; describe() }
})
try {
 state = await request('get')
 for (const profile of state.profiles) {
  const option = document.createElement('option'); option.value = profile.id; option.textContent = profile.label; select.append(option)
 }
 select.value = state.current; describe()
 if (state.profiles.length < 2) document.getElementById('missing').textContent = 'To enable both environments, configure hosted public settings in .env.local.hosted and local public settings in .env.local, then rebuild and reload the extension.'
} catch (error) { message.textContent = error.message; button.disabled = true }
