import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PanelToastProvider } from './components/PanelToastProvider.tsx'
import { PanelConfirmProvider } from './components/PanelConfirmProvider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PanelConfirmProvider>
      <PanelToastProvider>
        <App />
      </PanelToastProvider>
    </PanelConfirmProvider>
  </StrictMode>,
)
