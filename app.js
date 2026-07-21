/* ============================================================
   Autoreg — RIR 기반 자동조절 트레이닝 PWA
   모든 데이터는 localStorage에만 저장된다 (서버 없음).
   ============================================================ */
'use strict';

/* ---------- RPE ↔ %1RM 표 (Zourdos et al. 2016 / RTS) ---------- */
const RPE_COLS = [10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5, 6];
const RPE_TABLE = [
  [100.0, 97.8, 95.5, 93.9, 92.2, 90.7, 89.2, 87.8, 86.3],
  [95.5, 93.9, 92.2, 90.7, 89.2, 87.8, 86.3, 85.0, 83.7],
  [92.2, 90.7, 89.2, 87.8, 86.3, 85.0, 83.7, 82.4, 81.1],
  [89.2, 87.8, 86.3, 85.0, 83.7, 82.4, 81.1, 79.9, 78.6],
  [86.3, 85.0, 83.7, 82.4, 81.1, 79.9, 78.6, 77.4, 76.2],
  [83.7, 82.4, 81.1, 79.9, 78.6, 77.4, 76.2, 75.1, 73.9],
  [81.1, 79.9, 78.6, 77.4, 76.2, 75.1, 73.9, 72.3, 70.7],
  [78.6, 77.4, 76.2, 75.1, 73.9, 72.3, 70.7, 69.4, 68.0],
  [76.2, 75.1, 73.9, 72.3, 70.7, 69.4, 68.0, 66.7, 65.3],
  [73.9, 72.3, 70.7, 69.4, 68.0, 66.7, 65.3, 64.0, 62.6],
  [70.7, 69.4, 68.0, 66.7, 65.3, 64.0, 62.6, 61.3, 59.9],
  [68.0, 66.7, 65.3, 64.0, 62.6, 61.3, 59.9, 58.6, 57.2]
];
function rpeColIdx(rpe) {
  let best = 0, bd = 99;
  RPE_COLS.forEach((v, i) => { const d = Math.abs(v - rpe); if (d < bd) { bd = d; best = i; } });
  return best;
}
function pct1RM(reps, rpe) {
  const r = Math.min(12, Math.max(1, Math.round(reps)));
  return RPE_TABLE[r - 1][rpeColIdx(rpe)];
}
/** 무게·반복·RIR → 추정 1RM */
function e1rmOf(w, reps, rir) {
  if (!w || !reps) return 0;
  const p = pct1RM(reps, 10 - (rir == null ? 0 : rir));
  return Math.round((w / (p / 100)) * 10) / 10;
}
/** 주어진 부하·e1RM·RPE에서 기대 가능한 반복수 */
function repsAt(load, e1, rpe) {
  if (!e1 || !load) return 0;
  const target = (load / e1) * 100;
  const col = rpeColIdx(rpe);
  let out = 1;
  for (let r = 1; r <= 12; r++) { if (RPE_TABLE[r - 1][col] >= target) out = r; }
  return out;
}

/* ---------- 날짜 / ISO 주차 ---------- */
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_KO = { mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일' };
function isoWeekKey(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((t - y0) / 86400000 + 1) / 7);
  return t.getUTCFullYear() + '-W' + String(wk).padStart(2, '0');
}
function mondayOf(d) {
  const x = new Date(d);
  const off = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - off);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function dayKeyOf(d) { return DAY_KEYS[(d.getDay() + 6) % 7]; }
