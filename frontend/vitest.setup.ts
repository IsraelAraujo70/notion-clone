import "@testing-library/jest-dom/vitest"
import { afterEach } from "vitest"
import { cleanup } from "@testing-library/react"

class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserver

function createLocalStorageMock() {
  let store = new Map<string, string>()

  return {
    get length() {
      return store.size
    },
    clear: () => {
      store = new Map()
    },
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key)
    },
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
  }
}

const localStorageMock = createLocalStorageMock()
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: localStorageMock,
})
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: localStorageMock,
})

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }),
})
Element.prototype.scrollIntoView = function scrollIntoView() {}
Element.prototype.hasPointerCapture =
  Element.prototype.hasPointerCapture ??
  function hasPointerCapture() {
    return false
  }
Element.prototype.setPointerCapture =
  Element.prototype.setPointerCapture ?? function setPointerCapture() {}
Element.prototype.releasePointerCapture =
  Element.prototype.releasePointerCapture ?? function releasePointerCapture() {}

afterEach(() => {
  cleanup()
})
