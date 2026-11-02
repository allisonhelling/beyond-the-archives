import { useAuth } from '../auth/auth-context'
import { sampleMode } from '../../lib/sample-mode'
import { readerAppUrl } from '../../lib/connected-login'

export function ConnectReader() {
  const { authenticated } = useAuth()
  return <div className="form-actions"><a className="button secondary" href={readerAppUrl()} target="_blank" rel="noreferrer" aria-disabled={sampleMode || !authenticated} onClick={event => { if (sampleMode || !authenticated) event.preventDefault() }}>Open Reader</a></div>
}
