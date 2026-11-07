import { useEffect, useState } from 'react';
import { api } from '../api.js';

const empty = { name: '', address: '', zone: '', latitude: '', longitude: '' };

export default function Households() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [edit, setEdit] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try { setRows(await api.getHouseholds()); setError(''); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const run = async (fn) => {
    try { await fn(); setError(''); await load(); }
    catch (e) { setError(e.message); }
  };

  const num = (v) => (v === '' ? null : Number(v));

  const add = (e) => {
    e.preventDefault();
    run(async () => {
      await api.createHousehold({
        name: form.name, address: form.address, zone: form.zone.toUpperCase(),
        latitude: num(form.latitude), longitude: num(form.longitude),
      });
      setForm(empty);
    });
  };

  const saveEdit = (id) => run(async () => {
    await api.updateHousehold(id, { name: edit.name, address: edit.address, zone: edit.zone.toUpperCase() });
    setEditId(null);
  });

  const changeFill = (id, value) => {
    const level = Number(value);
    if (!Number.isFinite(level) || level < 0 || level > 100) { setError('Tingkat isi harus 0 sampai 100.'); return; }
    run(() => api.setFillLevel(id, level));
  };

  return (
    <div>
      <h1>Kelola Rumah</h1>
      {error && <p role="alert" style={{ color: 'crimson' }}>{error}</p>}

      <form onSubmit={add}>
        <h2>Tambah rumah</h2>
        <input placeholder="Nama" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input placeholder="Alamat" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} required />
        <input placeholder="Zona (A/B/C)" value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} required maxLength={2} />
        <input placeholder="Latitude" type="number" step="any" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} />
        <input placeholder="Longitude" type="number" step="any" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} />
        <button type="submit">Tambah</button>
      </form>

      {loading ? <p>Memuat...</p> : (
        <table>
          <thead>
            <tr><th>Nama</th><th>Alamat</th><th>Zona</th><th>Isi (%)</th><th>Aksi</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.household_id}>
                {editId === r.household_id ? (
                  <>
                    <td><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></td>
                    <td><input value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></td>
                    <td><input value={edit.zone} maxLength={2} onChange={(e) => setEdit({ ...edit, zone: e.target.value })} /></td>
                    <td>{r.current_fill_level}</td>
                    <td>
                      <button onClick={() => saveEdit(r.household_id)}>Simpan</button>
                      <button onClick={() => setEditId(null)}>Batal</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td>{r.name}</td>
                    <td>{r.address}</td>
                    <td>{r.zone}</td>
                    <td>
                      <input type="number" min="0" max="100" defaultValue={r.current_fill_level}
                        key={`${r.household_id}-${r.current_fill_level}`}
                        onBlur={(e) => Number(e.target.value) !== Number(r.current_fill_level) && changeFill(r.household_id, e.target.value)}
                        style={{ width: 70 }} />
                    </td>
                    <td>
                      <button onClick={() => { setEditId(r.household_id); setEdit({ name: r.name, address: r.address, zone: r.zone }); }}>Ubah</button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}