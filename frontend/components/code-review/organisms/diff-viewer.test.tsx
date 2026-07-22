import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { parseUnifiedPatch } from "@/lib/code-review/parse-unified-patch"
import type { ReviewLineAddress } from "@/lib/code-review/contracts"
import type { SyntaxToken } from "@/lib/code-review/tree-sitter-highlight"

import { DiffViewer } from "./diff-viewer"

const treeSitter = vi.hoisted(() => ({
  tokens: vi
    .fn<(address: ReviewLineAddress | null, content: string) => SyntaxToken[]>()
    .mockReturnValue([]),
}))

vi.mock("@/lib/code-review/tree-sitter-highlight", () => ({
  useTreeSitterHighlight: () => treeSitter.tokens,
}))

const patch = parseUnifiedPatch(
  ["@@ -1,2 +1,2 @@", " keep", "-before", "+after"].join("\n")
)

describe("DiffViewer", () => {
  beforeEach(() => treeSitter.tokens.mockReset().mockReturnValue([]))
  afterEach(() => vi.unstubAllGlobals())

  it("renders syntax tokens and wraps code inside the diff cell", () => {
    treeSitter.tokens.mockImplementation((_address, content) =>
      content === "after" ? [{ start: 0, end: 5, kind: "keyword" }] : []
    )
    render(
      <DiffViewer
        path="src/file.ts"
        patch={patch}
        viewMode="unified"
        selection={null}
        threads={[]}
        onSelectLine={vi.fn()}
      />
    )

    const highlighted = screen.getByText("after")
    expect(highlighted).toHaveClass("syntax-keyword")
    expect(highlighted.closest("code")).toHaveClass(
      "whitespace-pre-wrap",
      "[overflow-wrap:anywhere]"
    )
    expect(screen.getByRole("list", { name: "Unified code diff" })).toHaveClass(
      "min-w-0"
    )
  })

  it("renders selectable GitHub line sides and read-only inline threads", () => {
    const onSelectLine = vi.fn()
    render(
      <DiffViewer
        path="src/file.ts"
        patch={patch}
        viewMode="unified"
        selection={null}
        threads={[
          {
            id: "thread-1",
            path: "src/file.ts",
            side: "RIGHT",
            line: 2,
            isResolved: false,
            comments: [
              {
                id: "comment-1",
                author: { id: "user-1", login: "octocat" },
                body: "Please rename this.",
                createdAt: "2026-07-21T10:00:00Z",
              },
            ],
          },
        ]}
        onSelectLine={onSelectLine}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Select left line 2" }))
    expect(onSelectLine).toHaveBeenCalledWith(
      {
        path: "src/file.ts",
        hunkId: "hunk-0",
        side: "LEFT",
        line: 2,
      },
      false
    )
    expect(
      screen.getByRole("article", { name: /review thread/i })
    ).toHaveTextContent("Please rename this.")
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
  })

  it("mounts only the responsive layout selected for the current breakpoint", () => {
    const { unmount } = render(
      <DiffViewer
        path="src/file.ts"
        patch={patch}
        viewMode="split"
        selection={null}
        threads={[]}
        onSelectLine={vi.fn()}
      />
    )

    expect(
      screen.getByRole("list", { name: "Unified code diff" })
    ).toBeVisible()
    expect(
      screen.queryByRole("list", { name: "Split code diff" })
    ).not.toBeInTheDocument()
    unmount()

    vi.stubGlobal("matchMedia", matchMedia(true))
    render(
      <DiffViewer
        path="src/file.ts"
        patch={patch}
        viewMode="split"
        selection={null}
        threads={[]}
        onSelectLine={vi.fn()}
      />
    )
    expect(screen.getByRole("list", { name: "Split code diff" })).toBeVisible()
    expect(
      screen.queryByRole("list", { name: "Unified code diff" })
    ).not.toBeInTheDocument()
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
  })

  it("shows explicit binary and missing patch states", () => {
    const { rerender } = render(
      <DiffViewer
        path="logo.png"
        patch={{ kind: "binary" }}
        viewMode="unified"
        selection={null}
        threads={[]}
        onSelectLine={vi.fn()}
      />
    )
    expect(screen.getByText("Binary file cannot be displayed.")).toBeVisible()

    rerender(
      <DiffViewer
        path="large.txt"
        patch={{ kind: "missing" }}
        viewMode="unified"
        selection={null}
        threads={[]}
        onSelectLine={vi.fn()}
      />
    )
    expect(
      screen.getByText("Patch is unavailable for this file.")
    ).toBeVisible()

    rerender(
      <DiffViewer
        path="broken.txt"
        patch={{ kind: "invalid", reason: "truncated" }}
        viewMode="unified"
        selection={null}
        threads={[]}
        onSelectLine={vi.fn()}
      />
    )
    expect(
      screen.getByText("Patch is truncated and cannot be displayed safely.")
    ).toBeVisible()
  })
})

function matchMedia(matches: boolean) {
  return vi.fn().mockImplementation((media: string) => ({
    matches,
    media,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}
