const { app, BrowserWindow, ipcMain, shell } = require("electron")
const path = require("path")
const fs = require("fs")
const axios = require("axios")
const { exec } = require("child_process")
const Store = require("electron-store")
const { autoUpdater } = require("electron-updater")
const { startMusicServer } = require("./music-server")
require("dotenv").config({ path: path.join(__dirname, ".env") })

let musicServer

const settingsStore = new Store({
  name: "settings",
  defaults: {
    userName: "",
    theme: "dark",
    volume: 35,
    lastSong: "Marconi Union - Weightless",
    location: "",
    license: {
      active: false,
      key: "",
      email: "",
      validatedAt: ""
    }
  }
})

function getLicenseConfig() {
  return {
    productPermalink: process.env.GUMROAD_PRODUCT_PERMALINK || "",
    buyUrl: process.env.GUMROAD_BUY_URL || "",
    verifyUrl: process.env.GUMROAD_VERIFY_URL || "https://api.gumroad.com/v2/licenses/verify"
  }
}

async function validateLicenseWithGumroad(licenseKey, email) {
  const config = getLicenseConfig()
  if (!config.productPermalink) {
    return { ok: false, error: "License server not configured" }
  }

  try {
    const response = await axios.post(
      config.verifyUrl,
      new URLSearchParams({
        product_permalink: config.productPermalink,
        license_key: licenseKey,
        increment_uses_count: "false"
      }).toString(),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 12000
      }
    )

    const purchase = response.data?.purchase
    if (!response.data?.success || !purchase) {
      return { ok: false, error: "Invalid license key" }
    }

    if (purchase.refunded || purchase.chargebacked || purchase.disputed) {
      return { ok: false, error: "License is not valid for activation" }
    }

    if (email && purchase.email && String(purchase.email).toLowerCase() !== String(email).toLowerCase()) {
      return { ok: false, error: "Email does not match this license" }
    }

    return {
      ok: true,
      email: purchase.email || email || ""
    }
  } catch {
    return { ok: false, error: "License verification failed" }
  }
}

function getAppDataDir() {
  const target = path.join(app.getPath("userData"), "app-data")
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true })
  }
  return target
}

function getScopePath(scopeKey) {
  const scopeMap = {
    workspace: app.getAppPath(),
    appData: getAppDataDir(),
    art: path.join(app.getAppPath(), "assets", "art"),
    music: path.join(app.getAppPath(), "assets", "music")
  }

  return scopeMap[scopeKey] || app.getAppPath()
}

function resolveAmbientTrackPath() {
  const musicDir = getScopePath("music")
  if (!fs.existsSync(musicDir)) {
    return ""
  }

  try {
    const files = fs.readdirSync(musicDir)
    const preferred = files.find((fileName) => /marconi\s*union.*weightless/i.test(fileName))
    if (preferred) {
      return path.join(musicDir, preferred)
    }
    const fallback = files.find((fileName) => /\.(mp3|wav|ogg|m4a)$/i.test(fileName))
    return fallback ? path.join(musicDir, fallback) : ""
  } catch {
    return ""
  }
}

function isAllowedExternalUrl(urlValue) {
  try {
    const parsed = new URL(urlValue)
    return ["http:", "https:", "spotify:", "vscode:"].includes(parsed.protocol)
  } catch {
    return false
  }
}

