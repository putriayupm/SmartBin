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

// Sample coordinates around Ciater so the route map works in mock mode (keyed by schedule_id)
const mockCoords = {
  1: [-6.3190, 106.6886], 2: [-6.3197, 106.6894], 3: [-6.3205, 106.6902],
  4: [-6.3212, 106.6910], 5: [-6.3220, 106.6918], 6: [-6.3228, 106.6911],
  7: [-6.3236, 106.6903], 8: [-6.3229, 106.6895], 9: [-6.3221, 106.6888],
};

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
    const list = s.role === 'officer' ? schedule.filter((x) => x.zone === s.zone) : schedule;
      const withCoords = list.map((x) => ({
      ...x,
      latitude: mockCoords[x.schedule_id]?.[0],
      longitude: mockCoords[x.schedule_id]?.[1],
    }));
    return wait(withCoords.sort((a, b) => a.route_order - b.route_order));
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
    if (!MOCK) return request(`/schedules/${id}/skip`, { method: 'PATCH' });
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
  getForecast() {
    if (!MOCK) return request('/weather');
    return wait({ available: true, rain_expected: true, rainy_periods: 1, summary: 'Hujan diperkirakan pada 1 periode (3 jam) dalam 24 jam ke depan.' });
  },
  getHistory(limit = 10) {
  if (!MOCK) return request(`/history?limit=${limit}`);
  return wait(mockHistory().slice(0, limit));
  },
  getHistorySummary(days = 7) {
  if (!MOCK) return request(`/history/summary?days=${days}`);
  return wait(mockSummary());
  },
};
const dayStr = (back) => new Date(Date.now() - back * 864e5).toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
const mockSummary = () => {
  const days = [8, 9, 7, 9, 9, 8, 6].map((c, i) => ({ date: dayStr(7 - i), scheduled: 9, collected: c }));
  const sched = days.reduce((a, d) => a + d.scheduled, 0);
  const coll = days.reduce((a, d) => a + d.collected, 0);
  return { total_collections: coll, completion_rate: Math.round((coll / sched) * 1000) / 10, days };
};
const mockHistory = () => [
  ['Lina Anggraini', 'Blok C No. 3', 'C', 'Dedi Kurniawan', '09:12'],
  ['Hasan Basri', 'Blok B No. 9', 'B', 'Joko Prasetyo', '08:40'],
  ['Agus Hartono', 'Blok B No. 3', 'B', 'Joko Prasetyo', '08:21'],
  ['Budi Santoso', 'Blok A No. 7', 'A', 'Slamet Riyadi', '08:05'],
  ['Sari Wulandari', 'Blok A No. 12', 'A', 'Slamet Riyadi', '07:48'],
  ['Tuti Handayani', 'Blok C No. 18', 'C', 'Dedi Kurniawan', '07:35'],
].map(([household_name, address, zone, officer_name, t], i) => ({
  history_id: i + 1, household_name, address, zone, officer_name,
  collected_at: `${dayStr(1)}T${t}:00+07:00`,
}));