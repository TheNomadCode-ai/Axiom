const express = require("express")
const axios = require("axios")
const fs = require("fs")
const path = require("path")
require("dotenv").config({ path: path.join(__dirname, ".env") })

const PORT = 3030
const HISTORY_LIMIT = 30
const RECENT_TRACK_BLOCK = 20
const RECENT_ARTIST_BLOCK = 5

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath)
  }
}

async function getAccessToken() {
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    throw new Error("Missing Spotify credentials")
  }

  const response = await axios.post(
    "https://accounts.spotify.com/api/token",
    "grant_type=client_credentials",
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      auth: {
        username: process.env.SPOTIFY_CLIENT_ID,
        password: process.env.SPOTIFY_CLIENT_SECRET
      },
      timeout: 15000
    }
  )

  return response.data?.access_token || ""
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase()
}

function createHistoryManager(historyPath) {
  function readHistory() {
    if (!fs.existsSync(historyPath)) {
      return []
    }
    try {
      const data = JSON.parse(fs.readFileSync(historyPath, "utf8"))
      return Array.isArray(data) ? data : []
    } catch {
      return []
    }
  }

  function writeHistory(entries) {
    fs.writeFileSync(historyPath, JSON.stringify(entries.slice(0, HISTORY_LIMIT), null, 2))
  }

  return {
    readHistory,
    writeHistory
  }
}

function pickWeightedRandom(tracks) {
  if (!tracks.length) {
    return null
  }

  const weights = tracks.map((_, index) => tracks.length - index)
  const total = weights.reduce((sum, value) => sum + value, 0)
  let random = Math.random() * total

  for (let index = 0; index < tracks.length; index += 1) {
    random -= weights[index]
    if (random <= 0) {
      return tracks[index]
    }
  }

  return tracks[tracks.length - 1]
}

function filterOutRecentItems(candidates, history) {
  const recentTracks = new Set(
    history.slice(0, RECENT_TRACK_BLOCK).map((item) => normalizeText(item.trackKey))
  )
  const recentArtists = new Set(
    history.slice(0, RECENT_ARTIST_BLOCK).map((item) => normalizeText(item.artist))
  )

  const strictPool = candidates.filter((candidate) => {
    const trackKey = normalizeText(candidate.trackKey)
    const artist = normalizeText(candidate.artist)
    return !recentTracks.has(trackKey) && !recentArtists.has(artist)
  })

  if (strictPool.length) {
    return strictPool
  }

  const noTrackRepeatPool = candidates.filter((candidate) => {
    const trackKey = normalizeText(candidate.trackKey)
    return !recentTracks.has(trackKey)
  })

  return noTrackRepeatPool.length ? noTrackRepeatPool : candidates
}

async function fetchRandomTrack(accessToken, previousTrackId, history) {
  const popularQueries = [
    "rock",
    "alt rock",
    "hard rock",
    "classic rock",
    "Foo Fighters",
    "Linkin Park",
    "Arctic Monkeys",
    "Red Hot Chili Peppers",
    "Green Day",
    "Nirvana",
    "Metallica",
    "The Strokes"
  ]

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const query = popularQueries[Math.floor(Math.random() * popularQueries.length)]
    const offset = Math.floor(Math.random() * 300)

    const response = await axios.get("https://api.spotify.com/v1/search", {
      params: {
        q: query,
        type: "track",
        limit: 50,
        offset,
        market: "US"
      },
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      timeout: 15000
    })

    const tracks = response.data?.tracks?.items || []
    const validTracks = tracks.filter((track) => track?.preview_url && track?.id && track.id !== previousTrackId)
    if (!validTracks.length) {
      continue
    }

    const scoredTracks = [...validTracks]
      .sort((first, second) => (second.popularity || 0) - (first.popularity || 0))
      .slice(0, Math.min(15, validTracks.length))
      .map((track) => ({
        id: track.id,
        trackKey: `spotify:${track.id}`,
        previewUrl: track.preview_url,
        coverUrl: track.album?.images?.[0]?.url || "",
        title: track.name || "Spotify Preview",
        artist: track.artists?.map((artist) => artist.name).join(", ") || "",
        popularity: track.popularity || 0
      }))

    const filteredPool = filterOutRecentItems(scoredTracks, history)
    const selected = pickWeightedRandom(filteredPool)
    if (!selected) {
      continue
    }

    return {
      id: selected.id,
      trackKey: selected.trackKey,
      previewUrl: selected.previewUrl,
      coverUrl: selected.coverUrl,
      title: selected.title,
      artist: selected.artist,
      popularity: selected.popularity
    }
  }

  throw new Error("No Spotify preview tracks found")
}

