/**
 * app.js — decrypt worklog.enc, render month calendar + day modal
 */

'use strict';

// ── State ──────────────────────────────────────────────────────────────────────
let worklogData = null;      // decrypted JSON
let categoryMap  = {};       // id → {label, color}
// Canonical from app lib/config.dart: startHour=8, endHour=17 → slot_start 8..16
// = 9 hourly blocks covering 08:00–17:00. MUST match or slot-8 entries vanish.
const DAY_SLOTS = [8, 9, 10, 11, 12, 13, 14, 15, 16]; // 9 slots, 08:00–17:00

// Escape untrusted text (entry.detail / category labels come from user input)
// before innerHTML injection — prevents stored XSS in the boss-facing page.
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ── Boot ───────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('unlock-form').addEventListener('submit', handleUnlock);
  document.getElementById('modal-overlay').addEventListener('click', closeModal);
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
});

// ── Unlock flow ────────────────────────────────────────────────────────────────
async function handleUnlock(e) {
  e.preventDefault();

  const passEl  = document.getElementById('passphrase');
  const errEl   = document.getElementById('unlock-error');
  const btnEl   = document.getElementById('unlock-btn');
  const spinEl  = document.getElementById('unlock-spinner');

  errEl.textContent = '';
  btnEl.disabled = true;
  spinEl.hidden = false;

  const passphrase = passEl.value;

  try {
    const resp = await fetch('data/worklog.enc');
    if (!resp.ok) throw new Error('FETCH_FAILED');
    const envelope = await resp.json();

    worklogData = await decryptWorklog(envelope, passphrase);

    // Build category lookup
    categoryMap = {};
    for (const cat of worklogData.categories) {
      categoryMap[cat.id] = cat;
    }

    showCalendar();
    passEl.value = '';
  } catch (err) {
    if (err.message === 'DECRYPT_FAILED') {
      errEl.textContent = 'รหัสผ่านไม่ถูกต้อง';
    } else if (err.message === 'FETCH_FAILED') {
      errEl.textContent = 'ไม่พบไฟล์ข้อมูล — รัน encrypt ก่อน';
    } else {
      errEl.textContent = 'เกิดข้อผิดพลาด — ลองใหม่';
    }
    btnEl.disabled = false;
    spinEl.hidden = true;
  }
}

// ── Calendar render ────────────────────────────────────────────────────────────
function showCalendar() {
  document.getElementById('lock-screen').hidden  = true;
  document.getElementById('app-screen').hidden   = false;

  renderHeader();
  renderLegend();
  renderGrid();
}

function parseMonth(monthStr) {
  // "2026-06" → {year, month (1-based)}
  const [year, month] = monthStr.split('-').map(Number);
  return { year, month };
}

function formatThaiMonth(monthStr) {
  const { year, month } = parseMonth(monthStr);
  const thaiMonths = [
    '', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
  ];
  return `${thaiMonths[month]} ${year + 543}`; // Buddhist Era
}

