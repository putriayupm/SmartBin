// pages/RouteMapPage.jsx
// Route map for the day's schedule. Officers see their own zone (the API already filters),
// operators can pick a zone. Skipped stops are hidden because they are not on the route.
import { useEffect, useState } from 'react';
import { api, getSession } from '../api.js';
import RouteMap from '../components/RouteMap.jsx';

const LEGEND = [
  { color: 'var(--red)', label: 'Di atas 80%' },
  { color: 'var(--amber)', label: '60 sampai 80%' },
  { color: 'var(--green)', label: 'Di bawah 60%' },
];

export default function RouteMapPage() {
  const s = getSession();
  const [rows, setRows] = useState([]);
  const [zone, setZone] = useState('all');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getSchedule()
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const shown = rows.filter((r) => r.status !== 'skipped' && (zone === 'all' || r.zone === zone));
  const withCoords = shown.filter(
    (r) => Number.isFinite(Number(r.latitude)) && Number.isFinite(Number(r.longitude))
  );
  const missing = shown.length - withCoords.length;

  return (
    <>
      <h1>Peta rute hari ini</h1>
      <p className="muted">Angka menunjukkan urutan kunjungan. Warna menunjukkan seberapa penuh tempat sampahnya.</p>

      {s.role === 'operator' && (
        <div style={{ margin: '1rem 0' }}>
          <label htmlFor="zone" style={{ display: 'inline', marginRight: '.5rem' }}>Zona</label>
          <select id="zone" value={zone} onChange={(e) => setZone(e.target.value)}>
            <option value="all">Semua zona</option>
            {['A', 'B', 'C'].map((z) => (
              <option key={z} value={z}>Zona {z}</option>
            ))}
          </select>
        </div>
      )}

      {error && <p className="err" role="alert">{error}</p>}
      {loading && <p className="muted">Memuat peta...</p>}
      {!loading && !error && shown.length === 0 && <p className="muted">Belum ada jadwal untuk hari ini.</p>}
      {missing > 0 && (
        <p className="muted" role="status">{missing} rumah belum punya koordinat dan tidak tampil di peta.</p>
      )}

      <RouteMap stops={withCoords} />

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '.75rem' }} aria-label="Keterangan warna">
        {LEGEND.map((l) => (
          <span key={l.label} className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem' }}>
            <i style={{ width: 12, height: 12, borderRadius: '50%', background: l.color, display: 'inline-block' }} />
            {l.label}
          </span>
        ))}
        <span className="muted">Garis putus-putus hanya menunjukkan urutan, bukan jalur jalan sebenarnya.</span>
      </div>
    </>
  );
}