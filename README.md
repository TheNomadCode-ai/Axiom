# Bootup App

A desktop application built with Electron that serves as a bootup screen with various features.

## Features

- ✅ Greeting changes by time (Good Morning/Afternoon/Evening)
- ✅ Clock updates in real-time
- ✅ Quote loads from an online API
- ✅ Weather loads from an online API (set to Kathmandu coordinates)
- ✅ Music plays background tracks
- ✅ Mute button works to toggle audio
- ✅ Next button works to skip to next track
- ✅ Enter Desktop button exits the app with fade out
- ✅ Space / Enter / Esc keys exit the app

## How to Run

1. Install dependencies: `npm install`
2. Start the app: `npm start`

## Files

- `main.js`: Electron main process
- `preload.js`: Preload script (currently empty)
- `renderer.js`: Frontend logic
- `index.html`: HTML structure
- `style.css`: Styling
- `assets/music/`: Background music files

## APIs Used

- Quotes: https://api.quotable.io/random
- Weather: https://api.open-meteo.com/v1/forecast (latitude=27.7, longitude=85.3)