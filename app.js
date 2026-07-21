/* ============================================================
   Autoreg — RIR 기반 자동조절 트레이닝 PWA
   모든 데이터는 localStorage에만 저장된다 (서버 없음).
   ============================================================ */
'use strict';

/* ---------- 카르보넨 생리학 기반 유산소 엔진 ---------- */
const CardioEngine = {
  calculateZones(age, rhr = 70) {
    if (!age) return null;
    const maxHR = 220 - age;
    const hrr = maxHR - rhr;
    return {
      zone2: { min: Math.round(hrr * 0.60 + rhr), max: Math.round(hrr * 0.70 + rhr) },
      zone3_4: { min: Math.round(hrr * 0.70 + rhr), max: Math.round(hrr * 0.85 + rhr) }
    };
  },
  renderDashboard() {
    const st = Store.s.settings;
    if (!st.age) return '';
    const zones = this.calculateZones(st.age, st.rhr || 70);
    return `
      <div class="cardio-dash">
        <div style="font-size:12px; font-weight:800; color:#047857; display:flex; align-items:center; gap:4px;">
          생리학 기반 카디오 타겟팅 (Age: ${st.age})
        </div>
        <div style="display:flex; justify-content:space-between; margin-top:6px; font-size:11px; color:#065f46;">
          <div><b>Zone 2 (회복/지방연소):</b><br>${zones.zone2.min} ~ ${zones.zone2.max} BPM</div>
          <div style="text-align:right;"><b>Zone 3-4 (심폐강화):</b><br>${zones.zone3_4.min} ~ ${zones.zone3_4.max} BPM</div>
        </div>
      </div>
    `;
  }
};

/* ---------- RPE ↔ %1RM 표 ---------- */
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
function e1rmOf(w, reps, rir) {
  if (!w || !reps) return 0;
  const p = pct1RM(reps, 10 - (rir == null ? 0 : rir));
  return Math.round((w / (p / 100)) * 10) / 10;
}
function repsAt(load, e1, rpe) {
  if (!e1 || !load) return 0;
  const target = (load / e1) * 100;
  const col = rpeColIdx(rpe);
  let out = 1;
  for (let r = 1; r <= 12; r++) { if (RPE_TABLE[r - 1][col] >= target) out = r; }
  return out;
}

/* ---------- 날짜 및 시간 헬퍼 ---------- */
function fmtDate(d) { return (d.getMonth() + 1) + '/' + d.getDate(); }
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
function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ---------- 2분할 6일 루틴 기본 데이터베이스 ---------- */
function ex(o) {
  return Object.assign({
    id: 'x' + Math.random().toString(36).slice(2, 9),
    type: 'weight',
    targetMin: 30,
    name: '', equip: '머신', lift: '', sets: 3, repLo: 8, repHi: 12,
    rir: 1, rest: 150, mode: 'normal', round: 'near', note: ''
  }, o);
}
function defaultPrograms() {
  return [
    { id: 'p1', title: '상체 1', desc: '벤치프레스 강도 및 상체 볼륨', items: [
        ex({ name: '벤치프레스 (톱세트)', equip: '바벨', lift: '벤치프레스', sets: 1, repLo: 3, repHi: 5, rir: 2, rest: 210 }),
        ex({ name: '벤치프레스 (백오프)', equip: '바벨', lift: '벤치프레스', sets: 3, repLo: 5, repHi: 8, rir: 2, rest: 180 }),
        ex({ name: '머신 랫풀다운', sets: 3, repLo: 8, repHi: 12, rir: 1, rest: 150 })
    ]},
    { id: 'p2', title: '상체 2', desc: '오버헤드 프레스 및 케이블 로우', items: [
        ex({ name: '오버헤드 프레스', equip: '바벨', sets: 3, repLo: 6, repHi: 10, rir: 1, rest: 180 }),
        ex({ name: '시티드 케이블 로우', equip: '케이블', sets: 3, repLo: 10, repHi: 15, rir: 1, rest: 150 }),
        ex({ name: '인클라인 덤벨 프레스', equip: '덤벨', sets: 3, repLo: 8, repHi: 12, rir: 1, rest: 150 })
    ]},
    { id: 'p3', title: '상체 3', desc: '인클라인 바벨 및 어깨 집중', items: [
        ex({ name: '인클라인 바벨 프레스', equip: '바벨', sets: 3, repLo: 6, repHi: 10, rir: 2, rest: 180 }),
        ex({ name: '원암 덤벨 로우', equip: '덤벨', sets: 3, repLo: 8, repHi: 12, rir: 1, rest: 150 }),
        ex({ name: '사이드 레터럴 레이즈', equip: '덤벨', sets: 4, repLo: 12, repHi: 20, rir: 0, rest: 90 })
    ]},
    { id: 'p4', title: '하체 1', desc: '백스쿼트 강도 및 레그프레스', items: [
        ex({ name: '백스쿼트 (톱세트)', equip: '바벨', lift: '스쿼트', sets: 1, repLo: 3, repHi: 5, rir: 2, rest: 240 }),
        ex({ name: '백스쿼트 (백오프)', equip: '바벨', lift: '스쿼트', sets: 3, repLo: 5, repHi: 8, rir: 2, rest: 210 }),
        ex({ name: '레그프레스', sets: 3, repLo: 10, repHi: 15, rir: 1, rest: 150 })
    ]},
    { id: 'p5', title: '하체 2', desc: '데드리프트 및 후면 사슬', items: [
        ex({ name: '데드리프트', equip: '바벨', lift: '데드리프트', sets: 2, repLo: 3, repHi: 5, rir: 2, rest: 240 }),
        ex({ name: '불가리안 스플릿 스쿼트', equip: '덤벨', sets: 3, repLo: 8, repHi: 12, rir: 1, rest: 150 }),
        ex({ name: '라잉 레그컬', sets: 3, repLo: 10, repHi: 15, rir: 1, rest: 120 })
    ]},
    { id: 'p6', title: '하체 3', desc: '프론트 스쿼트 및 머신 볼륨', items: [
        ex({ name: '프론트 스쿼트', equip: '바벨', sets: 3, repLo: 6, repHi: 10, rir: 2, rest: 180 }),
        ex({ name: '레그 익스텐션', sets: 3, repLo: 12, repHi: 15, rir: 0, rest: 120 }),
        ex({ name: '카프 레이즈', sets: 4, repLo: 10, repHi: 15, rir: 0, rest: 90 })
    ]}
  ];
}

