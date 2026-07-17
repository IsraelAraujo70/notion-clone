"use client"

import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react"

export const PAGE_FULL_WIDTH_STORAGE_KEY = "reason:page-full-width:v1"

const PAGE_LAYOUT_CHANGE_EVENT = "reason-page-layout-change"
let memoryFullWidth = false

type PageLayoutContextValue = {
  fullWidth: boolean
  setFullWidth: (fullWidth: boolean) => void
}

const PageLayoutContext = createContext<PageLayoutContextValue | null>(null)

function getFullWidthSnapshot() {
  try {
    memoryFullWidth =
      localStorage.getItem(PAGE_FULL_WIDTH_STORAGE_KEY) === "true"
  } catch {
    // Keep the setting functional when browser storage is unavailable.
  }
  return memoryFullWidth
}

function subscribePageLayout(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange)
  window.addEventListener(PAGE_LAYOUT_CHANGE_EVENT, onStoreChange)
  return () => {
    window.removeEventListener("storage", onStoreChange)
    window.removeEventListener(PAGE_LAYOUT_CHANGE_EVENT, onStoreChange)
  }
}

function persistFullWidth(fullWidth: boolean) {
  memoryFullWidth = fullWidth
  try {
    localStorage.setItem(PAGE_FULL_WIDTH_STORAGE_KEY, String(fullWidth))
  } catch {
    // The in-memory preference still updates the current session.
  }
  window.dispatchEvent(new Event(PAGE_LAYOUT_CHANGE_EVENT))
}

export function PageLayoutProvider({ children }: { children: ReactNode }) {
  const fullWidth = useSyncExternalStore(
    subscribePageLayout,
    getFullWidthSnapshot,
    () => false
  )

  return (
    <PageLayoutContext.Provider
      value={{ fullWidth, setFullWidth: persistFullWidth }}
    >
      {children}
    </PageLayoutContext.Provider>
  )
}

export function usePageLayout() {
  const context = useContext(PageLayoutContext)
  if (!context) {
    throw new Error("usePageLayout must be used within PageLayoutProvider")
  }
  return context
}
