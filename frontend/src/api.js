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
const h = (id, name, address, zone, fill, score, reason) => ({
  schedule_id: id, name, address, zone, current_fill_level: fill,
  priority_score: score, reason, status: 'pending',
});
let schedule = [
  h(1, 'Sari Wulandari', 'Blok A No. 12', 'A', 92, 96, 'Tempat sampah 92% penuh dan diperkirakan penuh hari ini. Hujan sore membuat sampah lebih berat dan lebih sulit diangkut besok.'),
  h(2, 'Budi Santoso', 'Blok A No. 7', 'A', 88, 90, 'Tempat sampah 88% penuh, diperkirakan penuh dalam kurang dari sehari.'),
  h(3, 'Dewi Lestari', 'Blok A No. 21', 'A', 71, 68, 'Tempat sampah 71% penuh. Laju pengisian sedang, dimasukkan karena hujan diperkirakan sore ini.'),
  h(4, 'Agus Hartono', 'Blok B No. 3', 'B', 85, 88, 'Tempat sampah 85% penuh dan laju pengisian cepat.'),
  h(5, 'Rina Marlina', 'Blok B No. 15', 'B', 64, 62, 'Tempat sampah 64% penuh. Dimasukkan sebagai antisipasi hujan.'),
  h(6, 'Hasan Basri', 'Blok B No. 9', 'B', 48, 40, 'Tempat sampah 48% penuh. Prioritas rendah, diambil karena searah dengan rute.'),
  h(7, 'Lina Anggraini', 'Blok C No. 3', 'C', 90, 94, 'Tempat sampah 90% penuh dan hampir penuh hari ini.'),
  h(8, 'Eko Prabowo', 'Blok C No. 10', 'C', 58, 55, 'Tempat sampah 58% penuh. Dimasukkan agar tidak menumpuk saat hujan.'),
  h(9, 'Tuti Handayani', 'Blok C No. 18', 'C', 67, 65, 'Tempat sampah 67% penuh dan laju pengisian sedang.'),
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
  async getScheduleSummary() {
    if (!MOCK) return request('/schedules/summary');
    return wait({
      summary: 'Hujan diperkirakan sore ini, jadi rumah dengan tempat sampah hampir penuh didahulukan dan beberapa rumah dengan isi sedang ikut dimasukkan.',
      generated_by: 'ai',
    });
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
