import { contextBridge } from "electron"

import type { ReasonDesktopBridge } from "./contracts"

const bridge: ReasonDesktopBridge = Object.freeze({
  bridgeVersion: 1,
  platform: process.platform,
})

contextBridge.exposeInMainWorld("reasonDesktop", bridge)
