import { useMemo, useState } from 'react'
import { emptyCourse, finalGrade } from './grades.js'

const STATUS = {
  incompleto: 'Faltan notas',
  examen: 'Va a examen',
  eximido: 'Eximido',
  aprobado: 'Aprobado',
  reprobado: 'Reprobado',
}

const courseNamesFromSchedule = (schedule) => {
  const names = []
  for (const block of schedule || []) {
    const name = block.subject || block.courseName
    if (name && !names.includes(name)) names.push(name)
  }
  return names.sort((a, b) => a.localeCompare(b, 'es'))
}

export default function NotasTab({ schedule = [], grades, setGrades }) {
  const catalog = useMemo(() => courseNamesFromSchedule(schedule), [schedule])
  const courses = grades?.courses || {}
  const ids = Object.keys(courses)
  const [active, setActive] = useState(ids[0] || '')
  const [draftName, setDraftName] = useState('')

  const course = courses[active]
  const result = course ? finalGrade(course) : null

  const update = (next) => {
    setGrades({ courses: { ...courses, [active]: next } })
  }

  const addCourse = (name) => {
    const label = String(name || '').trim()
    if (!label) return
    const id = label.toLowerCase().replace(/\s+/g, '-')
    if (!courses[id]) {
      setGrades({ courses: { ...courses, [id]: emptyCourse(label) } })
    }
    setActive(id)
    setDraftName('')
  }

  const setItem = (itemId, field, value) => {
    update({
      ...course,
      items: course.items.map((item) => item.id === itemId ? { ...item, [field]: value } : item),
    })
  }

  return (
    <div className="campus-page">
      <p className="campus-note">
        Calculadora personal (escala 1.0 a 7.0). Por defecto NF = 70% presentación + 30% examen,
        eximición con NP ≥ 5.0 y reprobación con NP &lt; 4.0. Ajústalo al syllabus de cada ramo.
      </p>

      <div className="campus-toolbar wrap">
        {ids.map((id) => (
          <button key={id} type="button" className={`pill ${active === id ? 'active' : ''}`} onClick={() => setActive(id)}>
            {courses[id].name}
          </button>
        ))}
      </div>

      <div className="friend-invite">
        <label className="field" style={{ flex: 1 }}>
          <span>Agregar ramo</span>
          <input
            list="notas-ramos"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder={catalog[0] || 'Nombre del ramo'}
          />
          <datalist id="notas-ramos">
            {catalog.map((name) => <option key={name} value={name} />)}
          </datalist>
        </label>
        <button type="button" className="btn-primary-inline" onClick={() => addCourse(draftName)}>Crear</button>
      </div>

      {!course && <p className="campus-muted">Crea un ramo para empezar a cargar notas.</p>}

      {course && (
        <>
          <div className={`nota-result ${result.status}`}>
            <p className="nota-kicker">{STATUS[result.status]}</p>
            <p className="nota-big">
              NP {result.np?.toFixed(1) || '—'}
              <span> · NF {result.nf?.toFixed(1) || '—'}</span>
            </p>
            <p className="campus-muted">{result.detail}</p>
          </div>

          {course.items.map((item) => (
            <div key={item.id} className="nota-row">
              <input
                aria-label="Evaluación"
                value={item.label}
                onChange={(e) => setItem(item.id, 'label', e.target.value)}
              />
              <input
                aria-label="Ponderación"
                type="number" min="0" max="100"
                value={item.weight}
                onChange={(e) => setItem(item.id, 'weight', Number(e.target.value))}
              />
              <input
                aria-label="Nota"
                type="number" min="1" max="7" step="0.1"
                value={item.grade}
                placeholder="Nota"
                onChange={(e) => setItem(item.id, 'grade', e.target.value)}
              />
              <button type="button" className="btn-ghost" onClick={() => update({
                ...course,
                items: course.items.filter((row) => row.id !== item.id),
              })}>✕</button>
            </div>
          ))}
          <button type="button" className="pill" onClick={() => update({
            ...course,
            items: [...course.items, { id: `n${Date.now()}`, label: 'Nueva evaluación', weight: 0, grade: '' }],
          })}>+ Evaluación</button>

          <div className="nota-exam">
            <label className="field">
              <span>Examen (nota)</span>
              <input type="number" min="1" max="7" step="0.1" value={course.examGrade}
                onChange={(e) => update({ ...course, examGrade: e.target.value })} />
            </label>
            <label className="field">
              <span>% examen</span>
              <input type="number" min="0" max="70" value={course.examWeight}
                onChange={(e) => update({ ...course, examWeight: Number(e.target.value) })} />
            </label>
            <label className="field">
              <span>Exime con NP ≥</span>
              <input type="number" min="1" max="7" step="0.1" value={course.exemptAt}
                onChange={(e) => update({ ...course, exemptAt: Number(e.target.value) })} />
            </label>
            <label className="field">
              <span>Reprueba NP &lt;</span>
              <input type="number" min="1" max="7" step="0.1" value={course.failBelow}
                onChange={(e) => update({ ...course, failBelow: Number(e.target.value) })} />
            </label>
          </div>

          <button type="button" className="btn-ghost" onClick={() => {
            const next = { ...courses }
            delete next[active]
            setGrades({ courses: next })
            setActive(Object.keys(next)[0] || '')
          }}>Eliminar este ramo</button>
        </>
      )}
    </div>
  )
}
