import type { BrowserWindowConstructorOptions } from "electron"

export function createWindowOptions(
  preloadPath: string,
  iconPath: string
): BrowserWindowConstructorOptions {
  return {
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: "#f7f7f5",
    icon: iconPath,
    webPreferences: {
      preload: preloadPath,
      partition: "persist:reason",
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
    },
  }
}
