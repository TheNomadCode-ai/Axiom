const { app, BrowserWindow, ipcMain, shell } = require("electron")
const path = require("path")
const fs = require("fs")
const { exec } = require("child_process")
const Store = require("electron-store")
const { startMusicServer } = require("./music-server")

let musicServer

const settingsStore = new Store({
  name: "settings",
  defaults: {
    userName: "",
    theme: "dark",
    volume: 35,
    lastSong: "Marconi Union - Weightless",
    location: ""
  }
})

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
  musicServer = startMusicServer()
  createWindow()
})

app.on("before-quit", () => {
  if (musicServer) {
    musicServer.close()
  }
})