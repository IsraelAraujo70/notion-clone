import assert from "node:assert/strict"
import test from "node:test"
import type { WebContents } from "electron"

import { secureWindowNavigation } from "./window-navigation"

type PreventableEvent = {
  preventDefault: () => void
}

type NavigationHandler = (event: PreventableEvent, url: string) => void

test("guards server redirects with the same origin policy as navigations", () => {
  const handlers = new Map<string, NavigationHandler>()
  const webContents = {
    on: (event: string, handler: NavigationHandler) => {
      handlers.set(event, handler)
      return webContents
    },
    setWindowOpenHandler: () => undefined,
  } as unknown as WebContents
  const externalUrls: string[] = []

  secureWindowNavigation(
    webContents,
    true,
    () => undefined,
    (url) => externalUrls.push(url)
  )

  assert.equal(handlers.has("will-navigate"), true)
  assert.equal(handlers.has("will-redirect"), true)

  let prevented = false
  handlers.get("will-redirect")?.(
    { preventDefault: () => (prevented = true) },
    "https://example.com/redirected"
  )
  assert.equal(prevented, true)
  assert.deepEqual(externalUrls, ["https://example.com/redirected"])

  prevented = false
  handlers.get("will-redirect")?.(
    { preventDefault: () => (prevented = true) },
    "https://reason.israeldeveloper.com.br/dashboard"
  )
  assert.equal(prevented, false)

  prevented = false
  handlers.get("will-redirect")?.(
    { preventDefault: () => (prevented = true) },
    "file:///tmp/untrusted"
  )
  assert.equal(prevented, true)
  assert.deepEqual(externalUrls, ["https://example.com/redirected"])
})
