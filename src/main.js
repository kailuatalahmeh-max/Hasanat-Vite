import '@fontsource/amiri/400.css';
import '@fontsource/amiri/700.css';
import '@fontsource/tajawal/300.css';
import '@fontsource/tajawal/400.css';
import '@fontsource/tajawal/700.css';
import './style.css';

import { registerSW } from 'virtual:pwa-register';
import data from './data/adhkar.json';
import { state, save, rollDay, addToDaily } from './store.js';
import { icons } from './icons.js';

registerSW({ immediate: true });

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (str) =>
  String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (n) => Number(n).toLocaleString('en-US');
const CUSTOM = 'custom';
const RING_R = 108;
const RING_C = 2 * Math.PI * RING_R;

/* ---------------- البيانات ---------------- */

function adhkarOf(categoryId) {
  if (categoryId === CUSTOM) return state.custom.map((c) => ({ ...c, category: CUSTOM, custom: true }));
  return data.adhkar.filter((d) => d.category === categoryId);
}
function findDhikr(id) {
  return data.adhkar.find((d) => d.id === id) || adhkarOf(CUSTOM).find((d) => d.id === id) || null;
}
const targetOf = (d) => state.targets[d.id] || d.count;
const countOf = (d) => state.counts[d.id] || 0;
const categoryName = (id) => data.categories.find((c) => c.id === id)?.name ?? '';

function currentDhikr() {
  const list = adhkarOf(state.current.category);
  return list.find((d) => d.id === state.current.id) || list[0] || null;
}

/** درجة الحديث مع التصنيف، مثل: «صحيح · متفق عليه» */
const gradeLabel = (d) => `${d.grade} · ${d.classification}`;

/* ---------------- الثيم ---------------- */

const THEMES = ['auto', 'light', 'dark'];
const THEME_LABEL = { auto: 'تلقائي', light: 'فاتح', dark: 'داكن' };

function applyTheme() {
  const t = state.settings.theme;
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  const btn = $('#theme-btn');
  btn.innerHTML = icons[t === 'auto' ? 'auto' : t === 'light' ? 'sun' : 'moon'];
  btn.title = `الوضع: ${THEME_LABEL[t]}`;
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  $('meta[name="theme-color"]').content = dark ? '#0c1714' : '#0f5c4a';
}

/* ---------------- تنبيهات صغيرة ---------------- */

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}
function vibrate(pattern) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* غير مدعوم */
  }
}

/* ---------------- المسبحة ---------------- */

const counterView = $('#view-counter');

function renderCounter() {
  const cat = state.current.category;
  const d = currentDhikr();
  const list = adhkarOf(cat);

  counterView.innerHTML = `
    <div class="chips" role="tablist" aria-label="الأقسام">
      ${data.categories
        .map(
          (c) =>
            `<button class="chip" role="tab" data-cat="${c.id}" aria-selected="${c.id === cat}">${esc(c.name)}</button>`,
        )
        .join('')}
    </div>

    ${d ? dhikrCard(d, list) : emptyCustom()}

    <button class="tap" id="tap" ${d ? '' : 'disabled'} aria-label="اضغط للتسبيح (أو زر المسافة)">
      <svg viewBox="0 0 240 240" aria-hidden="true">
        <circle class="ring-bg" cx="120" cy="120" r="${RING_R}" />
        <circle class="ring-fg" id="ring" cx="120" cy="120" r="${RING_R}"
          stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C}" transform="rotate(-90 120 120)" />
      </svg>
      <span class="tap-inner">
        <span class="tap-count" id="tap-count">0</span>
        <span class="tap-target" id="tap-target"></span>
        <span class="tap-laps" id="tap-laps"></span>
      </span>
    </button>
    <p class="hint muted" id="tap-hint">اضغط على الدائرة للعدّ — أو زر المسافة على الكمبيوتر</p>
    <div class="done-bar" id="done-bar" role="status" aria-live="polite" hidden>
      <p>أتممت العدد، تقبّل الله</p>
      <div class="done-actions">
        <button class="btn" data-act="restart">${icons.reset}<span>ابدأ من جديد</span></button>
        <button class="btn primary" data-act="next" ${list.length > 1 ? '' : 'disabled'}>${icons.next}<span>الذكر التالي</span></button>
      </div>
    </div>

    <div class="controls">
      <button class="ctl" data-act="undo" ${d ? '' : 'disabled'}>${icons.undo}<span>تراجع</span></button>
      <button class="ctl" data-act="reset" ${d ? '' : 'disabled'}>${icons.reset}<span>تصفير</span></button>
      <button class="ctl" data-act="edit" ${d ? '' : 'disabled'}>${icons.edit}<span>تعديل العدد</span></button>
      <button class="ctl" data-act="next" ${list.length > 1 ? '' : 'disabled'}>${icons.next}<span>التالي</span></button>
    </div>

    ${cat === 'rizq' ? `<a class="rizq-link" href="#/rizq">${icons.quran}<span>أسباب الرزق من القرآن والسنة</span>${icons.chevron}</a>` : ''}
    ${cat === CUSTOM ? customForm() : ''}

    <h2 class="section-title">أذكار القسم</h2>
    <ul class="dhikr-list">
      ${list.map((x) => listItem(x, d)).join('') || '<li class="muted empty-li">لا توجد أذكار بعد.</li>'}
    </ul>
  `;
  updateCount(false);
}

