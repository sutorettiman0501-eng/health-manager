// ===== Supabase =====
const SUPABASE_URL = 'https://dohodudlajausbnemqbo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRvaG9kdWRsYWphdXNibmVtcWJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NTI0MTgsImV4cCI6MjA5MzAyODQxOH0.XUVMCPStcJ794qzR3Qdlfy8uwrNIvRcVyfSME-6hRdA';
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== 運動種目（MET値） =====
const EXERCISE_TYPES = [
  { id: 'walk',       name: 'ウォーキング', icon: '🚶', met: 3.5 },
  { id: 'jog',        name: 'ジョギング',   icon: '🏃', met: 7.0 },
  { id: 'run',        name: 'ランニング',   icon: '🏃', met: 10.0 },
  { id: 'bike',       name: '自転車',       icon: '🚴', met: 6.0 },
  { id: 'swim',       name: '水泳',         icon: '🏊', met: 6.0 },
  { id: 'strength',   name: '筋トレ',       icon: '💪', met: 5.0 },
  { id: 'yoga',       name: 'ヨガ',         icon: '🧘', met: 2.5 },
  { id: 'stretch',    name: 'ストレッチ',   icon: '🤸', met: 2.0 },
  { id: 'aerobics',   name: 'エアロビクス', icon: '💃', met: 6.5 },
  { id: 'tennis',     name: 'テニス',       icon: '🎾', met: 7.0 },
  { id: 'soccer',     name: 'サッカー',     icon: '⚽', met: 7.0 },
  { id: 'basketball', name: 'バスケ',       icon: '🏀', met: 6.5 },
  { id: 'golf',       name: 'ゴルフ',       icon: '⛳', met: 4.0 },
  { id: 'hiking',     name: 'ハイキング',   icon: '🥾', met: 6.0 },
  { id: 'dance',      name: 'ダンス',       icon: '🕺', met: 5.0 },
  { id: 'other',      name: 'その他',       icon: '⭐', met: 4.0 },
];

// ===== 状態管理 =====
let settings = { id: null, height: null, age: null, gender: 'male', goal_weight: null };
let bodyRecords = [];
let exerciseRecords = [];
let currentView = 'today';
let currentDate = new Date();
let currentMetric = 'weight';
let currentPeriod = 7;
let chartInstance = null;
let selectedGender = 'male';

// ===== 初期化 =====
async function init() {
  setupEventListeners();
  renderDateLabel();
  await Promise.all([loadSettings(), loadBodyRecords(), loadExerciseRecords()]);
  renderToday();
  renderStreak();
}

// ===== データ読み込み =====
async function loadSettings() {
  const { data } = await db.from('health_settings').select('*').limit(1);
  if (data && data.length > 0) {
    settings = data[0];
    selectedGender = data[0].gender || 'male';
  }
}

async function loadBodyRecords() {
  const { data } = await db.from('body_records').select('*').order('date', { ascending: true });
  if (data) bodyRecords = data;
}

async function loadExerciseRecords() {
  const { data } = await db.from('exercise_records').select('*').order('date').order('created_at');
  if (data) exerciseRecords = data;
}

// ===== 日付ユーティリティ =====
function toDateStr(d) { return d.toLocaleDateString('sv-SE'); }

function formatDateJP(d) {
  const days = ['日','月','火','水','木','金','土'];
  return `${d.getMonth()+1}月${d.getDate()}日（${days[d.getDay()]}）`;
}

function renderDateLabel() {
  const el = document.getElementById('today-label');
  if (el) el.textContent = formatDateJP(currentDate);
}

// ===== 計算 =====
function calcBMI(weight) {
  if (!settings.height || !weight) return null;
  const h = settings.height / 100;
  return Math.round((weight / (h * h)) * 10) / 10;
}

function calcBF(bmi) {
  if (!bmi || !settings.age || !settings.gender) return null;
  const sexFactor = settings.gender === 'male' ? 1 : 0;
  const bf = (1.20 * bmi) + (0.23 * settings.age) - (10.8 * sexFactor) - 5.4;
  return Math.max(0, Math.round(bf * 10) / 10);
}

