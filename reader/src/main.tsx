import { consumeReaderPairing } from '../../src/lib/reader-connection'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'
const initialPairing = consumeReaderPairing()
createRoot(document.getElementById('root')!).render(<App initialPairing={initialPairing} />)
