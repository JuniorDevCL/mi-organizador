import { useEffect, useState } from 'react'
import { dateKey, formatLongDate, greetingForHour } from './checklist'
import { checklistPulse, relativeDayLabel, todayClasses, upcomingEvents } from './dashboard'
import { shortEventType } from './offeringParser'

const TYPE_LABEL = {
  control: 'Control',
  solemne: 'Solemne',
  tarea: 'Tarea',
  otro: 'Otro',
}

export default function HomeTab({ firstName, schedule, events, daysMap, onOpen }) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(timer)
  }, [])

  const day = todayClasses(schedule, now)
  const upcoming = upcomingEvents(events, now)
  const tasks = daysMap?.[dateKey(now)] || []
  const pulse = checklistPulse(tasks)
  const greeting = greetingForHour(now.getHours())

  return (
    <div className="home">
      <section className="home-hero">
        <p className="home-kicker">{greeting}{firstName ? `, ${firstName}` : ''}</p>
        <h2 className="home-title">Tu día</h2>
        <p className="home-date">{formatLongDate(now)}</p>
        <div className="home-stats">
          <button type="button" className="home-stat" onClick={() => onOpen('schedule')}>
            <strong>{day.blocks.length}</strong>
            <span>{day.blocks.length === 1 ? 'clase hoy' : 'clases hoy'}</span>
          </button>
          <button type="button" className="home-stat" onClick={() => onOpen('calendar')}>
            <strong>{upcoming.total}</strong>
            <span>{upcoming.total === 1 ? 'evento cerca' : 'eventos cerca'}</span>
          </button>
          <button type="button" className="home-stat" onClick={() => onOpen('goals')}>
            <strong>{pulse.total ? `${pulse.done}/${pulse.total}` : '0'}</strong>
            <span>recorrido</span>
          </button>
        </div>
      </section>

      {day.current && (
        <button type="button" className="home-now" onClick={() => onOpen('schedule')}>
          <span>Ahora</span>
          <strong>{day.current.subject || day.current.courseName}</strong>
          <em>{day.current.startTime}–{day.current.endTime}</em>
        </button>
      )}

      <section className="home-section">
        <div className="home-section-head">
          <h3 className="campus-h">Horario de hoy</h3>
          <button type="button" className="home-link" onClick={() => onOpen('schedule')}>Ver semana</button>
        </div>
        {day.weekend && (
          <p className="home-empty">Fin de semana. No hay bloques en el horario.</p>
        )}
        {!day.weekend && day.blocks.length === 0 && (
          <p className="home-empty">
            Hoy no tienes clases cargadas.{' '}
            <button type="button" className="home-link" onClick={() => onOpen('settings')}>Armar horario</button>
          </p>
        )}
        {day.blocks.map((block) => {
          const state = block.id && day.current?.id === block.id
            ? 'now'
            : block.id && day.next?.id === block.id
              ? 'next'
              : ''
          return (
            <button
              key={block.id || `${block.startTime}-${block.subject}`}
              type="button"
              className={`home-row ${state}`}
              onClick={() => onOpen('schedule')}
            >
              <span className="home-time">{block.startTime}–{block.endTime}</span>
              <span className="home-copy">
                <span className="home-subject">{block.subject || block.courseName || 'Clase'}</span>
                <span className="home-meta">
                  {state === 'now' ? 'En curso' : state === 'next' ? 'Siguiente' : 'Hoy'}
                  {block.eventType ? ` · ${shortEventType(block.eventType)}` : ''}
                  {block.location ? ` · ${block.location}` : ''}
                </span>
              </span>
            </button>
          )
        })}
      </section>

      <section className="home-section">
        <div className="home-section-head">
          <h3 className="campus-h">Eventos cercanos</h3>
          <button type="button" className="home-link" onClick={() => onOpen('calendar')}>Agenda</button>
        </div>
        {upcoming.items.length === 0 && (
          <p className="home-empty">Nada en los próximos 14 días.</p>
        )}
        {upcoming.items.map((event) => (
          <button
            key={event.id || `${event.date}-${event.title}`}
            type="button"
            className="home-row"
            onClick={() => onOpen('calendar')}
          >
            <span className="home-time">{event.time || 'Día'}</span>
            <span className="home-copy">
              <span className="home-subject">{event.title || 'Evento'}</span>
              <span className="home-meta">
                {TYPE_LABEL[event.type] || 'Evento'} · {relativeDayLabel(event.date, now)}
              </span>
            </span>
          </button>
        ))}
        {upcoming.total > upcoming.items.length && (
          <p className="home-more">+{upcoming.total - upcoming.items.length} más en la agenda</p>
        )}
      </section>

      <section className="home-section">
        <div className="home-section-head">
          <h3 className="campus-h">Mi recorrido</h3>
          <button type="button" className="home-link" onClick={() => onOpen('goals')}>Abrir</button>
        </div>
        <button type="button" className="home-row home-checklist" onClick={() => onOpen('goals')}>
          <span className="home-copy">
            <span className="home-subject">
              {pulse.total === 0 ? 'Sin tareas para hoy' : `${pulse.done} de ${pulse.total} listas`}
            </span>
            <span className="home-meta">
              {pulse.next
                ? `Siguiente: ${pulse.next.emoji ? `${pulse.next.emoji} ` : ''}${pulse.next.name}${pulse.next.time ? ` · ${pulse.next.time}` : ''}`
                : pulse.total > 0
                  ? 'Día completo'
                  : 'Agrega una tarea en Mi recorrido'}
            </span>
            {pulse.total > 0 && (
              <span className="home-progress" aria-hidden>
                <span style={{ width: `${pulse.pct}%` }} />
              </span>
            )}
          </span>
        </button>
      </section>
    </div>
  )
}
