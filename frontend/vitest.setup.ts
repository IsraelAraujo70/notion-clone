import "@testing-library/jest-dom/vitest"
import { afterEach } from "vitest"
import { cleanup } from "@testing-library/react"

class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserver
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
