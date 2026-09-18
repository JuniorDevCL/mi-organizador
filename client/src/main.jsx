import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import AuthScreen from './AuthScreen.jsx'
import { api } from './api'
import { store } from './store'
import './index.css'

function applyTheme(dark) {
  document.documentElement.classList.toggle('theme-dark', !!dark)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0F0F14' : '#5238C4')
}

function Splash({ label = 'Cargando…' }) {
  return (
    <div className="splash">
      <div className="splash-logo" aria-hidden>✓</div>
      <p>{label}</p>
    </div>
  )
}

function Root() {
  const [phase, setPhase] = useState('checking') // checking | anon | loading | ready
  const [user, setUser] = useState(null)

  const enter = async (u) => {
    setUser(u)
    setPhase('loading')
    try {
      const data = await store.hydrate(u)
      applyTheme(data.app_dark_mode)
      setPhase('ready')
    } catch {
      store.reset()
      setUser(null)
      setPhase('anon')
    }
  }

  useEffect(() => {
    api.me()
      .then(({ user: u, admin }) => enter({ ...u, admin: !!admin }))
      .catch(() => setPhase('anon'))
  }, [])

  useEffect(() => store.subscribe(status => {
    if (status === 'unauthorized') {
      store.reset()
      setUser(null)
      setPhase('anon')
    }
  }), [])

  const logout = async () => {
    await store.flush()
    try { await api.logout() } catch { /* la sesión igual se cierra localmente */ }
    store.reset()
    applyTheme(false)
    setUser(null)
    setPhase('anon')
  }

  if (phase === 'checking') return <Splash />
  if (phase === 'loading') return <Splash label={`Hola ${user?.name?.split(' ')[0] || ''}, cargando tus datos…`} />
  if (phase === 'anon') return <AuthScreen />
  return <App key={user.id} user={user} onLogout={logout} />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
