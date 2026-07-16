import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"

import { Sidebar, SidebarProvider, SidebarRail } from "@/components/ui/sidebar"

const WIDTH_KEY = "reason:sidebar-width:v1"

function TestSidebar() {
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarRail />
      </Sidebar>
    </SidebarProvider>
  )
}

function wrapper() {
  return document.querySelector<HTMLElement>('[data-slot="sidebar-wrapper"]')!
}

function desktopSidebar() {
  return document.querySelector<HTMLElement>(
    '[data-slot="sidebar"][data-state]'
  )!
}

describe("SidebarRail", () => {
  beforeEach(() => {
    window.localStorage.clear()
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1280,
    })
  })

  it("restores a valid expanded width and ignores invalid saved values", async () => {
    window.localStorage.setItem(WIDTH_KEY, "360")
    const { unmount } = render(<TestSidebar />)

    await waitFor(() =>
      expect(wrapper().style.getPropertyValue("--sidebar-width")).toBe("360px")
    )
    unmount()

    window.localStorage.setItem(WIDTH_KEY, "360px")
    render(<TestSidebar />)
    await waitFor(() =>
      expect(wrapper().style.getPropertyValue("--sidebar-width")).toBe("240px")
    )
  })

  it("reclamps the stored width when the viewport gets narrower", async () => {
    window.localStorage.setItem(WIDTH_KEY, "480")
    render(<TestSidebar />)

    await waitFor(() =>
      expect(wrapper().style.getPropertyValue("--sidebar-width")).toBe("480px")
    )

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 800,
    })
    fireEvent(window, new Event("resize"))

    await waitFor(() =>
      expect(wrapper().style.getPropertyValue("--sidebar-width")).toBe("320px")
    )
    expect(window.localStorage.getItem(WIDTH_KEY)).toBe("320")
  })

  it("resizes after the drag threshold, persists the width, and does not collapse", async () => {
    render(<TestSidebar />)
    const rail = screen.getByRole("button", {
      name: "Resize or toggle sidebar",
    })

    fireEvent.pointerDown(rail, { pointerId: 1, clientX: 240 })
    fireEvent.pointerMove(rail, { pointerId: 1, clientX: 243 })
    expect(wrapper().style.getPropertyValue("--sidebar-width")).toBe("240px")

    fireEvent.pointerMove(rail, { pointerId: 1, clientX: 360 })
    fireEvent.pointerUp(rail, { pointerId: 1, clientX: 360 })
    fireEvent.click(rail)

    await waitFor(() =>
      expect(wrapper().style.getPropertyValue("--sidebar-width")).toBe("360px")
    )
    await waitFor(() =>
      expect(window.localStorage.getItem(WIDTH_KEY)).toBe("360")
    )
    expect(desktopSidebar()).toHaveAttribute("data-state", "expanded")
  })

  it("supports keyboard resize bounds and click collapse", async () => {
    render(<TestSidebar />)
    const rail = screen.getByRole("button", {
      name: "Resize or toggle sidebar",
    })

    fireEvent.keyDown(rail, { key: "ArrowRight", shiftKey: true })
    await waitFor(() =>
      expect(wrapper().style.getPropertyValue("--sidebar-width")).toBe("272px")
    )

    fireEvent.keyDown(rail, { key: "Home" })
    await waitFor(() =>
      expect(wrapper().style.getPropertyValue("--sidebar-width")).toBe("200px")
    )

    fireEvent.keyDown(rail, { key: "End" })
    await waitFor(() =>
      expect(wrapper().style.getPropertyValue("--sidebar-width")).toBe("480px")
    )

    fireEvent.click(rail)
    expect(desktopSidebar()).toHaveAttribute("data-state", "collapsed")
  })
})
