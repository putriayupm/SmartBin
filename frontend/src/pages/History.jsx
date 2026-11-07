import { useEffect, useState } from 'react';
import { api } from '../api.js';
import './History.css';

const DAYS = 7; // GET /history/summary?days=7
const dayKey = (d) => String(d).slice(0, 10); // accepts '2026-11-06' or an ISO datetime
const asDate = (d) => new Date(`${dayKey(d)}T00:00:00Z`);
const fmtDay = (d) => new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric', timeZone: 'UTC' }).format(asDate(d));
const fmtLong = (d) => new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(asDate(d));
const fmtTime = (iso) => new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' }).format(new Date(iso));
const pct = (d) => (d.scheduled ? Math.round((d.collected / d.scheduled) * 100) : 0);

export default function History() {
  // undefined = loading, null = failed or endpoint not ready
  const [summary, setSummary] = useState(undefined);
  const [rows, setRows] = useState(undefined);
  const [asTable, setAsTable] = useState(false);

  useEffect(() => {
    api.getHistorySummary(DAYS).then(setSummary).catch(() => setSummary(null));
    api.getHistory(10).then(setRows).catch(() => setRows(null));
  }, []);

  const days = summary?.days ?? [];

  return (<>
    <h1>Riwayat pengambilan dan kinerja</h1>
    <p className="muted">Ringkasan {DAYS} hari terakhir dan pengambilan terbaru.</p>

    {summary === null && <p className="muted hs-note" role="status">Ringkasan kinerja belum tersedia.</p>}

    {summary && (<>
      <div className="stats hs-stats">
        <div className="card stat"><b>{Math.round(summary.completion_rate)}%</b>Tingkat penyelesaian</div>
        <div className="card stat"><b>{summary.total_collections}</b>Total pengambilan</div>
      </div>

      <section className="card hs-chart-card">
        <h2>Tingkat penyelesaian per hari</h2>
        <p className="muted">Rumah terjadwal yang sudah diambil, dalam persen.</p>
        {days.length === 0
          ? <p className="muted">Belum ada jadwal pada periode ini.</p>
          : (<>
            <div className="hs-plot">
              <div className="hs-yaxis" aria-hidden="true"><span>100%</span><span>50%</span><span>0%</span></div>
              <div className="hs-bars">
                {days.map((d) => {
                  const p = pct(d);
                  return (
                    <div className="hs-col" key={dayKey(d.date)} tabIndex={0}
                      aria-label={`${fmtLong(d.date)}: ${d.collected} dari ${d.scheduled} rumah (${p}%)`}>
                      <div className="hs-track"><i style={{ height: `${p}%` }} /></div>
                      <span className="hs-day">{fmtDay(d.date)}</span>
                      <div className="hs-tip" role="tooltip">
                        <b>{p}%</b>
                        <span>{d.collected} dari {d.scheduled} rumah</span>
                        <span className="muted">{fmtLong(d.date)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <button type="button" className="hs-link" aria-expanded={asTable} onClick={() => setAsTable(!asTable)}>
              {asTable ? 'Sembunyikan tabel' : 'Tampilkan sebagai tabel'}
            </button>
            {asTable && (
              <div className="hs-scroll"><table className="hs-table">
                <thead><tr><th>Tanggal</th><th>Terjadwal</th><th>Diambil</th><th>Selesai</th></tr></thead>
                <tbody>{days.map((d) => (
                  <tr key={dayKey(d.date)}><td>{fmtLong(d.date)}</td><td>{d.scheduled}</td><td>{d.collected}</td><td>{pct(d)}%</td></tr>
                ))}</tbody>
              </table></div>
            )}
          </>)}
      </section>
    </>)}

    <section className="card hs-recent">
      <h2>Pengambilan terbaru</h2>
      {rows === undefined && <p className="muted">Memuat...</p>}
      {rows === null && <p className="err" role="alert">Riwayat tidak dapat dimuat. Coba muat ulang halaman.</p>}
      {rows && rows.length === 0 && <p className="muted">Belum ada pengambilan yang tercatat.</p>}
      {rows && rows.length > 0 && (
        <div className="hs-scroll"><table className="hs-table">
          <thead><tr><th>Waktu</th><th>Rumah</th><th>Zona</th><th>Petugas</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.history_id}>
              <td>{fmtTime(r.collected_at)}</td>
              <td><b>{r.household_name}</b><div className="muted">{r.address}</div></td>
              <td>{r.zone}</td><td>{r.officer_name}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </section>
  </>);
}
