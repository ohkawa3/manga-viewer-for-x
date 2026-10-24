'use strict';

// content.js（x.com 上）と options.js（設定画面）で共有する定義。
// どちらからも同じ値を使うため、モード名や基準幅の範囲はここだけに書く。
const XMV_CONFIG = Object.freeze({
  // 表示モード。この配列の順 = ツールバーのボタンの並び = 数字キー 1〜6
  //   equal : 同幅   すべての画像を基準幅にそろえる（画像ごとに倍率が変わる）
  //   scale : 同倍   先頭画像が基準幅になる倍率を全画像に適用（同じ解像度で描かれた前提）
  //   width : 横幅   画面幅に合わせる
  //   height: 高さ   1枚が画面に縦に収まる
  //   best  : 自動   縦長は幅、横長は画面に収める（原寸以上には拡大しない）
  //   orig  : 原寸   画像の画素のまま
  MODES: ['equal', 'scale', 'width', 'height', 'best', 'orig'],
  DEFAULT_MODE: 'equal', // 初めて使うときの表示モード
  START_LAST: 'last', // 起動時の表示モードの設定値：「前回選んだモードで始める」
  // 同幅・同倍の基準幅（画面幅に対する割合）。ズームはこれにさらに掛かる
  RATIO: Object.freeze({ min: 0.3, max: 1, step: 0.05, def: 0.75 }),
  // 表示文言は _locales/<言語>/messages.json から、ブラウザの言語に合わせて取得する
  t(key) {
    try { return chrome.i18n.getMessage(key) || key; } catch (_) { return key; }
  },
  // 設定で隠したモードを除いた一覧。全部隠れていても、最低1つは残す
  visibleModes(hidden) {
    const v = XMV_CONFIG.MODES.filter((m) => !(hidden || []).includes(m));
    return v.length ? v : XMV_CONFIG.MODES.slice();
  },
  clampRatio(r) {
    const { min, max } = XMV_CONFIG.RATIO;
    return Math.round(Math.min(max, Math.max(min, r)) * 100) / 100;
  },
});
