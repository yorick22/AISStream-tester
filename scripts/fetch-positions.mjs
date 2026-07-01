import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const configPath = path.join(__dirname, '..', 'config.json');
const outputPath = path.join(__dirname, '..', 'docs', 'data', 'positions.json');

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const API_KEY = process.env.AISSTREAM_API_KEY;
const CAPTURE_WINDOW_MS = Number(process.env.CAPTURE_WINDOW_MS || 90000);

if (!API_KEY) {
  console.error('Missing AISSTREAM_API_KEY environment variable.');
  process.exit(1);
}

function loadExistingVessels() {
  try {
    const raw = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    const map = new Map();
    (raw.vessels || []).forEach((v) => map.set(v.mmsi, v));
    return map;
  } catch (err) {
    return new Map();
  }
}

function writeVessels(map) {
  const output = {
    generatedAt: new Date().toISOString(),
    vessels: Array.from(map.values()),
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n');
}

const vessels = loadExistingVessels();
let receivedAny = false;

const socket = new WebSocket('wss://stream.aisstream.io/v0/stream');

const hardTimeout = setTimeout(() => {
  console.log(`Capture window (${CAPTURE_WINDOW_MS}ms) elapsed, closing.`);
  socket.close();
}, CAPTURE_WINDOW_MS);

socket.on('open', () => {
  console.log('Connected to AISStream.io, subscribing...');
  socket.send(JSON.stringify({
    APIKey: API_KEY,
    BoundingBoxes: config.boundingBoxes,
    FiltersShipMMSI: config.mmsiList,
    FilterMessageTypes: ['PositionReport'],
  }));
});

socket.on('message', (raw) => {
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

  const mmsi = String(meta.MMSI);
  vessels.set(mmsi, {
    mmsi,
    name: (meta.ShipName || '').trim() || `MMSI ${mmsi}`,
    lat: report.Latitude,
    lon: report.Longitude,
    speedKnots: report.Sog,
    courseDeg: report.Cog,
    headingDeg: report.TrueHeading,
    timestampUtc: meta.time_utc,
  });
  receivedAny = true;
  console.log(`Position update for MMSI ${mmsi} at ${meta.time_utc}`);
});

socket.on('close', () => {
  clearTimeout(hardTimeout);
  if (receivedAny) {
    writeVessels(vessels);
    console.log(`Wrote ${vessels.size} vessel(s) to ${outputPath}`);
  } else {
    console.log('No new position reports received this run; leaving existing data untouched.');
  }
  process.exit(0);
});

socket.on('error', (err) => {
  console.error('AISStream error:', err.message);
  clearTimeout(hardTimeout);
  process.exit(1);
});
