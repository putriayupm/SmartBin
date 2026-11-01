import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

export default function Login() {
  const [role, setRole] = useState('officer');
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const u = await api.login({ ...form, role });
      localStorage.setItem('session', JSON.stringify(u));
      nav(u.role === 'operator' ? '/dasbor' : '/jadwal');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <div className="login"><form className="card" onSubmit={submit}>
      <h1>Selamat datang</h1><p className="muted">Masuk untuk melihat jadwal pengambilan sampah.</p>
      <div className="seg" role="group" aria-label="Peran">
        <button type="button" className={role === 'officer' ? 'on' : ''} onClick={() => setRole('officer')}>Petugas</button>
        <button type="button" className={role === 'operator' ? 'on' : ''} onClick={() => setRole('operator')}>Operator</button>
      </div>
      <label htmlFor="u">Nama pengguna</label>
      <input id="u" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
      <label htmlFor="p">Kata sandi</label>
      <input id="p" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
      {error && <p className="err" role="alert">{error}</p>}
      <button className="btn big" style={{ marginTop: '1.25rem' }} disabled={busy}>{busy ? 'Memeriksa...' : 'Masuk'}</button>
      <p className="muted" style={{ marginTop: '1rem', fontSize: '.85rem' }}>.</p>
    </form></div>
  );
}