function calcCalories(exTypeId, durationMin) {
  const ex = EXERCISE_TYPES.find(e => e.id === exTypeId);
  if (!ex || !durationMin) return 0;
  const latestRecord = bodyRecords.filter(r => r.weight).slice(-1)[0];
  const weight = latestRecord?.weight || settings.goal_weight || 65;
  return Math.round(ex.met * weight * (durationMin / 60));
}

function getBMICategory(bmi) {
  if (bmi < 18.5) return { label: '低体重', cls: 'bmi-under' };
  if (bmi < 25)   return { label: '普通体重', cls: 'bmi-normal' };
  if (bmi < 30)   return { label: '過体重', cls: 'bmi-over' };
  return { label: '肥満', cls: 'bmi-obese' };
}

// ===== 今日ビュー =====
function renderToday() {
  renderDateLabel();
  const dateStr = toDateStr(currentDate);
  const rec = bodyRecords.find(r => r.date === dateStr);
  const exs = exerciseRecords.filter(e => e.date === dateStr);

  document.getElementById('weight-input').value = rec?.weight || '';
  document.getElementById('bf-input').value = rec?.body_fat || '';
  updateBodyMetrics(rec?.weight || null, rec?.body_fat || null);
  renderDiff(dateStr, rec?.weight || null);
  renderGoalProgress(rec?.weight || null);
  renderExerciseList(exs);
}

function updateBodyMetrics(weight, bf) {
  const bmi = calcBMI(weight);
  const bmiEl    = document.getElementById('bmi-value');
  const bmiBadge = document.getElementById('bmi-badge');
  const bfBadge  = document.getElementById('bf-badge');

  if (bmi) {
    bmiEl.textContent = bmi;
    const cat = getBMICategory(bmi);
    bmiBadge.textContent = cat.label;
    bmiBadge.className = `metric-badge ${cat.cls}`;
  } else {
    bmiEl.textContent = '--';
    bmiBadge.textContent = settings.height ? '' : '身長を設定';
    bmiBadge.className = 'metric-badge bmi-est';
  }

  // 体脂肪：手動入力がない場合に自動推定を表示
  const estimated = calcBF(bmi);
  if (!bf && estimated !== null) {
    bfBadge.textContent = `推定 ${estimated}%`;
    bfBadge.className = 'metric-badge bmi-est';
  } else {
    bfBadge.textContent = '';
    bfBadge.className = 'metric-badge';
  }
}

function renderDiff(dateStr, todayWeight) {
  const el = document.getElementById('diff-display');
  if (!todayWeight) { el.textContent = ''; el.className = 'diff-display'; return; }

  const prev = bodyRecords.filter(r => r.date < dateStr && r.weight).slice(-1)[0];
  if (!prev) { el.textContent = '初回記録 🎉'; el.className = 'diff-display diff-same'; return; }

  const diff = Math.round((todayWeight - prev.weight) * 100) / 100;
  if (diff === 0) {
    el.textContent = '前回比 ± 0 kg';
    el.className = 'diff-display diff-same';
  } else if (diff < 0) {
    el.textContent = `前回比 ▼ ${Math.abs(diff).toFixed(2)} kg`;
    el.className = 'diff-display diff-down';
  } else {
    el.textContent = `前回比 ▲ +${diff.toFixed(2)} kg`;
    el.className = 'diff-display diff-up';
  }
}

function renderGoalProgress(weight) {
  const wrap = document.getElementById('goal-progress-wrap');
  if (!settings.goal_weight || !weight) { wrap.classList.add('hidden'); return; }

  const startWeight = bodyRecords.filter(r => r.weight).slice(0, 1)[0]?.weight || weight;
  const goal = settings.goal_weight;
  const total = Math.abs(startWeight - goal);
  const done  = Math.abs(weight - goal);
  const pct   = total > 0 ? Math.max(0, Math.min(100, Math.round((1 - done / total) * 100))) : 100;
  const remain = Math.round((weight - goal) * 100) / 100;

  wrap.classList.remove('hidden');
  document.getElementById('goal-remain').textContent =
    remain === 0 ? '目標達成！🎉' : `あと ${Math.abs(remain).toFixed(2)} kg`;
  document.getElementById('goal-bar-fill').style.width = `${pct}%`;
}

