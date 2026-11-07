// components/RouteMap.jsx
// Shows the stops of a schedule on an OpenStreetMap map (Leaflet).
// Props: stops = rows from GET /api/schedules/today
//   (needs route_order, name, address, latitude, longitude, current_fill_level, status)
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const DEFAULT_CENTER = [-6.32, 106.69]; // Ciater, Serpong: used when there are no stops

// Same thresholds as the rest of the UI: red above 80, amber 60-80, green below
function fillColor(level) {
  if (level > 80) return '#B91C1C';
  if (level >= 60) return '#F59E0B';
  return '#2D6A4F';
}

// A numbered circle drawn with HTML, so we do not depend on Leaflet's default marker images
function numberedIcon(order, level, collected) {
  const html =
    `<div style="width:28px;height:28px;border-radius:50%;background:${fillColor(level)};` +
    `color:#fff;font:600 13px Inter,sans-serif;display:flex;align-items:center;` +
    `justify-content:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);` +
    `opacity:${collected ? 0.45 : 1}">${Number(order)}</div>`;
  return L.divIcon({ html, className: 'sb-marker', iconSize: [28, 28], iconAnchor: [14, 14] });
}

// Built with textContent (not an HTML string) so a name from the database can never inject HTML
function popupContent(s) {
  const box = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = `${s.route_order}. ${s.name}`;
  const address = document.createElement('div');
  address.textContent = s.address ?? '';
  const fill = document.createElement('div');
  fill.textContent = `Isi tong: ${Number(s.current_fill_level)}%`;
  box.append(title, address, fill);
  return box;
}

export default function RouteMap({ stops = [] }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);

  // 1) Create the map once, remove it when the component unmounts
  useEffect(() => {
    const map = L.map(containerRef.current).setView(DEFAULT_CENTER, 16);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // 2) Redraw markers and the line whenever the stops change
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    const valid = stops
      .filter((s) => Number.isFinite(Number(s.latitude)) && Number.isFinite(Number(s.longitude)))
      .sort((a, b) => a.route_order - b.route_order);
    if (valid.length === 0) {
      map.setView(DEFAULT_CENTER, 16);
      return;
    }

    const points = valid.map((s) => [Number(s.latitude), Number(s.longitude)]);
    // Dashed straight lines: they show the visiting order, NOT the real road geometry
        // One line per zone, so zones are never joined to each other
    const byZone = new Map();
    valid.forEach((s) => {
      const key = s.zone ?? '';
      if (!byZone.has(key)) byZone.set(key, []);
      byZone.get(key).push([Number(s.latitude), Number(s.longitude)]);
    });
    byZone.forEach((pts) => {
      if (pts.length > 1) {
        L.polyline(pts, { color: '#2D6A4F', weight: 3, opacity: 0.6, dashArray: '6 6' }).addTo(layer);
      }
    });
    valid.forEach((s, i) => {
      L.marker(points[i], {
        icon: numberedIcon(s.route_order, Number(s.current_fill_level), s.status === 'collected'),
      })
        .bindPopup(popupContent(s))
        .addTo(layer);
    });
    map.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 17 });
  }, [stops]);

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="Peta rute pengambilan"
      style={{ height: 420, width: '100%', borderRadius: 12, overflow: 'hidden' }}
    />
  );
}