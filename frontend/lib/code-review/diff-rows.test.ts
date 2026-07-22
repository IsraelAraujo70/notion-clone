import { describe, expect, it } from "vitest"

import { toSplitRows, toUnifiedRows } from "./diff-rows"
import { parseUnifiedPatch } from "./parse-unified-patch"

describe("diff row transforms", () => {
  const parsed = parseUnifiedPatch(
    [
      "@@ -4,4 +4,3 @@",
      " unchanged",
      "-old first",
      "-old second",
      "+new first",
      " trailing",
    ].join("\n")
  )

  it("keeps both GitHub addresses for context in unified rows", () => {
    const rows = toUnifiedRows("src/file.ts", parsed)
    expect(rows[1]).toMatchObject({
      type: "code",
      oldLine: 4,
      newLine: 4,
      leftAddress: {
        path: "src/file.ts",
        hunkId: "hunk-0",
        side: "LEFT",
        line: 4,
      },
      rightAddress: {
        path: "src/file.ts",
        hunkId: "hunk-0",
        side: "RIGHT",
        line: 4,
      },
    })
    expect(rows[2]).toMatchObject({
      type: "code",
      leftAddress: { side: "LEFT", line: 5 },
      rightAddress: null,
    })
  })

  it("pairs adjacent deletion and addition blocks in split rows", () => {
    const rows = toSplitRows("src/file.ts", parsed)
    expect(rows[2]).toMatchObject({
      type: "code",
      left: { content: "old first", address: { side: "LEFT", line: 5 } },
      right: { content: "new first", address: { side: "RIGHT", line: 5 } },
    })
    expect(rows[3]).toMatchObject({
      type: "code",
      left: { content: "old second", address: { side: "LEFT", line: 6 } },
      right: null,
    })
    expect(rows[4]).toMatchObject({
      type: "code",
      left: { address: { side: "LEFT", line: 7 } },
      right: { address: { side: "RIGHT", line: 6 } },
    })
  })

  it("turns unavailable patches into stable notice rows", () => {
    expect(toUnifiedRows("asset.png", { kind: "binary" })).toEqual([
      { type: "notice", id: "notice-binary", state: "binary" },
    ])
    expect(toSplitRows("large.txt", { kind: "missing" })).toEqual([
      { type: "notice", id: "notice-missing", state: "missing" },
    ])
    expect(
      toUnifiedRows("broken.txt", {
        kind: "invalid",
        reason: "truncated",
      })
    ).toEqual([{ type: "notice", id: "notice-truncated", state: "truncated" }])
  })
})
