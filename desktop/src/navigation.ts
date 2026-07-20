export const PRODUCTION_WEB_ORIGIN = "https://reason.israeldeveloper.com.br"
export const APP_ENTRY_PATH = "/dashboard"
export const DEVELOPMENT_WEB_ORIGINS = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
])
const ALLOWED_PERMISSIONS = new Set([
  "clipboard-read",
  "clipboard-sanitized-write",
])

function parseUrl(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

export function isAllowedAppUrl(value: string, isPackaged: boolean): boolean {
  const url = parseUrl(value)
  if (!url || url.username || url.password) return false

  if (url.origin === PRODUCTION_WEB_ORIGIN) return true
  return !isPackaged && DEVELOPMENT_WEB_ORIGINS.has(url.origin)
}

export function isSafeExternalUrl(value: string): boolean {
  const url = parseUrl(value)
  if (!url || url.username || url.password) return false

  return url.protocol === "https:" || url.protocol === "http:"
}

export function isAllowedPermission(
  permission: string,
  requestingUrl: string,
  isPackaged: boolean
): boolean {
  return (
    ALLOWED_PERMISSIONS.has(permission) &&
    isAllowedAppUrl(requestingUrl, isPackaged)
  )
}

export function resolveAppUrl(
  configuredUrl: string | undefined,
  isPackaged: boolean
): string {
  const fallback = isPackaged
    ? PRODUCTION_WEB_ORIGIN
    : "http://localhost:3000"
  const appUrl = configuredUrl?.trim() || fallback

  if (!isAllowedAppUrl(appUrl, isPackaged)) {
    throw new Error(`REASON_WEB_URL is not an allowed application URL: ${appUrl}`)
  }

  const url = new URL(appUrl)
  if (url.pathname === "/") url.pathname = APP_ENTRY_PATH
  return url.toString()
}
