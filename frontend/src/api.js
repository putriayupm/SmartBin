// Satu-satunya tempat panggilan data. Mock aktif sampai VITE_USE_MOCK=false.
const MOCK = import.meta.env.VITE_USE_MOCK !== 'false';
const API_URL = import.meta.env.VITE_API_URL;
const wait = (v) => new Promise((r) => setTimeout(() => r(structuredClone(v)), 250));

export const getSession = () => JSON.parse(localStorage.getItem('session') || 'null');
export const logout = () => localStorage.removeItem('session');

async function request(path, options = {}) {
  const s = getSession();
  const res = await fetch(`${API_URL}${path}`, { ...options, headers: {
    'Content-Type': 'application/json', ...(s && { Authorization: `Bearer ${s.token}` }) } });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || `Gagal (${res.status})`);
  return res.json();
}

const users = [
  { username: 'slamet.riyadi', name: 'Slamet Riyadi', role: 'officer', zone: 'A' },
  { username: 'joko.prasetyo', name: 'Joko Prasetyo', role: 'officer', zone: 'B' },
  { username: 'dedi.kurniawan', name: 'Dedi Kurniawan', role: 'officer', zone: 'C' },
  { username: 'hendra.wijaya', name: 'Hendra Wijaya', role: 'operator', zone: null },
];
const h = (id, name, address, zone, fill) => ({ schedule_id: id, name, address, zone, current_fill_level: fill, status: 'pending' });
let schedule = [
  h(1, 'Sari Wulandari', 'Blok A No. 12', 'A', 92), h(2, 'Budi Santoso', 'Blok A No. 7', 'A', 88),
  h(3, 'Dewi Lestari', 'Blok A No. 21', 'A', 71), h(4, 'Agus Hartono', 'Blok B No. 3', 'B', 85),
  h(5, 'Rina Marlina', 'Blok B No. 15', 'B', 64), h(6, 'Hasan Basri', 'Blok B No. 9', 'B', 48),
  h(7, 'Lina Anggraini', 'Blok C No. 3', 'C', 90), h(8, 'Eko Prabowo', 'Blok C No. 10', 'C', 58),
  h(9, 'Tuti Handayani', 'Blok C No. 18', 'C', 67),
].map((x, i) => ({ ...x, route_order: i + 1 }));

export const api = {
  async login({ username, password, role }) {
    if (!MOCK) return request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password, role }) });
    const u = users.find((x) => x.username === username && x.role === role);
    if (!u || password !== 'smartbin123') { await wait(0); throw new Error('Nama pengguna atau kata sandi tidak cocok dengan peran yang dipilih.'); }
    return wait({ token: 'mock-token', ...u });
  },
  getSchedule() {
    if (!MOCK) return request('/schedules/today');
    const s = getSession();
    return wait(s.role === 'officer' ? schedule.filter((x) => x.zone === s.zone) : schedule);
  },
  async markCollected(id) {
    if (!MOCK) return request(`/schedules/${id}/collected`, { method: 'PATCH' });
    schedule = schedule.map((x) => (x.schedule_id === id ? { ...x, status: 'collected', current_fill_level: 0 } : x));
    return wait({ message: 'ok' });
  },
  getOfficers() {
    if (!MOCK) return request('/users/officers');
    return wait(users.filter((u) => u.role === 'officer'));
  },
  getForecast() {
    if (!MOCK) return request('/weather');
    return wait({ rain: true, text: 'Hujan diperkirakan sore ini. Agen AI menaikkan prioritas tempat sampah yang hampir penuh.' });
  },
};
