import { isLoginBridge, readerAppUrl, serveConnectedLogin } from './lib/connected-login'
import { supabase } from './lib/supabase'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import './styles.css'
import './features/library/browsing/browsing.css'
import './features/library/display/display.css'
import './features/library/summaries/summary.css'
import { isLocalApp } from './lib/local-app'

const root = createRoot(document.getElementById('root')!)
const localPreview = import.meta.env.DEV
  && isLocalApp()
  && window.self === window.top

if (isLoginBridge()) {
  if (supabase) serveConnectedLogin(supabase, readerAppUrl())
} else if (localPreview) {
  void import('./app/LocalViewportPreview').then(({ LocalViewportPreview }) => {
    root.render(<StrictMode><LocalViewportPreview><App /></LocalViewportPreview></StrictMode>)
  })
} else {
  root.render(<StrictMode><App /></StrictMode>)
}

if (!isLoginBridge() && import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/sw.js').catch(() => { /* Online use remains available when storage is blocked. */ })
}
