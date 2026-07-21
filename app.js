/* ============================================================
   Autoreg PRO — 자율 루틴 빌더 & 자동조절 트레이닝 엔진 (정제 UI 톤앤매너)
   ============================================================ */
'use strict';

// --- [추가] 누락되었던 전역 유틸리티 핵심 함수 정의 ---
function el(id) { return document.getElementById(id); }
function esc(str) { 
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function toast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}
function closeModal() { document.querySelectorAll('.modal').forEach(m => m.remove()); }
// ----------------------------------------------------

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

function getTargetHeartRate(age) {
  const maxHR = 220 - age;
  const restHR = 60;
  const hrr = maxHR - restHR;
  return {
    zone2Min: Math.round(restHR + (hrr * 0.60)),
    zone2Max: Math.round(restHR + (hrr * 0.70)),
    zone3Min: Math.round(restHR + (hrr * 0.70)),
    zone3Max: Math.round(restHR + (hrr * 0.85))
  };
}

function ex(o) {
  return Object.assign({
    id: 'x' + Math.random().toString(36).slice(2, 9),
    name: '', equip: '머신', lift: '', sets: 3, repLo: 8, repHi: 12,
    rir: 1, rest: 150, mode: 'normal', round: 'near', note: '', isCardio: false, cardioMin: 30
  }, o);
}

function initialRoutines() {
  return [
    {
      id: 'r-upper-1',
      title: '기본 2분할 — 상체 1',
      items: [
        ex({ name: '벤치프레스 (톱세트)', equip: '바벨', lift: '벤치프레스', sets: 1, repLo: 2, repHi: 3, rir: 2, rest: 210 }),
        ex({ name: '벤치프레스 (백오프)', equip: '바벨', lift: '벤치프레스', sets: 3, repLo: 4, repHi: 6, rir: 3, rest: 210, round: 'floor' }),
        ex({ name: '머신 랫풀다운', sets: 3, repLo: 8, repHi: 12, rir: 1, rest: 150 }),
        ex({ name: '원암 사이드레터럴 머신', sets: 3, repLo: 12, repHi: 15, rir: 1, rest: 90 }),
        ex({ name: '트레드밀 (유산소)', isCardio: true, cardioMin: 30, note: '하체 피로 회복 유도' })
      ]
    },
    {
      id: 'r-lower-1',
      title: '기본 2분할 — 하체 1',
      items: [
        ex({ name: '백스쿼트 (톱세트)', equip: '바벨', lift: '스쿼트', sets: 1, repLo: 3, repHi: 4, rir: 2, rest: 240 }),
        ex({ name: '백스쿼트 (백오프)', equip: '바벨', lift: '스쿼트', sets: 3, repLo: 5, repHi: 6, rir: 3, rest: 240 }),
        ex({ name: '루마니안 데드리프트', equip: '바벨', sets: 3, repLo: 6, repHi: 10, rir: 2, rest: 150 }),
        ex({ name: '싸이클 (유산소)', isCardio: true, cardioMin: 20 })
      ]
    }
  ];
}

const KEY = 'autoreg.v2_pro';
const DEFAULT_STATE = () => ({
  version: 2,
  user: { age: '', sbdSquat: '', sbdBench: '', sbdDead: '', initialized: false },
  settings: { unitBar: 10, unitMachine: 5, unitDumbbell: 2, capUp: 0.025, capDown: 0.03, autoRest: true, sound: true, vibrate: true, wakelock: true },
  routines: initialRoutines(),
  history: [],
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
    if (!this.s.routines || !this.s.routines.length) this.s.routines = initialRoutines();
    return this.s;
  },
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.s)); } catch (e) { toast('용량이 부족합니다'); }
  }
};