function registerIpcHandlers() {
  ipcMain.handle("settings:get", () => settingsStore.store)

  ipcMain.handle("settings:update", (_, payload) => {
    if (!payload || typeof payload !== "object") return settingsStore.store

    const allowed = ["userName", "theme", "volume", "lastSong", "location"]
    allowed.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        settingsStore.set(key, payload[key])
      }
    })

    return settingsStore.store
  })

  ipcMain.handle("notes:load", () => {
    const notesPath = path.join(getAppDataDir(), "notes.md")
    if (!fs.existsSync(notesPath)) {
      return ""
    }
    return fs.readFileSync(notesPath, "utf8")
  })

  ipcMain.handle("notes:save", (_, notesText) => {
    const text = typeof notesText === "string" ? notesText : ""
    const notesPath = path.join(getAppDataDir(), "notes.md")
    fs.writeFileSync(notesPath, text, "utf8")
    return true
  })

  ipcMain.handle("files:list", (_, scopeKey) => {
    const allowedExtensions = new Set([".md", ".txt", ".json", ".js", ".css", ".html", ".jpg", ".jpeg", ".png", ".mp3", ".wav"])
    const directoryPath = getScopePath(String(scopeKey || "workspace"))

    if (!fs.existsSync(directoryPath)) {
      return []
    }

    const entries = fs.readdirSync(directoryPath, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile() && allowedExtensions.has(path.extname(entry.name).toLowerCase()))
      .slice(0, 40)
      .map((entry) => entry.name)
  })

  ipcMain.handle("files:open", (_, scopeKey, fileName) => {
    const safeName = path.basename(String(fileName || ""))
    if (!safeName) {
      return false
    }

    const directoryPath = getScopePath(String(scopeKey || "workspace"))
    const fullPath = path.join(directoryPath, safeName)
    if (!fullPath.startsWith(path.resolve(directoryPath))) {
      return false
    }

    shell.openPath(fullPath)
    return true
  })

  ipcMain.handle("external:open", (_, rawUrl) => {
    const urlValue = String(rawUrl || "")
    if (!isAllowedExternalUrl(urlValue)) {
      return false
    }

    shell.openExternal(urlValue)
    return true
  })

  ipcMain.handle("launch:vscode", () => {
    shell.openExternal("vscode://")
    exec("code .", { cwd: app.getAppPath() }, () => {})
    return true
  })

  ipcMain.handle("launch:terminal", () => {
    if (process.platform === "win32") {
      exec("start wt", () => {
        exec("start powershell", () => {})
      })
      return true
    }
    if (process.platform === "darwin") {
      exec("open -a Terminal .", { cwd: app.getAppPath() }, () => {})
      return true
    }
    exec("x-terminal-emulator", () => {})
    return true
  })

  ipcMain.handle("launch:spotify", () => {
    shell.openExternal("spotify:").catch(() => {
      shell.openExternal("https://open.spotify.com")
    })
    return true
  })

  ipcMain.handle("media:getInfo", () => {
    const ambientPath = resolveAmbientTrackPath()
    const coverPath = path.join(getScopePath("art"), "default.png")
    return {
      ambientPath,
      coverPath,
      lastSong: settingsStore.get("lastSong")
    }
  })

  ipcMain.handle("license:getStatus", () => {
    const license = settingsStore.get("license") || {}
    const config = getLicenseConfig()
    return {
      active: Boolean(license.active),
      email: license.email || "",
      buyUrl: config.buyUrl || "https://gumroad.com"
    }
  })

  ipcMain.handle("license:activate", async (_, rawKey, rawEmail) => {
    const licenseKey = String(rawKey || "").trim()
    const email = String(rawEmail || "").trim()

    if (!licenseKey || licenseKey.length < 8) {
      return { ok: false, error: "Enter a valid license key" }
    }

    const result = await validateLicenseWithGumroad(licenseKey, email)
    if (!result.ok) {
      return result
    }

    settingsStore.set("license", {
      active: true,
      key: licenseKey,
      email: result.email || email,
      validatedAt: new Date().toISOString()
    })

    return { ok: true }
  })

  ipcMain.handle("license:deactivate", () => {
    settingsStore.set("license", {
      active: false,
      key: "",
      email: "",
      validatedAt: ""
    })
    return true
  })
}

function setupAutoUpdates() {
  if (!app.isPackaged) {
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on("checking-for-update", () => {
    console.log("AutoUpdate: checking for updates")
  })

  autoUpdater.on("update-available", (info) => {
    console.log("AutoUpdate: update available", info?.version)
  })

  autoUpdater.on("update-not-available", () => {
    console.log("AutoUpdate: no update available")
  })

  autoUpdater.on("error", (error) => {
    console.error("AutoUpdate error:", error?.message || error)
  })

  autoUpdater.on("update-downloaded", (info) => {
    console.log("AutoUpdate: downloaded", info?.version)
  })

  autoUpdater.checkForUpdates().catch((error) => {
    console.error("AutoUpdate check failed:", error?.message || error)
  })
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    fullscreen: true,
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js")
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      shell.openExternal(url)
    }
    return { action: "deny" }
  })

  win.webContents.on("render-process-gone", (_, details) => {
    console.error("Renderer process gone:", details)
  })

  win.loadFile("index.html")
}

process.on("uncaughtException", (error) => {
  console.error("Uncaught:", error)
})

process.on("unhandledRejection", (error) => {
  console.error("Unhandled rejection:", error)
})

app.whenReady().then(() => {
  registerIpcHandlers()
  setupAutoUpdates()
  musicServer = startMusicServer()
  createWindow()
})

app.on("before-quit", () => {
  if (musicServer) {
    musicServer.close()
  }
})