function fmtDate(d) { return (d.getMonth() + 1) + '/' + d.getDate(); }
function weekLabel(mon) {
  const sun = addDays(mon, 6);
  return `${mon.getFullYear()}. ${fmtDate(mon)} – ${fmtDate(sun)}`;
}
function mmss(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return m + ':' + String(s).padStart(2, '0');
}
function hhmmss(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return (h > 0 ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
}

/* ---------- 기본 프로그램 (엑셀 마스터 테이블과 동일) ---------- */
function ex(o) {
  return Object.assign({
    id: 'x' + Math.random().toString(36).slice(2, 9),
    name: '', equip: '머신', lift: '', sets: 3, repLo: 8, repHi: 12,
    rir: 1, rest: 150, mode: 'normal', round: 'near', note: ''
  }, o);
}
function defaultProgram() {
  return {
    mon: {
      title: 'Lower A — 스쿼트 강도', items: [
        ex({ name: '백스쿼트 (톱세트)', equip: '바벨', lift: '스쿼트', sets: 1, repLo: 3, repHi: 4, rir: 2, rest: 240, note: '램프업 무휴식 → 본세트 직전 4분 휴식' }),
        ex({ name: '백스쿼트 (백오프)', equip: '바벨', lift: '스쿼트', sets: 3, repLo: 5, repHi: 6, rir: 3, rest: 240, round: 'floor' }),
        ex({ name: '레그프레스', sets: 3, repLo: 8, repHi: 12, rir: 1, rest: 150, note: '깊은 ROM' }),
        ex({ name: '루마니안 데드리프트', equip: '바벨', sets: 3, repLo: 6, repHi: 10, rir: 2, rest: 150, note: '힌지 3회차 — 척추 압박 낮음' }),
        ex({ name: '원암 사이드레터럴 머신', sets: 2, repLo: 12, repHi: 15, rir: 1, rest: 90 }),
        ex({ name: '레그프레스 카프레이즈', sets: 3, repLo: 10, repHi: 15, rir: 0, rest: 90, note: '전족부만 걸고 하단 2초 정지' })
      ]
    },
    tue: {
      title: 'Upper A — 벤치 강도', items: [
        ex({ name: '벤치프레스 (톱세트)', equip: '바벨', lift: '벤치프레스', sets: 1, repLo: 2, repHi: 3, rir: 2, rest: 210 }),
        ex({ name: '벤치프레스 (백오프)', equip: '바벨', lift: '벤치프레스', sets: 3, repLo: 4, repHi: 6, rir: 3, rest: 210, round: 'floor' }),
        ex({ name: '머신 랫풀다운', sets: 3, repLo: 8, repHi: 12, rir: 1, rest: 150 }),
        ex({ name: '스미스 숄더프레스 R1 (대사)', sets: 1, repLo: 30, repHi: 40, rir: 0, rest: 180, mode: 'restpause', note: '활성세트 + RP 2회 총합 입력. 미니세트 간 15초' }),
        ex({ name: '스미스 숄더프레스 R2 (긴장)', sets: 1, repLo: 12, repHi: 16, rir: 0, rest: 180, mode: 'restpause', note: '증량 후 활성세트 6회 미만이면 증량 철회' }),
        ex({ name: '원암 사이드레터럴 머신', sets: 2, repLo: 12, repHi: 15, rir: 1, rest: 90 }),
        ex({ name: '리버스 팩덱플라이', sets: 2, repLo: 12, repHi: 20, rir: 0, rest: 90 }),
        ex({ name: '케이블 원암 푸시다운', equip: '케이블', sets: 2, repLo: 10, repHi: 15, rir: 0, rest: 90, note: '↓ 이두와 교대 슈퍼세트' }),
        ex({ name: '프리쳐컬', sets: 2, repLo: 8, repHi: 12, rir: 0, rest: 90, note: '↑ 삼두와 교대 슈퍼세트' })
      ]
    },
    wed: {
      title: 'Lower B — 데드 강도', items: [
        ex({ name: '데드리프트', equip: '바벨', lift: '데드리프트', sets: 2, repLo: 3, repHi: 4, rir: 2, rest: 240, note: '2세트 고정' }),
        ex({ name: '백스쿼트 (기술)', equip: '바벨', lift: '스쿼트', sets: 3, repLo: 4, repHi: 6, rir: 4, rest: 180, round: 'floor', note: 'RIR4 고정 — 빈도 확보용' }),
        ex({ name: '시티드 레그컬', sets: 3, repLo: 10, repHi: 15, rir: 1, rest: 150 }),
        ex({ name: '힙쓰러스트', equip: '바벨', sets: 2, repLo: 8, repHi: 12, rir: 1, rest: 150 }),
        ex({ name: '원암 사이드레터럴 머신', sets: 2, repLo: 12, repHi: 15, rir: 1, rest: 90 }),
        ex({ name: '레그프레스 카프레이즈', sets: 3, repLo: 10, repHi: 15, rir: 0, rest: 90 })
      ]
    },
    thu: {
      title: 'Upper B — 풀 선행 + 인클라인', items: [
        ex({ name: '랩콘 리니어 로우', sets: 4, repLo: 6, repHi: 10, rir: 2, rest: 150, note: '팔꿈치 몸통에 붙여 광배 우위로' }),
        ex({ name: '클로스그립 랫풀다운', sets: 2, repLo: 8, repHi: 12, rir: 1, rest: 150 }),
        ex({ name: '덤벨 인클라인 벤치프레스', equip: '덤벨', sets: 3, repLo: 6, repHi: 10, rir: 2, rest: 150, note: '자유중량이 머신보다 선행' }),
        ex({ name: '인클라인 스미스 벤치프레스', sets: 3, repLo: 8, repHi: 12, rir: 1, rest: 150 }),
        ex({ name: '원암 사이드레터럴 머신', sets: 2, repLo: 12, repHi: 15, rir: 0, rest: 90 }),
        ex({ name: '리버스 팩덱플라이', sets: 2, repLo: 12, repHi: 20, rir: 0, rest: 90 }),
        ex({ name: '케이블 원암 익스텐션', equip: '케이블', sets: 2, repLo: 10, repHi: 15, rir: 0, rest: 90, note: '↓ 이두와 교대' }),
        ex({ name: '투암 케이블컬', equip: '케이블', sets: 2, repLo: 8, repHi: 12, rir: 0, rest: 90, note: '↑ 삼두와 교대' })
      ]
    },
    fri: {
      title: 'Lower C — 스쿼트 볼륨 + 데드 기술', items: [
        ex({ name: '백스쿼트', equip: '바벨', lift: '스쿼트', sets: 3, repLo: 6, repHi: 8, rir: 2, rest: 210 }),
        ex({ name: '데드리프트 (기술)', equip: '바벨', lift: '데드리프트', sets: 2, repLo: 3, repHi: 3, rir: 4, rest: 180, round: 'floor', note: 'RIR4 고정 — 피로 남기지 않는다' }),
        ex({ name: '레그프레스', sets: 3, repLo: 10, repHi: 15, rir: 1, rest: 150 }),
        ex({ name: '라잉 레그컬', sets: 3, repLo: 10, repHi: 15, rir: 0, rest: 150 }),
        ex({ name: '원암 사이드레터럴 머신', sets: 2, repLo: 12, repHi: 15, rir: 1, rest: 90 }),
        ex({ name: '레그프레스 카프레이즈', sets: 3, repLo: 10, repHi: 15, rir: 0, rest: 90 })
      ]
    },
    sat: {
      title: 'Upper C — 풀 선행 + 벤치 3회차', items: [
        ex({ name: '원암 풀다운', equip: '케이블', sets: 3, repLo: 10, repHi: 15, rir: 1, rest: 150 }),
        ex({ name: '벤치프레스 (포즈)', equip: '바벨', lift: '벤치프레스', sets: 3, repLo: 4, repHi: 6, rir: 3, rest: 210, round: 'floor', note: '가슴 1초 정지' }),
        ex({ name: '머신 체스트프레스', sets: 2, repLo: 10, repHi: 15, rir: 0, rest: 150 }),
        ex({ name: '케이블 플라이', equip: '케이블', sets: 2, repLo: 12, repHi: 20, rir: 0, rest: 90 }),
        ex({ name: '원암 사이드레터럴 머신', sets: 2, repLo: 12, repHi: 15, rir: 0, rest: 90 }),
        ex({ name: '케이블 원암 푸시다운', equip: '케이블', sets: 3, repLo: 10, repHi: 15, rir: 0, rest: 90, note: '↓ 이두와 교대' }),
        ex({ name: '해머컬', equip: '덤벨', sets: 3, repLo: 8, repHi: 12, rir: 0, rest: 90, note: '↑ 삼두와 교대' }),
        ex({ name: '덤벨 콤보 (사레→5초→프론트)', equip: '덤벨', sets: 2, repLo: 20, repHi: 25, rir: 0, rest: 90, note: '5kg 고정, 번아웃' })
      ]
    },
    sun: { title: '휴식', items: [] }
  };
}

/* ---------- 저장소 ---------- */
const KEY = 'autoreg.v1';
const DEFAULT_STATE = () => ({
  version: 1,
  settings: {
    unitBar: 10, unitMachine: 5, unitDumbbell: 2,
    capUp: 0.025, capDown: 0.03,
    baseline: {
      '스쿼트': { w: 140, reps: 3, rir: 0.5 },
      '벤치프레스': { w: 100, reps: 2, rir: 0.5 },
      '데드리프트': { w: 150, reps: 3, rir: 0.5 }
    },
    autoRest: true, sound: true, vibrate: true, notify: false, wakelock: true,
    cardioMin: 30
  },
  program: defaultProgram(),
  logs: {},           // logs[weekKey][dayKey] = { date, startedAt, endedAt, sets: { exId: [{w,reps,rir,done}] } }
  timer: null,        // { endsAt, total, label }
  session: null       // { week, day, startedAt }
});

const Store = {
  s: null,
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      this.s = raw ? JSON.parse(raw) : DEFAULT_STATE();
    } catch (e) { this.s = DEFAULT_STATE(); }
    if (!this.s.program) this.s.program = defaultProgram();
    if (!this.s.logs) this.s.logs = {};
    if (!this.s.settings) this.s.settings = DEFAULT_STATE().settings;
    return this.s;
  },
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.s)); }
    catch (e) { toast('저장 공간이 부족합니다'); }
  }
};

