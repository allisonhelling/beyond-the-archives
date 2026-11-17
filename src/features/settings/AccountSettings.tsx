import { clearOfflineSnapshot } from '../offline/storage'
import { UsernameSettings } from '../auth/UsernameSettings'
import { AccountSecuritySettings } from '../auth/AccountSecuritySettings'
import { verifyCurrentPassword } from '../../lib/auth-account'
import { accountSettingsSection } from './settings-sections'
import { useAuth } from '../auth/auth-context'
import { authRedirectUrl, supabase } from '../../lib/supabase'
import { sampleMode } from '../../lib/sample-mode'

export function AccountSettings() {
 const { session } = useAuth()
 return <section id={accountSettingsSection.id} tabIndex={-1} className="settings-card" aria-label="Account & Security"><dl><div><dt>Email</dt><dd>{session?.user.email}</dd></div><div><dt>Library Visibility</dt><dd>Private · shared account for both apps</dd></div></dl><UsernameSettings key={session?.user.id} client={supabase} disabled={sampleMode} verifyPassword={password => supabase ? verifyCurrentPassword(supabase, password) : Promise.reject(new Error('Sign in to edit your account.'))} /><AccountSecuritySettings client={supabase} disabled={sampleMode} redirectTo={authRedirectUrl()} afterSignOut={async () => { sessionStorage.setItem('connected-login-signed-out', '1'); clearOfflineSnapshot() }} />{sampleMode && <p className="muted">Account settings are unavailable in the local sample preview.</p>}</section>
}