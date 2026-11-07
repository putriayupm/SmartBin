// Satu-satunya tempat panggilan data. Mock aktif sampai VITE_USE_MOCK=false.
const MOCK = import.meta.env.VITE_USE_MOCK !== 'false';
const API_URL = import.meta.env.VITE_API_URL;
const wait = (v) => new Promise((r) => setTimeout(() => r(structuredClone(v)), 250));

export const getSession = () => JSON.parse(localStorage.getItem('session') || 'null');
export const logout = () => localStorage.removeItem('session');

async function request(path, options = {}) {
  const s = getSession();
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers: {
      'Content-Type': 'application/json', ...(s && { Authorization: `Bearer ${s.token}` }) } });
  } catch {
    throw new Error('Tidak dapat terhubung ke server. Periksa koneksi atau coba lagi nanti.');
  }
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

// Translates the agreed weather contract {available, rain_expected, rainy_periods, summary}
// into the shape the Dashboard uses {rain, text}. If the forecast is unavailable, show no banner.
const adaptForecast = (f) => ({
  rain: Boolean(f?.available && f?.rain_expected),
  text: f?.summary || '',
});

const num = (v) => (v == null ? v : Number(v));
const normalizeStop = (r) => ({
  ...r,
  current_fill_level: num(r.current_fill_level), priority_score: num(r.priority_score),
  latitude: num(r.latitude), longitude: num(r.longitude),
});

export const api = {
  async login({ username, password, role }) {
    if (!MOCK) return request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password, role }) });
    const u = users.find((x) => x.username === username && x.role === role);
    if (!u || password !== 'smartbin123') { await wait(0); throw new Error('Nama pengguna atau kata sandi tidak cocok dengan peran yang dipilih.'); }
    return wait({ token: 'mock-token', ...u });
  },
  async getSchedule() {
    if (!MOCK) return (await request('/schedules/today')).map(normalizeStop);
    const s = getSession();
    const list = s.role === 'officer' ? schedule.filter((x) => x.zone === s.zone) : schedule;
    return wait([...list].sort((a, b) => a.route_order - b.route_order));
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
    // override (mock)
  async removeStop(id) {
        if (!MOCK) return request(`/schedules/${id}/override`, { method: 'PATCH', body: JSON.stringify({ status: 'skipped' }) });
    schedule = schedule.map((x) => (x.schedule_id === id && x.status === 'pending' ? { ...x, status: 'skipped' } : x));
    return wait({ message: 'ok' });
  },
  // swaps route_order with the neighbour in the same zone
  async moveStop(id, direction) {
    if (!MOCK) return request(`/schedules/${id}/move`, { method: 'PATCH', body: JSON.stringify({ direction }) });
    const me = schedule.find((x) => x.schedule_id === id);
    if (!me || me.status !== 'pending') return wait({ message: 'ok' });
    const sameZone = schedule
      .filter((x) => x.zone === me.zone && x.status === 'pending')
      .sort((a, b) => a.route_order - b.route_order);
    const i = sameZone.findIndex((x) => x.schedule_id === id);
    const other = sameZone[direction === 'up' ? i - 1 : i + 1];
    if (!other) return wait({ message: 'ok' }); // already first/last
    const a = me.route_order, b = other.route_order;
    schedule = schedule.map((x) =>
      x.schedule_id === me.schedule_id ? { ...x, route_order: b }
      : x.schedule_id === other.schedule_id ? { ...x, route_order: a } : x);
    return wait({ message: 'ok' });
  },
  getOfficers() {
    if (!MOCK) return request('/users/officers');
    return wait(users.filter((u) => u.role === 'officer'));
  },
  async getForecast() {
    if (!MOCK) return adaptForecast(await request('/weather'));
    return wait(adaptForecast({
      available: true, rain_expected: true, rainy_periods: 3,
      summary: 'Hujan diperkirakan sore ini. Agen AI menaikkan prioritas tempat sampah yang hampir penuh.',
    }));
  },
};
