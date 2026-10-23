import { useEffect } from 'react'
import { useAuth } from '../auth/auth-context'
import { sampleMode } from '../../lib/sample-mode'
import { connectExtension, disconnectExtension } from './extension'

export function ExtensionConnection() {
 const { session, loading } = useAuth()
 useEffect(() => {
  if (sampleMode || loading) return
  // Stay mounted across the auth gate; remounts and closing the page must not
  // disconnect queued imports. Only a resolved signed-out session does that.
  void (session ? connectExtension(session) : disconnectExtension()).catch(() => {})
 }, [session, loading])
 return null
}

