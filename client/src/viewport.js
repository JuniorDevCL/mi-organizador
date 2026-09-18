/** Ancla la app al viewport visible (Safari iOS / iPhone Pro Max). */

export const syncVisibleViewport = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  const viewport = window.visualViewport
  const height = Math.round(viewport?.height || window.innerHeight || 0)
  const top = Math.round(viewport?.offsetTop || 0)
  if (height <= 0) return

  const root = document.documentElement
  root.style.setProperty('--app-height', `${height}px`)
  root.style.setProperty('--app-top', `${top}px`)
}

export const lockToVisibleViewport = () => {
  if (typeof window === 'undefined') return

  syncVisibleViewport()

  const viewport = window.visualViewport
  viewport?.addEventListener('resize', syncVisibleViewport)
  viewport?.addEventListener('scroll', syncVisibleViewport)
  window.addEventListener('orientationchange', () => {
    syncVisibleViewport()
    setTimeout(syncVisibleViewport, 120)
    setTimeout(syncVisibleViewport, 400)
  })
  window.addEventListener('resize', syncVisibleViewport)
}
