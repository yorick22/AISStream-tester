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

function connect() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

  ws.onopen = () => {
    statusEl.textContent = 'Connected — waiting for position reports';
    statusEl.className = 'status connected';
  };

  ws.onclose = () => {
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
