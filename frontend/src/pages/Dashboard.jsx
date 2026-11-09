import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { fillColor } from './Schedule.jsx';

export default function Dashboard() {
  const [rows, setRows] = useState([]);
  const [officers, setOfficers] = useState([]);
  const [fc, setFc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0); // incremented by "Coba lagi" to reload

  useEffect(() => {
    let alive = true; // avoids updating state after the page was left
    setLoading(true); setError('');
    // Schedule and officers are required: if either fails, show an error
    Promise.all([api.getSchedule(), api.getOfficers()])
      .then(([s, o]) => { if (alive) { setRows(s); setOfficers(o); } })
      .catch((e) => { if (alive) setError(e.message || 'Gagal memuat data.'); })
      .finally(() => { if (alive) setLoading(false); });
    // Weather is optional: if it fails, the dashboard works without the banner
    api.getForecast().then((f) => { if (alive) setFc(f); }).catch(() => {});
    return () => { alive = false; };
  }, [tick]);

  if (loading) return <p className="muted" role="status">Memuat data...</p>;
  if (error) return (<>
    <h1>Dasbor operator</h1>
    <p className="err" role="alert">{error}</p>
    <button className="btn" onClick={() => setTick((t) => t + 1)}>Coba lagi</button>
  </>);

  // Skipped stops (removed by the operator) are not part of today's work
  const active = rows.filter((r) => r.status !== 'skipped');
  const done = active.filter((r) => r.status === 'collected').length;
  const near = active.filter((r) => r.status !== 'collected' && r.current_fill_level > 80).length;
  const top = active.filter((r) => r.status !== 'collected').sort((a, b) => b.current_fill_level - a.current_fill_level).slice(0, 5);
  const pct = active.length ? Math.round((done / active.length) * 100) : 0;

  return (<>
    <h1>Dasbor operator</h1><p className="muted">Ringkasan pengambilan sampah hari ini.</p>
    {fc?.rain && <div className="banner" role="status"><b>Cuaca memengaruhi jadwal.</b> {fc.text}</div>}
    <div className="stats">
      <div className="card stat"><b>{active.length}</b>Rumah dijadwalkan</div>
      <div className="card stat alert"><b>{near}</b>Hampir penuh (di atas 80%)</div>
      <div className="card stat"><b>{done}/{active.length}</b>Sudah diambil<div className="bar"><i style={{ width: `${pct}%` }} /></div></div>
      <div className="card stat"><b>{officers.length}</b>Petugas bertugas</div>
    </div>
    <div className="cols">
      <section className="card"><h2>Tempat sampah paling penuh</h2>
        {top.length === 0 && <p className="muted">Semua rumah sudah diambil.</p>}
        {top.map((r) => (<div className="row" key={r.schedule_id}>
          <div className="grow"><b>{r.name}</b><div className="muted">{r.address}, Zona {r.zone}</div></div>
          <span className="fill" style={{ color: fillColor(r.current_fill_level) }}>{Math.round(r.current_fill_level)}%</span></div>))}
      </section>
      <section className="card"><h2>Status petugas</h2>
        {officers.map((o) => {
          const mine = active.filter((r) => r.zone === o.zone);
          const d = mine.filter((r) => r.status === 'collected').length;
          return (<div className="row" key={o.username}><div className="grow"><b>{o.name}</b><div className="muted">Zona {o.zone}</div>
            <div className="bar"><i style={{ width: `${mine.length ? (d / mine.length) * 100 : 0}%` }} /></div></div>
            <span className="muted">{d}/{mine.length}</span></div>);
        })}
      </section>
    </div>
  </>);
}