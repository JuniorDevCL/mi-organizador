import { useEffect, useState } from 'react'

const ERRORS = {
  udp: 'Solo se puede entrar con un correo institucional UDP (@mail.udp.cl). Elige esa cuenta en Google.',
  google: 'No se pudo entrar con Google. Inténtalo de nuevo.',
  config: 'Falta configurar Google en el servidor (GOOGLE_CLIENT_SECRET y la URI de redirección).',
}

export default function AuthScreen() {
  const [error, setError] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('error')
    if (!code) return
    setError(ERRORS[code] || ERRORS.google)
    window.history.replaceState({}, '', window.location.pathname)
  }, [])

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

      <div className="auth-card">
        <h2 className="auth-card-title">Entra con tu correo UDP</h2>
        <p className="auth-card-sub">
          Te redirigimos a Google. Usa tu cuenta institucional (@mail.udp.cl), no Gmail personal.
        </p>

        {error && <p className="auth-error" role="alert">{error}</p>}

        <a className="btn-google" href="/api/auth/google">
          <GoogleMark />
          Continuar con Google
        </a>
      </div>
    </div>
  )
}

function GoogleMark() {
  return (
    <svg className="btn-google-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3.01h3.87c2.27-2.09 3.55-5.17 3.55-8.88z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.85l-3.87-3.01c-1.08.72-2.45 1.15-4.08 1.15-3.13 0-5.78-2.11-6.73-4.96H1.28v3.09A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.33A7.2 7.2 0 0 1 4.89 12c0-.81.14-1.59.38-2.33V6.58H1.28A12 12 0 0 0 0 12c0 1.94.46 3.77 1.28 5.42l3.99-3.09z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.28 6.58l3.99 3.09C6.22 6.86 8.87 4.75 12 4.75z" />
    </svg>
  )
}
