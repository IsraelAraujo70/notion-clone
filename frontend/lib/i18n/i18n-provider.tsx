"use client"

import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react"

import { ptMessages, type Message } from "@/lib/i18n/messages"

export const DEFAULT_LOCALE = "en" as const
export const LOCALE_STORAGE_KEY = "reason_locale"

export type Locale = "en" | "pt-BR"
type Variables = Record<string, string | number>
const LOCALE_CHANGE_EVENT = "reason-locale-change"
let memoryLocale: Locale = DEFAULT_LOCALE

type I18nContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (message: Message, variables?: Variables) => string
  formatDate: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string
}

function interpolate(message: string, variables?: Variables) {
  if (!variables) return message
  return message.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in variables ? String(variables[key]) : match
  )
}

const defaultValue: I18nContextValue = {
  locale: DEFAULT_LOCALE,
  setLocale: () => undefined,
  t: (message, variables) => interpolate(message, variables),
  formatDate: (input, options) =>
    new Intl.DateTimeFormat(DEFAULT_LOCALE, options).format(new Date(input)),
  formatNumber: (input, options) =>
    new Intl.NumberFormat(DEFAULT_LOCALE, options).format(input),
}

const I18nContext = createContext<I18nContextValue>(defaultValue)

function getLocaleSnapshot(): Locale {
  try {
    return localStorage.getItem(LOCALE_STORAGE_KEY) === "pt-BR" ? "pt-BR" : "en"
  } catch {
    return memoryLocale
  }
}

function subscribeLocale(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange)
  window.addEventListener(LOCALE_CHANGE_EVENT, onStoreChange)
  return () => {
    window.removeEventListener("storage", onStoreChange)
    window.removeEventListener(LOCALE_CHANGE_EVENT, onStoreChange)
  }
}

function persistLocale(locale: Locale) {
  memoryLocale = locale
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    // The in-memory preference still keeps language switching functional.
  }
  window.dispatchEvent(new Event(LOCALE_CHANGE_EVENT))
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(
    subscribeLocale,
    getLocaleSnapshot,
    () => DEFAULT_LOCALE
  )

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const value: I18nContextValue = {
    locale,
    setLocale: persistLocale,
    t: (message, variables) =>
      interpolate(locale === "pt-BR" ? ptMessages[message] : message, variables),
    formatDate: (input, options) =>
      new Intl.DateTimeFormat(locale, options).format(new Date(input)),
    formatNumber: (input, options) =>
      new Intl.NumberFormat(locale, options).format(input),
  }

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  return useContext(I18nContext)
}
