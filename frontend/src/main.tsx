import React from 'react'
import ReactDOM from 'react-dom/client'
// FIX (William 2026-08-27): usar HashRouter ao inves de BrowserRouter.
// Necessario porque o servidor web da PM (IIS/Nginx) nao faz fallback pra
// index.html em rotas SPA. HashRouter coloca a rota no hash (#/login)
// que NUNCA vai pro servidor, entao F5 sempre carrega o index.html.
import { HashRouter } from 'react-router-dom'
import App from './App'
import './index.css'

// FIX (William 2026-08-10): sub-path /viaturas/ via proxy reverso
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
)
