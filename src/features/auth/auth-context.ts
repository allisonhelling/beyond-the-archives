import { createContext, useContext } from 'react'
import type { Session } from '@supabase/supabase-js'

export type AuthState = {
  session: Session | null
  loading: boolean
  error: string | null
  needsPassword: boolean
  passwordSaved: () => void
}
export const AuthContext = createContext<AuthState | null>(null)
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('AuthProvider is required')
  return context
}