function renderExerciseList(exs) {
  const list   = document.getElementById('exercise-list');
  const badge  = document.getElementById('calorie-total');
  const total  = exs.reduce((s, e) => s + (e.calories || 0), 0);
  badge.textContent = `${total} kcal`;
  list.innerHTML = '';

  if (!exs.length) {
    list.innerHTML = '<div class="exercise-empty">運動を追加してカロリーを記録しよう</div>';
    return;
  }
  exs.forEach(ex => {
    const type = EXERCISE_TYPES.find(t => t.id === ex.exercise_type) || { icon: '⭐' };
    const item = document.createElement('div');
    item.className = 'exercise-item';
    item.innerHTML = `
      <span class="exercise-icon">${type.icon}</span>
      <div class="exercise-info">
        <div class="exercise-name">${escapeHtml(ex.exercise_name)}</div>
        <div class="exercise-detail">${ex.duration_min}分${ex.notes ? ' · ' + escapeHtml(ex.notes) : ''}</div>
      </div>
      <span class="exercise-cal">${ex.calories} kcal</span>
      <button class="exercise-del" onclick="deleteExercise('${ex.id}')">×</button>
    `;
    list.appendChild(item);
  });
}

// ===== 保存：体重 =====
async function saveBodyRecord() {
  const weight = parseFloat(document.getElementById('weight-input').value);
  if (!weight) { alert('体重を入力してください'); return; }

  const bf = parseFloat(document.getElementById('bf-input').value) || null;
  const dateStr = toDateStr(currentDate);
  const bmi = calcBMI(weight);
  const bfToSave = bf || calcBF(bmi) || null;
  const payload = { date: dateStr, weight, bmi, body_fat: bfToSave };
  const existing = bodyRecords.find(r => r.date === dateStr);

  if (existing) {
    const { data, error } = await db.from('body_records')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', existing.id).select().single();
    if (error) { alert('更新に失敗しました: ' + error.message); return; }
    const idx = bodyRecords.findIndex(r => r.id === existing.id);
    if (idx > -1) bodyRecords[idx] = data;
  } else {
    const { data, error } = await db.from('body_records').insert(payload).select().single();
    if (error) { alert('保存に失敗しました: ' + error.message); return; }
    bodyRecords.push(data);
    bodyRecords.sort((a, b) => a.date.localeCompare(b.date));
  }

  // BF推定値をフィールドに反映
  if (!bf && bfToSave) document.getElementById('bf-input').value = bfToSave;
  renderDiff(dateStr, weight);
  renderGoalProgress(weight);
  renderStreak();

  const btn = document.getElementById('save-body-btn');
  btn.textContent = '保存しました ✓';
  btn.style.background = 'var(--green-dark)';
  setTimeout(() => { btn.textContent = '保存する'; btn.style.background = ''; }, 1800);
}

// ===== 運動モーダル =====
function openExerciseModal() {
  const sel = document.getElementById('ex-type');
  sel.innerHTML = EXERCISE_TYPES.map(t => `<option value="${t.id}">${t.icon} ${t.name}</option>`).join('');
  document.getElementById('ex-duration').value = '';
  document.getElementById('ex-notes').value = '';
  document.getElementById('calorie-preview').textContent = '-- kcal';
  document.getElementById('exercise-modal').classList.remove('hidden');
}

function updateCaloriePreview() {
  const type = document.getElementById('ex-type').value;
  const dur  = parseInt(document.getElementById('ex-duration').value);
  document.getElementById('calorie-preview').textContent =
    dur ? `${calcCalories(type, dur)} kcal` : '-- kcal';
}

