const fs = require("fs")
const path = require("path")
const { pathToFileURL } = require("url")
const { shell } = require("electron")
const { exec } = require("child_process")

document.addEventListener("DOMContentLoaded", () => {
  const desktopCarousel = document.getElementById("desktopCarousel")
  const mainContainer = document.getElementById("mainContainer")

  const greetingEl = document.getElementById("greeting")
  const timeEl = document.getElementById("time")
  const quoteEl = document.getElementById("quote")
  const musicBlock = document.getElementById("musicBlock")
  const muteBtn = document.getElementById("muteBtn")
  const player = document.getElementById("bgMusic")
  const volumeSlider = document.getElementById("volumeSlider")
  const timerValue = document.getElementById("timerValue")
  const restToggleBtn = document.getElementById("restToggleBtn")

  const openVsCodeBtn = document.getElementById("openVsCodeBtn")
  const openBrowserPanelBtn = document.getElementById("openBrowserPanelBtn")
  const openBrowserBtn = document.getElementById("openBrowserBtn")
  const browserInput = document.getElementById("browserInput")
  const browserStatus = document.getElementById("browserStatus")
  const quickLinkBtns = Array.from(document.querySelectorAll(".quickLinkBtn"))
  const openTerminalBtn = document.getElementById("openTerminalBtn")
  const openNotesPanelBtn = document.getElementById("openNotesPanelBtn")
  const notesInput = document.getElementById("notesInput")
  const notesStatus = document.getElementById("notesStatus")
  const openSpotifyBtn = document.getElementById("openSpotifyBtn")
  const openFilesPanelBtn = document.getElementById("openFilesPanelBtn")

  const fileScopeSelect = document.getElementById("fileScopeSelect")
  const refreshFilesBtn = document.getElementById("refreshFilesBtn")
  const fileList = document.getElementById("fileList")
  const fileStatus = document.getElementById("fileStatus")

  const toolPanelOverlay = document.getElementById("toolPanelOverlay")
  const toolPanelTitle = document.getElementById("toolPanelTitle")
  const closeToolPanelBtn = document.getElementById("closeToolPanelBtn")
  const browserPanel = document.getElementById("browserPanel")
  const notesPanel = document.getElementById("notesPanel")
  const filesPanel = document.getElementById("filesPanel")

  const pixelBuddy = document.getElementById("pixelBuddy")
  const buddyEyeLeft = document.getElementById("buddyEyeLeft")
  const buddyEyeRight = document.getElementById("buddyEyeRight")

  const appDataDir = path.join(__dirname, "app-data")
  const notesPath = path.join(appDataDir, "notes.md")
  const defaultCoverPath = path.join(__dirname, "assets", "art", "default.png")
  const defaultAmbientPath = resolveDefaultAmbientTrack()

  let notesSaveTimer = null
  let baseVolume = 0.35
  let focusStart = Date.now()
  let isResting = false
  let restStartedAt = null
  let pausedAccumulated = 0

  if (!fs.existsSync(appDataDir)) {
    fs.mkdirSync(appDataDir)
  }

  function toPlayableSrc(src) {
    if (/^https?:\/\//i.test(src)) return src
    if (path.isAbsolute(src)) return pathToFileURL(src).href
    return src
  }

  function resolveDefaultAmbientTrack() {
    const musicDir = path.join(__dirname, "assets", "music")
    if (!fs.existsSync(musicDir)) {
      return ""
    }

    try {
      const files = fs.readdirSync(musicDir)
      const preferred = files.find((fileName) => /marconi\s*union.*weightless/i.test(fileName))
      if (preferred) return path.join(musicDir, preferred)

      const fallback = files.find((fileName) => /\.(mp3|wav|ogg|m4a)$/i.test(fileName))
      return fallback ? path.join(musicDir, fallback) : ""
    } catch {
      return ""
    }
  }

  function setBaseVolume(value) {
    const parsed = Number(value)
    const normalized = Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed / 100)) : 0.35
    baseVolume = normalized
    if (!player.muted) {
      player.volume = baseVolume
    }
  }

  function fadeInAudio(duration = 900) {
    player.volume = 0
    const steps = 18
    const stepDuration = Math.max(20, Math.floor(duration / steps))
    const stepAmount = baseVolume / steps
    let count = 0

    const timer = setInterval(() => {
      count += 1
      player.volume = Math.min(baseVolume, player.volume + stepAmount)
      if (count >= steps) {
        clearInterval(timer)
      }
    }, stepDuration)
  }

  function startAmbientFlow() {
    if (!defaultAmbientPath || !fs.existsSync(defaultAmbientPath)) {
      return
    }

    player.src = toPlayableSrc(defaultAmbientPath)
    player.loop = true
    player.volume = 0
    player.play().then(() => {
      document.body.classList.add("ambient-playing")
      fadeInAudio(900)

      setTimeout(() => {
        pixelBuddy.classList.add("working")
        pixelBuddy.classList.add("speaking")
      }, 3500)

      setTimeout(() => {
        pixelBuddy.classList.remove("speaking")
        if (!isResting) {
          document.body.classList.add("apps-ready")
        }
      }, 4200)
    }).catch(() => {})
  }

  function updateTimer() {
    const now = Date.now()
    let elapsedMs = now - focusStart - pausedAccumulated
    if (isResting && restStartedAt) {
      elapsedMs -= now - restStartedAt
    }
    const totalSeconds = Math.floor(elapsedMs / 1000)
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0")
    const seconds = String(totalSeconds % 60).padStart(2, "0")
    if (timerValue) {
      timerValue.innerText = `${minutes}:${seconds}`
    }
  }

  function setRestState(resting) {
    isResting = resting
    document.body.classList.toggle("resting", resting)
    document.body.classList.toggle("apps-ready", !resting)

    if (resting) {
      restStartedAt = Date.now()
    } else if (restStartedAt) {
      pausedAccumulated += Date.now() - restStartedAt
      restStartedAt = null
    }

    if (pixelBuddy) {
      if (resting) {
        pixelBuddy.classList.remove("working")
        pixelBuddy.classList.remove("speaking")
      } else {
        pixelBuddy.classList.add("working")
        pixelBuddy.classList.add("speaking")
        setTimeout(() => {
          pixelBuddy.classList.remove("speaking")
        }, 2000)
      }
    }

    if (restToggleBtn) {
      restToggleBtn.innerText = resting ? "Back to Work" : "Take Rest"
    }
  }

  function updateClock() {
    const now = new Date()
    timeEl.innerText = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }

  function updateGreeting() {
    const hour = new Date().getHours()
    let greet = "Good evening"

    if (hour >= 5 && hour < 12) greet = "Good morning"
    else if (hour >= 12 && hour < 17) greet = "Good afternoon"
    else if (hour >= 22 || hour < 5) greet = "Good night"

    const funnyLines = hour < 12
      ? [
          "Coffee loaded. Bugs trembling.",
          "You beat the snooze button. Legendary.",
          "Morning build incoming. Stay brave."
        ]
      : hour < 18
        ? [
            "Productivity patch applied.",
            "You vs deadlines: stylish edition.",
            "Another tab? Obviously yes."
          ]
        : [
            "Night mode: activated and dramatic.",
            "If it compiles at midnight, it is art.",
            "Moonlight and merge conflicts."
          ]

    const funny = funnyLines[Math.floor(Math.random() * funnyLines.length)]
    greetingEl.innerText = `${greet}. ${funny}`
  }

  function normalizeQuoteText(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/([.?!])([A-Za-z])/g, "$1 $2")
      .trim()
  }

  function setupQuote() {
    fetch("https://zenquotes.io/api/random")
      .then((response) => response.json())
      .then((data) => {
        if (Array.isArray(data) && data[0]?.q) {
          const quote = normalizeQuoteText(data[0].q)
          const author = data[0].a ? ` — ${data[0].a}` : ""
          quoteEl.innerText = `${quote}${author}`
          return
        }
        quoteEl.innerText = ""
      })
      .catch(() => {
        quoteEl.innerText = ""
      })
  }

  function setupDesktopLaunchers() {
    openVsCodeBtn.onclick = () => {
      shell.openExternal("vscode://")
      exec("code .", { cwd: __dirname }, () => {})
    }

    openBrowserBtn.onclick = () => {
      openControlledUrl(browserInput?.value || "https://developer.mozilla.org")
    }

    quickLinkBtns.forEach((button) => {
      button.onclick = () => {
        openControlledUrl(button.dataset.url || "")
      }
    })

    if (browserInput) {
      browserInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          openControlledUrl(browserInput.value)
        }
      })
    }

    openTerminalBtn.onclick = () => {
      if (process.platform === "win32") {
        exec("start wt", () => {
          exec("start powershell", () => {})
        })
        return
      }
      if (process.platform === "darwin") {
        exec("open -a Terminal .", () => {})
        return
      }
      exec("x-terminal-emulator", () => {})
    }

    openSpotifyBtn.onclick = () => {
      shell.openExternal("spotify:").catch(() => {
        shell.openExternal("https://open.spotify.com")
      })
    }

    openBrowserPanelBtn.onclick = () => showToolPanel("browser")
    openNotesPanelBtn.onclick = () => showToolPanel("notes")
    openFilesPanelBtn.onclick = () => {
      showToolPanel("files")
      refreshScopedFiles()
    }
  }

  function hideToolPanel() {
    toolPanelOverlay.classList.remove("show")
    toolPanelOverlay.classList.add("hidden")
  }

  function showToolPanel(panelName) {
    browserPanel.classList.add("hidden")
    notesPanel.classList.add("hidden")
    filesPanel.classList.add("hidden")

    if (panelName === "browser") {
      browserPanel.classList.remove("hidden")
      toolPanelTitle.innerText = "Controlled Browser"
    }

    if (panelName === "notes") {
      notesPanel.classList.remove("hidden")
      toolPanelTitle.innerText = "Notes"
    }

    if (panelName === "files") {
      filesPanel.classList.remove("hidden")
      toolPanelTitle.innerText = "Scoped File Access"
    }

    toolPanelOverlay.classList.remove("hidden")
    toolPanelOverlay.classList.add("show")
  }

  function setupToolPanel() {
    closeToolPanelBtn.addEventListener("click", hideToolPanel)
    toolPanelOverlay.addEventListener("click", (event) => {
      if (event.target === toolPanelOverlay) hideToolPanel()
    })

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") hideToolPanel()
    })
  }

  function updateFileStatus(text) {
    fileStatus.innerText = text
  }

  function getScopePath(scopeKey) {
    const scopeMap = {
      workspace: __dirname,
      appData: appDataDir,
      art: path.join(__dirname, "assets", "art"),
      music: path.join(__dirname, "assets", "music")
    }

    return scopeMap[scopeKey] || __dirname
  }

  function isAllowedFileName(fileName) {
    const allowedExtensions = new Set([".md", ".txt", ".json", ".js", ".css", ".html", ".jpg", ".jpeg", ".png", ".mp3", ".wav"])
    return allowedExtensions.has(path.extname(fileName).toLowerCase())
  }

  function renderFileRows(directoryPath) {
    fileList.innerHTML = ""

    let entries = []
    try {
      entries = fs.readdirSync(directoryPath, { withFileTypes: true })
    } catch {
      updateFileStatus("Cannot access selected folder")
      return
    }

    const files = entries.filter((entry) => entry.isFile() && isAllowedFileName(entry.name)).slice(0, 40)
    if (!files.length) {
      updateFileStatus("No allowed files in this scope")
      return
    }

    files.forEach((entry) => {
      const item = document.createElement("li")
      item.className = "fileRow"

      const fileNameEl = document.createElement("span")
      fileNameEl.className = "fileName"
      fileNameEl.innerText = entry.name

      const openBtn = document.createElement("button")
      openBtn.className = "openFileBtn"
      openBtn.innerText = "Open"
      openBtn.addEventListener("click", () => {
        const fullPath = path.join(directoryPath, entry.name)
        shell.openPath(fullPath)
      })

      item.appendChild(fileNameEl)
      item.appendChild(openBtn)
      fileList.appendChild(item)
    })

    updateFileStatus(`Showing ${files.length} file(s)`)
  }

  function refreshScopedFiles() {
    const scopePath = getScopePath(fileScopeSelect.value)
    if (!fs.existsSync(scopePath)) {
      fileList.innerHTML = ""
      updateFileStatus("Scope folder does not exist")
      return
    }
    renderFileRows(scopePath)
  }

  function setupScopedFileAccess() {
    fileScopeSelect.addEventListener("change", refreshScopedFiles)
    refreshFilesBtn.addEventListener("click", refreshScopedFiles)
    refreshScopedFiles()
  }

  function ensureProtocol(urlValue) {
    const value = String(urlValue || "").trim()
    if (!value) return ""
    if (/^https?:\/\//i.test(value)) return value
    return `https://${value}`
  }

  function isBlockedHostname(hostname) {
    const blockedWords = ["instagram.com", "facebook.com", "x.com", "twitter.com", "reddit.com", "tiktok.com"]
    return blockedWords.some((blocked) => hostname === blocked || hostname.endsWith(`.${blocked}`))
  }

  function looksLikeUrl(value) {
    const text = String(value || "").trim()
    if (!text) return false
    if (/^https?:\/\//i.test(text)) return true
    if (/^www\./i.test(text)) return true
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#].*)?$/i.test(text)
  }

  function openControlledUrl(rawUrl) {
    const inputValue = String(rawUrl || "").trim()
    if (!inputValue) {
      browserStatus.innerText = "Type something to search or open."
      return
    }

    const normalized = looksLikeUrl(inputValue)
      ? ensureProtocol(inputValue)
      : `https://www.google.com/search?q=${encodeURIComponent(inputValue)}`

    if (!normalized) {
      browserStatus.innerText = "Enter a URL to open."
      return
    }

    try {
      const parsed = new URL(normalized)
      const hostname = parsed.hostname.toLowerCase()
      if (isBlockedHostname(hostname)) {
        browserStatus.innerText = "Blocked by productivity policy. Choose docs/research resources only."
        return
      }

      shell.openExternal(parsed.href)
      browserStatus.innerText = looksLikeUrl(inputValue) ? `Opened ${hostname}` : `Searched: ${inputValue}`
    } catch {
      browserStatus.innerText = "Invalid URL."
    }
  }

  function updateNotesStatus(text) {
    notesStatus.innerText = text
  }

  function loadNotes() {
    try {
      if (fs.existsSync(notesPath)) {
        notesInput.value = fs.readFileSync(notesPath, "utf8")
        updateNotesStatus("Loaded local notes")
      } else {
        updateNotesStatus("Ready to capture")
      }
    } catch {
      updateNotesStatus("Failed to load notes")
    }
  }

  function saveNotesNow() {
    try {
      fs.writeFileSync(notesPath, notesInput.value, "utf8")
      updateNotesStatus(`Saved ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`)
    } catch {
      updateNotesStatus("Save failed")
    }
  }

  function setupNotesPersistence() {
    loadNotes()
    notesInput.addEventListener("input", () => {
      updateNotesStatus("Saving...")
      if (notesSaveTimer) clearTimeout(notesSaveTimer)
      notesSaveTimer = setTimeout(saveNotesNow, 450)
    })
  }

  function setupPixelBuddyTracking() {
    const maxBodyShift = 150
    const maxEyeShift = 2.8

    document.addEventListener("mousemove", (event) => {
      if (pixelBuddy.classList.contains("working")) {
        return
      }
      const normalizedX = Math.max(-1, Math.min(1, (event.clientX - window.innerWidth / 2) / (window.innerWidth / 2)))
      const normalizedY = Math.max(-1, Math.min(1, (event.clientY - (window.innerHeight - 90)) / 180))

      pixelBuddy.style.transform = `translateX(${normalizedX * maxBodyShift}px)`

      if (normalizedX < -0.1) {
        pixelBuddy.classList.add("look-left")
        pixelBuddy.classList.remove("look-right")
      } else if (normalizedX > 0.1) {
        pixelBuddy.classList.add("look-right")
        pixelBuddy.classList.remove("look-left")
      } else {
        pixelBuddy.classList.remove("look-left")
        pixelBuddy.classList.remove("look-right")
      }

      buddyEyeLeft.style.transform = `translate(${normalizedX * maxEyeShift}px, ${normalizedY * maxEyeShift}px)`
      buddyEyeRight.style.transform = `translate(${normalizedX * maxEyeShift}px, ${normalizedY * maxEyeShift}px)`
    })
  }

  function revealMainContent() {
    desktopCarousel.style.display = "block"
    mainContainer.style.opacity = "0"
    mainContainer.style.transition = "opacity 300ms ease"

    requestAnimationFrame(() => {
      mainContainer.style.opacity = "1"
    })

    const revealTargets = [greetingEl, timeEl, quoteEl, muteBtn]
    musicBlock.classList.add("show")

    revealTargets.forEach((element, index) => {
      element.classList.add("reveal-hidden")
      setTimeout(() => {
        element.classList.add("reveal-show")
      }, 260 + index * 150)
    })
  }

  muteBtn.onclick = () => {
    player.muted = !player.muted
    player.volume = player.muted ? 0 : baseVolume
    muteBtn.innerText = player.muted ? "🔇" : "🔊"
  }

  volumeSlider.addEventListener("input", () => {
    setBaseVolume(volumeSlider.value)
  })

  if (restToggleBtn) {
    restToggleBtn.addEventListener("click", () => {
      setRestState(!isResting)
    })
  }

  setBaseVolume(volumeSlider.value)
  updateClock()
  setInterval(updateClock, 1000)
  updateTimer()
  setInterval(updateTimer, 1000)
  updateGreeting()
  setupQuote()

  revealMainContent()
  startAmbientFlow()
  setupDesktopLaunchers()
  setupToolPanel()
  setupNotesPersistence()
  setupScopedFileAccess()
  setupPixelBuddyTracking()
})
