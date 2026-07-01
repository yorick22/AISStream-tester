# Yacht Tracker (AISStream.io)

A simple web app that shows the live location of specific yachts on a map, using the
[AISStream.io](https://aisstream.io) real-time AIS feed.

## How it works

- `server.js` opens a WebSocket connection to AISStream.io, subscribes to position reports
  for the MMSI numbers listed in `config.json`, and relays each update to connected browsers
  over its own WebSocket endpoint (`/ws`).
- `public/` is a small Leaflet-based web page that plots each yacht as a marker and updates
  its position live as new AIS reports arrive.

## Setup

1. Install dependencies:
   ```
   npm install
   ```
2. Copy `.env.example` to `.env` and set your AISStream.io API key:
   ```
   cp .env.example .env
   ```
   (Get a free key at https://aisstream.io after creating an account.)
3. Edit `config.json` to list the MMSI number(s) of the yacht(s) you want to track:
   ```json
   {
     "mmsiList": ["538071148"],
     "boundingBoxes": [[[-90, -180], [90, 180]]]
   }
   ```
   `boundingBoxes` can be narrowed to a region for faster/lighter subscriptions, but the
   worldwide default works fine when filtering by MMSI.
4. Start the app:
   ```
   npm start
   ```
5. Open http://localhost:3000 in your browser.

## Notes

- A yacht will only appear once AISStream.io receives a fresh AIS position report for it —
  this depends on the vessel being within range of an AIS receiver and actively transmitting.
- Add more yachts by adding more MMSI numbers to `config.json` and restarting the server.