async function saveExercise() {
  const type = document.getElementById('ex-type').value;
  const dur  = parseInt(document.getElementById('ex-duration').value);
  const notes = document.getElementById('ex-notes').value.trim();
  if (!dur || dur < 1) { alert('時間を入力してください'); return; }

  const dateStr = toDateStr(currentDate);
  const cal  = calcCalories(type, dur);
  const info = EXERCISE_TYPES.find(t => t.id === type);
  const payload = {
    date: dateStr,
    exercise_type: type,
    exercise_name: info?.name || type,
    duration_min: dur,
    calories: cal,
    notes: notes || null,
  };

  const { data, error } = await db.from('exercise_records').insert(payload).select().single();
  if (error) { alert('追加に失敗しました: ' + error.message); return; }
  exerciseRecords.push(data);
  document.getElementById('exercise-modal').classList.add('hidden');
  renderExerciseList(exerciseRecords.filter(e => e.date === dateStr));
}

async function deleteExercise(id) {
  await db.from('exercise_records').delete().eq('id', id);
  exerciseRecords = exerciseRecords.filter(e => e.id !== id);
  renderExerciseList(exerciseRecords.filter(e => e.date === toDateStr(currentDate)));
}

// ===== 設定 =====
function openSettings() {
  document.getElementById('s-height').value = settings.height || '';
  document.getElementById('s-age').value    = settings.age || '';
  document.getElementById('s-goal').value   = settings.goal_weight || '';
  selectedGender = settings.gender || 'male';
  document.querySelectorAll('.toggle-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.gender === selectedGender));
  document.getElementById('settings-modal').classList.remove('hidden');
}

async function saveSettings() {
  const height      = parseFloat(document.getElementById('s-height').value) || null;
  const age         = parseInt(document.getElementById('s-age').value) || null;
  const goal_weight = parseFloat(document.getElementById('s-goal').value) || null;
  const payload = { height, age, gender: selectedGender, goal_weight, updated_at: new Date().toISOString() };

  if (settings.id) {
    const { data } = await db.from('health_settings').update(payload).eq('id', settings.id).select().single();
    if (data) settings = data;
  } else {
    const { data } = await db.from('health_settings').insert(payload).select().single();
    if (data) settings = data;
  }
  document.getElementById('settings-modal').classList.add('hidden');
  renderToday();
}

// ===== ストリーク =====
function renderStreak() {
  const badge = document.getElementById('streak-badge');
  let streak = 0;
  const d = new Date();
  while (true) {
    if (bodyRecords.find(r => r.date === toDateStr(d))) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else break;
  }
  if (streak === 0) {
    badge.textContent = '今日から記録しよう';
    badge.className = 'streak-badge';
  } else {
    badge.textContent = `🔥 ${streak}日連続`;
    badge.className = 'streak-badge fire';
  }
}

// ===== グラフ =====
function renderGraph() {
  const today = new Date();
  const dates = Array.from({ length: currentPeriod }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (currentPeriod - 1 - i));
    return toDateStr(d);
  });
  const labels = dates.map(ds => {
    const d = new Date(ds);
    return `${d.getMonth()+1}/${d.getDate()}`;
  });

  let data, label, color, unit, type;
  if (currentMetric === 'weight') {
    data  = dates.map(ds => bodyRecords.find(r => r.date === ds)?.weight ?? null);
    label = '体重'; color = '#2ECC8A'; unit = 'kg'; type = 'line';
  } else if (currentMetric === 'bf') {
    data  = dates.map(ds => bodyRecords.find(r => r.date === ds)?.body_fat ?? null);
    label = '体脂肪率'; color = '#4A9EFF'; unit = '%'; type = 'line';
  } else {
    data  = dates.map(ds => {
      const total = exerciseRecords.filter(e => e.date === ds).reduce((s, e) => s + (e.calories || 0), 0);
      return total || null;
    });
    label = '消費カロリー'; color = '#FF9F43'; unit = 'kcal'; type = 'bar';
  }

  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
  const ctx = document.getElementById('main-chart').getContext('2d');
  chartInstance = new Chart(ctx, {
    type,
    data: {
      labels,
      datasets: [{
        label,
        data,
        borderColor: color,
        backgroundColor: type === 'bar' ? color + 'BB' : color + '25',
        borderWidth: 2.5,
        pointBackgroundColor: color,
        pointRadius: currentPeriod <= 30 ? 4 : 2,
        pointHoverRadius: 6,
        tension: 0.35,
        fill: type === 'line',
        spanGaps: true,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => `${c.parsed.y} ${unit}` } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 0 } },
        y: {
          grid: { color: '#F0EDE8' },
          ticks: { font: { size: 10 }, callback: v => `${v}${unit}` },
        },
      },
    },
  });

  const valid = data.filter(v => v !== null);
  const summary = document.getElementById('graph-summary');
  if (!valid.length) {
    summary.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);font-size:13px;padding:8px">データがありません</div>';
    return;
  }
  const avg    = Math.round(valid.reduce((s, v) => s + v, 0) / valid.length * 10) / 10;
  const min    = Math.min(...valid);
  const max    = Math.max(...valid);
  const change = valid.length >= 2
    ? Math.round((valid[valid.length - 1] - valid[0]) * 10) / 10
    : null;

  summary.innerHTML = `
    <div class="summary-item">
      <div class="summary-label">平均</div>
      <div class="summary-value">${avg}<small style="font-size:12px">${unit}</small></div>
    </div>
    <div class="summary-item">
      <div class="summary-label">最小</div>
      <div class="summary-value">${min}<small style="font-size:12px">${unit}</small></div>
    </div>
    <div class="summary-item">
      <div class="summary-label">最大</div>
      <div class="summary-value">${max}<small style="font-size:12px">${unit}</small></div>
    </div>
    ${change !== null ? `
    <div class="summary-item summary-change">
      <div class="summary-label">期間の変化</div>
      <div class="summary-value" style="color:${change <= 0 ? 'var(--green-dark)' : 'var(--red)'}">
        ${change > 0 ? '+' : ''}${change} ${unit}
      </div>
    </div>` : ''}
  `;
}