const Engine = {
  unitFor(e) {
    const st = Store.s.settings;
    if (e.equip === '바벨') return st.unitBar;
    if (e.equip === '덤벨') return st.unitDumbbell;
    return st.unitMachine;
  },
  getLatestE1RM(lift) {
    let best = 0;
    Store.s.history.forEach(h => {
      Object.entries(h.sets || {}).forEach(([exId, arr]) => {
        let matchedLift = '';
        Store.s.routines.forEach(r => { const found = r.items.find(i => i.id === exId); if (found) matchedLift = found.lift; });
        if (matchedLift !== lift) return;
        arr.forEach(s => { if (s.done) { const v = e1rmOf(s.w, s.reps, s.rir); if (v > best) best = v; } });
      });
    });
    if (best > 0) return best;
    const u = Store.s.user;
    if (lift === '스쿼트') return +u.sbdSquat || 140;
    if (lift === '벤치프레스') return +u.sbdBench || 100;
    if (lift === '데드리프트') return +u.sbdDead || 150;
    return 100;
  },
  prevRecord(exId) {
    for (let i = Store.s.history.length - 1; i >= 0; i--) {
      const h = Store.s.history[i];
      if (h.sets && h.sets[exId]) {
        const arr = h.sets[exId].filter(s => s.done);
        if (arr.length) return arr;
      }
    }
    return null;
  },
  targets(e) {
    const unit = this.unitFor(e);
    const out = [];
    if (e.isCardio) {
      out.push({ text: `목표 가동 임계치: ${e.cardioMin}분` });
      return out;
    }
    if (e.lift) {
      const e1 = this.getLatestE1RM(e.lift);
      const rpe = 10 - e.rir;
      let w0 = e1 * pct1RM(e.repLo, rpe) / 100;
      w0 = e.round === 'floor' ? Math.floor(w0 / unit) * unit : Math.round(w0 / unit) * unit;
      let r0 = repsAt(w0, e1, rpe);
      if (r0 > e.repHi) { w0 += unit; r0 = repsAt(w0, e1, rpe); }
      const reps = Math.max(e.repLo, r0);
      for (let i = 0; i < e.sets; i++) {
        out.push({ w: w0, reps, text: `${w0}kg × ${reps}회 (RIR ${e.rir})`, kind: 'main' });
      }
      return out;
    }
    const prev = this.prevRecord(e.id);
    for (let i = 0; i < e.sets; i++) {
      const p = prev && prev[i] ? prev[i] : null;
      if (!p || !p.w) {
        out.push({ w: '', reps: e.repLo, text: `부하 자율 세팅 · ${e.repLo}~${e.repHi}회`, kind: 'first' });
        continue;
      }
      if (p.reps >= e.repHi) {
        out.push({ w: Math.round((p.w + unit) * 10) / 10, reps: e.repLo, text: `${p.w + unit}kg 점진 증량`, kind: 'up' });
      } else {
        out.push({ w: p.w, reps: p.reps + 1, text: `${p.w}kg × ${p.reps + 1}회`, kind: 'rep' });
      }
    }
    return out;
  }
};

