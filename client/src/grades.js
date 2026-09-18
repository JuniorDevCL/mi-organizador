/** Calculadora de notas UDP (escala 1.0–7.0). */

export function clampGrade(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.min(7, Math.max(1, Math.round(n * 10) / 10))
}

export function roundGrade(value) {
  if (!Number.isFinite(value)) return null
  return Math.round(value * 10) / 10
}

export function presentationAverage(items = []) {
  const rows = items
    .map((item) => ({
      weight: Number(item.weight) || 0,
      grade: clampGrade(item.grade),
    }))
    .filter((item) => item.weight > 0 && item.grade != null)
  const weight = rows.reduce((sum, item) => sum + item.weight, 0)
  if (!weight) return { np: null, weight: 0, complete: false }
  const np = rows.reduce((sum, item) => sum + item.grade * item.weight, 0) / weight
  return { np: roundGrade(np), weight, complete: Math.abs(weight - 100) < 0.5 }
}

export function finalGrade({
  items = [],
  examGrade = null,
  examWeight = 30,
  exemptAt = 5.0,
  failBelow = 4.0,
} = {}) {
  const { np, weight, complete } = presentationAverage(items)
  const exam = examGrade === '' || examGrade == null ? null : clampGrade(examGrade)
  const examPct = Number(examWeight)
  const safeExamPct = Number.isFinite(examPct) ? Math.min(70, Math.max(0, examPct)) : 30
  const npPct = 100 - safeExamPct

  if (np == null) {
    return { np: null, nf: null, exam, status: 'incompleto', detail: 'Faltan notas de presentación', complete, weight, examWeight: safeExamPct }
  }
  if (failBelow != null && np < failBelow) {
    return {
      np, nf: np, exam, complete, weight, examWeight: safeExamPct,
      status: 'reprobado',
      detail: `Nota de presentación ${np.toFixed(1)} < ${Number(failBelow).toFixed(1)}`,
    }
  }
  if (exemptAt != null && np >= exemptAt) {
    return {
      np, nf: np, exam, complete, weight, examWeight: safeExamPct,
      status: 'eximido',
      detail: `NP ${np.toFixed(1)} ≥ ${Number(exemptAt).toFixed(1)}: eximido de examen`,
    }
  }
  if (exam == null) {
    return {
      np, nf: null, exam, complete, weight, examWeight: safeExamPct,
      status: 'examen',
      detail: `Debe dar examen (${safeExamPct}% de la nota final)`,
    }
  }
  const nf = roundGrade((np * npPct + exam * safeExamPct) / 100)
  return {
    np, nf, exam, complete, weight, examWeight: safeExamPct,
    status: nf >= 4 ? 'aprobado' : 'reprobado',
    detail: `NF = ${npPct}% · NP ${np.toFixed(1)} + ${safeExamPct}% · examen ${exam.toFixed(1)}`,
  }
}

export function emptyCourse(name = '') {
  return {
    name,
    items: [
      { id: 's1', label: 'Solemne 1', weight: 30, grade: '' },
      { id: 's2', label: 'Solemne 2', weight: 30, grade: '' },
      { id: 'p', label: 'Parciales / controles', weight: 40, grade: '' },
    ],
    examGrade: '',
    examWeight: 30,
    exemptAt: 5,
    failBelow: 4,
  }
}