/* ---------- 저장소 ---------- */
const KEY = 'autoreg.v5';
const DEFAULT_STATE = () => ({
  version: 5,
  settings: {
    isFirstRun: true, age: null, rhr: 70, unit: 'kg',
    unitBar: 10, unitMachine: 5, unitDumbbell: 2,
    capUp: 0.025, capDown: 0.03,
    baseline: {
      '스쿼트': { w: 0, reps: 1, rir: 0 },
      '벤치프레스': { w: 0, reps: 1, rir: 0 },
      '데드리프트': { w: 0, reps: 1, rir: 0 }
    },
    autoRest: true, sound: true, vibrate: true, notify: false, wakelock: true,
    cardioMin: 30
  },
  programs: defaultPrograms(),
  logs: {},
  timer: null,
  session: null
});

const Store = {
  s: null,
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      this.s = raw ? JSON.parse(raw) : DEFAULT_STATE();
    } catch (e) { this.s = DEFAULT_STATE(); }
    if (!this.s.programs) this.s.programs = defaultPrograms();
    if (!this.s.logs) this.s.logs = {};
    if (!this.s.settings) this.s.settings = DEFAULT_STATE().settings;
    if (this.s.settings.isFirstRun === undefined) this.s.settings.isFirstRun = true;
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
  datesSorted() { return Object.keys(Store.s.logs).sort(); },
  
  bestE1Before(targetDate, lift) {
    const dates = this.datesSorted().filter(d => d < targetDate);
    let best = 0;
    dates.forEach(d => {
      const log = Store.s.logs[d];
      if (!log || !log.sets) return;
      Object.entries(log.sets).forEach(([exId, arr]) => {
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
  appliedE1(lift, targetDate) {
    const st = Store.s.settings;
    const b = st.baseline[lift];
    if (!b) return 0;
    let cur = e1rmOf(b.w, b.reps, b.rir);
    
    const dates = this.datesSorted().filter(d => d < targetDate);
    dates.forEach(d => {
      const bestOfDay = this.bestE1ForDate(d, lift);
      if (bestOfDay > 0) {
        const up = cur * (1 + st.capUp), dn = cur * (1 - st.capDown);
        cur = Math.round(Math.min(Math.max(bestOfDay, dn), up) * 10) / 10;
      }
    });
    return Math.round(cur * 10) / 10;
  },
  bestE1ForDate(dateStr, lift) {
    const log = Store.s.logs[dateStr];
    if(!log || !log.sets) return 0;
    let best = 0;
    Object.entries(log.sets).forEach(([exId, arr]) => {
      const e = findExById(exId);
      if(!e || e.lift !== lift) return;
      (arr || []).forEach(s => {
        if(s && s.done) {
          const v = e1rmOf(+s.w, +s.reps, +s.rir);
          if(v > best) best = v;
        }
      });
    });
    return best;
  },

  prevRecord(exId, targetDate) {
    const dates = this.datesSorted().filter(d => d < targetDate).reverse();
    for (const d of dates) {
      const log = Store.s.logs[d];
      if (log && log.sets && log.sets[exId]) {
        const arr = log.sets[exId].filter(s => s && s.done && +s.reps > 0);
        if (arr.length) return { date: d, sets: log.sets[exId] };
      }
    }
    return null;
  },

  targets(e, targetDate) {
    if (e.type === 'cardio') {
      return [{ w: '', reps: '', text: `유산소 ${e.targetMin}분 진행`, kind: 'cardio' }];
    }
    const unit = this.unitFor(e);
    const uLabel = Store.s.settings.unit || 'kg';
    const out = [];
    if (e.lift) {
      const e1 = this.appliedE1(e.lift, targetDate);
      const rpe = 10 - e.rir;
      let w0 = e1 * pct1RM(e.repLo, rpe) / 100;
      w0 = e.round === 'floor' ? Math.floor(w0 / unit) * unit : Math.round(w0 / unit) * unit;
      let r0 = repsAt(w0, e1, rpe);
      if (r0 > e.repHi) { w0 += unit; r0 = repsAt(w0, e1, rpe); }
      const reps = Math.max(e.repLo, r0);
      for (let i = 0; i < e.sets; i++) {
        out.push({ w: w0, reps, text: `${w0}${uLabel} × ${reps}회 @RIR${e.rir}`, kind: 'main', e1 });
      }
      return out;
    }
    const prev = this.prevRecord(e.id, targetDate);
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
          text: `${Math.round((pw + unit) * 10) / 10}${uLabel} × ${e.repLo}회 ▲증량`, kind: 'up'
        });
      } else {
        out.push({
          w: pw, reps: pr + 1,
          text: `${pw}${uLabel} × ${pr + 1}회` + (e.mode === 'restpause' ? ' (총합)' : ''), kind: 'rep'
        });
      }
    }
    return out;
  }
};

