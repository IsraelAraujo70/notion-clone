import assert from "node:assert/strict"
import test from "node:test"

import {
  isAllowedAppUrl,
  isAllowedPermission,
  isSafeExternalUrl,
  resolveAppUrl,
} from "./navigation"

test("allows only the production origin in packaged builds", () => {
  assert.equal(
    isAllowedAppUrl("https://reason.israeldeveloper.com.br/dashboard", true),
    true
  )
  assert.equal(isAllowedAppUrl("http://localhost:3000", true), false)
  assert.equal(
    isAllowedAppUrl("https://reason.israeldeveloper.com.br.attacker.test", true),
    false
  )
})

test("allows loopback development origins only in development", () => {
  assert.equal(isAllowedAppUrl("http://localhost:3000/login", false), true)
  assert.equal(isAllowedAppUrl("http://127.0.0.1:3000/login", false), true)
  assert.equal(isAllowedAppUrl("http://0.0.0.0:3000/login", false), false)
})

test("rejects malformed URLs and URLs containing credentials", () => {
  assert.equal(isAllowedAppUrl("not a url", false), false)
  assert.equal(
    isAllowedAppUrl(
      "https://user:password@reason.israeldeveloper.com.br",
      false
    ),
    false
  )
})

test("opens only credential-free HTTP URLs externally", () => {
  assert.equal(isSafeExternalUrl("https://electronjs.org/docs"), true)
  assert.equal(isSafeExternalUrl("http://example.com"), true)
  assert.equal(isSafeExternalUrl("file:///tmp/example"), false)
  assert.equal(isSafeExternalUrl("reason://dashboard"), false)
  assert.equal(isSafeExternalUrl("https://user:password@example.com"), false)
})

test("allows only clipboard permissions from an application origin", () => {
  assert.equal(
    isAllowedPermission(
      "clipboard-read",
      "https://reason.israeldeveloper.com.br/dashboard",
      true
    ),
    true
  )
  assert.equal(
    isAllowedPermission(
      "clipboard-sanitized-write",
      "http://localhost:3000/dashboard",
      false
    ),
    true
  )
  assert.equal(
    isAllowedPermission(
      "notifications",
      "https://reason.israeldeveloper.com.br",
      true
    ),
    false
  )
  assert.equal(
    isAllowedPermission("clipboard-read", "https://attacker.test", true),
    false
  )
})

test("resolves safe defaults and rejects an unsafe override", () => {
  assert.equal(
    resolveAppUrl(undefined, true),
    "https://reason.israeldeveloper.com.br/dashboard"
  )
  assert.equal(
    resolveAppUrl(undefined, false),
    "http://localhost:3000/dashboard"
  )
  assert.equal(
    resolveAppUrl("http://localhost:3000", false),
    "http://localhost:3000/dashboard"
  )
  assert.equal(
    resolveAppUrl("http://localhost:3000/login", false),
    "http://localhost:3000/login"
  )
  assert.throws(
    () => resolveAppUrl("https://attacker.test", true),
    /not an allowed application URL/
  )
})
