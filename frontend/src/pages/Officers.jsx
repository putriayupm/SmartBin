import { useEffect, useState } from 'react';
import { api } from '../api.js';

const empty = { name: '', username: '', password: '', phone_number: '', assigned_zone: '' };

export default function Officers() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [edit, setEdit] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try { setRows(await api.getOfficerList()); setError(''); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const run = async (fn) => {
    try { await fn(); setError(''); await load(); }
    catch (e) { setError(e.message); }
  };

  const add = (e) => {
    e.preventDefault();
    run(async () => {
      await api.createOfficer({
        name: form.name, username: form.username, password: form.password,
        phone_number: form.phone_number || null, assigned_zone: form.assigned_zone.toUpperCase(),
      });
      setForm(empty);
    });
  };

  const saveEdit = (id) => run(async () => {
    await api.updateOfficer(id, {
      name: edit.name, phone_number: edit.phone_number || null, assigned_zone: edit.assigned_zone.toUpperCase(),
    });
    setEditId(null);
  });

  return (
    <div>
      <h1>Kelola Petugas</h1>
      {error && <p role="alert" style={{ color: 'crimson' }}>{error}</p>}

      <form onSubmit={add}>
        <h2>Tambah petugas</h2>
        <input placeholder="Nama" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input placeholder="Nama pengguna" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
        <input placeholder="Kata sandi (min. 8)" type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        <input placeholder="No. WhatsApp (62...)" value={form.phone_number} onChange={(e) => setForm({ ...form, phone_number: e.target.value })} />
        <input placeholder="Zona" maxLength={2} value={form.assigned_zone} onChange={(e) => setForm({ ...form, assigned_zone: e.target.value })} required />
        <button type="submit">Tambah</button>
      </form>

      {loading ? <p>Memuat...</p> : (
        <table>
          <thead>
            <tr><th>Nama</th><th>Pengguna</th><th>No. WhatsApp</th><th>Zona</th><th>Aksi</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.user_id}>
                {editId === r.user_id ? (
                  <>
                    <td><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></td>
                    <td>{r.username}</td>
                    <td><input value={edit.phone_number} onChange={(e) => setEdit({ ...edit, phone_number: e.target.value })} /></td>
                    <td><input value={edit.assigned_zone} maxLength={2} onChange={(e) => setEdit({ ...edit, assigned_zone: e.target.value })} /></td>
                    <td>
                      <button onClick={() => saveEdit(r.user_id)}>Simpan</button>
                      <button onClick={() => setEditId(null)}>Batal</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td>{r.name}</td>
                    <td>{r.username}</td>
                    <td>{r.phone_number || '-'}</td>
                    <td>{r.assigned_zone}</td>
                    <td>
                      <button onClick={() => { setEditId(r.user_id); setEdit({ name: r.name, phone_number: r.phone_number || '', assigned_zone: r.assigned_zone }); }}>Ubah</button>
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