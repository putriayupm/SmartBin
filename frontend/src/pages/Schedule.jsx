import { useEffect, useState } from 'react';
import { api, getSession } from '../api.js';

export const fillColor = (l) => (l > 80 ? 'var(--red)' : l >= 60 ? 'var(--amber)' : 'var(--green)');

export default function Schedule() {
  const s = getSession();
  const [rows, setRows] = useState([]); const [zone, setZone] = useState('all'); const [busy, setBusy] = useState(null); const [error, setError] = useState(''); const [summary, setSummary] = useState(null);  const load = () => api.getSchedule().then(setRows).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    api.getScheduleSummary().then(setSummary).catch(() => setSummary(null));
  }, []);
  const mark = async (id) => { setBusy(id); setError(''); try { await api.markCollected(id); await load(); } catch (e) { setError(e.message); } finally { setBusy(null); } };
  const act = async (id, fn) => { setBusy(id); setError(''); try { await fn(); await load(); } catch (e) { setError(e.message); } finally { setBusy(null); } };
  const remove = (r) => { if (window.confirm(`Hapus ${r.name} dari jadwal hari ini?`)) act(r.schedule_id, () => api.removeStop(r.schedule_id)); };
  const move = (r, dir) => act(r.schedule_id, () => api.moveStop(r.schedule_id, dir));
  const shown = rows.filter((r) => zone === 'all' || r.zone === zone);
  const active = shown.filter((r) => r.status !== 'skipped');
  const done = active.filter((r) => r.status === 'collected').length;
  const next = s.role === 'officer' ? shown.find((r) => r.status === 'pending') : null;
  return (<>
    <h1>Jadwal dan rute hari ini</h1>
    <p className="muted">Urutan disusun oleh agen AI berdasarkan isi tempat sampah, cuaca, dan hari libur.</p>
    {summary?.summary && (
      <div className="banner" role="status"><b>Ringkasan agen AI.</b> {summary.summary}</div>
    )}
    {s.role === 'operator' && <div style={{ margin: '1rem 0' }}><label htmlFor="z" style={{ display: 'inline', marginRight: '.5rem' }}>Zona</label>
      <select id="z" value={zone} onChange={(e) => setZone(e.target.value)}><option value="all">Semua zona</option>
        {['A', 'B', 'C'].map((z) => <option key={z} value={z}>Zona {z}</option>)}</select></div>}
    <div className="card" style={{ margin: '1rem 0' }}><b>{done} dari {active.length} rumah sudah diambil</b>
      <div className="bar"><i style={{ width: `${active.length ? (done / active.length) * 100 : 0}%` }} /></div></div>
    {error && <p className="err" role="alert">{error}</p>}
    {next && <div className="card next"><h2>Berikutnya: {next.name}</h2><p className="muted">{next.address}, tempat sampah {Math.round(next.current_fill_level)}% penuh</p>
      <button className="btn big" style={{ marginTop: '.9rem' }} disabled={busy === next.schedule_id} onClick={() => mark(next.schedule_id)}>
        {busy === next.schedule_id ? 'Menyimpan...' : 'Tandai sudah diambil'}</button></div>}
    <section className="card">
      {active.length === 0 && <p className="muted">Belum ada jadwal untuk hari ini.</p>}
      {shown.map((r) => (<div className={`row ${r.status === 'collected' ? 'done' : ''}`} key={r.schedule_id}>
        <span className="no">{r.route_order}</span>
        <div className="grow"><b>{r.name}</b><div className="muted">{r.address}, Zona {r.zone}</div>
          {r.reason && <div className="muted" style={{ marginTop: '.25rem', fontSize: '.85rem' }}>Alasan: {r.reason}</div>}
        </div>
        {r.status === 'collected' ? <span className="tag">Sudah diambil</span>
          : r.status === 'skipped' ? <span className="tag">Dilewati</span>
          : <span className="fill" style={{ color: fillColor(r.current_fill_level) }}>{Math.round(r.current_fill_level)}%</span>}
        {s.role === 'operator' && r.status === 'pending' && (
          <span style={{ display: 'flex', gap: '.25rem', marginLeft: '.5rem' }}>
            <button className="btn" aria-label={`Naikkan ${r.name}`} disabled={busy === r.schedule_id} onClick={() => move(r, 'up')}>↑</button>
            <button className="btn" aria-label={`Turunkan ${r.name}`} disabled={busy === r.schedule_id} onClick={() => move(r, 'down')}>↓</button>
            <button className="btn" aria-label={`Hapus ${r.name}`} disabled={busy === r.schedule_id} onClick={() => remove(r)}>Hapus</button>
          </span>
        )}
      </div>))}
    </section>
  </>);
}