// ===== 記録ビュー =====
function renderHistory() {
  const list = document.getElementById('history-list');
  list.innerHTML = '';

  const allDates = [...new Set([
    ...bodyRecords.map(r => r.date),
    ...exerciseRecords.map(e => e.date),
  ])].sort((a, b) => b.localeCompare(a));

  if (!allDates.length) {
    list.innerHTML = '<div style="text-align:center;padding:48px;color:var(--text-muted);font-size:14px">記録がまだありません</div>';
    return;
  }

  allDates.forEach(ds => {
    const d    = new Date(ds);
    const days = ['日','月','火','水','木','金','土'];
    const body = bodyRecords.find(r => r.date === ds);
    const exs  = exerciseRecords.filter(e => e.date === ds);
    const totalCal = exs.reduce((s, e) => s + (e.calories || 0), 0);

    const card = document.createElement('div');
    card.className = 'history-card';
    card.innerHTML = `
      <div class="history-date">${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日（${days[d.getDay()]}）</div>
      ${body ? `
        <div class="history-body-row">
          <span class="history-weight">${Number(body.weight).toFixed(2)} kg</span>
          ${body.bmi       ? `<span class="history-meta">BMI ${body.bmi}</span>` : ''}
          ${body.body_fat  ? `<span class="history-meta">体脂肪 ${body.body_fat}%</span>` : ''}
        </div>` : '<div style="font-size:13px;color:var(--text-muted)">体重未記録</div>'}
      ${exs.length ? `
        <div class="history-exercises">${exs.map(e => {
          const t = EXERCISE_TYPES.find(x => x.id === e.exercise_type);
          return `${t?.icon || '⭐'} ${e.exercise_name} ${e.duration_min}分`;
        }).join(' · ')}</div>
        <div class="history-calories">消費 ${totalCal} kcal</div>
      ` : ''}
    `;
    list.appendChild(card);
  });
}

// ===== ビュー切り替え =====
function switchView(view) {
  currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`${view}-view`).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.view === view));
  if (view === 'today')   renderToday();
  if (view === 'graph')   renderGraph();
  if (view === 'history') renderHistory();
}

// ===== ユーティリティ =====
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ===== iOS PWA 対応 =====
async function refreshData() {
  await Promise.all([loadBodyRecords(), loadExerciseRecords()]);
  if (currentView === 'today')   renderToday();
  if (currentView === 'graph')   renderGraph();
  if (currentView === 'history') renderHistory();
  renderStreak();
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshData();
});
window.addEventListener('pageshow', e => { if (e.persisted) refreshData(); });