function getWorkingDaysInMonth(year, month) {
  // Returns array of Date objects for Mon–Fri in given month (1-based)
  const days = [];
  const d = new Date(year, month - 1, 1);
  while (d.getMonth() === month - 1) {
    const dow = d.getDay(); // 0=Sun, 6=Sat
    if (dow >= 1 && dow <= 5) {
      days.push(new Date(d));
    }
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function calcSummary(days, allWorkingDays) {
  let totalSlots = 0;
  const catTotals = {};

  for (const slots of Object.values(days)) {
    totalSlots += slots.length;
    for (const s of slots) {
      catTotals[s.categoryId] = (catTotals[s.categoryId] ?? 0) + 1;
    }
  }

  const filledDays = Object.values(days).filter((s) => s.length > 0).length;
  const pct = allWorkingDays > 0
    ? Math.round((filledDays / allWorkingDays) * 100)
    : 0;

  // top category
  let topCatId = null;
  let topCatCount = 0;
  for (const [id, cnt] of Object.entries(catTotals)) {
    if (cnt > topCatCount) { topCatCount = cnt; topCatId = id; }
  }

  return { totalSlots, filledDays, pct, topCatId, topCatCount };
}

function renderHeader() {
  const { month, owner, days } = worklogData;
  const { year, month: m } = parseMonth(month);
  const workingDays = getWorkingDaysInMonth(year, m);
  const summary = calcSummary(days, workingDays.length);

  const topCat = summary.topCatId ? categoryMap[summary.topCatId] : null;
  const topCatBadge = topCat
    ? `<span class="badge-cat" style="--cat-color:${topCat.color}">${esc(topCat.label)} (${summary.topCatCount} ชม.)</span>`
    : '';

  document.getElementById('header-month').textContent = formatThaiMonth(month);
  if (owner) {
    document.getElementById('header-owner').textContent = owner;
    document.getElementById('header-owner').hidden = false;
  }

  document.getElementById('header-summary').innerHTML = `
    <span class="summary-chip">รวม <strong>${summary.totalSlots} ชม.</strong></span>
    ${topCatBadge ? `<span class="summary-chip">หมวดเด่น ${topCatBadge}</span>` : ''}
    <span class="summary-chip">ลงบันทึก <strong>${summary.pct}%</strong> (${summary.filledDays}/${workingDays.length} วัน)</span>
  `;
}

function renderLegend() {
  const el = document.getElementById('legend');
  el.innerHTML = worklogData.categories
    .map(
      (cat) =>
        `<span class="legend-item"><span class="legend-dot" style="background:${cat.color}"></span>${esc(cat.label)}</span>`
    )
    .join('');
}

function renderGrid() {
  const { month, days } = worklogData;
  const { year, month: m } = parseMonth(month);
  const workingDays = getWorkingDaysInMonth(year, m);
  const todayKey = dateKey(new Date());

  // Group by week (Mon index)
  const weeks = [];
  let week = [];
  let firstDow = workingDays[0]?.getDay(); // 1=Mon

  // Pad the first week if first day isn't Monday
  for (let i = 1; i < firstDow; i++) week.push(null);

  for (const d of workingDays) {
    const dow = d.getDay();
    if (dow === 1 && week.length > 0) {
      weeks.push(week);
      week = [];
    }
    week.push(d);
  }
  if (week.length > 0) {
    while (week.length < 5) week.push(null);
    weeks.push(week);
  }

  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';

  // Day headers
  const dayNames = ['จ', 'อ', 'พ', 'พฤ', 'ศ'];
  const headerRow = document.createElement('div');
  headerRow.className = 'cal-header-row';
  headerRow.innerHTML = dayNames.map((n) => `<div class="cal-day-name">${n}</div>`).join('');
  grid.appendChild(headerRow);

  for (const week of weeks) {
    const rowEl = document.createElement('div');
    rowEl.className = 'cal-week-row';

    for (const d of week) {
      const cellEl = document.createElement('div');

      if (!d) {
        cellEl.className = 'cal-cell cal-cell--empty';
        rowEl.appendChild(cellEl);
        continue;
      }

      const key = dateKey(d);
      const slots = days[key] ?? [];
      const isToday = key === todayKey;
      const hasData = slots.length > 0;

      cellEl.className = [
        'cal-cell',
        isToday ? 'cal-cell--today' : '',
        !hasData ? 'cal-cell--nodata' : '',
      ].filter(Boolean).join(' ');

      cellEl.setAttribute('role', 'button');
      cellEl.setAttribute('tabindex', '0');
      cellEl.setAttribute('aria-label', `${d.getDate()} — ${slots.length} ชั่วโมง`);

      const dayNum = document.createElement('div');
      dayNum.className = 'cal-day-num';
      dayNum.textContent = d.getDate();

      const miniBar = document.createElement('div');
      miniBar.className = 'cal-mini-bar';
      for (const slot of DAY_SLOTS) {
        const entry = slots.find((s) => s.slot === slot);
        const dot = document.createElement('div');
        dot.className = 'cal-mini-dot';
        if (entry && categoryMap[entry.categoryId]) {
          dot.style.background = categoryMap[entry.categoryId].color;
        }
        miniBar.appendChild(dot);
      }

      const badge = document.createElement('div');
      badge.className = 'cal-badge';
      badge.textContent = hasData ? `${slots.length}/${DAY_SLOTS.length}` : '';

      cellEl.appendChild(dayNum);
      cellEl.appendChild(miniBar);
      cellEl.appendChild(badge);

      cellEl.addEventListener('click', () => openModal(d, slots));
      cellEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') openModal(d, slots);
      });

      rowEl.appendChild(cellEl);
    }

    grid.appendChild(rowEl);
  }
}

// ── Day modal ──────────────────────────────────────────────────────────────────
const SLOT_LABELS = {
  8: '08:00', 9: '09:00', 10: '10:00', 11: '11:00', 12: '12:00',
  13: '13:00', 14: '14:00', 15: '15:00', 16: '16:00',
};

const THAI_DAY_NAMES = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

function openModal(d, slots) {
  const overlay = document.getElementById('modal-overlay');
  const title   = document.getElementById('modal-title');
  const body    = document.getElementById('modal-body');

  const dayLabel = `${THAI_DAY_NAMES[d.getDay()]}ที่ ${d.getDate()}`;
  title.textContent = dayLabel;

  body.innerHTML = '';

  for (const slot of DAY_SLOTS) {
    const entry = slots.find((s) => s.slot === slot);
    const rowEl = document.createElement('div');
    rowEl.className = 'timeline-row';

    const timeEl = document.createElement('div');
    timeEl.className = 'timeline-time';
    timeEl.textContent = SLOT_LABELS[slot] ?? `${slot}:00`;

    const dotEl = document.createElement('div');
    dotEl.className = 'timeline-dot';

    const infoEl = document.createElement('div');
    infoEl.className = 'timeline-info';

    if (entry && categoryMap[entry.categoryId]) {
      const cat = categoryMap[entry.categoryId];
      dotEl.style.background = cat.color;
      dotEl.style.boxShadow = `0 0 6px ${cat.color}88`;
      infoEl.innerHTML = `<span class="tl-cat" style="color:${cat.color}">${esc(cat.label)}</span><span class="tl-detail">${esc(entry.detail)}</span>`;
    } else {
      dotEl.classList.add('timeline-dot--empty');
      infoEl.innerHTML = `<span class="tl-empty">— (ยังไม่กรอก)</span>`;
    }

    rowEl.appendChild(timeEl);
    rowEl.appendChild(dotEl);
    rowEl.appendChild(infoEl);
    body.appendChild(rowEl);
  }

  overlay.classList.add('visible');
  document.body.style.overflow = 'hidden';
  document.getElementById('modal-close').focus();
}

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('visible');
  document.body.style.overflow = '';
}
