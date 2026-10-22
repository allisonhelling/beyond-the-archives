import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

vi.stubGlobal('scrollTo', vi.fn())

// Match the native dialog API for shared confirmation dialogs in jsdom.
if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.showModal ??= function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close ??= function () { this.removeAttribute('open') }
}

// jsdom has no layout engine; browser tests exercise actual shelf measurements.
vi.stubGlobal('ResizeObserver', class {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
})

afterEach(() => cleanup())