function allExercises() {
  const out = [];
  Store.s.programs.forEach(p => (p.items || []).forEach(e => out.push(e)));
  return out;
}
function findExById(id) { return allExercises().find(e => e.id === id) || null; }

/* ---------- 로그 접근 ---------- */
function getLog(dateStr, create) {
  if (!Store.s.logs[dateStr]) {
    if (!create) return null;
    Store.s.logs[dateStr] = { programId: null, startedAt: null, endedAt: null, sets: {} };
  }
  return Store.s.logs[dateStr];
}
function dayDone(dateStr) {
  const d = getLog(dateStr, false);
  if (!d) return 0;
  let n = 0;
  Object.values(d.sets || {}).forEach(arr => (arr || []).forEach(s => { if (s && s.done) n++; }));
  return n;
}
function progTotalSets(pId) {
  const p = Store.s.programs.find(x => x.id === pId);
  if (!p) return 0;
  return p.items.reduce((a, e) => a + (e.type === 'cardio' ? 1 : e.sets), 0);
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
  cur: null, // { date, programId }
  editProgramId: null,
  viewMonday: (function() {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  })(),
  tick: null,

  init() {
    Store.load();
    this.restore();
    
    const splash = el('splashScreen');
    const splashBtn = el('splashBtn');
    
    if (Store.s.settings.isFirstRun) {
      if (splashBtn) splashBtn.style.display = 'block';
    } else {
      if (splash) setTimeout(() => splash.classList.add('hide-splash'), 800);
    }

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
  
  startFromSplash() {
    const splash = el('splashScreen');
    if (splash) splash.classList.add('hide-splash');
    if (Store.s.settings.isFirstRun) setTimeout(() => this.showInitialSetup(), 400);
  },
  
  showInitialSetup() {
    const html = `
      <div style="text-align:center; margin-bottom:12px; font-size:13px; color:var(--mid);">
        기본 세팅을 위해 정보를 입력해주세요.
      </div>
      <div class="grid2">
        <div class="field"><label>나이 (카르보넨 계산용)</label>
          <input id="initAge" type="number" placeholder="예: 27"></div>
        <div class="field"><label>중량 단위</label>
          <select id="initUnit"><option value="kg">kg</option><option value="lbs">lbs</option></select></div>
      </div>
      <div class="field"><label>현재 스쿼트 1RM (추정치)</label>
        <input id="initSq" type="number" placeholder="0"></div>
      <div class="field"><label>현재 벤치프레스 1RM</label>
        <input id="initBp" type="number" placeholder="0"></div>
      <div class="field"><label>현재 데드리프트 1RM</label>
        <input id="initDl" type="number" placeholder="0"></div>
      <button class="btn" style="margin-top:16px;" onclick="App.saveInitialSetup()">완료 및 시작하기</button>
    `;
    modal('유료어플쓰다열받아서만든어플', html);
  },

  saveInitialSetup() {
    const st = Store.s.settings;
    st.age = +el('initAge').value || 25;
    st.unit = el('initUnit').value || 'kg';
    st.baseline['스쿼트'] = { w: +el('initSq').value || 0, reps: 1, rir: 0 };
    st.baseline['벤치프레스'] = { w: +el('initBp').value || 0, reps: 1, rir: 0 };
    st.baseline['데드리프트'] = { w: +el('initDl').value || 0, reps: 1, rir: 0 };
    st.isFirstRun = false;
    Store.save(); closeModal(); this.render();
  },

  restore() {
    const s = Store.s;
    if (s.session && s.session.date === getTodayStr()) {
      this.cur = { date: s.session.date, programId: s.session.programId };
    } else {
      s.session = null;
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
    
    if (tab === 'program') this.editProgramId = null;
    
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

  /* ---------- 과거 날짜 운동 구경(조회) 기능 ---------- */
  openHistoryViewer(dateStr) {
    const log = Store.s.logs[dateStr];
    const uLabel = Store.s.settings.unit || 'kg';
    
    if (!log || !log.sets || Object.keys(log.sets).length === 0) {
      toast(`${dateStr}에 기록된 운동이 없습니다.`);
      return;
    }
    
    const p = Store.s.programs.find(x => x.id === log.programId);
    const pTitle = p ? p.title : '저장된 루틴';
    
    let contentHtml = `<div style="font-size:13px; color:var(--mid); margin-bottom:12px;">루틴: <b>${esc(pTitle)}</b></div>`;
    
    Object.entries(log.sets).forEach(([exId, arr]) => {
      const e = findExById(exId);
      const name = e ? e.name : '(삭제된 운동)';
      const doneSets = (arr || []).filter(s => s && s.done);
      
      contentHtml += `<div style="background:var(--sky-50); padding:10px; border-radius:10px; margin-bottom:8px;">
        <div style="font-weight:800; font-size:14px; color:var(--sky-900);">${esc(name)}</div>
        <div style="font-size:12px; color:var(--mid); margin-top:4px;">`;
      
      if (doneSets.length === 0) {
        contentHtml += `완료된 세트 없음`;
      } else {
        doneSets.forEach((s, idx) => {
          contentHtml += `[${idx+1}세트] ${s.w}${uLabel} × ${s.reps}회 (RIR ${s.rir})<br>`;
        });
      }
      contentHtml += `</div></div>`;
    });
    
    modal(`${dateStr} 운동 구경하기`, contentHtml + `<button class="btn sm" style="margin-top:12px;" onclick="closeModal()">닫기</button>`);
  },

  shiftWeek(n) {
    this.viewMonday.setDate(this.viewMonday.getDate() + n * 7);
    this.render();
  },

  /* ---------- 홈 ---------- */
  renderHome() {
    const today = new Date();
    const todayStr = getTodayStr();
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    el('hSub').textContent = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일 (${days[today.getDay()]}요일)`;

    // 1. 월간 캘린더 생성 (과거 터치 시 운동 구경 가능)
    const year = today.getFullYear();
    const month = today.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startOffset = firstDay; 
    
    let monthHtml = `<div class="card"><h2>${month + 1}월 달력 <span class="tiny">(날짜 터치시 과거 기록 구경)</span></h2><div class="monthly-cal">`;
    for(let i=0; i < startOffset; i++) monthHtml += `<div></div>`;
    
    for(let d=1; d <= daysInMonth; d++) {
      const iterStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const isDone = dayDone(iterStr) > 0;
      const isTodayStr = (d === today.getDate()) ? 'today' : '';
      const doneClass = isDone ? 'done' : '';
      monthHtml += `<div class="m-day ${isTodayStr} ${doneClass}" onclick="App.openHistoryViewer('${iterStr}')">${d}</div>`;
    }
    monthHtml += `</div></div>`;

    // 2. 주간 캘린더 바 생성
    let weekCalHtml = '';
    for (let i = 0; i < 7; i++) {
      const d = new Date(this.viewMonday);
      d.setDate(this.viewMonday.getDate() + i);
      const iterStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const isToday = iterStr === todayStr;
      const isDone = dayDone(iterStr) > 0;
      
      weekCalHtml += `<div class="daycell ${isToday ? 'today' : ''} ${isDone ? 'done' : ''}" onclick="App.openHistoryViewer('${iterStr}')">
        <div class="dw">${['일','월','화','수','목','금','토'][i]}</div>
        <div class="dd">${d.getDate()}</div>
        <div class="tag">${isDone ? '기록됨' : ''}</div>
      </div>`;
    }

    // 3. 루틴 템플릿 목록 렌더링
    let routinesHtml = '';
    Store.s.programs.forEach(p => {
      const exCount = p.items.length;
      let exNames = p.items.slice(0,3).map(e => e.name).join(', ');
      if (exCount > 3) exNames += ' 등';
      
      routinesHtml += `
        <div class="routine-card" onclick="App.startSession('${todayStr}', '${p.id}')">
          <div class="routine-header">
            <span class="routine-title">${esc(p.title)}</span>
            <span style="font-size:12px; color:var(--sky-600); font-weight:800;">시작하기 ▶</span>
          </div>
          <div class="routine-desc">${esc(p.desc)}</div>
          <div class="routine-meta">${exCount}개 | ${esc(exNames)}</div>
        </div>
      `;
    });

    let homeHtml = monthHtml + `
      <div class="card">
        <div class="weeknav">
          <button class="navb" onclick="App.shiftWeek(-1)">‹ 이전 주</button>
          <b>${fmtDate(this.viewMonday)} 주간 기록</b>
          <button class="navb" onclick="App.shiftWeek(1)">다음 주 ›</button>
        </div>
        <div class="weekbar">${weekCalHtml}</div>
      </div>
      <div class="card">
        <h2>수행할 루틴 선택</h2>
        <div class="muted" style="margin-bottom:12px;">원하는 루틴을 선택해 오늘의 운동을 시작하세요.</div>
        ${routinesHtml}
        <button class="btn ghost sm" onclick="App.go('program')" style="margin-top:8px;">➕ 새로운 루틴 템플릿 만들기</button>
      </div>
    `;

    if (this.cur && this.cur.date === todayStr) {
      const p = Store.s.programs.find(x => x.id === this.cur.programId);
      if (p) {
        homeHtml = `
          <div class="card" style="border: 2px solid var(--sky-400);">
            <h2>현재 진행 중인 세션</h2>
            <div style="font-size:15px; font-weight:800; margin-bottom:12px;">${esc(p.title)}</div>
            <button class="btn" onclick="App.go('workout')">이어서 하기</button>
          </div>
        ` + homeHtml;
      }
    }
    
    el('viewHome').innerHTML = homeHtml;
  },

  /* ---------- 세션 ---------- */
  startSession(dateStr, programId) {
    if (this.cur && this.cur.date === dateStr && this.cur.programId !== programId) {
      if (!confirm('현재 진행 중인 다른 세션 기록이 덮어씌워질 수 있습니다. 계속하시겠습니까?')) return;
    }
    this.cur = { date: dateStr, programId };
    const log = getLog(dateStr, true);
    if (!log.startedAt || log.programId !== programId) {
      log.programId = programId;
      log.startedAt = Date.now();
      log.sets = {};
    }
    Store.s.session = { date: dateStr, programId, startedAt: log.startedAt };
    Store.save();
    this.requestWakeLock();
    this.go('workout');
  },

  finishSession() {
    if (!this.cur) { this.go('home'); return; }
    const log = getLog(this.cur.date, true);
    log.endedAt = Date.now();
    Store.s.session = null;
    Store.save();
    this.releaseWakeLock();
    const n = dayDone(this.cur.date);
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
    const { date, programId } = this.cur;
    const prog = Store.s.programs.find(x => x.id === programId);
    if (!prog) return this.go('home');

    const log = getLog(date, true);
    const total = progTotalSets(programId), done = dayDone(date);
    const elapsed = log.startedAt ? (Date.now() - log.startedAt) / 1000 : 0;
    const uLabel = Store.s.settings.unit || 'kg';
    
    el('hSub').textContent = `${esc(prog.title)}`;

    let html = `
      ${CardioEngine.renderDashboard()}
      <div class="sessbar">
        <div><div class="l">세션 경과</div><div class="v" id="sessT">${hhmmss(elapsed)}</div></div>
        <div style="text-align:center"><div class="l">완료</div><div class="v">${done}/${total}</div></div>
        <div style="text-align:right"><div class="l">진행률</div><div class="v">${total ? Math.round(done / total * 100) : 0}%</div></div>
      </div>
    `;

    prog.items.forEach((e, ei) => {
      const tg = Engine.targets(e, date);
      const rec = log.sets[e.id] || [];
      const prev = Engine.prevRecord(e.id, date);
      
      let prevText = '이전 기록 없음';
      if (prev && prev.sets && prev.sets.length > 0) {
        const lastSet = prev.sets[prev.sets.length - 1]; 
        if(e.type === 'cardio') prevText = `저번 운동: 완료`;
        else if(lastSet && lastSet.w) prevText = `저번 운동: ${lastSet.w}${uLabel} × ${lastSet.reps}회`;
      }

      let rows = '';
      
      if (e.type === 'cardio') {
        const r = rec[0] || {};
        const dn = !!r.done;
        rows += `<div class="setrow head"><span></span><span style="grid-column: 2 / span 3;">유산소 진행</span><span>완료</span></div>
        <div class="setrow ${dn ? 'done' : ''}">
          <div class="setno">1</div>
          <div style="grid-column: 2 / span 3; text-align: center; font-weight: 800; color: var(--sky-700);">
            목표: ${e.targetMin}분
            <button class="btn ghost sm" style="display:inline-block; width:auto; padding:5px 12px; margin-left:12px;" onclick="App.startRest(${e.targetMin * 60}, '${e.name} 진행중')">⏱ 타이머</button>
          </div>
          <button class="chk ${dn ? 'on' : ''}" onclick="App.toggleSet('${e.id}',0)">✓</button>
        </div>`;
      } else {
        rows += `<div class="setrow head"><span></span><span>무게(${uLabel})</span><span>${e.mode === 'restpause' ? '총 반복' : '반복'}</span><span>${e.mode === 'restpause' ? '—' : 'RIR'}</span><span>완료</span></div>`;
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
      }

      const firstT = tg[0] ? tg[0].text : '';
      const allSame = tg.every(x => x.text === firstT);
      const tgtHtml = allSame
        ? `<div class="target">자동 처방: ${esc(firstT)}</div>`
        : `<div class="target">${tg.map((x, i) => `${i + 1}세트: ${esc(x.text)}`).join('<br>')}</div>`;

      html += `<div class="card">
        <div class="exhead">
          <div style="flex:1;min-width:0">
            <div class="exname">${esc(e.name)}</div>
            <div class="exmeta">${e.type==='cardio'?'유산소':esc(e.equip)}${e.lift ? ' · ' + esc(e.lift) : ''} · 휴식 ${mmss(e.rest)}</div>
            <div class="prev-record">📌 ${prevText}</div>
          </div>
          <button class="iconb" onclick="App.editExercise('${programId}',${ei})">✎</button>
        </div>
        ${tgtHtml}
        ${rows}
        ${e.type === 'weight' ? `
        <div class="btnrow" style="margin-top:9px">
          <button class="btn ghost sm" onclick="App.changeSets('${programId}',${ei},1)">＋ 세트</button>
          <button class="btn ghost sm" onclick="App.changeSets('${programId}',${ei},-1)">－ 세트</button>
          <button class="btn ghost sm" onclick="App.restFor('${e.id}')">휴식 ${mmss(e.rest)}</button>
        </div>` : ''}
      </div>`;
    });

    html += `<div class="card">
      <button class="btn ghost" onclick="App.addExercise('${programId}')" style="margin-bottom:12px;">➕ 현재 세션에 운동 추가하기</button>
      <button class="btn" onclick="App.finishSession()">세션 저장 및 종료</button>
      <div class="tiny" style="margin-top:8px;text-align:center">종료 후 Zone2 ${Store.s.settings.cardioMin}분 어떠신가요?</div>
    </div>`;
    el('viewWorkout').innerHTML = html;
  },

  setVal(exId, idx, field, val) {
    const { date } = this.cur;
    const log = getLog(date, true);
    if (!log.sets[exId]) log.sets[exId] = [];
    while (log.sets[exId].length <= idx) log.sets[exId].push({});
    const s = log.sets[exId][idx];
    s[field] = val === '' ? null : +val;
    Store.save();
  },

  toggleSet(exId, idx) {
    const { date, programId } = this.cur;
    const prog = Store.s.programs.find(x => x.id === programId);
    const e = prog.items.find(x => x.id === exId);
    const log = getLog(date, true);
    if (!log.sets[exId]) log.sets[exId] = [];
    while (log.sets[exId].length <= idx) log.sets[exId].push({});
    const s = log.sets[exId][idx];
    
    if (s.done) {
      s.done = false; Store.save(); this.renderWorkout(); return;
    }
    
    if (e.type === 'cardio') {
      s.done = true; s.at = Date.now();
      Store.save(); this.renderWorkout(); return;
    }
    
    const tg = Engine.targets(e, date)[idx] || {};
    if (s.w == null || s.w === '') s.w = tg.w || 0;
    if (s.reps == null || s.reps === '') s.reps = tg.reps || 0;
    if (s.rir == null) s.rir = e.mode === 'restpause' ? 0 : e.rir;
    if (!s.w || !s.reps) { toast('무게와 반복을 입력하세요'); return; }
    
    s.done = true; s.at = Date.now();
    Store.save();
    this.renderWorkout();
    if (Store.s.settings.autoRest) this.startRest(e.rest, e.name);
  },

  restFor(exId) {
    const prog = Store.s.programs.find(x => x.id === this.cur.programId);
    const e = prog.items.find(x => x.id === exId);
    if (e) this.startRest(e.rest, e.name);
  },

  changeSets(pId, ei, delta) {
    const p = Store.s.programs.find(x => x.id === pId);
    const e = p.items[ei];
    e.sets = Math.max(1, Math.min(10, e.sets + delta));
    Store.save(); this.render();
  },

  /* ---------- 휴식 타이머 ---------- */
  startRest(sec, label) {
    Store.s.timer = { endsAt: Date.now() + sec * 1000, total: sec, label: label || '휴식', fired: false };
    Store.save(); this.renderRest(); this.requestWakeLock();
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
    el('restLbl').textContent = over ? `${t.label} · 완료` : `${t.label}`;
    el('restT').textContent = over ? '+' + mmss(-left) : mmss(left);
    el('restProg').style.width = over ? '100%' : Math.max(0, Math.min(100, (1 - left / t.total) * 100)) + '%';
  },
  onTick() {
    const t = Store.s.timer;
    if (t) {
      this.renderRest();
      if (!t.fired && Date.now() >= t.endsAt) { t.fired = true; Store.save(); this.alarm(t.label); }
    }
    if (this.tab === 'workout' && this.cur) {
      const log = getLog(this.cur.date, false);
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
          navigator.serviceWorker.ready.then(r => r.showNotification('타이머 완료', {
            body: `${label}`, tag: 'rest', renotify: true,
            icon: 'icon-192.png', badge: 'icon-192.png', vibrate: [200, 100, 200]
          })).catch(() => { });
        } else new Notification('타이머 완료', { body: label });
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

  /* ---------- 루틴 템플릿 목록/편집 및 이름 수정 권한 부여 ---------- */
  renderProgram() {
    if (this.editProgramId) return this.renderProgramDetail(this.editProgramId);
    
    el('hSub').textContent = '루틴 편집';
    let html = '';
    Store.s.programs.forEach(p => {
      const exCount = p.items.length;
      html += `
        <div class="card">
          <h2>
            <span>${esc(p.title)}</span>
            <button class="pill blue" onclick="App.renameProgram('${p.id}')">루틴 이름 수정</button>
          </h2>
          <div class="muted">${esc(p.desc)}</div>
          <div class="tiny" style="margin-top:4px;">포함된 운동: ${exCount}개</div>
          <div class="btnrow" style="margin-top:12px;">
            <button class="btn ghost sm" onclick="App.openProgramDetail('${p.id}')">세부 운동 편집</button>
            <button class="btn danger sm" onclick="App.deleteProgram('${p.id}')">삭제</button>
          </div>
        </div>
      `;
    });
    html += `
      <div class="card">
        <button class="btn" onclick="App.createProgram()">➕ 새 루틴 템플릿 추가</button>
        <div style="height:12px"></div>
        <button class="btn danger sm" onclick="App.resetProgram()">기본 2분할 6일 루틴으로 복원</button>
      </div>`;
    el('viewProgram').innerHTML = html;
  },

  openProgramDetail(pId) {
    this.editProgramId = pId;
    this.render();
    window.scrollTo(0, 0);
  },

  renderProgramDetail(pId) {
    const p = Store.s.programs.find(x => x.id === pId);
    if (!p) { this.editProgramId = null; return this.render(); }
    
    el('hSub').textContent = `상세 편집: ${p.title}`;
    const items = (p.items || []).map((e, i) => `
      <div class="exitem">
        <div class="iconb">${i + 1}</div>
        <div class="g"><div class="n">${esc(e.name)}</div>
          <div class="m">${e.type === 'cardio' ? `유산소 · ${e.targetMin}분` : `${e.sets}세트 · ${e.mode === 'restpause' ? '총 ' : ''}${e.repLo}~${e.repHi}회 · RIR${e.rir}`}</div></div>
        <button class="iconb" onclick="App.moveExercise('${p.id}',${i},-1)">↑</button>
        <button class="iconb" onclick="App.editExercise('${p.id}',${i})">✎</button>
        <button class="iconb del" onclick="App.deleteExercise('${p.id}',${i})">✕</button>
      </div>`).join('') || '<div class="emptybox">운동이 없습니다</div>';
    
    el('viewProgram').innerHTML = `
      <div class="card">
        <h2>${esc(p.title)} <button class="pill blue" onclick="App.renameProgram('${p.id}')">이름 수정</button></h2>
        <div class="muted">${esc(p.desc)}</div>
        <div style="margin-top:16px;">${items}</div>
        <div style="height:12px"></div>
        <button class="btn ghost sm" onclick="App.addExercise('${p.id}')">＋ 이 루틴에 운동 추가</button>
      </div>
      <div class="card">
        <button class="btn" onclick="App.editProgramId = null; App.render();">← 루틴 목록으로 돌아가기</button>
      </div>
    `;
  },

  createProgram() {
    const title = prompt('새 루틴 이름 (예: 상체 4)', '상체 4');
    if (!title) return;
    const desc = prompt('루틴 설명', '추가 루틴');
    Store.s.programs.push({
      id: 'p' + Math.random().toString(36).slice(2, 9),
      title: title.trim(),
      desc: (desc || '').trim(),
      items: []
    });
    Store.save(); this.render();
  },

  renameProgram(pId) {
    const p = Store.s.programs.find(x => x.id === pId);
    const t = prompt('루틴 이름 수정', p.title);
    if (!t) return;
    const d = prompt('루틴 설명 수정', p.desc);
    p.title = t.trim();
    p.desc = (d || '').trim();
    Store.save(); this.render();
    toast('루틴 이름이 수정되었습니다');
  },

  deleteProgram(pId) {
    if (!confirm('이 루틴 템플릿을 삭제할까요?')) return;
    Store.s.programs = Store.s.programs.filter(x => x.id !== pId);
    Store.save(); this.render();
  },

  moveExercise(pId, i, d) {
    const p = Store.s.programs.find(x => x.id === pId);
    const arr = p.items;
    const j = i + d;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    Store.save(); this.render();
  },

  deleteExercise(pId, i) {
    const p = Store.s.programs.find(x => x.id === pId);
    const e = p.items[i];
    if (!confirm(`"${e.name}"을(를) 삭제할까요?`)) return;
    p.items.splice(i, 1);
    Store.save(); this.render();
  },

  addExercise(pId) { this.exerciseForm(pId, -1); },
  editExercise(pId, i) { this.exerciseForm(pId, i); },

  toggleExType() {
    const isCardio = el('fType').value === 'cardio';
    el('weightFields').style.display = isCardio ? 'none' : 'block';
    el('cardioFields').style.display = isCardio ? 'block' : 'none';
  },

  exerciseForm(pId, idx) {
    const p = Store.s.programs.find(x => x.id === pId);
    const isNew = idx < 0;
    const e = isNew ? ex({ name: '', type: 'weight' }) : p.items[idx];
    const opt = (v, cur) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${v || '없음'}</option>`;
    
    const html = `
      <div class="field"><label>운동 종류</label>
        <select id="fType" onchange="App.toggleExType()">
          <option value="weight" ${e.type !== 'cardio' ? 'selected' : ''}>웨이트 트레이닝</option>
          <option value="cardio" ${e.type === 'cardio' ? 'selected' : ''}>유산소 운동</option>
        </select>
      </div>
      <div class="field"><label>운동 이름</label>
        <input id="fName" value="${esc(e.name)}" placeholder="예: 벤치프레스 또는 러닝머신"></div>
      
      <div id="cardioFields" style="display: ${e.type === 'cardio' ? 'block' : 'none'};">
        <div class="field"><label>목표 시간 (분)</label>
          <input id="fTargetMin" type="number" min="1" value="${e.targetMin}">
        </div>
      </div>

      <div id="weightFields" style="display: ${e.type === 'cardio' ? 'none' : 'block'};">
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
      </div>
      <div class="btnrow" style="margin-top:16px;">
        <button class="btn ghost sm" onclick="closeModal()">취소</button>
        <button class="btn sm" onclick="App.saveExercise('${pId}',${idx})">저장</button>
      </div>`;
    modal(isNew ? '운동 추가' : '운동 편집', html);
    this._draft = e;
  },

  saveExercise(pId, idx) {
    const g = id => el(id).value;
    const e = this._draft;
    const name = g('fName').trim();
    if (!name) { toast('운동 이름을 입력하세요'); return; }
    
    e.name = name;
    e.type = g('fType');
    
    if (e.type === 'cardio') {
      e.targetMin = Math.max(1, +g('fTargetMin') || 30);
    } else {
      e.equip = g('fEquip');
      e.lift = g('fLift');
      e.sets = Math.max(1, Math.min(10, +g('fSets') || 1));
      e.repLo = Math.max(1, +g('fLo') || 1);
      e.repHi = Math.max(e.repLo, +g('fHi') || e.repLo);
      e.rir = +g('fRir');
      e.rest = Math.max(0, +g('fRest') || 0);
      e.mode = g('fMode');
      e.round = g('fRound');
    }
    
    const p = Store.s.programs.find(x => x.id === pId);
    if (idx < 0) p.items.push(e);
    else p.items[idx] = e;
    Store.save(); closeModal(); this.render();
    toast('저장되었습니다');
  },

  resetProgram() {
    if (!confirm('기본 2분할 6일 루틴으로 되돌릴까요? 기존 템플릿은 모두 초기화됩니다.')) return;
    Store.s.programs = defaultPrograms();
    Store.save(); this.render(); toast('기본 2분할 6일 루틴 복원 완료');
  },

  /* ---------- 기록 ---------- */
  renderStats() {
    el('hSub').textContent = '날짜별 누적 기록';
    const dates = Engine.datesSorted();
    const uLabel = Store.s.settings.unit || 'kg';
    if (!dates.length) {
      el('viewStats').innerHTML = `<div class="card"><div class="emptybox">
        아직 기록이 없습니다.<br><span class="tiny">세션을 완료하면 여기에 쌓입니다.</span></div></div>`;
      return;
    }
    
    let html = '';
    dates.slice().reverse().forEach(d => {
      const log = Store.s.logs[d];
      if(!log || !log.sets) return;
      
      let rows = '';
      let wkVol = 0, wkSets = 0;
      
      Object.entries(log.sets).forEach(([exId, arr]) => {
        const e = findExById(exId);
        const nm = e ? e.name : '(삭제된 운동)';
        const done = (arr || []).filter(s => s && s.done);
        if (!done.length) return;
        
        if (e && e.type === 'cardio') {
          wkSets += 1;
          rows += `<tr><td style="text-align:left">${esc(nm)} (유산소)</td>
            <td>1</td><td>-</td><td>완료</td></tr>`;
        } else {
          const reps = done.reduce((a, s) => a + (+s.reps || 0), 0);
          const vol = done.reduce((a, s) => a + (+s.reps || 0) * (+s.w || 0), 0);
          wkVol += vol; wkSets += done.length;
          rows += `<tr><td style="text-align:left">${esc(nm)}</td>
            <td>${done.length}</td><td>${reps}</td><td>${Math.round(vol).toLocaleString()}</td></tr>`;
        }
      });
      
      if (!rows) return;
      const p = Store.s.programs.find(x => x.id === log.programId);
      const pTitle = p ? p.title : '저장된 루틴';
      
      html += `<div class="card">
        <h2>${d} <span class="pill blue">${pTitle}</span></h2>
        <div class="tiny" style="margin-bottom:8px;">총 ${wkSets}세트 · 볼륨 ${Math.round(wkVol).toLocaleString()}${uLabel}</div>
        <table class="hist"><thead><tr><th style="text-align:left">종목</th><th>세트</th><th>총반복</th><th>볼륨</th></tr></thead>
        <tbody>${rows}</tbody></table></div>`;
    });
    el('viewStats').innerHTML = html || '<div class="card"><div class="emptybox">기록이 없습니다.</div></div>';
  },

  /* ---------- 설정 ---------- */
  renderSettings() {
    el('hSub').textContent = '데이터는 이 기기에만 저장됩니다';
    const st = Store.s.settings;
    const b = st.baseline;
    const uLabel = st.unit || 'kg';
    const bl = lift => `<div class="grid3">
        <div class="field"><label>${lift} 무게</label><input type="number" value="${b[lift].w}" onchange="App.setBase('${lift}','w',this.value)"></div>
        <div class="field"><label>반복</label><input type="number" value="${b[lift].reps}" onchange="App.setBase('${lift}','reps',this.value)"></div>
        <div class="field"><label>RIR</label><input type="number" step="0.5" value="${b[lift].rir}" onchange="App.setBase('${lift}','rir',this.value)"></div>
      </div>`;
    el('viewSettings').innerHTML = `
      <div class="card"><h2>증량 단위 및 기본 정보</h2>
        <div class="grid3">
          <div class="field"><label>바벨(${uLabel})</label><input type="number" step="0.5" value="${st.unitBar}" onchange="App.setSetting('unitBar',this.value)"></div>
          <div class="field"><label>머신·케이블</label><input type="number" step="0.5" value="${st.unitMachine}" onchange="App.setSetting('unitMachine',this.value)"></div>
          <div class="field"><label>덤벨</label><input type="number" step="0.5" value="${st.unitDumbbell}" onchange="App.setSetting('unitDumbbell',this.value)"></div>
        </div>
        <div class="grid2" style="margin-top:8px;">
          <div class="field"><label>나이</label><input type="number" value="${st.age || 25}" onchange="App.setSetting('age',this.value)"></div>
          <div class="field"><label>안정시 심박수(RHR)</label><input type="number" value="${st.rhr || 70}" onchange="App.setSetting('rhr',this.value)"></div>
        </div>
      </div>

      <div class="card"><h2>메인 리프트 기준 기록</h2>
        ${bl('스쿼트')}${bl('벤치프레스')}${bl('데드리프트')}
        <div class="grid2">
          <div class="field"><label>증량 상한(%)</label><input type="number" step="0.5" value="${(st.capUp * 100).toFixed(1)}" onchange="App.setSetting('capUp',this.value/100)"></div>
          <div class="field"><label>하락 상한(%)</label><input type="number" step="0.5" value="${(st.capDown * 100).toFixed(1)}" onchange="App.setSetting('capDown',this.value/100)"></div>
        </div>
      </div>

      <div class="card"><h2>타이머 · 알림</h2>
        ${this.toggle('autoRest', '세트 완료 시 휴식 타이머 자동 시작')}
        ${this.toggle('sound', '완료 시 소리')}
        ${this.toggle('vibrate', '완료 시 진동')}
        ${this.toggle('wakelock', '운동 중 화면 꺼짐 방지')}
        ${this.toggle('notify', '알림(백그라운드 복귀 시 표시)')}
        <div class="field"><label>Zone2 기본 유산소 처방(분)</label><input type="number" value="${st.cardioMin}" onchange="App.setSetting('cardioMin',this.value)"></div>
        <button class="btn ghost sm" onclick="App.askNotify()">알림 권한 요청</button>
      </div>

      <div class="card"><h2>데이터 관리</h2>
        <div class="btnrow">
          <button class="btn ghost sm" onclick="App.exportData()">백업 내보내기</button>
          <button class="btn ghost sm" onclick="App.importData()">복원하기</button>
        </div>
        <div style="height:9px"></div>
        <button class="btn danger sm" onclick="App.wipe()">모든 데이터 초기화</button>
      </div>
    `;
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
          if (!d.programs || !d.settings) throw 0;
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
  const wake = () => { App.beep && (App._ac && App._ac.state === 'suspended') && App._ac.resume(); };
  document.addEventListener('touchstart', wake, { once: true });
});
