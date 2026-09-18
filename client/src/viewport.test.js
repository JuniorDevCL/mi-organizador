import test from 'node:test'
import assert from 'node:assert/strict'
import { syncVisibleViewport, lockToVisibleViewport } from './viewport.js'

const installDom = ({ innerHeight = 932, visualHeight, offsetTop = 0 } = {}) => {
  const props = {}
  globalThis.document = {
    documentElement: {
      style: {
        setProperty(name, value) {
          props[name] = value
        },
      },
    },
  }
  const listeners = { window: [], visual: [] }
  globalThis.window = {
    innerHeight,
    visualViewport: visualHeight == null
      ? undefined
      : {
          height: visualHeight,
          offsetTop,
          addEventListener(_event, handler) {
            listeners.visual.push(handler)
          },
        },
    addEventListener(_event, handler) {
      listeners.window.push(handler)
    },
  }
  return { props, listeners }
}

test('usa el alto visible de Safari, no el layout viewport del iPhone Pro Max', () => {
  const { props } = installDom({ innerHeight: 932, visualHeight: 746, offsetTop: 0 })
  syncVisibleViewport()
  assert.equal(props['--app-height'], '746px')
  assert.equal(props['--app-top'], '0px')
})

test('desplaza la app cuando Safari mueve el visual viewport', () => {
  const { props } = installDom({ innerHeight: 932, visualHeight: 780, offsetTop: 47 })
  syncVisibleViewport()
  assert.equal(props['--app-height'], '780px')
  assert.equal(props['--app-top'], '47px')
})

test('si no hay visualViewport, usa innerHeight', () => {
  const { props } = installDom({ innerHeight: 844, visualHeight: undefined })
  syncVisibleViewport()
  assert.equal(props['--app-height'], '844px')
  assert.equal(props['--app-top'], '0px')
})

test('redondea fracciones de CSS pixels', () => {
  const { props } = installDom({ innerHeight: 932, visualHeight: 745.6, offsetTop: 12.4 })
  syncVisibleViewport()
  assert.equal(props['--app-height'], '746px')
  assert.equal(props['--app-top'], '12px')
})

test('registra listeners para resize, scroll y orientación', () => {
  const { listeners } = installDom({ innerHeight: 932, visualHeight: 746 })
  lockToVisibleViewport()
  assert.equal(listeners.visual.length, 2)
  assert.ok(listeners.window.length >= 2)
})
