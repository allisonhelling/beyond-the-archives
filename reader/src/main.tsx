import { isLoginBridge, organizerAppUrl, serveConnectedLogin, serveConnectedLoginInTab } from '../../src/lib/connected-login'
import { readerCloud } from './cloud'
import { consumePendingReaderPairing, consumeReaderPairing } from '../../src/lib/reader-connection'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'
const initialPairing = consumeReaderPairing() ?? consumePendingReaderPairing()
if (isLoginBridge()) serveConnectedLogin(readerCloud, organizerAppUrl())
else {
 serveConnectedLoginInTab(readerCloud, organizerAppUrl())
 createRoot(document.getElementById('root')!).render(<App initialPairing={initialPairing} />)
}