function countBadge(d) {
  if (d.custom) return '<span class="badge">ذكر مخصّص</span>';
  return d.countFromHadith
    ? '<span class="badge ok">العدد منصوص في الحديث</span>'
    : '<span class="badge">العدد غير منصوص — اختياري</span>';
}

function dhikrCard(d, list) {
  const idx = list.findIndex((x) => x.id === d.id) + 1;
  return `
    <article class="dhikr-card">
      <div class="card-meta">${countBadge(d)}<span class="muted">${fmt(idx)} / ${fmt(list.length)}</span></div>
      ${d.when ? `<p class="when">${esc(d.when)}</p>` : ''}
      <p class="dhikr-text">${esc(d.text)}</p>
      ${
        d.custom
          ? ''
          : `<a class="fadl-btn" href="#/dhikr/${esc(d.id)}">
               ${icons.book}
               <span class="fadl-label">الفضل والحديث</span>
               <span class="fadl-grade">${esc(gradeLabel(d))}</span>
               ${icons.chevron}
             </a>`
      }
    </article>`;
}

function emptyCustom() {
  return `<article class="dhikr-card empty">
      <p class="dhikr-text">لم تُضِف أذكارًا بعد</p>
      <p class="muted">أضف ذكرك الخاص وعدده من النموذج أدناه.</p>
    </article>`;
}

function customForm() {
  return `
    <form class="custom-form" id="custom-form">
      <h2 class="section-title">إضافة ذكر</h2>
      <textarea name="text" rows="2" maxlength="500" placeholder="نص الذكر أو الدعاء" required></textarea>
      <div class="row">
        <input name="count" type="number" inputmode="numeric" min="1" max="100000" value="33" required aria-label="العدد" />
        <button class="btn primary" type="submit">${icons.plus}<span>إضافة</span></button>
      </div>
    </form>`;
}

function listItem(x, cur) {
  const t = targetOf(x);
  const c = Math.min(countOf(x), t);
  const done = c >= t;
  return `
    <li class="dhikr-li ${cur && x.id === cur.id ? 'active' : ''} ${done ? 'done' : ''}">
      <button class="li-main" data-pick="${esc(x.id)}">
        <span class="li-body">
          ${x.when ? `<span class="li-when">${esc(x.when)}</span>` : ''}
          <span class="li-text">${esc(x.text)}</span>
        </span>
        <span class="li-count">${fmt(c)} / ${fmt(t)}</span>
      </button>
      ${
        x.custom
          ? `<button class="icon-btn small" data-del="${esc(x.id)}" aria-label="حذف">${icons.trash}</button>`
          : `<a class="icon-btn small info" href="#/dhikr/${esc(x.id)}" aria-label="الفضل والحديث" title="الفضل والحديث">${icons.info}</a>`
      }
    </li>`;
}

function updateCount(animate = true) {
  $('#daily-total').textContent = fmt(state.daily.total);
  const d = currentDhikr();
  if (!d || !$('#tap-count')) return;
  const t = targetOf(d);
  const c = Math.min(countOf(d), t); // لا يتجاوز العدّ الرقم المطلوب
  const complete = c >= t;

  $('#tap-count').textContent = fmt(c);
  $('#tap-target').textContent = `من ${fmt(t)}`;
  $('#tap-laps').textContent = complete ? 'اكتمل ✓' : '';
  $('#ring').style.strokeDashoffset = String(RING_C * (1 - c / t));
  $('#tap').classList.toggle('complete', complete);
  $('#tap').setAttribute('aria-label', complete ? 'اكتمل العدد' : 'اضغط للتسبيح (أو زر المسافة)');
  $('#done-bar').hidden = !complete;
  $('#tap-hint').hidden = complete;

  const li = counterView.querySelector(`[data-pick="${CSS.escape(d.id)}"]`);
  if (li) {
    li.querySelector('.li-count').textContent = `${fmt(c)} / ${fmt(t)}`;
    li.parentElement.classList.toggle('done', complete);
  }
  if (animate) {
    const el = $('#tap-count');
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }
}

