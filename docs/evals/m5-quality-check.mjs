#!/usr/bin/env node

import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const fixtureUrl = new URL("./m5-quality-fixtures.json", import.meta.url)
const suite = JSON.parse(await readFile(fixtureUrl, "utf8"))
const expectedActions = new Set([
  "continue_writing",
  "summarize_page",
  "transform_selection",
  "workspace_agent",
])

assert.equal(suite.schemaVersion, 1)
assert.equal(suite.fixtures.length, 4)
assert.equal(suite.suiteThresholds.requiredTotalFixtures, suite.fixtures.length)
assert.equal(suite.suiteThresholds.requiredPassedFixtures, suite.fixtures.length)
assert.equal(suite.costLimits.maxRuns, suite.fixtures.length)
assert.ok(suite.costLimits.maxEmbeddingInputs >= 1)
assert.ok(suite.costLimits.maxPromptTokens > 0)
assert.ok(suite.costLimits.maxCompletionTokens > 0)

for (const fixture of suite.fixtures) {
  assert.ok(expectedActions.delete(fixture.action), `duplicate or unknown action: ${fixture.action}`)
  assert.match(fixture.id, /^[a-z0-9-]+$/)
  assert.ok(fixture.prompt.trim().length > 20, `${fixture.id} needs a specific prompt`)
  assert.ok(
    fixture.thresholds && Object.keys(fixture.thresholds).length > 0,
    `${fixture.id} needs explicit thresholds`
  )
}
assert.equal(expectedActions.size, 0, "every M5 action needs one fixture")

const qa = suite.fixtures.find(({ action }) => action === "workspace_agent")
assert.ok(qa.thresholds.minAccessibleCitations >= 1)
assert.equal(qa.thresholds.requireNoMutations, true)
const continued = suite.fixtures.find(({ action }) => action === "continue_writing")
assert.ok(continued.thresholds.minInsertedBlocks >= 2)
assert.equal(continued.thresholds.requireOrderedOperations, true)

console.log(
  `PASS - ${suite.fixtures.length}/${suite.fixtures.length} M5 fixtures define explicit quality thresholds; paid runs capped at ${suite.costLimits.maxRuns}`
)
