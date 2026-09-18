import { useMemo, useState } from 'react'
import { LS } from './store'
import {
  SOLEMNES_META,
  collectCourses,
  isInAgenda,
  matchSolemnes,
  schoolFromCareerId,
  toCalendarEvent,
} from './solemnes.js'

export default function SolemnesPanel({
  courseOptions = [],
  schedule = [],
  events = [],
  onImport,
}) {
  const [mode, setMode] = useState('mine')
  const [query, setQuery] = useState('')
  const careerId = LS.get('app_career_v1', '')
  const school = schoolFromCareerId(careerId)

  const courses = useMemo(
    () => collectCourses(courseOptions, schedule),
    [courseOptions, schedule],
  )

  const { days, mine } = useMemo(
    () => matchSolemnes(courses, { school, query }),
    [courses, school, query],
  )

  const pending = mine.filter((exam) => !isInAgenda(events, exam))
  const showing = mode === 'mine' ? mine : days.flatMap((day) => day.slots.flatMap((slot) => slot.exams))

  const addOne = (exam) => {
    if (isInAgenda(events, exam)) return
    onImport?.([toCalendarEvent(exam)])
  }

  const addAll = () => {
    if (!pending.length) return
    onImport?.(pending.map(toCalendarEvent))
  }

  return (
    <section className="campus-card sol-panel">
      <div className="campus-card-head">
        <div>
          <p className="nota-kicker">Ingeniería 2026-2</p>
          <h2 className="sol-title">{SOLEMNES_META.label}</h2>
        </div>
        {school ? <span className="sol-school">{school}</span> : null}
      </div>
      <p className="campus-muted">
        {SOLEMNES_META.sourceNote}
        {school ? ` Filtrado por escuela ${school} cuando el ramo está repetido.` : ' Elige tu carrera en Config para distinguir EIT, EII y EOC.'}
      </p>

      <div className="campus-toolbar wrap">
        <button type="button" className={`pill ${mode === 'mine' ? 'active' : ''}`} onClick={() => setMode('mine')}>
          Mis ramos{mine.length ? ` (${mine.length})` : ''}
        </button>
        <button type="button" className={`pill ${mode === 'all' ? 'active' : ''}`} onClick={() => setMode('all')}>
          Calendario completo
        </button>
      </div>

      <label className="field">
        <span>Buscar ramo</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Programación, Cálculo, Data Science…"
        />
      </label>

      {mode === 'mine' && courses.length === 0 && (
        <p className="campus-banner">
          Agrega tus ramos en Config (o genera el horario) para ver solo tus solemnes.
        </p>
      )}

      {mode === 'mine' && courses.length > 0 && mine.length === 0 && (
        <p className="campus-banner">
          Ninguna solemne coincide con tus ramos. El calendario cubre Ingeniería (EIT, EII y EOC);
          prueba «Calendario completo» o revisa el nombre del ramo.
        </p>
      )}

      {mode === 'mine' && pending.length > 0 && (
        <button type="button" className="btn-primary-inline sol-add-all" onClick={addAll}>
          Agregar {pending.length === 1 ? '1 solemne' : `${pending.length} solemnes`} a la agenda
        </button>
      )}

      {mode === 'mine' ? (
        <div className="sol-list">
          {mine.map((exam) => (
            <ExamRow
              key={exam.id}
              exam={exam}
              inAgenda={isInAgenda(events, exam)}
              onAdd={() => addOne(exam)}
            />
          ))}
        </div>
      ) : (
        <div className="sol-week">
          {days.map((day) => (
            <div key={day.day} className="sol-day">
              <p className="sala-day-name">{day.title}</p>
              {day.slots.map((slot) => (
                <div key={`${day.day}-${slot.start}`} className="sol-slot">
                  <p className="sol-slot-time">{slot.start}–{slot.end}</p>
                  {slot.exams.length === 0 && <p className="campus-muted">—</p>}
                  {slot.exams.map((exam) => (
                    <button
                      key={exam.id}
                      type="button"
                      className={`sol-pill ${exam.matched ? 'match' : 'dim'}`}
                      onClick={() => exam.matched && addOne(exam)}
                      disabled={!exam.matched || isInAgenda(events, exam)}
                    >
                      {exam.examName}
                      {exam.matched ? (isInAgenda(events, exam) ? ' · en agenda' : ' · agregar') : ''}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {mode === 'all' && query && showing.length === 0 && (
        <p className="campus-muted">Sin resultados para «{query}».</p>
      )}
    </section>
  )
}

function ExamRow({ exam, inAgenda, onAdd }) {
  return (
    <article className="sol-exam">
      <div>
        <p className="sol-exam-name">{exam.courseName || exam.examName}</p>
        <p className="sol-exam-meta">
          {exam.dayLabel} · {exam.start}–{exam.end}
          {exam.courseName && exam.courseName !== exam.examName ? ` · ${exam.examName}` : ''}
        </p>
      </div>
      {inAgenda ? (
        <span className="sol-status">En la agenda</span>
      ) : (
        <button type="button" className="pill active" onClick={onAdd}>Agregar</button>
      )}
    </article>
  )
}
