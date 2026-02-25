document.addEventListener("DOMContentLoaded", async () => {
  const api = window.axiom

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

  let notesSaveTimer = null
  let baseVolume = 0.35
  let focusStart = Date.now()
  let isResting = false
  let restStartedAt = null
  let pausedAccumulated = 0
  let mediaInfo = { ambientPath: "", coverPath: "", lastSong: "" }

  function toPlayableSrc(filePath) {
    if (!filePath) return ""
    if (/^https?:\/\//i.test(filePath) || /^file:\/\//i.test(filePath)) return filePath
    const normalized = String(filePath).replace(/\\/g, "/")
    return encodeURI(`file://${normalized}`)
  }

  async function hydrateSettings() {
    try {
      const settings = await api.getSettings()
      if (settings && Number.isFinite(Number(settings.volume))) {
        volumeSlider.value = String(settings.volume)
      }
      if (settings && settings.userName) {
        greetingEl.dataset.userName = settings.userName
      }
    } catch {
      volumeSlider.value = "35"
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

  async function startAmbientFlow() {
    if (!mediaInfo.ambientPath) {
      quoteEl.innerText = "Offline mode: ambient track unavailable."
      return
    }

    player.src = toPlayableSrc(mediaInfo.ambientPath)
    player.loop = true
    player.volume = 0

    try {
      await player.play()
      document.body.classList.add("ambient-playing")
      fadeInAudio(900)
      api.updateSettings({ lastSong: mediaInfo.lastSong || "Marconi Union - Weightless" })

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
    } catch {
      quoteEl.innerText = "Audio playback blocked. Click anywhere then toggle mute to start."
    }
  }

  function updateTimer() {
    const now = Date.now()
    let elapsedMs = now - focusStart - pausedAccumulated
    if (isResting && restStartedAt) {
      elapsedMs -= now - restStartedAt
    }
    const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000))
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0")
    const seconds = String(totalSeconds % 60).padStart(2, "0")
    timerValue.innerText = `${minutes}:${seconds}`
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

    restToggleBtn.innerText = resting ? "Back to Work" : "Take Rest"
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
      ? ["Coffee loaded. Bugs trembling.", "You beat the snooze button. Legendary.", "Morning build incoming. Stay brave."]
      : hour < 18
        ? ["Productivity patch applied.", "You vs deadlines: stylish edition.", "Another tab? Obviously yes."]
        : ["Night mode: activated and dramatic.", "If it compiles at midnight, it is art.", "Moonlight and merge conflicts."]

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

  async function setupQuote() {
    if (!navigator.onLine) {
      quoteEl.innerText = "Offline mode — focus mode active."
      return
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    try {
      const response = await fetch("https://zenquotes.io/api/random", { signal: controller.signal })
      const data = await response.json()
      if (Array.isArray(data) && data[0]?.q) {
        const quote = normalizeQuoteText(data[0].q)
        const author = data[0].a ? ` — ${data[0].a}` : ""
        quoteEl.innerText = `${quote}${author}`
      } else {
        quoteEl.innerText = "Quote unavailable right now."
      }
    } catch {
      quoteEl.innerText = navigator.onLine ? "Quote unavailable right now." : "Offline mode — focus mode active."
    } finally {
      clearTimeout(timeout)
    }
  }

  function setupDesktopLaunchers() {
    openVsCodeBtn.onclick = () => api.launchVsCode()
    openTerminalBtn.onclick = () => api.launchTerminal()
    openSpotifyBtn.onclick = () => api.launchSpotify()

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

  async function renderFileRows(scopeKey) {
    fileList.innerHTML = ""

    let files = []
    try {
      files = await api.listFiles(scopeKey)
    } catch {
      updateFileStatus("Cannot access selected folder")
      return
    }

    if (!files.length) {
      updateFileStatus("No allowed files in this scope")
      return
    }

    files.forEach((fileName) => {
      const item = document.createElement("li")
      item.className = "fileRow"

      const fileNameEl = document.createElement("span")
      fileNameEl.className = "fileName"
      fileNameEl.innerText = fileName

      const openBtn = document.createElement("button")
      openBtn.className = "openFileBtn"
      openBtn.innerText = "Open"
      openBtn.addEventListener("click", async () => {
        await api.openFile(fileScopeSelect.value, fileName)
      })

      item.appendChild(fileNameEl)
      item.appendChild(openBtn)
      fileList.appendChild(item)
    })

    updateFileStatus(`Showing ${files.length} file(s)`)
  }

  async function refreshScopedFiles() {
    await renderFileRows(fileScopeSelect.value)
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

  async function openControlledUrl(rawUrl) {
    const inputValue = String(rawUrl || "").trim()
    if (!inputValue) {
      browserStatus.innerText = "Type something to search or open."
      return
    }

    const normalized = looksLikeUrl(inputValue)
      ? ensureProtocol(inputValue)
      : `https://www.google.com/search?q=${encodeURIComponent(inputValue)}`

    try {
      const parsed = new URL(normalized)
      const hostname = parsed.hostname.toLowerCase()
      if (isBlockedHostname(hostname)) {
        browserStatus.innerText = "Blocked by productivity policy."
        return
      }

      const ok = await api.openExternal(parsed.href)
      browserStatus.innerText = ok
        ? (looksLikeUrl(inputValue) ? `Opened ${hostname}` : `Searched: ${inputValue}`)
        : "Blocked by app security policy."
    } catch {
      browserStatus.innerText = "Invalid URL."
    }
  }

  function updateNotesStatus(text) {
    notesStatus.innerText = text
  }

  async function loadNotes() {
    try {
      notesInput.value = await api.loadNotes()
      updateNotesStatus(notesInput.value ? "Loaded local notes" : "Ready to capture")
    } catch {
      updateNotesStatus("Failed to load notes")
    }
  }

  async function saveNotesNow() {
    try {
      await api.saveNotes(notesInput.value)
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
      if (pixelBuddy.classList.contains("working")) return

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
    api.updateSettings({ volume: Number(volumeSlider.value) })
  })

  restToggleBtn.addEventListener("click", () => {
    setRestState(!isResting)
  })

  window.addEventListener("offline", () => {
    browserStatus.innerText = "Offline mode"
    quoteEl.innerText = "Offline mode — focus mode active."
  })

  window.addEventListener("error", (event) => {
    console.error("Renderer error:", event.message)
  })

  window.addEventListener("unhandledrejection", (event) => {
    console.error("Renderer unhandled rejection:", event.reason)
  })

  try {
    mediaInfo = await api.getMediaInfo()
  } catch {
    mediaInfo = { ambientPath: "", coverPath: "", lastSong: "" }
  }

  await hydrateSettings()
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