// ===== イベントリスナー =====
function setupEventListeners() {
  // ナビ
  document.querySelectorAll('.nav-btn').forEach(btn =>
    btn.addEventListener('click', () => switchView(btn.dataset.view)));

  // 日付移動
  document.getElementById('prev-day').addEventListener('click', () => {
    currentDate.setDate(currentDate.getDate() - 1); renderToday();
  });
  document.getElementById('next-day').addEventListener('click', () => {
    currentDate.setDate(currentDate.getDate() + 1); renderToday();
  });

  // 体重 ±ボタン
  document.getElementById('weight-minus').addEventListener('click', () => {
    const i = document.getElementById('weight-input');
    i.value = Math.round((parseFloat(i.value) || 0) * 10 - 1) / 10;
    updateBodyMetrics(parseFloat(i.value), parseFloat(document.getElementById('bf-input').value) || null);
  });
  document.getElementById('weight-plus').addEventListener('click', () => {
    const i = document.getElementById('weight-input');
    i.value = Math.round((parseFloat(i.value) || 0) * 10 + 1) / 10;
    updateBodyMetrics(parseFloat(i.value), parseFloat(document.getElementById('bf-input').value) || null);
  });

  // 体重・体脂肪 入力変化
  document.getElementById('weight-input').addEventListener('input', () => {
    const w  = parseFloat(document.getElementById('weight-input').value) || null;
    const bf = parseFloat(document.getElementById('bf-input').value) || null;
    updateBodyMetrics(w, bf);
  });
  document.getElementById('bf-input').addEventListener('input', () => {
    const w  = parseFloat(document.getElementById('weight-input').value) || null;
    const bf = parseFloat(document.getElementById('bf-input').value) || null;
    updateBodyMetrics(w, bf);
  });

  // 保存
  document.getElementById('save-body-btn').addEventListener('click', saveBodyRecord);

  // 運動
  document.getElementById('add-exercise-btn').addEventListener('click', openExerciseModal);
  document.getElementById('ex-type').addEventListener('change', updateCaloriePreview);
  document.getElementById('ex-duration').addEventListener('input', updateCaloriePreview);
  document.getElementById('save-exercise').addEventListener('click', saveExercise);
  document.getElementById('cancel-exercise').addEventListener('click', () =>
    document.getElementById('exercise-modal').classList.add('hidden'));
  document.getElementById('exercise-modal').addEventListener('click', e => {
    if (e.target.classList.contains('modal') || e.target.classList.contains('modal-backdrop'))
      document.getElementById('exercise-modal').classList.add('hidden');
  });

  // 設定
  document.getElementById('settings-btn').addEventListener('click', openSettings);
  document.getElementById('save-settings').addEventListener('click', saveSettings);
  document.getElementById('cancel-settings').addEventListener('click', () =>
    document.getElementById('settings-modal').classList.add('hidden'));
  document.getElementById('settings-modal').addEventListener('click', e => {
    if (e.target.classList.contains('modal') || e.target.classList.contains('modal-backdrop'))
      document.getElementById('settings-modal').classList.add('hidden');
  });
  document.querySelectorAll('.toggle-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      selectedGender = btn.dataset.gender;
      document.querySelectorAll('.toggle-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.gender === selectedGender));
    }));

  // グラフ操作
  document.querySelectorAll('[data-metric]').forEach(btn =>
    btn.addEventListener('click', () => {
      currentMetric = btn.dataset.metric;
      document.querySelectorAll('[data-metric]').forEach(b =>
        b.classList.toggle('active', b.dataset.metric === currentMetric));
      renderGraph();
    }));
  document.querySelectorAll('[data-days]').forEach(btn =>
    btn.addEventListener('click', () => {
      currentPeriod = parseInt(btn.dataset.days);
      document.querySelectorAll('[data-days]').forEach(b =>
        b.classList.toggle('active', b.dataset.days === btn.dataset.days));
      renderGraph();
    }));
}

// ===== 起動 =====
init();
