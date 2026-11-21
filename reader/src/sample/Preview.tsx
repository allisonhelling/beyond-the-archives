import { useEffect, useState } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '../../../src/features/auth/AuthProvider'
import { useAuth } from '../../../src/features/auth/auth-context'
import { App } from '../App'
import { initializeSampleReader } from './repository'

export function SampleReaderPreview() {
  return <BrowserRouter><AuthProvider><SampleReader /></AuthProvider></BrowserRouter>
}

function SampleReader() {
  const { authenticated, signIn, signOut } = useAuth()
  const [ready, setReady] = useState(false), [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void initializeSampleReader().then(() => { if (active) setReady(true) }).catch(error => { if (active) setError(String(error)) })
    return () => { active = false }
  }, [])
  if (!ready) return <main className="settings-content"><p role={error ? 'alert' : 'status'}>{error || 'Opening sample reader…'}</p></main>
  return <App sampleAccount={{ authenticated, signIn, signOut }} />
}
