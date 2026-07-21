import { describe, expect, it } from "vitest"

import { parseUnifiedPatch } from "./parse-unified-patch"

describe("parseUnifiedPatch", () => {
  it("parses headers, hunks, line numbers, and missing newline markers", () => {
    const parsed = parseUnifiedPatch(
      [
        "diff --git a/src/example.ts b/src/example.ts",
        "--- a/src/example.ts",
        "+++ b/src/example.ts",
        "@@ -10,3 +10,4 @@ export function example() {",
        " const before = true",
        "-return before",
        "+const after = false",
        "+return after",
        "\\ No newline at end of file",
        " }",
      ].join("\r\n")
    )

    expect(parsed.kind).toBe("text")
    if (parsed.kind !== "text") return
    expect(parsed.headers).toHaveLength(3)
    expect(parsed.hunks[0]).toMatchObject({
      id: "hunk-0",
      oldStart: 10,
      oldLines: 3,
      newStart: 10,
      newLines: 4,
      heading: "export function example() {",
    })
    expect(parsed.hunks[0]?.lines).toEqual([
      expect.objectContaining({
        kind: "context",
        oldLine: 10,
        newLine: 10,
        content: "const before = true",
      }),
      expect.objectContaining({
        kind: "deletion",
        oldLine: 11,
        newLine: null,
        content: "return before",
      }),
      expect.objectContaining({
        kind: "addition",
        oldLine: null,
        newLine: 11,
        content: "const after = false",
      }),
      expect.objectContaining({
        kind: "addition",
        oldLine: null,
        newLine: 12,
        content: "return after",
        noNewline: true,
      }),
      expect.objectContaining({
        kind: "context",
        oldLine: 12,
        newLine: 13,
        content: "}",
      }),
    ])
  })

  it("represents missing and binary patches without throwing", () => {
    expect(parseUnifiedPatch(null)).toEqual({ kind: "missing" })
    expect(parseUnifiedPatch("   ")).toEqual({ kind: "missing" })
    expect(
      parseUnifiedPatch("Binary files a/logo.png and b/logo.png differ")
    ).toEqual({ kind: "binary" })
    expect(parseUnifiedPatch(null, { isBinary: true })).toEqual({
      kind: "binary",
    })
  })

  it("parses a large diff without truncating it", () => {
    const lineCount = 5_000
    const patch = [
      `@@ -1,${lineCount} +1,${lineCount} @@`,
      ...Array.from({ length: lineCount }, (_, index) => ` line ${index + 1}`),
    ].join("\n")
    const parsed = parseUnifiedPatch(patch)

    expect(parsed.kind).toBe("text")
    if (parsed.kind !== "text") return
    expect(parsed.hunks[0]?.lines).toHaveLength(lineCount)
    expect(parsed.hunks[0]?.lines.at(-1)).toMatchObject({
      oldLine: lineCount,
      newLine: lineCount,
    })
  })

  it("assigns stable identities to separate valid hunks", () => {
    const parsed = parseUnifiedPatch(
      ["@@ -1 +1 @@", "-old", "+new", "@@ -8 +8 @@", " keep"].join("\n")
    )

    expect(parsed.kind).toBe("text")
    if (parsed.kind !== "text") return
    expect(parsed.hunks.map((hunk) => hunk.id)).toEqual(["hunk-0", "hunk-1"])
  })

  it("rejects hunks that exceed their declared old or new counts", () => {
    expect(parseUnifiedPatch("@@ -1 +1 @@\n keep\n+extra")).toEqual({
      kind: "invalid",
      reason: "malformed",
    })
    expect(parseUnifiedPatch("@@ -1 +1 @@\n keep\n-extra")).toEqual({
      kind: "invalid",
      reason: "malformed",
    })
  })

  it("represents an incomplete final hunk as truncated", () => {
    expect(parseUnifiedPatch("@@ -1,2 +1,2 @@\n keep")).toEqual({
      kind: "invalid",
      reason: "truncated",
    })
    expect(parseUnifiedPatch("@@ -1,2 +1,2 @@\n keep\n")).toEqual({
      kind: "invalid",
      reason: "truncated",
    })
  })

  it("rejects non-empty ranges that would generate line-zero addresses", () => {
    expect(parseUnifiedPatch("@@ -0 +1 @@\n-old\n+new")).toEqual({
      kind: "invalid",
      reason: "malformed",
    })
    expect(parseUnifiedPatch("@@ -1 +0 @@\n-old\n+new")).toEqual({
      kind: "invalid",
      reason: "malformed",
    })
  })

  it("rejects unknown lines and trailers instead of treating them as context", () => {
    expect(parseUnifiedPatch("@@ -1 +1 @@\nunknown")).toEqual({
      kind: "invalid",
      reason: "malformed",
    })
    expect(parseUnifiedPatch("@@ -1 +1 @@\n keep\ntrailer")).toEqual({
      kind: "invalid",
      reason: "malformed",
    })
    expect(parseUnifiedPatch("not a patch")).toEqual({
      kind: "invalid",
      reason: "malformed",
    })
  })
})
