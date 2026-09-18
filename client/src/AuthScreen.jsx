import { useState } from 'react'
import { api } from './api'

export default function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const isRegister = mode === 'register'
  const canSubmit = email.trim() && password.length >= 6 && (!isRegister || name.trim().length >= 2)

  const submit = async (e) => {
    e.preventDefault()
    if (!canSubmit || busy) return
    setBusy(true)
    setError('')
    try {
      const payload = isRegister
        ? await api.register(email, name, password)
        : await api.login(email, password)
      onAuthenticated({ ...payload.user, admin: !!payload.admin })
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesión')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-hero">
        <div className="auth-brand">
          <span className="auth-logo" aria-hidden>✓</span>
          <div>
            <p className="auth-kicker">Mi Centro</p>
            <h1 className="auth-title">Organización</h1>
          </div>
        </div>
        <p className="auth-lead">
          Tu checklist diario, horario, agenda y mapa Pluxee en un solo lugar,
          sincronizados entre tu teléfono y tu computador.
        </p>
        <ul className="auth-features">
          <li><span>🎯</span> Checklist «Mi recorrido» con tareas repetitivas</li>
          <li><span>📚</span> Horario semanal desde la oferta académica</li>
          <li><span>📅</span> Agenda de controles y solemnes con Google Calendar</li>
          <li><span>🗺️</span> Comercios Pluxee cerca de ti</li>
        </ul>
      </div>

      <form className="auth-card" onSubmit={submit}>
        <div className="auth-switch" role="tablist">
          <button type="button" role="tab" aria-selected={!isRegister}
            className={!isRegister ? 'active' : ''} onClick={() => { setMode('login'); setError('') }}>
            Iniciar sesión
          </button>
          <button type="button" role="tab" aria-selected={isRegister}
            className={isRegister ? 'active' : ''} onClick={() => { setMode('register'); setError('') }}>
            Crear cuenta
          </button>
        </div>

        <h2 className="auth-card-title">{isRegister ? 'Crea tu cuenta' : 'Bienvenido de vuelta'}</h2>
        <p className="auth-card-sub">
          {isRegister
            ? 'Usa tu correo institucional UDP (@mail.udp.cl) para guardar tu información.'
            : 'Entra con tu correo @mail.udp.cl y tu contraseña.'}
        </p>

        {isRegister && (
          <label className="field">
            <span>Nombre</span>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Cómo te llamamos" autoComplete="name" />
          </label>
        )}
        <label className="field">
          <span>Correo</span>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="tu@mail.udp.cl" autoComplete="email" inputMode="email" required />
        </label>
        <label className="field">
          <span>Contraseña</span>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Mínimo 6 caracteres" autoComplete={isRegister ? 'new-password' : 'current-password'} required minLength={6} />
        </label>

        {error && <p className="auth-error" role="alert">{error}</p>}

        <button type="submit" className="btn-primary auth-submit" disabled={!canSubmit || busy}>
          {busy ? 'Un momento…' : isRegister ? 'Crear cuenta' : 'Entrar'}
        </button>

        <p className="auth-foot">
          {isRegister ? '¿Ya tienes cuenta? ' : '¿Primera vez aquí? '}
          <button type="button" className="link" onClick={() => { setMode(isRegister ? 'login' : 'register'); setError('') }}>
            {isRegister ? 'Inicia sesión' : 'Crea una cuenta'}
          </button>
        </p>
      </form>
    </div>
  )
}
