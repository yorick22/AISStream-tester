const map = L.map('map').setView([0, 0], 2);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 18,
}).addTo(map);

const markers = new Map();
const vessels = new Map();
let hasCentered = false;

const statusEl = document.getElementById('status');
const listEl = document.getElementById('vessel-list');

function yachtIcon() {
  return L.divIcon({
    className: 'yacht-icon',
    html: '⛵',
    iconSize: [24, 24],
  });
}

function upsertVessel(vessel) {
  vessels.set(vessel.mmsi, vessel);

  let marker = markers.get(vessel.mmsi);
  const latLng = [vessel.lat, vessel.lon];

  if (!marker) {
    marker = L.marker(latLng, { icon: yachtIcon() }).addTo(map);
    markers.set(vessel.mmsi, marker);
  } else {
    marker.setLatLng(latLng);
  }

  marker.bindPopup(popupHtml(vessel));

  if (!hasCentered) {
    map.setView(latLng, 10);
    hasCentered = true;
  }

  renderList();
}

function popupHtml(vessel) {
  const time = vessel.timestampUtc ? new Date(vessel.timestampUtc).toLocaleString() : 'unknown';
  return `
    <strong>${escapeHtml(vessel.name)}</strong><br/>
    MMSI: ${escapeHtml(vessel.mmsi)}<br/>
    Speed: ${vessel.speedKnots ?? '?'} kn<br/>
    Course: ${vessel.courseDeg ?? '?'}&deg;<br/>
    Updated: ${time}
  `;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function renderList() {
  listEl.innerHTML = '';
  for (const vessel of vessels.values()) {
    const li = document.createElement('li');
    const time = vessel.timestampUtc ? new Date(vessel.timestampUtc).toLocaleTimeString() : '—';
    li.innerHTML = `
      <div class="name">${escapeHtml(vessel.name)}</div>
      <div class="detail">MMSI ${escapeHtml(vessel.mmsi)} · ${vessel.speedKnots ?? '?'} kn · ${time}</div>
    `;
    li.addEventListener('click', () => {
      const marker = markers.get(vessel.mmsi);
      if (marker) {
        map.setView(marker.getLatLng(), 12);
        marker.openPopup();
      }
    });
    listEl.appendChild(li);
  }
}

// On a static host like GitHub Pages there is no live /ws server, so if the
// WebSocket doesn't open quickly we fall back to polling a JSON file that's
// refreshed periodically by a GitHub Actions workflow.
const POLL_INTERVAL_MS = 60000;
const WS_FALLBACK_MS = 4000;
let usingPolling = false;

async function pollPositions() {
  try {
    const res = await fetch(`data/positions.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    (data.vessels || []).forEach(upsertVessel);
    if (data.generatedAt) {
      statusEl.textContent = `Static mode — last updated ${new Date(data.generatedAt).toLocaleString()}`;
      statusEl.className = 'status connected';
    }
  } catch (err) {
    statusEl.textContent = 'Static mode — could not load position data';
    statusEl.className = 'status disconnected';
  }
}

function startPolling() {
  if (usingPolling) return;
  usingPolling = true;
  pollPositions();
  setInterval(pollPositions, POLL_INTERVAL_MS);
}

function connect() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
  let opened = false;

  const fallbackTimer = setTimeout(() => {
    if (!opened) {
      ws.close();
      startPolling();
    }
  }, WS_FALLBACK_MS);

  ws.onopen = () => {
    opened = true;
    clearTimeout(fallbackTimer);
    statusEl.textContent = 'Connected — waiting for position reports';
    statusEl.className = 'status connected';
  };

  ws.onclose = () => {
    if (usingPolling) return;
    if (!opened) return; // fallbackTimer will switch to polling
    statusEl.textContent = 'Disconnected — retrying...';
    statusEl.className = 'status disconnected';
    setTimeout(connect, 3000);
  };

  ws.onerror = () => ws.close();

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'snapshot') {
      msg.vessels.forEach(upsertVessel);
    } else if (msg.type === 'update') {
      upsertVessel(msg.vessel);
    }
  };
}

connect();