function replayAnimation(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

let lastRejectToast = 0;
/** ضغطة بعد إكمال العدد: تُرفض ولا تُحتسب */
function rejectTap() {
  vibrate([25, 40, 25]);
  replayAnimation($('#tap'), 'shake');
  replayAnimation($('#done-bar'), 'nudge');
  if (Date.now() - lastRejectToast > 2500) {
    lastRejectToast = Date.now();
    toast('اكتمل العدد — اضغط «ابدأ من جديد» للعدّ مرة أخرى');
  }
}

function increment() {
  const d = currentDhikr();
  if (!d) return;
  const t = targetOf(d);
  if (countOf(d) >= t) return rejectTap();
  if (rollDay()) toast('يوم جديد — بدأ مجموع اليوم من الصفر');
  state.counts[d.id] = countOf(d) + 1;
  addToDaily(1);
  save();
  if (state.counts[d.id] === t) {
    if (state.settings.doneVibrate) vibrate([70, 50, 70, 50, 140]);
    replayAnimation($('#tap'), 'celebrate');
  } else if (state.settings.tapVibrate) {
    vibrate(12);
  }
  updateCount();
}

function restart() {
  const d = currentDhikr();
  if (!d) return;
  state.counts[d.id] = 0;
  save();
  updateCount(false);
}

function undo() {
  const d = currentDhikr();
  if (!d || countOf(d) === 0) return;
  // عدّادات قديمة قد تكون تجاوزت الرقم المطلوب قبل هذا التحديث
  state.counts[d.id] = Math.min(countOf(d), targetOf(d)) - 1;
  addToDaily(-1);
  save();
  updateCount();
}

function resetCurrent() {
  const d = currentDhikr();
  if (!d || countOf(d) === 0) return;
  state.counts[d.id] = 0;
  save();
  updateCount(false);
  toast('تم التصفير');
}

function next() {
  const list = adhkarOf(state.current.category);
  if (list.length < 2) return;
  const i = list.findIndex((x) => x.id === currentDhikr()?.id);
  state.current.id = list[(i + 1) % list.length].id;
  save();
  renderCounter();
}

function select(category, id = null) {
  state.current = { category, id };
  save();
  renderCounter();
}

/* --- تعديل العدد --- */
const dlgTarget = $('#dlg-target');
function openTargetDialog() {
  const d = currentDhikr();
  if (!d) return;
  $('#dlg-target-input').value = targetOf(d);
  $('#dlg-target-hint').textContent = d.custom
    ? 'العدد الذي تريد الوصول إليه لهذا الذكر.'
    : d.countFromHadith
      ? `العدد الوارد في الحديث: ${fmt(d.count)}. يمكنك تغييره، لكن الفضل المذكور مرتبط بالعدد الوارد.`
      : `العدد الافتراضي ${fmt(d.count)} اختياري، فلم يرد عدد محدد في الحديث.`;
  dlgTarget.returnValue = '';
  dlgTarget.showModal();
}
dlgTarget.addEventListener('close', () => {
  const d = currentDhikr();
  if (!d) return;
  const v = dlgTarget.returnValue;
  if (v === 'save') {
    const n = Math.round(Number($('#dlg-target-input').value));
    if (n >= 1) state.targets[d.id] = Math.min(n, 100000);
  } else if (v === 'default') {
    delete state.targets[d.id];
  } else return;
  save();
  renderCounter();
});

/* --- أحداث المسبحة --- */
counterView.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  if (e.target.closest('#tap:not([disabled])')) increment();
});
counterView.addEventListener('click', (e) => {
  const chip = e.target.closest('[data-cat]');
  if (chip) return select(chip.dataset.cat, adhkarOf(chip.dataset.cat)[0]?.id ?? null);
  const pick = e.target.closest('[data-pick]');
  if (pick) {
    select(state.current.category, pick.dataset.pick);
    return window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  const del = e.target.closest('[data-del]');
  if (del) {
    const item = state.custom.find((c) => c.id === del.dataset.del);
    if (item && confirm(`حذف الذكر:\n«${item.text}»؟`)) {
      state.custom = state.custom.filter((c) => c.id !== item.id);
      delete state.counts[item.id];
      delete state.targets[item.id];
      if (state.current.id === item.id) state.current.id = null;
      save();
      renderCounter();
    }
    return;
  }
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'undo') undo();
  else if (act === 'reset') resetCurrent();
  else if (act === 'edit') openTargetDialog();
  else if (act === 'next') next();
  else if (act === 'restart') restart();
});
counterView.addEventListener('submit', (e) => {
  if (e.target.id !== 'custom-form') return;
  e.preventDefault();
  const f = new FormData(e.target);
  const text = String(f.get('text')).trim();
  const count = Math.min(Math.max(1, Math.round(Number(f.get('count')) || 1)), 100000);
  if (!text) return;
  const id = `c-${Date.now().toString(36)}`;
  state.custom.push({ id, text, count });
  select(CUSTOM, id);
  toast('أُضيف الذكر');
});

