import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

beforeEach(() => {
  // Reinstall browser API stubs after suites that restore their own globals.
  vi.stubGlobal('scrollTo', vi.fn())
  vi.stubGlobal('ResizeObserver', class {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  })

  // Persisted preferences and review drafts belong to one test, including
  // remounts. Node versions without browser storage may expose an empty object.
  if (typeof window === 'undefined') return
  window.localStorage?.clear?.()
  window.sessionStorage?.clear?.()
})

// Match the native dialog API for shared confirmation dialogs in jsdom.
if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.showModal ??= function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close ??= function () { this.removeAttribute('open') }
}

afterEach(() => cleanup())
