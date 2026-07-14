import { describe, expect, it } from "vitest"

import { citationPath } from "./citations"

describe("citationPath", () => {
  it("targets the cited page and exact block", () => {
    expect(
      citationPath({
        workspace_id: "workspace-2",
        page_id: "page/a",
        page_title: "Source",
        block_id: "block & 1",
        snippet: "Evidence",
      })
    ).toBe("/dashboard/pages/page/a?block=block+%26+1")
  })
})
