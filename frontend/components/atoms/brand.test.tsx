import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Brand } from "./brand"

describe("Brand", () => {
  it("renders the reason name and inline SVG logo", () => {
    const { container } = render(<Brand />)

    expect(screen.getByRole("link", { name: "reason" })).toHaveAttribute(
      "href",
      "/"
    )
    expect(container.querySelector("svg")).toBeInTheDocument()
    expect(container.querySelector("img")).not.toBeInTheDocument()
  })
})