/* ---------- 자동조절 엔진 ---------- */
const Engine = {
  unitFor(e) {
    const st = Store.s.settings;
    if (e.equip === '바벨') return st.unitBar;
    if (e.equip === '덤벨') return st.unitDumbbell;
    return st.unitMachine;
  },
  /** 기록이 있는 주차 키를 오름차순으로 */
  weeksSorted() { return Object.keys(Store.s.logs).sort(); },

  /** 특정 주차에서 리프트의 최고 e1RM */
  bestE1(weekKey, lift) {
    const wk = Store.s.logs[weekKey]; if (!wk) return 0;
    let best = 0;
    Object.values(wk).forEach(day => {
      if (!day || !day.sets) return;
      Object.entries(day.sets).forEach(([exId, arr]) => {
        const e = findExById(exId);
        if (!e || e.lift !== lift) return;
        (arr || []).forEach(s => {
          if (!s || !s.done) return;
          const v = e1rmOf(+s.w, +s.reps, +s.rir);
          if (v > best) best = v;
        });
      });
    });
    return best;
  },

  /** 대상 주차에 적용할 e1RM (기준 → 이전 주들 순차 반영, 상승·하락 상한) */
  appliedE1(lift, targetWeek) {
    const st = Store.s.settings;
    const b = st.baseline[lift];
    if (!b) return 0;
    let cur = e1rmOf(b.w, b.reps, b.rir);
    this.weeksSorted().forEach(wk => {
      if (wk >= targetWeek) return;
      const best = this.bestE1(wk, lift);
      if (!best) return;
      const up = cur * (1 + st.capUp), dn = cur * (1 - st.capDown);
      cur = Math.round(Math.min(Math.max(best, dn), up) * 10) / 10;
    });
    return Math.round(cur * 10) / 10;
  },

  /** 직전 기록(대상 주차 이전에서 가장 최근) */
  prevRecord(exId, targetWeek) {
    const wks = this.weeksSorted().filter(w => w < targetWeek).reverse();
    for (const wk of wks) {
      const days = Store.s.logs[wk];
      for (const dk of DAY_KEYS) {
        const d = days[dk];
        if (d && d.sets && d.sets[exId]) {
          const arr = d.sets[exId].filter(s => s && s.done && +s.reps > 0);
          if (arr.length) return { week: wk, sets: d.sets[exId] };
        }
      }
    }
    return null;
  },

  /** 세트별 목표 산출 → [{w, reps, text, note}] */
  targets(e, weekKey) {
    const unit = this.unitFor(e);
    const out = [];
    if (e.lift) {
      const e1 = this.appliedE1(e.lift, weekKey);
      const rpe = 10 - e.rir;
      let w0 = e1 * pct1RM(e.repLo, rpe) / 100;
      w0 = e.round === 'floor' ? Math.floor(w0 / unit) * unit : Math.round(w0 / unit) * unit;
      let r0 = repsAt(w0, e1, rpe);
      if (r0 > e.repHi) { w0 += unit; r0 = repsAt(w0, e1, rpe); }
      const reps = Math.max(e.repLo, r0);
      for (let i = 0; i < e.sets; i++) {
        out.push({ w: w0, reps, text: `${w0}kg × ${reps}회 @RIR${e.rir}`, kind: 'main', e1 });
      }
      return out;
    }
    const prev = this.prevRecord(e.id, weekKey);
    for (let i = 0; i < e.sets; i++) {
      const p = prev && prev.sets[i] && prev.sets[i].done ? prev.sets[i] : null;
      if (!p || !+p.w) {
        out.push({
          w: '', reps: e.repLo,
          text: e.mode === 'restpause'
            ? `무게 자율 · 총 ${e.repLo}~${e.repHi}회`
            : `무게 자율 · ${e.repLo}~${e.repHi}회 @RIR${e.rir}`,
          kind: 'first'
        });
        continue;
      }
      const pw = +p.w, pr = +p.reps;
      if (pr >= e.repHi) {
        out.push({
          w: Math.round((pw + unit) * 10) / 10, reps: e.repLo,
          text: `${Math.round((pw + unit) * 10) / 10}kg × ${e.repLo}회 ▲증량`, kind: 'up'
        });
      } else {
        out.push({
          w: pw, reps: pr + 1,
          text: `${pw}kg × ${pr + 1}회` + (e.mode === 'restpause' ? ' (총합)' : ''), kind: 'rep'
        });
      }
    }
    return out;
  }
};

function allExercises() {
  const out = [];
  DAY_KEYS.forEach(d => (Store.s.program[d].items || []).forEach(e => out.push(e)));
  return out;
}
function findExById(id) { return allExercises().find(e => e.id === id) || null; }

/* ---------- 로그 접근 ---------- */
function getDayLog(weekKey, dayKey, create) {
  const L = Store.s.logs;
  if (!L[weekKey]) { if (!create) return null; L[weekKey] = {}; }
  if (!L[weekKey][dayKey]) {
    if (!create) return null;
    L[weekKey][dayKey] = { date: null, startedAt: null, endedAt: null, sets: {} };
  }
  return L[weekKey][dayKey];
}
function dayDone(weekKey, dayKey) {
  const d = getDayLog(weekKey, dayKey, false);
  if (!d) return 0;
  let n = 0;
  Object.values(d.sets || {}).forEach(arr => (arr || []).forEach(s => { if (s && s.done) n++; }));
  return n;
}
function dayTotalSets(dayKey) {
  return (Store.s.program[dayKey].items || []).reduce((a, e) => a + e.sets, 0);
}

/* ---------- UI 헬퍼 ---------- */
function el(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
let toastT = null;
function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  clearTimeout(toastT);
  toastT = setTimeout(() => t.remove(), 1900);
}
function modal(title, html, onOpen) {
  const m = document.createElement('div');
  m.className = 'modal';
  m.innerHTML = `<div class="sheet"><h3>${esc(title)}</h3>${html}</div>`;
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });
  document.body.appendChild(m);
  if (onOpen) onOpen(m);
  return m;
}
function closeModal() { document.querySelectorAll('.modal').forEach(m => m.remove()); }

/* ============================================================
   App
   ============================================================ */
