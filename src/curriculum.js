export const CURRICULUM = [
  {
    semester: 1,
    year: 1,
    courses: ['CBM1000', 'CBM1001', 'CFQ1000', 'CIT1000'],
  },
  {
    semester: 2,
    year: 1,
    courses: ['CBM1002', 'CBM1003', 'CBF1000', 'CIT1010'],
  },
  {
    semester: 3,
    year: 2,
    courses: ['CBM1005', 'CBM1006', 'CBF1001', 'CIT2006', 'CIT2114'],
  },
  {
    semester: 4,
    year: 2,
    courses: ['CIT2204', 'CIT2107', 'CBF1002', 'CIT2007', 'CIT2008'],
  },
  {
    semester: 5,
    year: 3,
    courses: ['CII2750', 'CIT2108', 'CIT2205', 'CIT2009'],
  },
  {
    semester: 6,
    year: 3,
    courses: ['CII1000', 'CIT2109', 'CIT2110', 'CIT2010'],
  },
  {
    semester: 7,
    year: 4,
    courses: ['CIT2206', 'CIT2011', 'CIT2111', 'CIT2012'],
  },
  {
    semester: 8,
    year: 4,
    courses: ['CII2100', 'CIT2112', 'CIT2113', 'CIT2013', 'CIT2207'],
  },
  {
    semester: 9,
    year: 5,
    courses: ['CIT3100', 'CIT3000', 'CIT3202', 'CIT4001'],
    note: 'Los electivos profesionales se agregan manualmente.',
  },
  {
    semester: 10,
    year: 5,
    courses: ['CIT3203'],
    note: 'Los electivos profesionales se agregan manualmente.',
  },
  {
    semester: 11,
    year: '5½',
    courses: ['CIT4002'],
  },
]

export const getCurriculumSemester = (semester) =>
  CURRICULUM.find(item => item.semester === Number(semester))

export const matchSemesterCourses = (offering, semester) => {
  const plan = getCurriculumSemester(semester)
  if (!offering || !plan) return { plan, available: [], missing: [] }

  return {
    plan,
    available: plan.courses.filter(code => offering.courses[code]),
    missing: plan.courses.filter(code => !offering.courses[code]),
  }
}
