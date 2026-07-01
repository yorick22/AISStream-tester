require('dotenv').config();
const express = require('express');
const path = require('path');
const WebSocket = require('ws');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

const API_KEY = process.env.AISSTREAM_API_KEY;
const PORT = process.env.PORT || 3000;

if (!API_KEY) {
  console.error('Missing AISSTREAM_API_KEY. Copy .env.example to .env and add your key.');
  process.exit(1);
}

// Latest known position per MMSI, kept in memory and sent to newly connected browsers.
const latestPositions = new Map();

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const server = app.listen(PORT, () => {
  console.log(`Yacht tracker running at http://localhost:${PORT}`);
});

const browserWss = new WebSocket.Server({ server, path: '/ws' });

function broadcastToBrowsers(payload) {
  const data = JSON.stringify(payload);
  browserWss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

browserWss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'snapshot', vessels: Array.from(latestPositions.values()) }));
});

function connectToAisStream() {
  const aisSocket = new WebSocket('wss://stream.aisstream.io/v0/stream');

  aisSocket.on('open', () => {
    console.log('Connected to AISStream.io, subscribing...');
    aisSocket.send(JSON.stringify({
      APIKey: API_KEY,
      BoundingBoxes: config.boundingBoxes,
      FiltersShipMMSI: config.mmsiList,
      FilterMessageTypes: ['PositionReport'],
    }));
  });

  aisSocket.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (err) {
      return;
    }

    if (msg.MessageType !== 'PositionReport') return;

    const report = msg.Message?.PositionReport;
    const meta = msg.MetaData;
    if (!report || !meta) return;

    const vessel = {
      mmsi: String(meta.MMSI),
      name: (meta.ShipName || '').trim() || `MMSI ${meta.MMSI}`,
      lat: report.Latitude,
      lon: report.Longitude,
      speedKnots: report.Sog,
      courseDeg: report.Cog,
      headingDeg: report.TrueHeading,
      timestampUtc: meta.time_utc,
    };

    latestPositions.set(vessel.mmsi, vessel);
    broadcastToBrowsers({ type: 'update', vessel });
  });

  aisSocket.on('close', () => {
    console.log('AISStream connection closed, reconnecting in 5s...');
    setTimeout(connectToAisStream, 5000);
  });

  aisSocket.on('error', (err) => {
    console.error('AISStream error:', err.message);
  });
}

connectToAisStream();
