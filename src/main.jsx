import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { applyBrand } from './config/applyBrand'
import { applyEnvBadge } from './config/applyEnvBadge'
import { LanguageProvider } from './contexts/LanguageContext'

applyBrand()
applyEnvBadge()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LanguageProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </LanguageProvider>
  </StrictMode>,
)