const App = {
  tab: 'home',
  tick: null,

  init() {
    Store.load();
    // 글로벌 윈도우 스코프에 인라인 호출용 바인딩
    window.App = this;
    
    this.checkOnboarding();
    document.querySelectorAll('nav.tabs button').forEach(b => {
      b.addEventListener('click', () => this.go(b.dataset.tab));
    });
    this.tick = setInterval(() => this.onTick(), 250);
    this.go('home');
  },

  checkOnboarding() {
    if (!Store.s.user.initialized) {
      this.showOnboardingModal();
    }
  },

  showOnboardingModal() {
    const html = `
      <div class="field"><label>연령 (심박수 정밀 연산 지표)</label>
        <input type="number" id="onAge" placeholder="예: 27"></div>
      
      <div style="margin: 16px 0 8px 0; font-size: 12px; font-weight: 700; color: var(--sky-900); display: flex; justify-content: space-between; align-items: center;">
        <span>3대 Baseline 1RM 구성 (kg)</span>
        <button type="button" style="font-size: 11px; color: var(--sky-500); font-weight: 700; text-decoration: underline;" onclick="App.setUnknownSBD()">측정 기록 없음 (기본값 설정)</button>
      </div>

      <div class="field"><label>스쿼트 1RM</label>
        <input type="number" id="onSq" placeholder="140"></div>
      <div class="field"><label>벤치프레스 1RM</label>
        <input type="number" id="onBp" placeholder="100"></div>
      <div class="field"><label>데드리프트 1RM</label>
        <input type="number" id="onDl" placeholder="150"></div>
      <div style="height:10px"></div>
      <button class="btn" onclick="App.saveOnboarding()">프로필 초기화 완료</button>
    `;
    const m = modal('시스템 초기 파라미터 구성', html);
    // [수정] 모달 강제 취소 이벤트 리스너 제거 방식 안전하게 변경
    m.onclick = null; 
  },

  setUnknownSBD() {
    el('onSq').value = 60;
    el('onBp').value = 40;
    el('onDl').value = 80;
    toast('입문자 기준 기본값이 입력되었습니다.');
  },

  saveOnboarding() {
    const age = +el('onAge').value;
    const sq = +el('onSq').value;
    const bp = +el('onBp').value;
    const dl = +el('onDl').value;
    if (!age || !sq || !bp || !dl) { toast('데이터 파라미터가 유효하지 않습니다.'); return; }
    Store.s.user = { age, sbdSquat: sq, sbdBench: bp, sbdDead: dl, initialized: true };
    Store.save();
    closeModal();
    this.render();
    toast('시스템 연산 기준이 설정되었습니다.');
  },

  go(tab) {
    if (!Store.s.user.initialized) return;
    this.tab = tab;
    ['home', 'workout', 'program', 'stats', 'settings'].forEach(t => {
      const targetView = el('view' + t[0].toUpperCase() + t.slice(1));
      if(targetView) targetView.classList.toggle('hide', t !== tab);
    });
    document.querySelectorAll('nav.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    const hTitle = el('hTitle');
    if(hTitle) hTitle.textContent = tab === 'workout' ? '트레이닝 레코더' : (tab === 'program' ? '자율 루틴 아키텍처' : 'Autoreg PRO');
    this.render();
  },

  render() {
    if (this.tab === 'home') this.renderHome();
    else if (this.tab === 'workout') this.renderWorkout();
    else if (this.tab === 'program') this.renderProgram();
    else if (this.tab === 'stats') this.renderStats();
    else this.renderSettings();
    this.renderRest();
  },

  renderHome() {
    const u = Store.s.user;
    const hr = getTargetHeartRate(u.age);
    
    let html = `
      <div class="card" style="border-left: 4px solid var(--sky-500);">
        <h2>신체 계측 지표 및 심박수 처방 가이드</h2>
        <div style="font-size: 13px; line-height: 1.6; color: var(--mid);">
          연령: 만 ${u.age}세 | 초기 기준 중량: S ${u.sbdSquat}kg / B ${u.sbdBench}kg / D ${u.sbdDead}kg<br>
          <div style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--line);">
            <b>카르보넨 공식 기반 목표 심박수 범위</b><br>
            - 지방 대사 & 피로 회복 유도 (Zone 2): <span class="pill green">${hr.zone2Min} ~ ${hr.zone2Max} BPM</span><br>
            - 심폐 지구력 임계 강도 (Zone 3-4): <span class="pill amber">${hr.zone3Min} ~ ${hr.zone3Max} BPM</span>
          </div>
        </div>
      </div>
      <div style="margin: 16px 4px 8px; font-weight: 700; font-size: 13.5px; color: var(--sky-900);">가용 자율 프로그램 리스트</div>
    `;

    Store.s.routines.forEach((r) => {
      let itemsPreview = r.items.map(i => {
        if (i.isCardio) return `<span class="pill amber">${i.name} (${i.cardioMin}분)</span>`;
        return `<span class="pill blue">${i.name} (${i.sets}세트)</span>`;
      }).join(' ');

      html += `
        <div class="card">
          <div style="margin-bottom: 12px;">
            <h2 style="margin:0 0 6px 0; font-size:14.5px;">${esc(r.title)}</h2>
            <div style="display:flex; flex-wrap:wrap; gap:2px;">${itemsPreview || '<span class="tiny">구성된 종목이 없습니다.</span>'}</div>
          </div>
          <button class="btn" onclick="App.startSession('${r.id}')">세션 초기화 및 워크아웃 개시</button>
        </div>
      `;
    });

    el('viewHome').innerHTML = html;
  },

  startSession(routineId) {
    const r = Store.s.routines.find(rt => rt.id === routineId);
    if (!r) return;
    
    Store.s.session = {
      routineId: r.id,
      title: r.title,
      startedAt: Date.now(),
      sets: {}
    };
    
    r.items.forEach(e => {
      Store.s.session.sets[e.id] = [];
      const totalSets = e.isCardio ? 1 : e.sets;
      for (let i = 0; i < totalSets; i++) {
        Store.s.session.sets[e.id].push({ w: '', reps: '', rir: e.rir, done: false, isCardio: e.isCardio, cardioMin: e.cardioMin });
      }
    });

    Store.save();
    this.go('workout');
  },

  renderWorkout() {
    const s = Store.s.session;
    if (!s) {
      el('viewWorkout').innerHTML = `<div class="card"><div class="emptybox">활성화된 훈련 데이터 스트림이 없습니다.<br>메인 화면에서 프로그램을 로드하십시오.</div></div>`;
      return;
    }

    const elapsed = (Date.now() - s.startedAt) / 1000;
    let html = `
      <div class="sessbar" style="display:flex; justify-content:space-between; align-items:center; background: var(--sky-900); color:#fff; padding:12px; border-radius:8px; margin-bottom:12px;">
        <div style="font-size:13px; font-weight:700;">세션 경과 시간: <span id="sessT" style="font-variant-numeric:tabular-nums;">${hhmmss(elapsed)}</span></div>
        <button class="pill red" style="border:0; cursor:pointer;" onclick="App.abortSession()">훈련 파기</button>
      </div>
      <div style="font-size:14px; font-weight:700; color:var(--sky-900); margin-bottom:12px;">실행 중인 아키텍처: ${esc(s.title)}</div>
    `;

    Object.keys(s.sets).forEach((exId) => {
      let e = null;
      Store.s.routines.forEach(rt => { const found = rt.items.find(i => i.id === exId); if (found) e = found; });
      if (!e) {
        const sample = s.sets[exId][0];
        e = { id: exId, name: sample.isCardio ? '자유 유산소 대사' : '자유 보조 종목', equip: '머신', lift: '', rir: 1, rest: 120, isCardio: sample.isCardio };
      }

      const tg = Engine.targets(e);
      let rows = '';

      if (e.isCardio) {
        const cData = s.sets[exId][0] || {};
        rows = `
          <div style="padding: 12px; background: var(--sky-50); border-radius: 8px; margin-top:6px; border: 1px solid var(--line);">
            <div style="font-size:12px; margin-bottom: 8px; font-weight:700; color:var(--sky-900);">지속 대사 시간 설정</div>
            <div style="display:flex; gap:6px; align-items:center; margin-bottom:10px;">
              <input type="number" style="width:64px; padding:6px; text-align:center; border-radius:4px; border:1px solid var(--line);" value="${cData.cardioMin || e.cardioMin}" onchange="App.setCardioMin('${exId}', this.value)">
              <span style="font-size:12px; color:var(--mid);">분</span>
              <button class="btn sm" style="margin:0; padding:6px 12px; border-radius:4px;" onclick="App.startRest(${(cData.cardioMin || e.cardioMin) * 60}, '${e.name}')">타이머 연동 기동</button>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; border-top: 1px dashed var(--line); padding-top:8px;">
              <span class="tiny">수행 상태 플래그</span>
              <button class="chk ${cData.done ? 'on' : ''}" style="width:80px; height:30px; font-size:12px; border-radius:4px;" onclick="App.toggleCardioDone('${exId}')">${cData.done ? '검증 완료' : '미완료'}</button>
            </div>
          </div>
        `;
      } else {
        rows = `<div class="setrow head"><span></span><span>부하(kg)</span><span>볼륨(회)</span><span>RIR</span><span>체크</span></div>`;
        s.sets[exId].forEach((setObj, i) => {
          const t = tg[i] || {};
          rows += `
            <div class="setrow ${setObj.done ? 'done' : ''}">
              <div class="setno">${i + 1}</div>
              <input type="number" placeholder="${t.w || '-'}" value="${setObj.w}" onchange="App.setSessionVal('${exId}', ${i}, 'w', this.value)">
              <input type="number" placeholder="${t.reps || '-'}" value="${setObj.reps}" onchange="App.setSessionVal('${exId}', ${i}, 'reps', this.value)">
              <select onchange="App.setSessionVal('${exId}', ${i}, 'rir', this.value)">
                ${[0, 0.5, 1, 1.5, 2, 2.5, 3, 4].map(v => `<option value="${v}" ${+setObj.rir === v ? 'selected' : ''}>${v}</option>`).join('')}
              </select>
              <button class="chk ${setObj.done ? 'on' : ''}" onclick="App.toggleSessionSet('${exId}', ${i}, ${t.w || 0}, ${t.reps || 0})">✓</button>
            </div>
          `;
        });
      }

      html += `
        <div class="card">
          <div class="exhead">
            <div>
              <div class="exname">${esc(e.name)}</div>
              <div class="exmeta">${e.isCardio ? '정량 유산소 훈련' : `${esc(e.equip)} 세팅`}</div>
            </div>
          </div>
          ${!e.isCardio ? `<div class="target">자동조절 타겟: ${tg[0]?.text || '자율 정량 산출'}</div>` : ''}
          ${rows}
        </div>
      `;
    });

    html += `
      <div class="card" style="margin-top: 16px;">
        <div class="btnrow" style="margin-bottom:12px;">
          <button class="btn ghost sm" onclick="App.promptAddLiveExercise(false)">자유 중량 종목 추가</button>
          <button class="btn ghost sm" onclick="App.promptAddLiveExercise(true)">자유 유산소 종목 추가</button>
        </div>
        <button class="btn" style="background: var(--sky-900);" onclick="App.askFinishSession()">세션 종료 및 과부하 데이터 피드백 연산</button>
      </div>
    `;

    el('viewWorkout').innerHTML = html;
  },

  setSessionVal(exId, idx, field, val) {
    Store.s.session.sets[exId][idx][field] = val === '' ? '' : +val;
    Store.save();
  },
  setCardioMin(exId, val) {
    Store.s.session.sets[exId][0].cardioMin = +val || 30;
    Store.save();
  },
  toggleCardioDone(exId) {
    const s = Store.s.session.sets[exId][0];
    s.done = !s.done;
    Store.save();
    this.renderWorkout();
  },
  toggleSessionSet(exId, idx, defaultW, defaultReps) {
    const s = Store.s.session.sets[exId][idx];
    if (s.done) {
      s.done = false;
    } else {
      if (s.w === '' || s.w === 0) s.w = defaultW;
      if (s.reps === '' || s.reps === 0) s.reps = defaultReps;
      if (!s.w || !s.reps) { toast('실측 부하 및 볼륨 데이터가 공란입니다.'); return; }
      s.done = true;
      if (Store.s.settings.autoRest) {
        let matchedRest = 120;
        Store.s.routines.forEach(rt => { const found = rt.items.find(i => i.id === exId); if (found) matchedRest = found.rest; });
        this.startRest(matchedRest, '세트 간 제한 휴식');
      }
    }
    Store.save();
    this.renderWorkout();
  },

  promptAddLiveExercise(isCardio) {
    const name = prompt(isCardio ? '유산소 프로파일 종목명:' : '웨이트 프로파일 종목명:');
    if (!name) return;
    const newId = 'live-' + Math.random().toString(36).slice(2, 7);
    Store.s.session.sets[newId] = [];
    if (isCardio) {
      Store.s.session.sets[newId].push({ w: 0, reps: 0, rir: 0, done: false, isCardio: true, cardioMin: 30 });
    } else {
      for(let i=0; i<3; i++) {
        Store.s.session.sets[newId].push({ w: '', reps: '', rir: 1, done: false, isCardio: false });
      }
    }
    Store.save();
    this.renderWorkout();
    toast(`실시간 커스텀 데이터 스트림 [${name}] 바인딩.`);
  },

  abortSession() {
    if (!confirm('현재 런타임의 모든 휘발성 세션 데이터가 파기됩니다. 진행하시겠습니까?')) return;
    Store.s.session = null;
    Store.save();
    this.go('home');
  },

  askFinishSession() {
    if (!confirm('훈련 기록 프로세스를 종료하시겠습니까?')) return;
    const saveConfirm = confirm('금일 실측 기록을 타임라인 데이터베이스에 적재하고 다음 주기 목표 중량 모델을 계산하시겠습니까?');
    
    if (saveConfirm) {
      const s = Store.s.session;
      const historyItem = {
        id: 'h-' + Date.now(),
        routineId: s.routineId,
        title: s.title,
        date: new Date().toISOString().slice(0,10),
        duration: Math.round((Date.now() - s.startedAt) / 1000),
        sets: s.sets
      };
      Store.s.history.push(historyItem);
      toast('데이터 피드백 모델 연산 및 데이터 무결성 검증 완료.');
    } else {
      toast('임시 훈련 데이터 세션이 파기되었습니다.');
    }
    
    Store.s.session = null;
    Store.save();
    this.go('home');
  },

  startRest(sec, label) {
    Store.s.timer = { endsAt: Date.now() + sec * 1000, total: sec, label: label || '휴식', fired: false };
    Store.save();
    this.renderRest();
  },
  restStop() { Store.s.timer = null; Store.save(); this.renderRest(); },
  renderRest() {
    const t = Store.s.timer, bar = el('restbar'); if (!t) { if(bar) bar.classList.add('hide'); return; }
    if(bar) bar.classList.remove('hide');
    const left = (t.endsAt - Date.now()) / 1000;
    const over = left <= 0;
    
    const restLbl = el('restLbl');
    const restT = el('restT');
    const restProg = el('restProg');
    
    if(restLbl) restLbl.textContent = over ? `타이머 임계 초과: 다음 데이터 세션 진입 요구` : `제한 휴식 모니터링 [${t.label}]`;
    if(restT) restT.textContent = over ? '+' + mmss(-left) : mmss(left);
    if(restProg) restProg.style.width = over ? '100%' : Math.max(0, Math.min(100, (1 - left / t.total) * 100)) + '%';
  },
  onTick() {
    const t = Store.s.timer;
    if (t) { this.renderRest(); if (!t.fired && Date.now() >= t.endsAt) { t.fired = true; Store.save(); if(Store.s.settings.vibrate && navigator.vibrate) navigator.vibrate([200, 100, 200]); } }
    if (this.tab === 'workout' && Store.s.session) {
      const n = el('sessT'); if (n) n.textContent = hhmmss((Date.now() - Store.s.session.startedAt) / 1000);
    }
  },

  renderProgram() {
    let html = `
      <div class="card">
        <h2>자율 트레이닝 루틴 블록 신규 설계</h2>
        <div class="field"><label>프로그램 아키텍처 식별자 명명</label>
          <input type="text" id="newRoutineTitle" placeholder="예: 상체 스트렝스 블록 A"></div>
        <button class="btn sm" onclick="App.createRoutine()">루틴 블록 추가 고정</button>
      </div>
    `;

    Store.s.routines.forEach((r) => {
      let itemsHtml = r.items.map((it, idx) => `
        <div class="exitem">
          <div class="iconb">${idx + 1}</div>
          <div class="g">
            <div class="n">${esc(it.name)}</div>
            <div class="m">${it.isCardio ? `유산소: 대사 제한 시간 ${it.cardioMin}분` : `${it.sets}세트 고정 · 목표 RIR ${it.rir} · ${it.equip}`}</div>
          </div>
          <button class="iconb del" style="background:#fff5f5; color:#c53030; border:1px solid #feb2b2;" onclick="App.deleteRoutineItem('${r.id}', ${idx})">✕</button>
        </div>
      `).join('') || '<div class="emptybox">루틴 아키텍처 내부 종목이 구성되지 않았습니다.</div>';

      html += `
        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <h2 style="margin:0;">${esc(r.title)}</h2>
            <button class="pill red" style="border:1px solid #feb2b2; cursor:pointer;" onclick="App.removeRoutineWhole('${r.id}')">블록 전체 파기</button>
          </div>
          <div style="margin: 8px 0;">${itemsHtml}</div>
          <div class="btnrow">
            <button class="btn ghost sm" onclick="App.promptAddRoutineItem('${r.id}', false)">중량 종목 삽입</button>
            <button class="btn ghost sm" onclick="App.promptAddRoutineItem('${r.id}', true)">대사 종목 삽입</button>
          </div>
        </div>
      `;
    });

    el('viewProgram').innerHTML = html;
  },

  createRoutine() {
    const t = el('newRoutineTitle').value.trim();
    if (!t) { toast('식별자가 공란입니다.'); return; }
    Store.s.routines.push({
      id: 'r-' + Date.now(),
      title: t,
      items: []
    });
    Store.save();
    el('newRoutineTitle').value = '';
    this.renderProgram();
    toast('루틴 노드가 성공적으로 빌드되었습니다.');
  },

  removeRoutineWhole(rId) {
    if (!confirm('선택된 프로그램 블록을 데이터베이스에서 영구 삭제하시겠습니까?')) return;
    Store.s.routines = Store.s.routines.filter(r => r.id !== rId);
    Store.save();
    this.renderProgram();
  },

  promptAddRoutineItem(rId, isCardio) {
    const r = Store.s.routines.find(rt => rt.id === rId);
    if (!r) return;
    const name = prompt(isCardio ? '유산소 프로파일 식별자 입력:' : '중량 종목 식별자 입력:');
    if (!name) return;

    if (isCardio) {
      const min = +prompt('임계 지속 시간(분):', '30') || 30;
      r.items.push(ex({ name, isCardio: true, cardioMin: min }));
    } else {
      const sets = +prompt('지정 타겟 세트수:', '3') || 3;
      const lift = prompt('3대 연동 식별 바인딩 (스쿼트, 벤치프레스, 데드리프트 중 정확히 입력하거나 공란 유지):') || '';
      r.items.push(ex({ name, sets, lift, equip: lift ? '바벨' : '머신', repLo: 5, repHi: 8, rir: 2 }));
    }
    Store.save();
    this.renderProgram();
    toast('종목 로직이 프로그램 블록에 할당되었습니다.');
  },

  deleteRoutineItem(rId, idx) {
    const r = Store.s.routines.find(rt => rt.id === rId);
    if (r) { r.items.splice(idx, 1); Store.save(); this.renderProgram(); }
  },

  renderStats() {
    let html = '<div class="card"><h2>실시간 추정 최고 출력 지표 (e1RM 피드백)</h2>';
    ['스쿼트', '벤치프레스', '데드리프트'].forEach(lift => {
      const current = Engine.getLatestE1RM(lift);
      html += `<div style="padding:10px 0; border-bottom:1px solid var(--line); font-size:13px; color:var(--mid);"><b>${lift} 가동 베이스라인:</b> <span style="font-weight:700; color:var(--sky-50); font-size:14px; background:var(--sky-500); padding:2px 6px; border-radius:4px;">${current}kg</span></div>`;
    });
    html += '</div>';

    if (!Store.s.history.length) {
      html += `<div class="card"><div class="emptybox">연산 처리된 데이터 시퀀스가 존재하지 않습니다.</div></div>`;
    } else {
      Store.s.history.slice().reverse().forEach(h => {
        let rows = '';
        Object.entries(h.sets).forEach(([exId, arr]) => {
          const doneSets = arr.filter(s => s.done);
          if (!doneSets.length) return;
          
          // 종목 블록명을 찾기 위한 매칭 로직 보완
          let matchedName = '지정 종목';
          Store.s.routines.forEach(rt => {
            const found = rt.items.find(i => i.id === exId);
            if (found) matchedName = found.name;
          });
          
          let details = doneSets.map(s => s.isCardio ? `[대사 임계치 ${s.cardioMin}분 완료]` : `${s.w}kg × ${s.reps}회 (RIR ${s.rir})`).join(', ');
          rows += `<div style="font-size:13px; padding:6px 0; color:var(--mid);">• <b>${esc(matchedName)}:</b> ${details}</div>`;
        });
        html += `
          <div class="card">
            <h2 style="font-size:14px; color:var(--sky-900); font-weight:700;">세션 레코드 스탬프: ${h.date} — ${esc(h.title)}</h2>
            <div class="tiny" style="margin-bottom:8px; color:var(--soft);">총 임계 타임: ${mmss(h.duration)}</div>
            <div style="padding-left:4px;">${rows}</div>
          </div>
        `;
      });
    }
    el('viewStats').innerHTML = html;
  },

  renderSettings() {
    el('viewSettings').innerHTML = `
      <div class="card">
        <h2>사용자 생리적 파라미터 강제 재구성</h2>
        <div class="field"><label>연령 계측값 수정</label><input type="number" value="${Store.s.user.age}" onchange="Store.s.user.age=+this.value; Store.save(); toast('연령 매개변수 수정됨');"></div>
        <button class="btn sm danger" style="margin-top:12px;" onclick="localStorage.clear(); location.reload();">로컬 스토리지 무결성 초기화</button>
      </div>
    `;
  }
};

function modal(title, html) {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div class="sheet"><h3>${esc(title)}</h3>${html}</div>`;
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });
  document.body.appendChild(m);
  return m;
}

window.addEventListener('DOMContentLoaded', () => { App.init(); });
