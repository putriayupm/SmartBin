import { Navigate, Route, Routes, NavLink, useNavigate } from 'react-router-dom';
import { getSession, logout } from './api.js';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Schedule from './pages/Schedule.jsx';
import Households from './pages/Households.jsx';
import Officers from './pages/Officers.jsx';

function Shell({ role, children }) {
  const s = getSession(); const nav = useNavigate();
  if (!s || (role && s.role !== role)) return <Navigate to="/login" replace />;
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">SmartBin<small>Jadwal pengambilan sampah</small></div>
        <nav className="nav">
          {s.role === 'operator' && <NavLink to="/dasbor">Dasbor</NavLink>}
          <NavLink to="/jadwal">Jadwal dan rute</NavLink>
          {s.role === 'operator' && <NavLink to="/rumah">Kelola rumah</NavLink>}
          {s.role === 'operator' && <NavLink to="/petugas">Kelola petugas</NavLink>}
        </nav>
        <div className="me">{s.name}<div style={{ opacity: .75 }}>{s.role === 'operator' ? 'Operator' : `Petugas, Zona ${s.zone}`}</div>
          <button onClick={() => { logout(); nav('/login'); }}>Keluar</button></div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
export default function App() {
  const s = getSession();
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/dasbor" element={<Shell role="operator"><Dashboard /></Shell>} />
      <Route path="/jadwal" element={<Shell><Schedule /></Shell>} />
      <Route path="/rumah" element={<Shell role="operator"><Households /></Shell>} />
      <Route path="/petugas" element={<Shell role="operator"><Officers /></Shell>} />
      <Route path="*" element={<Navigate to={s ? (s.role === 'operator' ? '/dasbor' : '/jadwal') : '/login'} replace />} />
    </Routes>
  );
}
