require("dotenv").config()
const fs = require("fs")
const path = require("path")
const axios = require("axios")

async function run() {
  try {
    const id = process.env.SPOTIFY_CLIENT_ID
    const secret = process.env.SPOTIFY_CLIENT_SECRET
    console.log("id?", Boolean(id), "secret?", Boolean(secret))

    const tokenResp = await axios.post(
      "https://accounts.spotify.com/api/token",
      "grant_type=client_credentials",
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        auth: { username: id, password: secret },
        timeout: 15000
      }
    )

    const token = tokenResp.data.access_token
    console.log("token?", Boolean(token))

    const search = await axios.get("https://api.spotify.com/v1/search", {
      params: { q: "indie", type: "track", limit: 50, market: "US" },
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000
    })

    const items = search.data?.tracks?.items || []
    const withPreview = items.filter((track) => track.preview_url)
    console.log("tracks", items.length, "withPreview", withPreview.length)

    if (!withPreview.length) {
      return
    }

    const candidate = withPreview[0]
    console.log("candidate", candidate.name, "by", candidate.artists?.map((artist) => artist.name).join(", "))

    const outDir = path.join(process.cwd(), "app-data")
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir)
    }

    const outPath = path.join(outDir, "diag-preview.mp3")
    const previewResp = await axios.get(candidate.preview_url, {
      responseType: "stream",
      timeout: 20000
    })

    await new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(outPath)
      previewResp.data.pipe(writer)
      writer.on("finish", resolve)
      writer.on("error", reject)
    })

    console.log("download ok", outPath)
  } catch (error) {
    console.log("diag error", error.message)
    if (error.response) {
      console.log("status", error.response.status)
      console.log("body", JSON.stringify(error.response.data).slice(0, 300))
    }
  }
}

run()
