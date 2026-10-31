import { isLoginBridge, organizerAppUrl, serveConnectedLogin } from '../../src/lib/connected-login'
import { readerCloud } from './cloud'
import { consumeReaderPairing } from '../../src/lib/reader-connection'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'
const initialPairing = consumeReaderPairing()
if (isLoginBridge()) serveConnectedLogin(readerCloud, organizerAppUrl())
else createRoot(document.getElementById('root')!).render(<App initialPairing={initialPairing} />)
