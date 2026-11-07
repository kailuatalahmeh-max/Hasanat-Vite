// حالة التطبيق المحفوظة في localStorage
const KEY = 'misbaha:v1';

export function todayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function defaults() {
  return {
    counts: {}, // { [dhikrId]: number }
    targets: {}, // تعديلات المستخدم على العدد { [dhikrId]: number }
    custom: [], // أذكاري: [{ id, text, count }]
    current: { category: 'mutlaq', id: null },
    daily: { date: todayKey(), total: 0 },
    history: {}, // { 'YYYY-MM-DD': total } لآخر 30 يومًا
    lifetime: 0,
    settings: { theme: 'auto', tapVibrate: true, doneVibrate: true },
  };
}

function load() {
  const base = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const s = JSON.parse(raw);
    return {
      ...base,
      ...s,
      current: { ...base.current, ...s.current },
      daily: { ...base.daily, ...s.daily },
      settings: { ...base.settings, ...s.settings },
    };
  } catch {
    return base;
  }
}

export const state = load();

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* التخزين غير متاح (وضع خاص مثلًا) — يستمر التطبيق في الذاكرة */
  }
}

/** يصفّر مجموع اليوم إذا تغيّر التاريخ. يعيد true إن حدث تصفير. */
export function rollDay() {
  const t = todayKey();
  if (state.daily.date === t) return false;
  if (state.daily.total > 0) state.history[state.daily.date] = state.daily.total;
  const keys = Object.keys(state.history).sort();
  while (keys.length > 30) delete state.history[keys.shift()];
  state.daily = { date: t, total: 0 };
  save();
  return true;
}

export function addToDaily(n) {
  rollDay();
  state.daily.total = Math.max(0, state.daily.total + n);
  state.lifetime = Math.max(0, state.lifetime + n);
}