async function fetchFallbackTrack(previousProviderTrackId, history) {
  const fallbackQueries = ["rock", "alternative rock", "classic rock", "indie rock"]
  let tracks = []

  for (const query of fallbackQueries) {
    try {
      const response = await axios.get("https://api.deezer.com/search", {
        params: { q: query, limit: 50 },
        timeout: 15000
      })
      const result = response.data?.data || []
      if (result.length) {
        tracks = result
        break
      }
    } catch {
      tracks = []
    }
  }

  if (!tracks.length) {
    const response = await axios.get("https://api.deezer.com/chart/0/tracks", {
      params: { limit: 50 },
      timeout: 15000
    })
    tracks = response.data?.data || []
  }

  const validTracks = tracks.filter((track) => track?.preview)
  if (!validTracks.length) {
    throw new Error("No fallback preview tracks found")
  }

  const nonRepeatingTracks = validTracks.filter(
    (track) => String(track.id || "") !== String(previousProviderTrackId || "")
  )
  const pool = nonRepeatingTracks.length ? nonRepeatingTracks : validTracks
  const scoredPool = pool.map((track) => ({
    id: String(track.id || ""),
    trackKey: `deezer:${String(track.id || "")}`,
    previewUrl: track.preview,
    coverUrl: track.album?.cover_xl || track.album?.cover_big || track.album?.cover || "",
    title: track.title || "Fallback Preview",
    artist: track.artist?.name || "",
    popularity: track.rank || 0
  }))

  const filteredPool = filterOutRecentItems(scoredPool, history)
  const candidate = pickWeightedRandom(
    [...filteredPool].sort((first, second) => (second.popularity || 0) - (first.popularity || 0))
  )
  if (!candidate) {
    throw new Error("No fallback preview tracks found")
  }

  return {
    id: "",
    trackKey: candidate.trackKey,
    providerTrackId: candidate.id,
    previewUrl: candidate.previewUrl,
    coverUrl: candidate.coverUrl,
    title: candidate.title,
    artist: candidate.artist,
    source: "deezer-preview"
  }
}

async function downloadFile(url, targetPath) {
  const response = await axios({
    method: "GET",
    url,
    responseType: "stream",
    timeout: 20000
  })

  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(targetPath)
    response.data.pipe(writer)
    writer.on("finish", resolve)
    writer.on("error", reject)
  })
}

async function downloadFileAtomic(url, targetPath) {
  const tempPath = `${targetPath}.tmp`
  await downloadFile(url, tempPath)

  const stat = fs.statSync(tempPath)
  if (!stat.size || stat.size < 2048) {
    fs.unlinkSync(tempPath)
    throw new Error("Downloaded file is empty or too small")
  }

  fs.renameSync(tempPath, targetPath)
}

function startMusicServer() {
  const serverApp = express()

  serverApp.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type")
    if (req.method === "OPTIONS") {
      res.sendStatus(204)
      return
    }
    next()
  })

  serverApp.get("/health", (_, res) => {
    res.json({ ok: true })
  })

  serverApp.get("/update-song", async (_, res) => {
    try {
      const appDataDir = path.join(__dirname, "app-data")
      ensureDir(appDataDir)

      const songPath = path.join(appDataDir, "currentSong.mp3")
      const coverPath = path.join(appDataDir, "currentCover.jpg")
      const metadataPath = path.join(appDataDir, "metadata.json")
      const historyPath = path.join(appDataDir, "song-history.json")
      const historyManager = createHistoryManager(historyPath)
      const history = historyManager.readHistory()

      let previousTrackId = ""
      let previousProviderTrackId = ""
      if (fs.existsSync(metadataPath)) {
        try {
          const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"))
          previousTrackId = metadata.spotifyTrackId || ""
          previousProviderTrackId = metadata.providerTrackId || ""
        } catch {}
      }

      let track
      try {
        const accessToken = await getAccessToken()
        if (!accessToken) {
          throw new Error("Spotify token unavailable")
        }
        track = await fetchRandomTrack(accessToken, previousTrackId, history)
        track.source = "spotify-preview"
      } catch (spotifyError) {
        track = await fetchFallbackTrack(previousProviderTrackId, history)
      }

      await downloadFileAtomic(track.previewUrl, songPath)

      if (track.coverUrl) {
        try {
          await downloadFile(track.coverUrl, coverPath)
        } catch {}
      }

      const metadata = {
        title: track.title,
        artist: track.artist,
        trackKey: track.trackKey || "",
        spotifyTrackId: track.id,
        providerTrackId: track.providerTrackId || "",
        source: track.source || "spotify-preview",
        lastUpdated: new Date().toISOString()
      }
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2))

      const updatedHistory = [
        {
          trackKey: metadata.trackKey || `${metadata.source}:${metadata.title}`,
          source: metadata.source,
          title: metadata.title,
          artist: metadata.artist,
          at: metadata.lastUpdated
        },
        ...history
      ]
      historyManager.writeHistory(updatedHistory)

      res.json({
        ok: true,
        message: "Song updated successfully",
        ...metadata,
        hasCover: fs.existsSync(coverPath)
      })
    } catch (error) {
      const statusCode = error?.response?.status || 500
      const detail = error?.response?.data || error.message
      res.status(statusCode).json({
        ok: false,
        error: typeof detail === "string" ? detail : JSON.stringify(detail)
      })
    }
  })

  const server = serverApp.listen(PORT, "127.0.0.1")
  return server
}

module.exports = { startMusicServer }