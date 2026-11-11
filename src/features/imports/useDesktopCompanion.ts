import { useCallback, useEffect, useState } from 'react'
import { connectExtension } from './extension'

export function useDesktopCompanion() {
 const [connected, setConnected] = useState(false)
 const [hasConnected, setHasConnected] = useState(false)
 const [checking, setChecking] = useState(true)
 const [attempt, setAttempt] = useState(0)
 const reconnect = useCallback(() => { setChecking(true); setAttempt(value => value + 1) }, [])
 useEffect(() => {
  let active = true
  void connectExtension().then(value => { if (active) { setConnected(value); if (value) setHasConnected(true) } }).catch(() => { if (active) setConnected(false) }).finally(() => { if (active) setChecking(false) })
  window.addEventListener('focus', reconnect)
  return () => { active = false; window.removeEventListener('focus', reconnect) }
 }, [attempt, reconnect])
 return { connected, hasConnected, checking, reconnect }
}
