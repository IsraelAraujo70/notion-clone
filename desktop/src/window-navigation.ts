import type { WebContents } from "electron"

import { isAllowedAppUrl, isSafeExternalUrl } from "./navigation"

type PreventableEvent = {
  preventDefault: () => void
}

export function secureWindowNavigation(
  webContents: WebContents,
  isPackaged: boolean,
  loadUrl: (url: string) => void,
  openExternal: (url: string) => void
): void {
  const guardNavigation = (event: PreventableEvent, url: string) => {
    if (isAllowedAppUrl(url, isPackaged)) return

    event.preventDefault()
    if (isSafeExternalUrl(url)) openExternal(url)
  }

  webContents.on("will-navigate", guardNavigation)
  webContents.on("will-redirect", guardNavigation)

  webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedAppUrl(url, isPackaged)) {
      loadUrl(url)
    } else if (isSafeExternalUrl(url)) {
      openExternal(url)
    }

    return { action: "deny" }
  })

  webContents.on("will-attach-webview", (event) => {
    event.preventDefault()
  })
}
