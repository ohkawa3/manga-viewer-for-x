'use strict';

// 設定画面。値を変えると自動で chrome.storage.local に保存する
// （content.js が同じキー startMode / baseRatio / hiddenModes を読む）。
const { MODES, START_LAST, RATIO, t } = XMV_CONFIG;

// 画面の文言を、ブラウザの言語に合わせて差し込む（_locales/<言語>/messages.json）
document.documentElement.lang = chrome.i18n.getUILanguage();
document.title = t('options_title');
document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });

const startSel = document.getElementById('startMode');
const range = document.getElementById('baseRatioRange');
const num = document.getElementById('baseRatioNum');
const statusEl = document.getElementById('status');
let statusTimer = 0;

const modeChecks = document.getElementById('modeChecks');
let hidden = []; // 設定画面で隠すことにしたモード

// 表示するモードのチェックボックス
const checkOf = {};
MODES.forEach((m) => {
  const label = document.createElement('label');
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  label.append(cb, t('mode_' + m));
  modeChecks.append(label);
  checkOf[m] = cb;
  cb.addEventListener('change', () => {
    const next = MODES.filter((x) => (x === m ? !cb.checked : hidden.includes(x)));
    if (next.length >= MODES.length) { cb.checked = true; return; } // 全部は隠せない
    const prevStart = startSel.value;
    setHidden(next);
    const values = { hiddenModes: hidden };
    if (startSel.value !== prevStart) values.startMode = startSel.value; // 隠したモードで起動する設定は「前回のモード」に戻る
    save(values);
  });
});

function setHidden(list) {
  hidden = list.filter((m) => MODES.includes(m));
  MODES.forEach((m) => { checkOf[m].checked = !hidden.includes(m); });
  // 起動時の表示モードの選択肢：前回のモード + 表示するモード
  const cur = startSel.value;
  startSel.replaceChildren(new Option(t('opt_start_last'), START_LAST));
  XMV_CONFIG.visibleModes(hidden).forEach((m) => startSel.append(new Option(t('mode_' + m), m)));
  startSel.value = [...startSel.options].some((o) => o.value === cur) ? cur : START_LAST;
}
setHidden([]);

// 基準幅は % 表示で扱う（保存は 0.75 のような割合）
range.min = num.min = Math.round(RATIO.min * 100);
range.max = num.max = Math.round(RATIO.max * 100);
range.step = num.step = Math.round(RATIO.step * 100);

function show(startMode, baseRatio, hiddenModes) {
  setHidden(hiddenModes);
  startSel.value = startMode;
  range.value = num.value = Math.round(baseRatio * 100);
}

function flash() {
  statusEl.classList.add('show');
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => statusEl.classList.remove('show'), 1500);
}

function save(values) {
  chrome.storage.local.set(values, flash);
}

chrome.storage.local.get(['startMode', 'baseRatio', 'hiddenModes'], (r) => {
  const sm = r.startMode === START_LAST || MODES.includes(r.startMode) ? r.startMode : START_LAST;
  const br = typeof r.baseRatio === 'number' && isFinite(r.baseRatio) ? XMV_CONFIG.clampRatio(r.baseRatio) : RATIO.def;
  const hm = Array.isArray(r.hiddenModes) ? r.hiddenModes : [];
  show(sm, br, hm);
});

startSel.addEventListener('change', () => save({ startMode: startSel.value }));

// スライダー・数値欄は連動させ、範囲外や空欄は範囲内に丸めて保存する
function commitRatio(percent) {
  const v = Number(percent);
  if (!isFinite(v) || percent === '') return;
  const ratio = XMV_CONFIG.clampRatio(v / 100);
  range.value = num.value = Math.round(ratio * 100);
  save({ baseRatio: ratio });
}
range.addEventListener('input', () => { num.value = range.value; });
range.addEventListener('change', () => commitRatio(range.value));
num.addEventListener('change', () => commitRatio(num.value));

document.getElementById('reset').addEventListener('click', () => {
  show(START_LAST, RATIO.def, []);
  save({ startMode: START_LAST, baseRatio: RATIO.def, hiddenModes: [] });
});
