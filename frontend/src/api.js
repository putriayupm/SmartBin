// Satu-satunya tempat panggilan data. Mock aktif sampai VITE_USE_MOCK=false.
const MOCK = import.meta.env.VITE_USE_MOCK !== 'false';
const API_URL = import.meta.env.VITE_API_URL;
const wait = (v) => new Promise((r) => setTimeout(() => r(structuredClone(v)), 250));

export const getSession = () => JSON.parse(localStorage.getItem('session') || 'null');
export const logout = () => localStorage.removeItem('session');

const ERROR_ID = {
  'Invalid username or password': 'Nama pengguna atau kata sandi tidak cocok dengan peran yang dipilih.',
  'Forbidden: insufficient role': 'Kamu tidak punya akses untuk tindakan ini.',
  'Missing or invalid Authorization header': 'Sesi berakhir, silakan masuk lagi.',
  'Invalid or expired token': 'Sesi berakhir, silakan masuk lagi.',
  'Schedule not found, already collected, or not yours': 'Jadwal tidak ditemukan atau sudah dikumpulkan.',
  'Collected schedules cannot be overridden': 'Jadwal yang sudah dikumpulkan tidak bisa diubah.',
  'Username already exists': 'Nama pengguna sudah dipakai.',
  'password must be at least 8 characters': 'Kata sandi minimal 8 karakter.',
};

async function request(path, options = {}) {
  const s = getSession();
  const res = await fetch(`${API_URL}${path}`, { ...options, headers: {
    'Content-Type': 'application/json', ...(s && { Authorization: `Bearer ${s.token}` }) } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 401 && s) { logout(); window.location.reload(); }
    throw new Error(ERROR_ID[body.message] || body.message || `Gagal (${res.status})`);
  }
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

let mockHouseholds = schedule.map((x) => ({
  household_id: x.schedule_id, name: x.name, address: x.address, zone: x.zone,
  latitude: null, longitude: null, current_fill_level: x.current_fill_level,
}));
let mockOfficers = users.filter((u) => u.role === 'officer')
  .map((u) => ({ user_id: u.username, name: u.name, username: u.username, phone_number: null, assigned_zone: u.zone }));

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
    return wait([...list].sort((a, b) => a.route_order - b.route_order));
  },
  async markCollected(id) {
    if (!MOCK) return request(`/schedules/${id}/collected`, { method: 'PATCH' });
    schedule = schedule.map((x) => (x.schedule_id === id ? { ...x, status: 'collected', current_fill_level: 0 } : x));
    return wait({ message: 'ok' });
  },
  async getScheduleSummary() {
    if (!MOCK) {
      const rows = await request('/schedules/summary');
      const text = rows.map((r) => (rows.length > 1 ? `Zona ${r.zone}: ${r.summary}` : r.summary)).join(' ');
      return { summary: text, generated_by: 'ai' };
    }
    return wait({
      summary: 'Hujan diperkirakan sore ini, jadi rumah dengan tempat sampah hampir penuh didahulukan dan beberapa rumah dengan isi sedang ikut dimasukkan.',
      generated_by: 'ai',
    });
  },
    // override (mock)
  async removeStop(id) {
    if (!MOCK) return request(`/schedules/${id}/override`, { method: 'PATCH', body: JSON.stringify({ status: 'skipped', reason: 'Dilewati oleh operator' }) });
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
    async getOfficers() {
    if (!MOCK) {
      const rows = await request('/users/officers');
      return rows.map((o) => ({ ...o, role: 'officer', zone: o.assigned_zone }));
    }
    return wait(users.filter((u) => u.role === 'officer'));
  },
  getForecast() {
    if (!MOCK) return request('/weather');
    return wait({ available: true, rain_expected: true, rainy_periods: 1, summary: 'Hujan diperkirakan pada 1 periode (3 jam) dalam 24 jam ke depan.' });
  },

    // ---- household management (operator) ----
  async getHouseholds() {
    if (!MOCK) return request('/households');
    return wait(mockHouseholds);
  },
  async createHousehold(data) {
    if (!MOCK) return request('/households', { method: 'POST', body: JSON.stringify(data) });
    const row = { ...data, household_id: `mock-${Date.now()}`, current_fill_level: 0 };
    mockHouseholds = [...mockHouseholds, row];
    return wait(row);
  },
  async updateHousehold(id, data) {
    if (!MOCK) return request(`/households/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
    mockHouseholds = mockHouseholds.map((x) => (x.household_id === id ? { ...x, ...data } : x));
    return wait({ message: 'ok' });
  },
  async setFillLevel(id, level) {
    if (!MOCK) return request(`/households/${id}/fill-level`, { method: 'PATCH', body: JSON.stringify({ current_fill_level: level }) });
    mockHouseholds = mockHouseholds.map((x) => (x.household_id === id ? { ...x, current_fill_level: level } : x));
    return wait({ message: 'ok' });
  },
  // ---- officer management (operator) ----
  async getOfficerList() {
    if (!MOCK) return request('/users/officers');
    return wait(mockOfficers);
  },
  async createOfficer(data) {
    if (!MOCK) return request('/users/officers', { method: 'POST', body: JSON.stringify(data) });
    const row = { ...data, user_id: data.username };
    delete row.password;
    mockOfficers = [...mockOfficers, row];
    return wait(row);
  },
  async updateOfficer(id, data) {
    if (!MOCK) return request(`/users/officers/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
    mockOfficers = mockOfficers.map((x) => (x.user_id === id ? { ...x, ...data } : x));
    return wait({ message: 'ok' });
  },


};
