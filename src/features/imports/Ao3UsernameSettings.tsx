import { useState } from 'react'
import { useAo3Username } from './ao3-username'

export function Ao3UsernameSettings() {
 const preference = useAo3Username()
 const [username, setUsername] = useState(() => preference.read())
 const [message, setMessage] = useState(''), [error, setError] = useState('')
 function save(value: string) {
  setError(''); setMessage('')
  try { preference.save(value); setUsername(preference.read()); setMessage(value ? 'AO3 username saved.' : 'AO3 username deleted. Future imports will ask for a username.') }
  catch (failure) { setError((failure as Error).message) }
 }
 return <section id="settings-ao3-username" tabIndex={-1} className="settings-card"><h2>AO3 Username</h2><p>Save your username on this browser to skip the prompt when importing Bookmarks or Marked for Later. You can still paste any supported AO3 List URL.</p><form className="story-form" onSubmit={event => { event.preventDefault(); save(username) }}><label>AO3 Username<input value={username} onChange={event => setUsername(event.target.value)} autoComplete="off" /></label><div className="form-actions"><button className="button primary">Save Username</button><button type="button" className="button secondary" onClick={() => save('')}>Delete Username</button></div></form>{message && <p role="status">{message}</p>}{error && <p role="alert" className="error-message">{error}</p>}</section>
}