document.addEventListener('keydown', (e) => {
  if (currentView !== 'counter' || e.repeat) return;
  if (document.querySelector('dialog[open]')) return;
  if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
  if (e.code === 'Space' || e.key === ' ' || (e.key === 'Enter' && e.target.id === 'tap')) {
    e.preventDefault();
    increment();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    undo();
  }
});

/* ---------------- صفحة الفضل والحديث ---------------- */

const detailView = $('#view-detail');

function backBar(title) {
  return `<div class="page-head">
      <button class="icon-btn" data-back aria-label="رجوع">${icons.back}</button>
      <h2>${esc(title)}</h2>
    </div>`;
}

function renderDetail(id) {
  const d = data.adhkar.find((x) => x.id === id);
  if (!d) {
    detailView.innerHTML = `${backBar('غير موجود')}<p class="muted center">لم يُعثر على هذا الذكر.</p>`;
    return;
  }
  const sources = d.sources
    .map(
      (s) => `
      <tr>
        <td>${esc(s.book)}</td>
        <td class="num">${esc(s.number)}</td>
        <td>${esc(s.grade)}${s.grader ? `<small> — ${esc(s.grader)}</small>` : ''}${
          s.tirmidhiSays ? `<small class="block">قال الترمذي: ${esc(s.tirmidhiSays)}</small>` : ''
        }</td>
      </tr>`,
    )
    .join('');
  const dorar = `https://dorar.net/hadith/search?q=${encodeURIComponent(d.text.split(/[،\n]/)[0].slice(0, 60))}`;

  detailView.innerHTML = `
    ${backBar('الفضل والحديث')}

    <article class="detail-card">
      <p class="muted cat-line">${esc(categoryName(d.category))}</p>
      ${d.when ? `<p class="when">${esc(d.when)}</p>` : ''}
      <p class="dhikr-text">${esc(d.text)}</p>
      <div class="lib-tags">
        ${countBadge(d)}
        <span class="badge">العدد: ${fmt(d.count)}</span>
      </div>
    </article>

    <section class="detail-sec">
      <h3>الفضل</h3>
      <p class="virtue-text">${esc(d.virtue)}</p>
    </section>

    <section class="detail-sec">
      <h3>نص الحديث</h3>
      <blockquote class="hadith">${esc(d.hadith)}</blockquote>
      <p class="muted narrator">الراوي: ${esc(d.narrator)}</p>
    </section>

    <section class="detail-sec">
      <h3>التخريج والدرجة</h3>
      <div class="grade-row">
        <span class="grade-pill ${/صحيح/.test(d.grade) ? 'sahih' : 'hasan'}">${esc(d.grade)}</span>
        <span>${esc(d.classification)}</span>
      </div>
      <table class="src-table">
        <thead><tr><th>المصدر</th><th>الرقم</th><th>الدرجة</th></tr></thead>
        <tbody>${sources}</tbody>
      </table>
      ${d.note ? `<p class="note">${esc(d.note)}</p>` : ''}
      <p class="verify ${d.verified ? 'ok' : 'warn'}">
        ${
          d.verified
            ? 'طُوبق لفظ الحديث ورقمه آليًّا مع نصوص الكتب الستة، والدرجات لغير الصحيحين من أحكام الألباني.'
            : 'لم يُطابَق هذا الحديث آليًّا لأن مصدره غير موجود في قاعدة التحقق.'
        }
      </p>
      <a class="ext-link" href="${dorar}" target="_blank" rel="noopener">ابحث عنه في الدرر السنية ↗</a>
    </section>

    <button class="btn primary wide" data-start="${esc(d.id)}">${icons.play}<span>ابدأ التسبيح بهذا الذكر</span></button>
  `;
}

detailView.addEventListener('click', (e) => {
  if (e.target.closest('[data-back]')) return goBack();
  const start = e.target.closest('[data-start]');
  if (start) {
    const d = findDhikr(start.dataset.start);
    if (d) {
      state.current = { category: d.category, id: d.id };
      scrollMemory.counter = 0;
      save();
      location.hash = '#/';
    }
  }
});

