import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import './styles.css'

const root = createRoot(document.getElementById('root')!)
const localPreview = import.meta.env.DEV
  && ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
  && window.self === window.top

if (localPreview) {
  void import('./app/LocalViewportPreview').then(({ LocalViewportPreview }) => {
    root.render(<StrictMode><LocalViewportPreview><App /></LocalViewportPreview></StrictMode>)
  })
} else {
  root.render(<StrictMode><App /></StrictMode>)
}
