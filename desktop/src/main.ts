import path from "node:path"

import { app, BrowserWindow, shell } from "electron"

import { isAllowedPermission, resolveAppUrl } from "./navigation"
import { secureWindowNavigation } from "./window-navigation"
import { createWindowOptions } from "./window-options"

let mainWindow: BrowserWindow | null = null

app.setName("reason")
app.enableSandbox()

function resolveIconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "icon.png")
    : path.join(app.getAppPath(), "assets", "icon.png")
}

function createWindow(iconPath: string): BrowserWindow {
  const window = new BrowserWindow(
    createWindowOptions(path.join(__dirname, "preload.js"), iconPath)
  )

  const session = window.webContents.session
  session.setPermissionCheckHandler(
    (_webContents, permission, requestingOrigin) =>
      isAllowedPermission(permission, requestingOrigin, app.isPackaged)
  )
  session.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(
      isAllowedPermission(permission, webContents.getURL(), app.isPackaged)
    )
  })
  secureWindowNavigation(
    window.webContents,
    app.isPackaged,
    (url) => void window.loadURL(url),
    (url) => void shell.openExternal(url).catch(() => undefined)
  )

  window.once("ready-to-show", () => window.show())
  window.on("closed", () => {
    mainWindow = null
  })

  void window.loadURL(resolveAppUrl(process.env.REASON_WEB_URL, app.isPackaged))
  return window
}

void app.whenReady().then(() => {
  const iconPath = resolveIconPath()
  app.dock?.setIcon(iconPath)
  mainWindow = createWindow(iconPath)

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow(iconPath)
    }
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
