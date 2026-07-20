import assert from "node:assert/strict"
import test from "node:test"

import { createWindowOptions } from "./window-options"

test("keeps the remote renderer isolated, branded and sandboxed", () => {
  const options = createWindowOptions("/app/preload.js", "/app/icon.png")

  assert.equal(options.icon, "/app/icon.png")
  assert.equal(options.webPreferences?.preload, "/app/preload.js")
  assert.equal(options.webPreferences?.partition, "persist:reason")
  assert.equal(options.webPreferences?.nodeIntegration, false)
  assert.equal(options.webPreferences?.contextIsolation, true)
  assert.equal(options.webPreferences?.sandbox, true)
  assert.equal(options.webPreferences?.webSecurity, true)
  assert.equal(options.webPreferences?.allowRunningInsecureContent, false)
  assert.equal(options.webPreferences?.webviewTag, false)
})
