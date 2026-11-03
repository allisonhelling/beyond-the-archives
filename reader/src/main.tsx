import { isLoginBridge, organizerAppUrl, serveConnectedLogin, serveConnectedLoginInTab } from '../../src/lib/connected-login'
import { readerCloud } from './cloud'
import { consumePendingReaderPairing, consumeReaderPairing } from '../../src/lib/reader-connection'
import { isLocalApp } from '../../src/lib/local-app'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'
const initialPairing = consumeReaderPairing() ?? consumePendingReaderPairing()
if (isLoginBridge()) serveConnectedLogin(readerCloud, organizerAppUrl())
else {
 serveConnectedLoginInTab(readerCloud, organizerAppUrl())
 const root = createRoot(document.getElementById('root')!)
 if (import.meta.env.DEV && isLocalApp() && window.self === window.top) {
  void import('../../src/app/LocalViewportPreview').then(({ LocalViewportPreview }) => {
   root.render(<LocalViewportPreview unitsAfterDimensions><App initialPairing={initialPairing} /></LocalViewportPreview>)
  })
 } else root.render(<App initialPairing={initialPairing} />)
}