const App = {
  tab: 'home',
  viewMonday: mondayOf(new Date()),
  cur: null,          // { week, day }
  tick: null,

  init() {
    Store.load();
    this.restore();
    document.querySelectorAll('nav.tabs button').forEach(b => {
      b.addEventListener('click', () => this.go(b.dataset.tab));
    });
    el('hAction').addEventListener('click', () => {
      if (this.tab === 'workout') this.finishSession(); else this.go('settings');
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.onResume(); });
    window.addEventListener('focus', () => this.onResume());
    this.tick = setInterval(() => this.onTick(), 250);
    this.go('home');
  },

  restore() {
    const s = Store.s;
    if (s.session) {
      const nowW = isoWeekKey(new Date());
      if (s.session.week === nowW) this.cur = { week: s.session.week, day: s.session.day };
      else s.session = null;
    }
  },

  go(tab) {
    this.tab = tab;
    ['home', 'workout', 'program', 'stats', 'settings'].forEach(t => {
      el('view' + t[0].toUpperCase() + t.slice(1)).classList.toggle('hide', t !== tab);
    });
    document.querySelectorAll('nav.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    el('hAction').textContent = tab === 'workout' ? '세션 종료' : '설정';
    const T = { home: '오늘의 훈련', workout: '운동 중', program: '루틴 편집', stats: '기록', settings: '설정' };
    el('hTitle').textContent = T[tab];
    this.render();
    window.scrollTo(0, 0);
  },

  render() {
    if (this.tab === 'home') this.renderHome();
    else if (this.tab === 'workout') this.renderWorkout();
    else if (this.tab === 'program') this.renderProgram();
    else if (this.tab === 'stats') this.renderStats();
    else this.renderSettings();
    this.renderRest();
  },

  /* ---------- 홈 ---------- */
  renderHome() {
    const today = new Date();
    const tdKey = dayKeyOf(today);
    const wkKey = isoWeekKey(this.viewMonday);
    const isThisWeek = isoWeekKey(today) === wkKey;
    el('hSub').textContent = `${today.getFullYear()}. ${fmtDate(today)} (${DAY_KO[tdKey]}) · ${isoWeekKey(today)}`;

    let cal = '';
    for (let i = 0; i < 7; i++) {
      const d = addDays(this.viewMonday, i);
      const dk = DAY_KEYS[i];
      const prog = Store.s.program[dk];
      const isToday = isThisWeek && dk === tdKey;
      const done = dayDone(wkKey, dk);
      const total = dayTotalSets(dk);
      const rest = total === 0;
      cal += `<div class="daycell ${isToday ? 'today' : ''} ${rest ? 'rest' : ''}" onclick="App.openDay('${wkKey}','${dk}')">
        ${done > 0 ? '<i class="dot"></i>' : ''}
        <div class="dw">${DAY_KO[dk]}</div>
        <div class="dd">${d.getDate()}</div>
        <div class="tag">${rest ? '휴식' : (prog.title.split('—')[0].trim() || '운동')}</div>
      </div>`;
    }

    const tprog = Store.s.program[tdKey];
    const tTotal = dayTotalSets(tdKey);
    const tDone = dayDone(isoWeekKey(today), tdKey);
    const pct = tTotal ? Math.round(tDone / tTotal * 100) : 0;

    let todayCard;
    if (tTotal === 0) {
      todayCard = `<div class="card">
        <h2>오늘 · ${DAY_KO[tdKey]}요일</h2>
        <div class="emptybox">오늘은 휴식일입니다.<br><span class="tiny">Zone2 ${Store.s.settings.cardioMin}분만 해도 좋습니다.</span></div>
        <button class="btn ghost sm" onclick="App.go('program')">루틴 편집</button>
      </div>`;
    } else {
      const list = tprog.items.map(e =>
        `<div class="exitem"><div class="g"><div class="n">${esc(e.name)}</div>
          <div class="m">${e.sets}세트 · ${e.mode === 'restpause' ? '총 ' : ''}${e.repLo}~${e.repHi}회 · RIR${e.rir} · 휴식 ${mmss(e.rest)}</div></div>
          <span class="pill blue">${esc(e.equip)}</span></div>`).join('');
      todayCard = `<div class="card">
        <h2>오늘 · ${esc(tprog.title)} <span class="pill ${pct === 100 ? 'green' : 'blue'}">${tDone}/${tTotal} 세트</span></h2>
        ${list}
        <div style="height:10px"></div>
        <button class="btn" onclick="App.startSession('${isoWeekKey(today)}','${tdKey}')">
          ${tDone > 0 ? '이어서 하기' : '오늘 운동 시작'}</button>
      </div>`;
    }

    /* 최근 세션 */
    const recent = [];
    this.weeksDesc().forEach(wk => {
      DAY_KEYS.slice().reverse().forEach(dk => {
        const d = Store.s.logs[wk] && Store.s.logs[wk][dk];
        if (d && d.date) {
          const n = dayDone(wk, dk);
          if (n) recent.push({ wk, dk, date: d.date, n, title: Store.s.program[dk].title });
        }
      });
    });
    recent.sort((a, b) => b.date.localeCompare(a.date));
    const recHtml = recent.slice(0, 6).map(r => {
      const dd = new Date(r.date);
      return `<div class="exitem" onclick="App.openDay('${r.wk}','${r.dk}')">
        <div class="iconb">✓</div>
        <div class="g"><div class="n">${esc(r.title)}</div>
        <div class="m">${dd.getFullYear()}. ${fmtDate(dd)} (${DAY_KO[r.dk]}) · ${r.n}세트 완료</div></div></div>`;
    }).join('') || '<div class="emptybox">아직 기록이 없습니다.<br><span class="tiny">첫 세션을 완료하면 다음 주 목표가 자동으로 계산됩니다.</span></div>';

    el('viewHome').innerHTML = `
      <div class="card">
        <div class="weeknav">
          <button class="navb" onclick="App.shiftWeek(-1)">‹ 이전</button>
          <b>${weekLabel(this.viewMonday)} · ${wkKey}</b>
          <button class="navb" onclick="App.shiftWeek(1)">다음 ›</button>
        </div>
        <div class="weekbar">${cal}</div>
        ${!isThisWeek ? '<div class="tiny" style="margin-top:8px">※ 이번 주가 아닙니다. 날짜를 눌러 해당 일자 기록을 확인·입력할 수 있습니다.</div>' : ''}
      </div>
      ${todayCard}
      <div class="card"><h2>최근 세션</h2>${recHtml}</div>
      <div class="card">
        <h2>다음 주 목표는 자동입니다</h2>
        <div class="muted">이번 주 기록을 입력하면 다음 주 목표가 스스로 계산됩니다.
        3대 운동은 RIR로 추정한 e1RM 기반(주간 상승 ${(Store.s.settings.capUp * 100).toFixed(1)}% / 하락 ${(Store.s.settings.capDown * 100).toFixed(1)}% 상한),
        보조 운동은 세트별 이중 점진(반복 +1 → 상한 도달 시 증량)으로 처리됩니다.</div>
      </div>`;
  },

  weeksDesc() { return Object.keys(Store.s.logs).sort().reverse(); },
  shiftWeek(n) { this.viewMonday = addDays(this.viewMonday, n * 7); this.render(); },

  openDay(week, day) {
    if (dayTotalSets(day) === 0) { toast('휴식일입니다'); return; }
    this.startSession(week, day, true);
  },

  /* ---------- 세션 ---------- */
  startSession(week, day, silent) {
    this.cur = { week, day };
    const log = getDayLog(week, day, true);
    if (!log.startedAt) {
      log.startedAt = Date.now();
      const mon = this.mondayOfWeekKey(week);
      log.date = addDays(mon, DAY_KEYS.indexOf(day)).toISOString().slice(0, 10);
    }
    Store.s.session = { week, day, startedAt: log.startedAt };
    Store.save();
    if (!silent) this.requestWakeLock();
    this.go('workout');
  },

  mondayOfWeekKey(wk) {
    const [y, w] = wk.split('-W').map(Number);
    const jan4 = new Date(y, 0, 4);
    const mon1 = mondayOf(jan4);
    return addDays(mon1, (w - 1) * 7);
  },

  finishSession() {
    if (!this.cur) { this.go('home'); return; }
    const log = getDayLog(this.cur.week, this.cur.day, true);
    log.endedAt = Date.now();
    Store.s.session = null;
    Store.save();
    this.releaseWakeLock();
    const n = dayDone(this.cur.week, this.cur.day);
    toast(`세션 종료 · ${n}세트 완료`);
    this.cur = null;
    this.go('home');
  },

  renderWorkout() {
    if (!this.cur) {
      el('viewWorkout').innerHTML = `<div class="card"><div class="emptybox">
        진행 중인 세션이 없습니다.</div>
        <button class="btn" onclick="App.go('home')">홈으로</button></div>`;
      return;
    }
    const { week, day } = this.cur;
    const prog = Store.s.program[day];
    const log = getDayLog(week, day, true);
    const total = dayTotalSets(day), done = dayDone(week, day);
    const elapsed = log.startedAt ? (Date.now() - log.startedAt) / 1000 : 0;
    el('hSub').textContent = `${esc(prog.title)} · ${week}`;

    let html = `<div class="sessbar">
      <div><div class="l">세션 경과</div><div class="v" id="sessT">${hhmmss(elapsed)}</div></div>
      <div style="text-align:center"><div class="l">완료</div><div class="v">${done}/${total}</div></div>
      <div style="text-align:right"><div class="l">진행률</div><div class="v">${total ? Math.round(done / total * 100) : 0}%</div></div>
    </div>`;

    prog.items.forEach((e, ei) => {
      const tg = Engine.targets(e, week);
      const rec = log.sets[e.id] || [];
      let rows = `<div class="setrow head"><span></span><span>무게(kg)</span><span>${e.mode === 'restpause' ? '총 반복' : '반복'}</span><span>${e.mode === 'restpause' ? '—' : 'RIR'}</span><span>완료</span></div>`;
      for (let i = 0; i < e.sets; i++) {
        const r = rec[i] || {};
        const t = tg[i] || {};
        const dn = !!r.done;
        rows += `<div class="setrow ${dn ? 'done' : ''}">
          <div class="setno">${i + 1}</div>
          <input type="number" inputmode="decimal" step="any" placeholder="${t.w || '-'}" value="${r.w != null ? r.w : ''}"
            onchange="App.setVal('${e.id}',${i},'w',this.value)">
          <input type="number" inputmode="numeric" placeholder="${t.reps || '-'}" value="${r.reps != null ? r.reps : ''}"
            onchange="App.setVal('${e.id}',${i},'reps',this.value)">
          ${e.mode === 'restpause'
            ? `<div class="tiny" style="text-align:center">실패<br>기준</div>`
            : `<select onchange="App.setVal('${e.id}',${i},'rir',this.value)">${
                [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5].map(v =>
                  `<option value="${v}" ${(r.rir != null ? +r.rir : e.rir) === v ? 'selected' : ''}>${v}</option>`).join('')
              }</select>`}
          <button class="chk ${dn ? 'on' : ''}" onclick="App.toggleSet('${e.id}',${i})">✓</button>
        </div>`;
      }
      const firstT = tg[0] ? tg[0].text : '';
      const allSame = tg.every(x => x.text === firstT);
      const tgtHtml = allSame
        ? `<div class="target">목표 ${esc(firstT)}</div>`
        : `<div class="target">${tg.map((x, i) => `${i + 1}세트 ${esc(x.text)}`).join(' <span>/</span> ')}</div>`;

      html += `<div class="card">
        <div class="exhead">
          <div style="flex:1;min-width:0">
            <div class="exname">${esc(e.name)}</div>
            <div class="exmeta">${esc(e.equip)}${e.lift ? ' · ' + esc(e.lift) : ''} · 휴식 ${mmss(e.rest)}${e.note ? ' · ' + esc(e.note) : ''}</div>
          </div>
          <button class="iconb" onclick="App.editExercise('${day}',${ei})">✎</button>
        </div>
        ${tgtHtml}
        ${rows}
        <div class="btnrow" style="margin-top:9px">
          <button class="btn ghost sm" onclick="App.changeSets('${day}',${ei},1)">＋ 세트</button>
          <button class="btn ghost sm" onclick="App.changeSets('${day}',${ei},-1)">－ 세트</button>
          <button class="btn ghost sm" onclick="App.restFor('${e.id}')">휴식 ${mmss(e.rest)}</button>
          <button class="btn ghost sm" onclick="App.changeRest('${day}',${ei},-15)">휴식 −15초</button>
          <button class="btn ghost sm" onclick="App.changeRest('${day}',${ei},15)">＋15초</button>
        </div>
      </div>`;
    });

    html += `<div class="card">
      <div class="btnrow">
        <button class="btn ghost sm" onclick="App.addExercise('${day}')">＋ 운동 추가</button>
        <button class="btn ghost sm" onclick="App.go('program')">루틴 편집</button>
      </div>
      <div style="height:9px"></div>
      <button class="btn" onclick="App.finishSession()">세션 종료</button>
      <div class="tiny" style="margin-top:8px;text-align:center">종료 후 Zone2 ${Store.s.settings.cardioMin}분</div>
    </div>`;
    el('viewWorkout').innerHTML = html;
  },

  setVal(exId, idx, field, val) {
    const { week, day } = this.cur;
    const log = getDayLog(week, day, true);
    if (!log.sets[exId]) log.sets[exId] = [];
    while (log.sets[exId].length <= idx) log.sets[exId].push({});
    const s = log.sets[exId][idx];
    s[field] = val === '' ? null : +val;
    Store.save();
  },

  toggleSet(exId, idx) {
    const { week, day } = this.cur;
    const e = findExById(exId);
    const log = getDayLog(week, day, true);
    if (!log.sets[exId]) log.sets[exId] = [];
    while (log.sets[exId].length <= idx) log.sets[exId].push({});
    const s = log.sets[exId][idx];
    if (s.done) {
      s.done = false; Store.save(); this.renderWorkout(); return;
    }
    /* 값이 비어 있으면 목표값을 채워 넣는다 */
    const tg = Engine.targets(e, week)[idx] || {};
    if (s.w == null || s.w === '') s.w = tg.w || 0;
    if (s.reps == null || s.reps === '') s.reps = tg.reps || 0;
    if (s.rir == null) s.rir = e.mode === 'restpause' ? 0 : e.rir;
    if (!s.w || !s.reps) { toast('무게와 반복을 입력하세요'); return; }
    s.done = true;
    s.at = Date.now();
    Store.save();
    this.renderWorkout();
    if (Store.s.settings.autoRest) this.startRest(e.rest, e.name);
  },

  restFor(exId) {
    const e = findExById(exId);
    if (e) this.startRest(e.rest, e.name);
  },

  changeRest(day, ei, delta) {
    const e = Store.s.program[day].items[ei];
    e.rest = Math.max(0, e.rest + delta);
    Store.save();
    this.render();
    toast(`휴식 ${mmss(e.rest)}`);
  },

  changeSets(day, ei, delta) {
    const e = Store.s.program[day].items[ei];
    e.sets = Math.max(1, Math.min(10, e.sets + delta));
    Store.save();
    this.render();
  },

  /* ---------- 휴식 타이머 ---------- */
  startRest(sec, label) {
    Store.s.timer = { endsAt: Date.now() + sec * 1000, total: sec, label: label || '휴식', fired: false };
    Store.save();
    this.renderRest();
    this.requestWakeLock();
  },
  restAdd(n) {
    const t = Store.s.timer; if (!t) return;
    t.endsAt += n * 1000;
    if (t.endsAt < Date.now()) t.endsAt = Date.now();
    t.total = Math.max(t.total + n, 1);
    Store.save(); this.renderRest();
  },
  restStop() { Store.s.timer = null; Store.save(); this.renderRest(); },
  renderRest() {
    const t = Store.s.timer, bar = el('restbar');
    if (!t) { bar.classList.add('hide'); return; }
    bar.classList.remove('hide');
    const left = (t.endsAt - Date.now()) / 1000;
    const over = left <= 0;
    bar.classList.toggle('over', over);
    el('restLbl').textContent = over ? `${t.label} · 휴식 완료 — 다음 세트` : `${t.label} 휴식`;
    el('restT').textContent = over ? '+' + mmss(-left) : mmss(left);
    el('restProg').style.width = over ? '100%' : Math.max(0, Math.min(100, (1 - left / t.total) * 100)) + '%';
  },
  onTick() {
    const t = Store.s.timer;
    if (t) {
      this.renderRest();
      if (!t.fired && Date.now() >= t.endsAt) {
        t.fired = true; Store.save(); this.alarm(t.label);
      }
    }
    if (this.tab === 'workout' && this.cur) {
      const log = getDayLog(this.cur.week, this.cur.day, false);
      const n = el('sessT');
      if (log && log.startedAt && n) n.textContent = hhmmss((Date.now() - log.startedAt) / 1000);
    }
  },
  onResume() {
    Store.load();
    const t = Store.s.timer;
    if (t && !t.fired && Date.now() >= t.endsAt) { t.fired = true; Store.save(); this.alarm(t.label); }
    this.render();
  },
  alarm(label) {
    const st = Store.s.settings;
    if (st.vibrate && navigator.vibrate) navigator.vibrate([220, 90, 220, 90, 320]);
    if (st.sound) this.beep();
    if (st.notify && 'Notification' in window && Notification.permission === 'granted') {
      try {
        if (navigator.serviceWorker && navigator.serviceWorker.ready) {
          navigator.serviceWorker.ready.then(r => r.showNotification('휴식 완료', {
            body: `${label} — 다음 세트를 시작하세요`, tag: 'rest', renotify: true,
            icon: 'icon-192.png', badge: 'icon-192.png', vibrate: [200, 100, 200]
          })).catch(() => { });
        } else new Notification('휴식 완료', { body: label });
      } catch (e) { }
    }
  },
  beep() {
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      if (!this._ac) this._ac = new C();
      const ac = this._ac;
      if (ac.state === 'suspended') ac.resume();
      [0, .28, .56].forEach(off => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = 'sine'; o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, ac.currentTime + off);
        g.gain.exponentialRampToValueAtTime(0.35, ac.currentTime + off + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + off + 0.22);
        o.connect(g); g.connect(ac.destination);
        o.start(ac.currentTime + off); o.stop(ac.currentTime + off + 0.25);
      });
    } catch (e) { }
  },
  async requestWakeLock() {
    if (!Store.s.settings.wakelock || !('wakeLock' in navigator)) return;
    try { this._wl = await navigator.wakeLock.request('screen'); } catch (e) { }
  },
  releaseWakeLock() { try { if (this._wl) { this._wl.release(); this._wl = null; } } catch (e) { } },

  /* ---------- 루틴 편집 ---------- */
  renderProgram() {
    el('hSub').textContent = '요일별 루틴 · 자유롭게 편집';
    let html = '';
    DAY_KEYS.forEach(dk => {
      const p = Store.s.program[dk];
      const items = (p.items || []).map((e, i) => `
        <div class="exitem">
          <div class="iconb">${i + 1}</div>
          <div class="g"><div class="n">${esc(e.name)}</div>
            <div class="m">${e.sets}세트 · ${e.mode === 'restpause' ? '총 ' : ''}${e.repLo}~${e.repHi}회 · RIR${e.rir} · ${mmss(e.rest)}${e.lift ? ' · ' + esc(e.lift) : ''}</div></div>
          <button class="iconb" onclick="App.moveExercise('${dk}',${i},-1)">↑</button>
          <button class="iconb" onclick="App.editExercise('${dk}',${i})">✎</button>
          <button class="iconb del" onclick="App.deleteExercise('${dk}',${i})">✕</button>
        </div>`).join('') || '<div class="emptybox">운동이 없습니다 (휴식일)</div>';
      html += `<div class="card">
        <h2>${DAY_KO[dk]}요일
          <button class="pill blue" onclick="App.renameDay('${dk}')">${esc(p.title)} ✎</button></h2>
        ${items}
        <div style="height:9px"></div>
        <button class="btn ghost sm" onclick="App.addExercise('${dk}')">＋ 운동 추가</button>
      </div>`;
    });
    html += `<div class="card">
      <h2>루틴 초기화</h2>
      <div class="muted" style="margin-bottom:9px">기본 2분할 루틴으로 되돌립니다. 훈련 기록은 유지됩니다.</div>
      <button class="btn danger sm" onclick="App.resetProgram()">기본 루틴으로 복원</button>
    </div>`;
    el('viewProgram').innerHTML = html;
  },

  renameDay(dk) {
    const cur = Store.s.program[dk].title;
    const v = prompt('세션 이름', cur);
    if (v == null) return;
    Store.s.program[dk].title = v.trim() || cur;
    Store.save(); this.render();
  },

  moveExercise(dk, i, d) {
    const arr = Store.s.program[dk].items;
    const j = i + d;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    Store.save(); this.render();
  },

  deleteExercise(dk, i) {
    const e = Store.s.program[dk].items[i];
    if (!confirm(`"${e.name}"을(를) 삭제할까요?\n(지난 기록은 남습니다)`)) return;
    Store.s.program[dk].items.splice(i, 1);
    Store.save(); this.render();
  },

  addExercise(dk) { this.exerciseForm(dk, -1); },
  editExercise(dk, i) { this.exerciseForm(dk, i); },

  exerciseForm(dk, idx) {
    const isNew = idx < 0;
    const e = isNew ? ex({ name: '' }) : Store.s.program[dk].items[idx];
    const opt = (v, cur) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${v || '없음'}</option>`;
    const html = `
      <div class="field"><label>운동 이름</label>
        <input id="fName" value="${esc(e.name)}" placeholder="예) 인클라인 덤벨 프레스"></div>
      <div class="grid2">
        <div class="field"><label>기구</label><select id="fEquip">
          ${['바벨', '덤벨', '머신', '케이블', '맨몸'].map(v => opt(v, e.equip)).join('')}</select></div>
        <div class="field"><label>메인 리프트 (e1RM 연동)</label><select id="fLift">
          ${['', '스쿼트', '벤치프레스', '데드리프트'].map(v => opt(v, e.lift)).join('')}</select></div>
      </div>
      <div class="grid3">
        <div class="field"><label>세트</label><input id="fSets" type="number" min="1" max="10" value="${e.sets}"></div>
        <div class="field"><label>반복 하한</label><input id="fLo" type="number" min="1" value="${e.repLo}"></div>
        <div class="field"><label>반복 상한</label><input id="fHi" type="number" min="1" value="${e.repHi}"></div>
      </div>
      <div class="grid3">
        <div class="field"><label>목표 RIR</label><select id="fRir">
          ${[0, 0.5, 1, 1.5, 2, 2.5, 3, 4].map(v => `<option value="${v}" ${v === e.rir ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="field"><label>휴식(초)</label><input id="fRest" type="number" min="0" step="15" value="${e.rest}"></div>
        <div class="field"><label>방식</label><select id="fMode">
          <option value="normal" ${e.mode === 'normal' ? 'selected' : ''}>일반</option>
          <option value="restpause" ${e.mode === 'restpause' ? 'selected' : ''}>레스트포즈</option>
        </select></div>
      </div>
      <div class="field"><label>반올림 (메인 리프트만)</label><select id="fRound">
        <option value="near" ${e.round === 'near' ? 'selected' : ''}>가까운 단위로</option>
        <option value="floor" ${e.round === 'floor' ? 'selected' : ''}>내림 (백오프·기술 세트)</option>
      </select></div>
      <div class="field"><label>메모</label><input id="fNote" value="${esc(e.note || '')}"></div>
      <div class="tiny" style="margin-bottom:10px">
        레스트포즈로 두면 RIR을 쓰지 않고 <b>고정 중량에서의 총 반복수</b>로 진행합니다.
        미니세트는 전부 실패로 끝나 자각도가 정보를 담지 못하기 때문입니다.
      </div>
      <div class="btnrow">
        <button class="btn ghost sm" onclick="closeModal()">취소</button>
        <button class="btn sm" onclick="App.saveExercise('${dk}',${idx})">저장</button>
      </div>`;
    modal(isNew ? '운동 추가' : '운동 편집', html);
    this._draft = e;
  },

  saveExercise(dk, idx) {
    const g = id => el(id).value;
    const e = this._draft;
    const name = g('fName').trim();
    if (!name) { toast('운동 이름을 입력하세요'); return; }
    e.name = name;
    e.equip = g('fEquip');
    e.lift = g('fLift');
    e.sets = Math.max(1, Math.min(10, +g('fSets') || 1));
    e.repLo = Math.max(1, +g('fLo') || 1);
    e.repHi = Math.max(e.repLo, +g('fHi') || e.repLo);
    e.rir = +g('fRir');
    e.rest = Math.max(0, +g('fRest') || 0);
    e.mode = g('fMode');
    e.round = g('fRound');
    e.note = g('fNote').trim();
    if (idx < 0) Store.s.program[dk].items.push(e);
    else Store.s.program[dk].items[idx] = e;
    Store.save(); closeModal(); this.render();
    toast('저장되었습니다');
  },

  resetProgram() {
    if (!confirm('기본 2분할 루틴으로 되돌릴까요?')) return;
    Store.s.program = defaultProgram();
    Store.save(); this.render(); toast('기본 루틴 복원');
  },

  /* ---------- 기록 ---------- */
  renderStats() {
    el('hSub').textContent = '주차별 누적 · e1RM 추이';
    const weeks = Object.keys(Store.s.logs).sort();
    if (!weeks.length) {
      el('viewStats').innerHTML = `<div class="card"><div class="emptybox">
        아직 기록이 없습니다.<br><span class="tiny">세션을 완료하면 여기에 쌓입니다.</span></div></div>`;
      return;
    }
    const nextWeek = isoWeekKey(addDays(new Date(), 7));
    let html = '<div class="card"><h2>메인 리프트 e1RM</h2>';
    ['스쿼트', '벤치프레스', '데드리프트'].forEach(lift => {
      const series = weeks.map(w => Engine.bestE1(w, lift)).filter(v => v > 0);
      const base = Store.s.settings.baseline[lift];
      const b0 = e1rmOf(base.w, base.reps, base.rir);
      const applied = Engine.appliedE1(lift, nextWeek);
      const mx = Math.max(b0, ...series, 1);
      const bars = [b0].concat(series).map((v, i, a) =>
        `<i class="${i === a.length - 1 ? 'last' : ''}" style="height:${Math.max(4, v / mx * 100)}%"></i>`).join('');
      const diff = applied - b0;
      html += `<div style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <b style="font-size:13px">${lift}</b>
          <span><b style="font-size:16px">${applied}</b><span class="tiny"> kg</span>
          <span class="pill ${diff > 0 ? 'green' : diff < 0 ? 'red' : 'blue'}">${diff >= 0 ? '+' : ''}${diff.toFixed(1)}</span></span>
        </div>
        <div class="spark">${bars}</div>
        <div class="tiny">기준 ${b0.toFixed(1)}kg → 다음 주 적용 ${applied}kg</div>
      </div>`;
    });
    html += '</div>';

    weeks.slice().reverse().forEach(wk => {
      const days = Store.s.logs[wk];
      let rows = '';
      let wkVol = 0, wkSets = 0;
      DAY_KEYS.forEach(dk => {
        const d = days[dk]; if (!d || !d.sets) return;
        Object.entries(d.sets).forEach(([exId, arr]) => {
          const e = findExById(exId);
          const nm = e ? e.name : '(삭제된 운동)';
          const done = (arr || []).filter(s => s && s.done);
          if (!done.length) return;
          const reps = done.reduce((a, s) => a + (+s.reps || 0), 0);
          const vol = done.reduce((a, s) => a + (+s.reps || 0) * (+s.w || 0), 0);
          wkVol += vol; wkSets += done.length;
          rows += `<tr><td style="text-align:left">${esc(nm)}</td><td>${DAY_KO[dk]}</td>
            <td>${done.length}</td><td>${reps}</td><td>${Math.round(vol).toLocaleString()}</td></tr>`;
        });
      });
      if (!rows) return;
      html += `<div class="card">
        <h2>${wk} <span class="pill blue">${wkSets}세트 · ${Math.round(wkVol).toLocaleString()}kg</span></h2>
        <table class="hist"><thead><tr><th style="text-align:left">종목</th><th>요일</th><th>세트</th><th>총반복</th><th>볼륨</th></tr></thead>
        <tbody>${rows}</tbody></table></div>`;
    });
    el('viewStats').innerHTML = html;
  },

  /* ---------- 설정 ---------- */
  renderSettings() {
    el('hSub').textContent = '데이터는 이 기기에만 저장됩니다';
    const st = Store.s.settings;
    const b = st.baseline;
    const bl = lift => `<div class="grid3">
        <div class="field"><label>${lift} 무게</label><input type="number" value="${b[lift].w}" onchange="App.setBase('${lift}','w',this.value)"></div>
        <div class="field"><label>반복</label><input type="number" value="${b[lift].reps}" onchange="App.setBase('${lift}','reps',this.value)"></div>
        <div class="field"><label>RIR</label><input type="number" step="0.5" value="${b[lift].rir}" onchange="App.setBase('${lift}','rir',this.value)"></div>
      </div>`;
    el('viewSettings').innerHTML = `
      <div class="card"><h2>증량 단위</h2>
        <div class="grid3">
          <div class="field"><label>바벨(kg)</label><input type="number" step="0.5" value="${st.unitBar}" onchange="App.setSetting('unitBar',this.value)"></div>
          <div class="field"><label>머신·케이블</label><input type="number" step="0.5" value="${st.unitMachine}" onchange="App.setSetting('unitMachine',this.value)"></div>
          <div class="field"><label>덤벨</label><input type="number" step="0.5" value="${st.unitDumbbell}" onchange="App.setSetting('unitDumbbell',this.value)"></div>
        </div>
        <div class="tiny">2.5kg 원판이 없으므로 바벨은 10kg 기본. 10kg 원판이 최소면 20으로 바꾸세요.</div>
      </div>

      <div class="card"><h2>메인 리프트 기준 기록</h2>
        <div class="tiny" style="margin-bottom:8px">최초 1회만 입력합니다. 이후에는 세션 기록에서 e1RM이 자동 갱신됩니다.</div>
        ${bl('스쿼트')}${bl('벤치프레스')}${bl('데드리프트')}
        <div class="grid2">
          <div class="field"><label>주간 상승 상한(%)</label><input type="number" step="0.5" value="${(st.capUp * 100).toFixed(1)}" onchange="App.setSetting('capUp',this.value/100)"></div>
          <div class="field"><label>주간 하락 상한(%)</label><input type="number" step="0.5" value="${(st.capDown * 100).toFixed(1)}" onchange="App.setSetting('capDown',this.value/100)"></div>
        </div>
      </div>

      <div class="card"><h2>타이머 · 알림</h2>
        ${this.toggle('autoRest', '세트 완료 시 휴식 타이머 자동 시작')}
        ${this.toggle('sound', '완료 시 소리')}
        ${this.toggle('vibrate', '완료 시 진동')}
        ${this.toggle('wakelock', '운동 중 화면 꺼짐 방지')}
        ${this.toggle('notify', '알림(백그라운드 복귀 시 표시)')}
        <div class="field"><label>Zone2 유산소(분)</label><input type="number" value="${st.cardioMin}" onchange="App.setSetting('cardioMin',this.value)"></div>
        <button class="btn ghost sm" onclick="App.askNotify()">알림 권한 요청</button>
        <div class="tiny" style="margin-top:8px">
          휴대폰이 앱을 완전히 잠재우면 브라우저는 코드를 실행하지 못합니다. 이 앱은 <b>종료 시각을 저장</b>해 두고
          화면을 다시 켰을 때 정확한 남은 시간을 복원하며, 시간이 지났다면 즉시 알립니다.
          운동 중에는 화면 꺼짐 방지를 켜두는 편이 가장 확실합니다.
        </div>
      </div>

      <div class="card"><h2>데이터</h2>
        <div class="btnrow">
          <button class="btn ghost sm" onclick="App.exportData()">백업 내보내기</button>
          <button class="btn ghost sm" onclick="App.importData()">복원</button>
        </div>
        <div style="height:9px"></div>
        <button class="btn danger sm" onclick="App.wipe()">모든 데이터 삭제</button>
        <div class="tiny" style="margin-top:8px">서버로 전송되는 데이터는 없습니다. 브라우저 저장소를 지우면 함께 사라지니 가끔 백업하세요.</div>
      </div>

      <div class="card"><h2>알고리즘 요약</h2>
        <div class="muted">
          <b>메인 3대</b> — 모든 세트를 RIR로 e1RM 환산 → 그 주 최고값 → 다음 주 처방.
          10kg 단위라 중량이 잘 안 움직이므로 <b>반복수가 진행을 담당</b>하고, 예상 반복이 상한을 넘을 때만 증량됩니다.
          상승·하락 모두 자동이며 각각 상한이 걸려 있습니다.<br><br>
          <b>보조·머신</b> — 세트별 이중 점진. 지난주 그 세트보다 반복 +1, 상한 도달 시 한 단위 증량 후 하한으로 리셋.<br><br>
          <b>레스트포즈</b> — 미니세트가 전부 실패로 끝나 RIR이 무의미하므로, 고정 중량에서의 <b>총 반복수</b>로 진행합니다.
        </div>
      </div>`;
  },
  toggle(k, label) {
    const on = !!Store.s.settings[k];
    return `<div class="exitem"><div class="g"><div class="n" style="font-weight:600">${label}</div></div>
      <button class="pill ${on ? 'green' : 'blue'}" onclick="App.setSetting('${k}',${!on})">${on ? 'ON' : 'OFF'}</button></div>`;
  },
  setSetting(k, v) {
    Store.s.settings[k] = (typeof v === 'boolean') ? v : (isNaN(+v) ? v : +v);
    Store.save(); this.render();
  },
  setBase(lift, f, v) {
    Store.s.settings.baseline[lift][f] = +v || 0;
    Store.save();
  },
  askNotify() {
    if (!('Notification' in window)) { toast('이 브라우저는 알림을 지원하지 않습니다'); return; }
    Notification.requestPermission().then(p => {
      if (p === 'granted') { Store.s.settings.notify = true; Store.save(); toast('알림이 켜졌습니다'); }
      else toast('알림 권한이 거부되었습니다');
      this.render();
    });
  },
  exportData() {
    const blob = new Blob([JSON.stringify(Store.s, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `autoreg-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
  importData() {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = 'application/json';
    i.onchange = () => {
      const f = i.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const d = JSON.parse(r.result);
          if (!d.program || !d.settings) throw 0;
          Store.s = d; Store.save(); toast('복원 완료'); this.go('home');
        } catch (e) { toast('파일을 읽을 수 없습니다'); }
      };
      r.readAsText(f);
    };
    i.click();
  },
  wipe() {
    if (!confirm('모든 루틴과 기록이 삭제됩니다. 계속할까요?')) return;
    if (!confirm('되돌릴 수 없습니다. 정말 삭제할까요?')) return;
    localStorage.removeItem(KEY);
    Store.load(); this.go('home'); toast('초기화되었습니다');
  }
};

/* ---------- 부팅 ---------- */
window.addEventListener('DOMContentLoaded', () => {
  App.init();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => { });
  }
  /* 첫 터치에서 오디오 컨텍스트를 깨워 알람 소리가 막히지 않게 한다 */
  const wake = () => { App.beep && (App._ac && App._ac.state === 'suspended') && App._ac.resume(); };
  document.addEventListener('touchstart', wake, { once: true });
});
