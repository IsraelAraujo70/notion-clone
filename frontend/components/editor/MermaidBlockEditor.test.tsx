import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { MermaidBlockEditor } from "./MermaidBlockEditor"

const mermaidMocks = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(),
}))

vi.mock("mermaid", () => ({ default: mermaidMocks }))
vi.mock("@/components/theme/theme-provider", () => ({
  useAppTheme: () => ({ mode: "light" }),
}))

function props() {
  return {
    blockId: "mermaid-1",
    value: "flowchart LR\n  A --> B",
    readOnly: false,
    onChange: vi.fn(),
    onFocus: vi.fn(),
    onBlur: vi.fn(),
    onExit: vi.fn(),
    onMergeBackward: vi.fn(),
    onMoveFocus: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
  }
}

afterEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe("MermaidBlockEditor", () => {
  it("renders Mermaid with the locked-down configuration", async () => {
    mermaidMocks.render.mockResolvedValue({
      svg: '<svg data-testid="rendered-diagram"></svg>',
    })

    render(<MermaidBlockEditor {...props()} />)

    await waitFor(() =>
      expect(mermaidMocks.initialize).toHaveBeenCalledWith(
        expect.objectContaining({
          securityLevel: "strict",
          htmlLabels: false,
          maxTextSize: 50_000,
          maxEdges: 500,
        })
      )
    )
    expect(await screen.findByTestId("rendered-diagram")).toBeVisible()
  })

  it("keeps the last valid preview when the next source is invalid", async () => {
    mermaidMocks.render
      .mockResolvedValueOnce({ svg: '<svg data-testid="valid-diagram"></svg>' })
      .mockRejectedValueOnce(new Error("invalid"))
    const editorProps = props()
    const { rerender } = render(<MermaidBlockEditor {...editorProps} />)

    expect(
      await screen.findByTestId("valid-diagram", {}, { timeout: 1_000 })
    ).toBeVisible()
    rerender(<MermaidBlockEditor {...editorProps} value="not a diagram" />)

    expect(
      await screen.findByRole("alert", {}, { timeout: 1_000 })
    ).toHaveTextContent("Mermaid syntax could not be rendered")
    expect(screen.getByTestId("valid-diagram")).toBeVisible()
  })

  it("edits through the supplied operation callback", async () => {
    mermaidMocks.render.mockResolvedValue({ svg: "<svg></svg>" })
    const onChange = vi.fn()
    render(<MermaidBlockEditor {...props()} onChange={onChange} />)

    fireEvent.click(screen.getByRole("button", { name: "Edit diagram" }))
    fireEvent.change(screen.getByRole("textbox", { name: "Mermaid source" }), {
      target: { value: "sequenceDiagram" },
    })

    expect(onChange).toHaveBeenCalledWith("sequenceDiagram")
    await waitFor(() => expect(mermaidMocks.render).toHaveBeenCalled())
  })

  it("does not restore a stale render after the source is cleared", async () => {
    let resolveRender: ((value: { svg: string }) => void) | undefined
    mermaidMocks.render.mockReturnValue(
      new Promise((resolve) => {
        resolveRender = resolve
      })
    )
    const editorProps = props()
    const { rerender } = render(<MermaidBlockEditor {...editorProps} />)
    await waitFor(() => expect(mermaidMocks.render).toHaveBeenCalled())

    rerender(<MermaidBlockEditor {...editorProps} value="" />)
    await act(async () => {
      resolveRender?.({ svg: '<svg data-testid="stale-diagram"></svg>' })
    })

    expect(screen.queryByTestId("stale-diagram")).toBeNull()
    expect(
      screen.getByText("Add Mermaid source to render a diagram")
    ).toBeVisible()
  })
})
