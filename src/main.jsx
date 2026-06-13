import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

try {
  if (JSON.parse(localStorage.getItem('app_dark_mode'))) {
    document.documentElement.classList.add('theme-dark')
  }
} catch {}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
