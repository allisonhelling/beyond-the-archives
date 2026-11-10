import { sampleMode } from '../../src/lib/sample-mode'
import { isLoginBridge, organizerAppUrl, serveConnectedLogin, serveConnectedLoginInTab } from '../../src/lib/connected-login'
import { readerCloud } from './cloud'
import { consumePendingReaderPairing, consumeReaderPairing } from '../../src/lib/reader-connection'
import { isLocalApp } from '../../src/lib/local-app'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ReaderAuthorization } from './ReaderAuthorization'
import './styles.css'
const initialPairing = sampleMode ? undefined : consumeReaderPairing() ?? consumePendingReaderPairing()
if (!sampleMode && isLoginBridge()) serveConnectedLogin(readerCloud, organizerAppUrl())
else if (!sampleMode && location.pathname === '/auth/authorize') createRoot(document.getElementById('root')!).render(<ReaderAuthorization />)
else {
 if (!sampleMode) serveConnectedLoginInTab(readerCloud, organizerAppUrl())
 const root = createRoot(document.getElementById('root')!)
 const content = sampleMode ? await import('./sample/Preview').then(({ SampleReaderPreview }) => <SampleReaderPreview><App /></SampleReaderPreview>) : <App initialPairing={initialPairing} />
 if (import.meta.env.DEV && isLocalApp() && window.self === window.top) {
  void import('../../src/app/LocalViewportPreview').then(({ LocalViewportPreview }) => {
   root.render(<LocalViewportPreview unitsAfterDimensions>{content}</LocalViewportPreview>)
  })
 } else root.render(content)
}