/* ---------------- أسباب الرزق ---------------- */

const rizqView = $('#view-rizq');

function renderRizq() {
  rizqView.innerHTML = `
    ${backBar('أسباب الرزق من القرآن والسنة')}
    <div class="causes">
      ${data.rizqCauses
        .map((r) => {
          const q = r.kind === 'quran';
          const src = q
            ? esc(r.ref)
            : `${esc(r.ref)} — ${r.sources
                .map((s) => `${esc(s.book)} ${esc(s.number)} (${esc(s.grade)}${s.grader ? `، ${esc(s.grader)}` : ''})`)
                .join('، ')}`;
          return `
          <article class="cause ${q ? 'quran' : 'hadith'}">
            <div class="cause-head">${q ? icons.quran : icons.quote}<h3>${esc(r.title)}</h3></div>
            <p class="cause-text">${q ? `﴿${esc(r.text)}﴾` : `«${esc(r.text)}»`}</p>
            <p class="src">${src}</p>
          </article>`;
        })
        .join('')}
    </div>`;
}
rizqView.addEventListener('click', (e) => {
  if (e.target.closest('[data-back]')) goBack();
});

/* ---------------- التنقل ---------------- */

let currentView = 'counter';
let cameFromApp = false; // هل فُتحت الصفحة الحالية من داخل التطبيق (فيعمل history.back)
const scrollMemory = { counter: 0 };

function goBack() {
  if (cameFromApp) history.back();
  else location.hash = '#/';
}

function route() {
  const hash = location.hash.replace(/^#/, '') || '/';
  if (currentView === 'counter') scrollMemory.counter = window.scrollY;

  let m;
  if ((m = hash.match(/^\/dhikr\/(.+)$/))) {
    currentView = 'detail';
    renderDetail(decodeURIComponent(m[1]));
  } else if (hash === '/rizq') {
    currentView = 'rizq';
    renderRizq();
  } else {
    currentView = 'counter';
    renderCounter();
  }
  counterView.hidden = currentView !== 'counter';
  detailView.hidden = currentView !== 'detail';
  rizqView.hidden = currentView !== 'rizq';
  window.scrollTo({ top: currentView === 'counter' ? scrollMemory.counter : 0 });
}

window.addEventListener('hashchange', () => {
  cameFromApp = true;
  route();
});

/* ---------------- الإعدادات والثيم ---------------- */

$('#theme-btn').addEventListener('click', () => {
  state.settings.theme = THEMES[(THEMES.indexOf(state.settings.theme) + 1) % THEMES.length];
  save();
  applyTheme();
  toast(`الوضع: ${THEME_LABEL[state.settings.theme]}`);
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

const dlgSettings = $('#dlg-settings');
$('#settings-btn').innerHTML = icons.gear;
$('#settings-btn').addEventListener('click', () => {
  $('#set-tap-vibrate').checked = state.settings.tapVibrate;
  $('#set-done-vibrate').checked = state.settings.doneVibrate;
  const week = Object.entries(state.history)
    .sort()
    .slice(-6)
    .reduce((sum, [, v]) => sum + v, state.daily.total);
  $('#stats').innerHTML = `
    <div><span class="muted">اليوم</span><strong>${fmt(state.daily.total)}</strong></div>
    <div><span class="muted">آخر ٧ أيام</span><strong>${fmt(week)}</strong></div>
    <div><span class="muted">الإجمالي</span><strong>${fmt(state.lifetime)}</strong></div>`;
  dlgSettings.returnValue = '';
  dlgSettings.showModal();
});
['tapVibrate', 'doneVibrate'].forEach((k) => {
  const id = k === 'tapVibrate' ? '#set-tap-vibrate' : '#set-done-vibrate';
  $(id).addEventListener('change', (e) => {
    state.settings[k] = e.target.checked;
    save();
  });
});
dlgSettings.addEventListener('close', () => {
  if (dlgSettings.returnValue === 'reset-counts' && confirm('تصفير عدّادات جميع الأذكار؟ (لا يؤثر على مجموع اليوم)')) {
    state.counts = {};
    save();
    if (currentView === 'counter') renderCounter();
    toast('تم تصفير كل العدّادات');
  }
});

// فحص تغيّر اليوم عند العودة للتطبيق
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && rollDay()) updateCount(false);
});

/* ---------------- البدء ---------------- */
rollDay();
if (!data.categories.some((c) => c.id === state.current.category)) state.current = { category: 'mutlaq', id: null };
applyTheme();
route();
