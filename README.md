# Yacht Tracker (AISStream.io)

A simple web app that shows the live location of specific yachts on a map, using the
[AISStream.io](https://aisstream.io) real-time AIS feed.

## How it works

- `server.js` opens a WebSocket connection to AISStream.io, subscribes to position reports
  for the MMSI numbers listed in `config.json`, and relays each update to connected browsers
  over its own WebSocket endpoint (`/ws`).
- `docs/` is a small Leaflet-based web page that plots each yacht as a marker and updates
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

## Running it entirely on GitHub (no server to host)

GitHub Pages only serves static files, so it can't run `server.js` directly. Instead, a
GitHub Actions workflow (`.github/workflows/update-positions.yml`) periodically connects to
AISStream.io for a short window, writes the latest known position of each tracked yacht to
`docs/data/positions.json`, and commits that file. The page's frontend automatically falls
back to polling that JSON file (every 60s) whenever it can't reach a live `/ws` server — which
is exactly the situation on GitHub Pages. This means positions update roughly every 15 minutes
(the cron schedule) rather than instantly, but nothing needs to be hosted elsewhere.

One-time setup on GitHub (github.com, not something I can do for you):

1. **Add your API key as a repository secret**: repo → Settings → Secrets and variables →
   Actions → New repository secret → name it `AISSTREAM_API_KEY`, paste your key.
2. **Allow Actions to push commits**: repo → Settings → Actions → General → Workflow
   permissions → select "Read and write permissions" → Save.
3. **Enable GitHub Pages**: repo → Settings → Pages → Source: "Deploy from a branch" →
   pick this branch and the `/docs` folder → Save. GitHub will publish the site at
   `https://<username>.github.io/<repo>/`.
4. Optionally trigger the workflow once manually: repo → Actions → "Update yacht positions" →
   Run workflow — so `docs/data/positions.json` has real data before you first load the page.

After that, the workflow keeps refreshing `docs/data/positions.json` on its own schedule
(every 15 minutes, editable via the `cron` line in the workflow file), and the Pages site
will show the latest data automatically.
