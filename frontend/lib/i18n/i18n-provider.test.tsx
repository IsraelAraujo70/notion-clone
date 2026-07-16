import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { I18nProvider, LOCALE_STORAGE_KEY, useI18n } from "./i18n-provider"

function Probe() {
  const { locale, setLocale, t } = useI18n()

  return (
    <div>
      <p>{locale}</p>
      <p>{t("Expires on {date}.", { date: "Friday" })}</p>
      <button type="button" onClick={() => setLocale("pt-BR")}>
        Switch to Portuguese
      </button>
      <button type="button" onClick={() => setLocale("en")}>
        Switch to English
      </button>
    </div>
  )
}

describe("i18n context", () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.lang = ""
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("uses English by default without a provider", () => {
    render(<Probe />)

    expect(screen.getByText("en")).toBeInTheDocument()
    expect(screen.getByText("Expires on Friday.")).toBeInTheDocument()
  })

  it("switches to pt-BR, interpolates, and persists the locale", async () => {
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>
    )

    expect(screen.getByText("Expires on Friday.")).toBeInTheDocument()
    await waitFor(() => {
      expect(document.documentElement.lang).toBe("en")
      expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull()
    })
    await userEvent.click(
      screen.getByRole("button", { name: "Switch to Portuguese" })
    )

    expect(screen.getByText("Expira em Friday.")).toBeInTheDocument()
    await waitFor(() => {
      expect(document.documentElement.lang).toBe("pt-BR")
      expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("pt-BR")
    })
  })

  it("restores a stored pt-BR preference", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "pt-BR")

    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>
    )

    expect(await screen.findByText("Expira em Friday.")).toBeInTheDocument()
    expect(screen.getByText("pt-BR")).toBeInTheDocument()
    expect(document.documentElement.lang).toBe("pt-BR")
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("pt-BR")
  })

  it("switches back to English", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "pt-BR")
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>
    )

    await userEvent.click(
      await screen.findByRole("button", { name: "Switch to English" })
    )

    expect(screen.getByText("Expires on Friday.")).toBeInTheDocument()
    expect(document.documentElement.lang).toBe("en")
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("en")
  })

  it("keeps switching when browser storage is unavailable", async () => {
    const getItem = vi
      .spyOn(localStorage, "getItem")
      .mockImplementation(() => {
        throw new DOMException("Blocked", "SecurityError")
      })
    const setItem = vi
      .spyOn(localStorage, "setItem")
      .mockImplementation(() => {
        throw new DOMException("Blocked", "SecurityError")
      })

    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>
    )
    await userEvent.click(
      screen.getByRole("button", { name: "Switch to Portuguese" })
    )

    expect(screen.getByText("Expira em Friday.")).toBeInTheDocument()
    expect(document.documentElement.lang).toBe("pt-BR")
    getItem.mockRestore()
    setItem.mockRestore()
  })
})
