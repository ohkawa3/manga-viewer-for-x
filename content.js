(() => {
  'use strict';
  if (window.__xmvLoaded) return;
  window.__xmvLoaded = true;

  // ------------------------------------------------------------------
  // 定数
  // ------------------------------------------------------------------
  // /<handle>/status/<id>/photo/<1-4> だけを厳密に受け付ける（/i/ は予約パスなので除外）
  const PHOTO_RE = /^\/(?!i\/)([A-Za-z0-9_]{1,50})\/status\/(\d{1,25})\/photo\/([1-4])\/?$/;
  const STATUS_RE = /^\/[A-Za-z0-9_]{1,50}\/status\/(\d{1,25})(?:\/|$)/;
  const MEDIA_PATH_RE = /^\/media\/[A-Za-z0-9_-]{1,100}$/;
  const FORMATS = new Set(['jpg', 'png', 'webp']);
  const TRUSTED_NAMES = /^(small|medium|large|orig)$/; // 縦横比が保たれるサイズ名
  const { MODES, DEFAULT_MODE, START_LAST, RATIO, t } = XMV_CONFIG; // config.js（モード一覧・基準幅の範囲・文言の取得）
  const ZMIN = 0.2; // ズーム倍率の下限・上限
  const ZMAX = 6;
  const MAX_ITEMS = 3000; // 収集する画像数の上限（無限スクロール対策）
  // 自動読み込み（ページの裏スクロール）の上限：約35秒
  const AUTO_MAX_STEPS = 70;
  const AUTO_STEP_MS = 500;
  const AUTO_NO_NEW_LIMIT = 12; // 約6秒新しい画像が来なければ終了
  const NAV_TIMEOUT_MS = 8000; // タイムライン→詳細ページ遷移の待ち時間
  const READY_TIMEOUT_MS = 20000; // 詳細ページの描画待ち
  const VIEW_EDGE = 56; // 上下のヘッダー等を避けるための判定マージン(px)

  // ------------------------------------------------------------------
  // 設定（chrome.storage に保存。x.com の localStorage には書かない）
  // ------------------------------------------------------------------
  // lastMode:    最後にビューアで選んだ表示モード（ビューアで切り替えるたびに保存）
  // startMode:   設定画面の「起動時の表示モード」。'last'（前回のモード）か、モード名で固定
  // baseRatio:   設定画面の「基準幅」
  // hiddenModes: 設定画面で「表示するモード」から外したモード（ツールバーと数字キーから除く）
  const prefs = { lastMode: DEFAULT_MODE, startMode: START_LAST, baseRatio: RATIO.def, hint: false, hiddenModes: [] };
  const PREF_KEYS = ['mode', 'startMode', 'baseRatio', 'hint', 'hiddenModes'];
  let onModesChanged = null; // 開いているビューアのボタン表示を更新する
  // storage の値を検証して prefs に反映する（不正な値は無視。設定画面で変えた分も同じ関数で受ける）
  function applyPrefs(r) {
    if (MODES.includes(r.mode)) prefs.lastMode = r.mode;
    if (r.startMode === START_LAST || MODES.includes(r.startMode)) prefs.startMode = r.startMode;
    if (typeof r.baseRatio === 'number' && isFinite(r.baseRatio)) prefs.baseRatio = XMV_CONFIG.clampRatio(r.baseRatio);
    if (r.hint === true) prefs.hint = true;
    if (Array.isArray(r.hiddenModes)) {
      prefs.hiddenModes = r.hiddenModes.filter((m) => MODES.includes(m));
      if (onModesChanged) onModesChanged();
    }
  }
  const isShown = (m) => XMV_CONFIG.visibleModes(prefs.hiddenModes).includes(m);
  // 起動時のモード。隠したモードだったときは、表示中の先頭のモードにする
  const startMode = () => {
    const m = prefs.startMode === START_LAST ? prefs.lastMode : prefs.startMode;
    return isShown(m) ? m : XMV_CONFIG.visibleModes(prefs.hiddenModes)[0];
  };
  try {
    chrome.storage.local.get(PREF_KEYS, (r) => {
      if (chrome.runtime.lastError || !r) return;
      applyPrefs(r);
    });
    // 設定画面での変更を、開いている x.com のタブにも反映する
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      const r = {};
      for (const k of PREF_KEYS) if (changes[k]) r[k] = changes[k].newValue;
      applyPrefs(r);
    });
  } catch (_) { /* 拡張の再読み込み直後などは無視 */ }
  function savePref(k, v) {
    try { chrome.storage.local.set({ [k]: v }); } catch (_) { /* ignore */ }
  }

  // ------------------------------------------------------------------
  // 小物
  // ------------------------------------------------------------------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function waitFor(fn, timeout, step) {
    const end = Date.now() + timeout;
    for (;;) {
      const v = fn();
      if (v) return v;
      if (Date.now() > end) return null;
      await sleep(step || 250);
    }
  }
  function runtimeAlive() {
    try { return !!(chrome.runtime && chrome.runtime.id); } catch (_) { return false; }
  }
  function stopEvent(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }

  // ------------------------------------------------------------------
  // URL の検証と組み立て
  // ------------------------------------------------------------------
  function parseSrc(src) {
    let u;
    try { u = new URL(src); } catch (_) { return null; }
    if (u.protocol !== 'https:' || u.hostname !== 'pbs.twimg.com') return null;
    let path = u.pathname;
    let format = (u.searchParams.get('format') || '').toLowerCase();
    const ext = /^(\/media\/[A-Za-z0-9_-]+)\.([A-Za-z]{3,4})$/.exec(path);
    if (ext) {
      path = ext[1];
      if (!format) format = ext[2].toLowerCase();
    }
    if (!MEDIA_PATH_RE.test(path)) return null;
    if (format === 'jpeg') format = 'jpg';
    if (!FORMATS.has(format)) format = 'jpg';
    return { path, format, name: u.searchParams.get('name') || '' };
  }

  function mediaUrl(it, name) {
    const u = new URL('https://pbs.twimg.com');
    u.pathname = it.path;
    u.searchParams.set('format', it.format);
    u.searchParams.set('name', name);
    return u.href;
  }

  // 画質は orig → 4096x4096 → large の順にフォールバック
  const variants = (it) => ['orig', '4096x4096', 'large'].map((n) => mediaUrl(it, n));

  const cmp = (a, b) => {
    const x = BigInt(a.id);
    const y = BigInt(b.id);
    return x < y ? -1 : x > y ? 1 : a.n - b.n;
  };

  function pageStatusId() {
    const m = STATUS_RE.exec(location.pathname);
    return m ? m[1] : null;
  }
  function hrefStatusId(href) {
    try {
      const m = STATUS_RE.exec(new URL(href).pathname);
      return m ? m[1] : null;
    } catch (_) { return null; }
  }

  function mediaImg(a) {
    return a.querySelector('img[src^="https://pbs.twimg.com/media/"]');
  }
  const imgSrc = (img) => img.currentSrc || img.src;

  // 読み込み済みで、縦横比が保たれるサイズ名の画像だけ縦横比を返す（それ以外は 0 = 不明）
  function aspectOf(img) {
    if (!(img.naturalWidth > 0 && img.naturalHeight > 0)) return 0;
    const b = parseSrc(imgSrc(img));
    return b && TRUSTED_NAMES.test(b.name) ? img.naturalWidth / img.naturalHeight : 0;
  }

  // ------------------------------------------------------------------
  // センシティブ画像（ぼかし・警告オーバーレイ）の判定
  //  画面外の画像はオーバーレイの有無を確かめられないので「保留」にし、
  //  画面内に入ったときに判定する。
  // ------------------------------------------------------------------
  let hostEl = null; // ビューアのホスト要素（判定から除外する）

  function hasBlur(img, a) {
    const art = a.closest('article');
    for (let el = img, i = 0; el && i < 24; el = el.parentElement, i++) {
      const cs = getComputedStyle(el);
      if (cs.filter.includes('blur') || (cs.backdropFilter || '').includes('blur')) return true;
      if (el === art) break;
    }
    return false;
  }

  // 'ok' | 'obscured' | 'unknown'（画面外で判定できない）
  function judge(img, a) {
    const r = img.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const visible = r.width > 0 && r.height > 0 &&
      cx >= 0 && cx < innerWidth && cy >= VIEW_EDGE && cy < innerHeight - VIEW_EDGE;
    if (!visible) return 'unknown';
    if (hasBlur(img, a)) return 'obscured';
    // 画像中央に、同じツイート内の「リンク外の要素」が被さっていれば警告中とみなす
    const art = a.closest('article');
    const stack = document.elementsFromPoint(cx, cy);
    const top = stack.find((el) => el !== hostEl);
    if (top && !a.contains(top) && art && art.contains(top)) return 'obscured';
    return 'ok';
  }

  // ------------------------------------------------------------------
  // スレッドの境界（「もっと見つける」等のおすすめ欄）の判定
  // ------------------------------------------------------------------
  let boundarySeen = false;
  let boundaryAbove = false; // 最後に見たとき境界が画面より上にあったか

  function findBoundary(sid) {
    const cells = document.querySelectorAll('[data-testid="cellInnerDiv"]');
    let focalSeen = boundarySeen; // 一度見つけた後は注目ツイートが消えていても判定する
    for (const cell of cells) {
      if (!focalSeen) {
        if (cell.querySelector(`a[href$="/status/${sid}"] time`)) focalSeen = true;
        continue;
      }
      if (cell.querySelector('h2') && !cell.querySelector('article')) return cell;
    }
    return null;
  }

  function focalCell(sid) {
    return document.querySelector(`[data-testid="cellInnerDiv"] a[href$="/status/${sid}"] time`);
  }

  // ------------------------------------------------------------------
  // 画像の収集（Xは画面外のツイートをDOMから消すので、見えた分を溜めておく）
  // ページ（パス）が変わったら破棄する
  // ------------------------------------------------------------------
  const store = new Map(); // key `${id}/${n}` -> item
  const excluded = new Set();
  let storePath = location.pathname;

  function resetIfNavigated() {
    if (location.pathname === storePath) return;
    storePath = location.pathname;
    store.clear();
    excluded.clear();
    boundarySeen = false;
    boundaryAbove = false;
  }

  // 呼び出し側で parseSrc とセンシティブ判定を済ませてから使う
  function makeItem(a, m, img) {
    const b = parseSrc(imgSrc(img));
    if (!b) return null;
    return {
      key: m[2] + '/' + m[3],
      id: m[2],
      n: parseInt(m[3], 10),
      handle: m[1],
      handleLc: m[1].toLowerCase(),
      tweetPath: `/${m[1]}/status/${m[2]}`,
      path: b.path,
      format: b.format,
      ar: aspectOf(img),
    };
  }

  // trustA: ユーザーが今クリックした画像リンク（見えていることが分かっているので判定済み扱い）
  function collect(trustA) {
    resetIfNavigated();
    const sid = pageStatusId();
    let bTop = null;
    if (sid) {
      const bcell = findBoundary(sid);
      if (bcell) {
        bTop = bcell.getBoundingClientRect().top;
        boundarySeen = true;
        boundaryAbove = bTop < 0;
      }
    }
    let added = 0;
    document.querySelectorAll('a[href*="/photo/"]').forEach((a) => {
      const m = PHOTO_RE.exec(a.pathname);
      if (!m) return;
      const key = m[2] + '/' + m[3];
      if (excluded.has(key)) return;
      const img = mediaImg(a);
      if (!img) return;
      const old = store.get(key);
      if (old) {
        if (!old.ar) old.ar = aspectOf(img); // 後から読み込まれた画像の縦横比を補う
        return;
      }
      if (sid) {
        const top = a.getBoundingClientRect().top;
        if ((bTop !== null && top > bTop) || (bTop === null && boundarySeen && boundaryAbove)) {
          excluded.add(key); // おすすめ欄の画像はスレッドに混ぜない
          return;
        }
      }
      if (store.size >= MAX_ITEMS) return;
      if (a !== trustA && judge(img, a) !== 'ok') return; // 画面外は保留、警告中は除外
      const it = makeItem(a, m, img);
      if (!it) return;
      store.set(key, it);
      added++;
    });
    return added;
  }

  // クリックしたツイートの残りの画像（同じツイートは警告も共通）を入れておく
  function addTweetImages(id, outside) {
    document.querySelectorAll(`a[href*="/status/${id}/photo/"]`).forEach((a2) => {
      const m2 = PHOTO_RE.exec(a2.pathname);
      if (!m2 || m2[2] !== id) return;
      const k2 = m2[2] + '/' + m2[3];
      if (store.has(k2)) return;
      const img2 = mediaImg(a2);
      if (!img2 || hasBlur(img2, a2) || judge(img2, a2) === 'obscured') return;
      const it2 = makeItem(a2, m2, img2);
      if (!it2) return;
      if (outside) it2.outside = true; // 後でスレッド表示したときに混ざらないよう印を付ける
      store.set(k2, it2);
    });
  }

  let viewer = null;
  let pendingOpen = false;
  let scheduled = false;
  const mo = new MutationObserver(() => {
    // タイムライン等ではビューアを開くまで何もしない（クリック時にだけ集める）
    if (scheduled || (!viewer && !pendingOpen && !pageStatusId())) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      if (collect() > 0 && viewer) viewer.sync();
    }, 150);
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
  if (pageStatusId()) collect();

  // ------------------------------------------------------------------
  // ビューア（closed Shadow DOM 内に構築。ページ側から DOM は読めない）
  // ------------------------------------------------------------------
  const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.root {
  position: fixed; inset: 0; background: #0b0b0d; color: #e7e9ea;
  font: 13px/1.2 system-ui, -apple-system, "Segoe UI", "Hiragino Sans", "Yu Gothic UI", sans-serif;
}
.scroll {
  position: absolute; inset: 0; overflow-y: scroll; overflow-x: auto;
  overscroll-behavior: contain; overflow-anchor: none; outline: none;
}
.inner { position: relative; width: max-content; min-width: 100%; }
.item { position: relative; display: block; width: max-content; margin: 0 auto 4px; }
.img {
  display: block; max-width: none; background: #16181c; cursor: pointer;
  user-select: none; -webkit-user-drag: none;
}
.failed {
  min-width: 320px; min-height: 120px; display: flex; align-items: center;
  justify-content: center; background: #16181c; color: #8b98a5;
}
.failed::after { content: ${JSON.stringify(t('failed'))}; }
.failed .img { display: none; }
.bar {
  position: absolute; top: 10px; right: 24px; display: flex; flex-direction: column;
  align-items: flex-start; gap: 4px; padding: 5px 6px; /* パネルは右端にあるので、ボタンは左に寄せてマウスの移動を短くする */ background: rgba(24,26,30,.9); border: 1px solid rgba(255,255,255,.12);
  border-radius: 10px; opacity: 0; transition: opacity .15s .3s; user-select: none;
}
.bar:hover, .bar:focus-within { opacity: 1; transition-delay: 0s; } /* 普段は透明。マウスを乗せたときだけ表示（消えるときは少し遅らせる） */
.row { display: flex; align-items: center; gap: 4px; }
.bar button {
  min-width: 28px; height: 26px; padding: 0 8px; border: 0; border-radius: 6px;
  background: rgba(255,255,255,.08); color: inherit; font: inherit; cursor: pointer;
}
.row.modes { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; } /* 言語が変わっても全ボタンを同じ幅に */
.bar button[data-act="mode"] { min-width: 44px; padding: 0 6px; }
.bar button:hover { background: rgba(255,255,255,.2); }
.bar button.on { background: #1d9bf0; color: #fff; }
.link {
  color: #8ecdf8; text-decoration: none; max-width: 160px; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap;
}
.link:hover { text-decoration: underline; }
.count { min-width: 56px; font-variant-numeric: tabular-nums; }
.toast {
  position: absolute; left: 50%; bottom: 28px; transform: translateX(-50%);
  padding: 8px 14px; border-radius: 8px; background: rgba(0,0,0,.8);
  border: 1px solid rgba(255,255,255,.15); opacity: 0; pointer-events: none;
  transition: opacity .2s; white-space: nowrap;
}
.toast.show { opacity: 1; }`;

  const TEMPLATE = `
<div class="root">
  <div class="scroll" tabindex="-1"><div class="inner"></div></div>
  <div class="bar">
   <div class="row">
    <a class="link" target="_blank" rel="noopener noreferrer"></a>
    <span class="count"></span>
    <button data-act="reload" title="${t('tip_reload')}">↻</button>
    <button data-act="close" title="${t('tip_close')}">✕</button>
   </div>
   <div class="row zooms">
    <button data-act="zout" title="${t('tip_zoomOut')}">−</button>
    <button data-act="zin" title="${t('tip_zoomIn')}">＋</button>
   </div>
   <div class="row modes">
${MODES.map((m) => `    <button data-act="mode" data-mode="${m}" title="${t('tip_' + m)}">${t('mode_' + m)}</button>`).join('\n')}
   </div>
  </div>
  <div class="toast"></div>
</div>`;

  // start: { handleLc, id, n, key, single, nav }
  //   single: スレッド外（おすすめ欄など）の画像 → そのツイートの画像だけ
  //   nav:    タイムラインから開いた → 裏で詳細ページへ遷移してスレッドを読む
  function createViewer(start) {
    let threadMode = !start.single && pageStatusId() !== null;
    let pageY = window.scrollY; // 閉じたとき・読み込み後に戻す位置
    let curHref = location.href;
    const fromHref = location.href;
    const nav = start.nav ? { arrived: false, gaveUp: false, deadline: Date.now() + NAV_TIMEOUT_MS } : null;
    let mode = startMode();
    let curScale = 0; // 同倍率モードの倍率（表示px / 画像px）。0 は未確定
    let zoom = 1;
    let closed = false;
    let loading = false;
    let loaderToken = 0;
    let toastTimer = 0;
    let infoRaf = 0;
    const list = []; // 表示順に並んだ rec
    const els = new Map(); // key -> rec

    const host = document.createElement('div');
    host.id = 'xmv-root';
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;';
    const sr = host.attachShadow({ mode: 'closed' });
    // 固定文字列のみ（外部データは含めない）
    sr.innerHTML = `<style>${CSS}</style>${TEMPLATE}`;
    const scroll = sr.querySelector('.scroll');
    const inner = sr.querySelector('.inner');
    const bar = sr.querySelector('.bar');
    const link = sr.querySelector('.link');
    const countEl = sr.querySelector('.count');
    const toastEl = sr.querySelector('.toast');
    const reloadBtn = sr.querySelector('[data-act="reload"]');
    if (!threadMode) reloadBtn.style.display = 'none';

    function toast(msg, ms) {
      toastEl.textContent = msg;
      toastEl.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms || 1600);
    }

    // ---- レイアウト --------------------------------------------------
    function layoutRec(rec) {
      const img = rec.img;
      if (rec.failed) return;
      const vw = scroll.clientWidth;
      const vh = scroll.clientHeight;
      const nw = rec.loaded ? img.naturalWidth : 0;
      const ar = rec.item.ar || (rec.loaded && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 0);
      let w;
      switch (mode) {
        case 'height':
          w = ar ? Math.min(vw, vh * ar) : vw;
          break;
        case 'orig':
          w = nw || vw;
          break;
        case 'equal':
          w = vw * prefs.baseRatio;
          break;
        case 'scale':
          // 未読込の画像は基準画像と同じ画素幅と仮定（読み込み後に正しい幅へ）
          w = curScale && nw ? nw * curScale : vw * prefs.baseRatio;
          break;
        case 'best': {
          const cap = nw || Infinity;
          w = ar >= 1 ? Math.min(vw, vh * ar, cap) : Math.min(vw, cap);
          if (!isFinite(w) || w <= 0) w = vw;
          break;
        }
        default:
          w = vw;
      }
      w = Math.max(40, Math.round(w * zoom));
      img.style.width = w + 'px';
      img.style.height = rec.loaded ? 'auto' : (ar ? Math.round(w / ar) + 'px' : 'auto');
      rec.wrap.style.minHeight = !rec.loaded && !ar ? '40vh' : '';
    }

    // 同倍率の基準：先頭の画像。未読込なら優先して読み込ませ、それまでは読込済みの最初の画像で代用
    function scaleNow() {
      const first = list.find((r) => !r.failed);
      if (!first) return 0;
      let ref = first;
      if (!first.loaded) {
        first.img.loading = 'eager';
        ref = list.find((r) => r.loaded && !r.failed);
      }
      return ref && ref.img.naturalWidth ? (scroll.clientWidth * prefs.baseRatio) / ref.img.naturalWidth : 0;
    }
    const scaleChanged = () => mode === 'scale' && Math.abs(scaleNow() - curScale) > 1e-9;

    function layoutAll() {
      curScale = mode === 'scale' ? scaleNow() : 0;
      list.forEach(layoutRec);
    }

    // 先頭に見えている画像の位置を保ったままレイアウトを変える
    function anchor() {
      const st = scroll.scrollTop;
      const rec = list.find((r) => r.wrap.offsetTop + r.wrap.offsetHeight > st + 1);
      return rec ? { rec, top: rec.wrap.getBoundingClientRect().top } : null;
    }
    function withAnchor(fn) {
      const a = anchor();
      fn();
      if (a) {
        const d = a.rec.wrap.getBoundingClientRect().top - a.top;
        if (Math.abs(d) >= 1) scroll.scrollTop += d;
      }
    }

    // ---- 画像ノード --------------------------------------------------
    function makeNode(it) {
      const wrap = document.createElement('div');
      wrap.className = 'item';
      const img = document.createElement('img');
      img.className = 'img';
      img.alt = '';
      img.draggable = false;
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      const rec = { item: it, wrap, img, vi: 0, loaded: false, failed: false };
      img.addEventListener('load', () => {
        rec.loaded = true;
        if (!it.ar && img.naturalHeight) it.ar = img.naturalWidth / img.naturalHeight;
        if (closed) return;
        // 基準画像が読み込まれたら全体の倍率が変わる
        withAnchor(() => { if (scaleChanged()) layoutAll(); else layoutRec(rec); });
      });
      img.addEventListener('error', () => {
        if (closed) return;
        const vs = variants(it);
        if (rec.vi + 1 < vs.length) {
          rec.vi++;
          img.src = vs[rec.vi];
        } else {
          rec.failed = true;
          wrap.classList.add('failed');
          wrap.style.minHeight = '';
          if (scaleChanged()) withAnchor(layoutAll);
        }
      });
      wrap.appendChild(img);
      img.src = variants(it)[0];
      return rec;
    }

    function currentItems() {
      const arr = [];
      store.forEach((it) => {
        if (threadMode ? it.handleLc === start.handleLc && !it.outside : it.id === start.id) arr.push(it);
      });
      arr.sort(cmp);
      return arr;
    }

    function sync() {
      if (closed) return;
      const fresh = currentItems().filter((it) => !els.has(it.key));
      if (!fresh.length) return;
      withAnchor(() => {
        fresh.forEach((it) => {
          const rec = makeNode(it);
          const idx = list.findIndex((r) => cmp(r.item, it) > 0);
          if (idx < 0) {
            inner.appendChild(rec.wrap);
            list.push(rec);
          } else {
            inner.insertBefore(rec.wrap, list[idx].wrap);
            list.splice(idx, 0, rec);
          }
          els.set(it.key, rec);
          layoutRec(rec);
        });
        if (scaleChanged()) layoutAll(); // 先頭に画像が増えたら同倍率の基準が変わる
      });
      updateInfo();
    }

    // ---- 情報表示 ----------------------------------------------------
    function updateInfo() {
      bar.querySelectorAll('[data-act="mode"]').forEach((b) => {
        b.classList.toggle('on', b.dataset.mode === mode);
        b.style.display = isShown(b.dataset.mode) || b.dataset.mode === mode ? '' : 'none'; // 使用中のモードは隠さない
      });
      if (!list.length) {
        countEl.textContent = '…';
        return;
      }
      const y = scroll.scrollTop + scroll.clientHeight * 0.35;
      let ci = 0;
      for (let i = 0; i < list.length; i++) {
        if (list[i].wrap.offsetTop <= y) ci = i; else break;
      }
      const it = list[ci].item;
      const busy = loading || (nav && !nav.arrived && !nav.gaveUp);
      link.textContent = '@' + it.handle;
      link.href = 'https://x.com' + it.tweetPath; // handle/id は正規表現で検証済み
      countEl.textContent = `${ci + 1} / ${list.length}` + (busy ? ' ' + t('loading') : '');
    }
    function scheduleInfo() {
      if (infoRaf) return;
      infoRaf = requestAnimationFrame(() => { infoRaf = 0; updateInfo(); });
    }

    // ---- 操作 --------------------------------------------------------
    function setMode(m) {
      if (!MODES.includes(m) || !isShown(m)) return;
      mode = m;
      zoom = 1;
      prefs.lastMode = m;
      savePref('mode', m);
      withAnchor(layoutAll);
      updateInfo();
    }

    function zoomBy(f, cx, cy) {
      const nz = Math.min(ZMAX, Math.max(ZMIN, zoom * f));
      if (Math.abs(nz - zoom) < 1e-4) return;
      const ir = inner.getBoundingClientRect();
      const fx = ir.width ? (cx - ir.left) / ir.width : 0.5;
      let ref = null;
      const el = sr.elementFromPoint(cx, cy);
      const wrap = el && el.closest ? el.closest('.item') : null;
      if (wrap) {
        const r = wrap.getBoundingClientRect();
        ref = { wrap, fy: r.height ? (cy - r.top) / r.height : 0 };
      }
      const a = ref ? null : anchor();
      zoom = nz;
      layoutAll();
      const r2 = inner.getBoundingClientRect();
      scroll.scrollLeft += r2.left + fx * r2.width - cx;
      if (ref) {
        const w2 = ref.wrap.getBoundingClientRect();
        scroll.scrollTop += w2.top + ref.fy * w2.height - cy;
      } else if (a) {
        const d = a.rec.wrap.getBoundingClientRect().top - a.top;
        if (Math.abs(d) >= 1) scroll.scrollTop += d;
      }
      updateInfo();
    }
    function zoomCenter(f) {
      const r = scroll.getBoundingClientRect();
      zoomBy(f, r.left + scroll.clientWidth / 2, r.top + scroll.clientHeight / 2);
    }
    function resetZoom() {
      withAnchor(() => { zoom = 1; layoutAll(); });
      updateInfo();
    }

    function goNext() {
      const st = scroll.scrollTop;
      const i = list.findIndex((r) => r.wrap.offsetTop > st + 8);
      if (i < 0) {
        toast(t('lastImage'));
        return;
      }
      scroll.scrollTo({ top: list[i].wrap.offsetTop, behavior: 'auto' });
    }
    function goPrev() {
      const st = scroll.scrollTop;
      let j = -1;
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].wrap.offsetTop < st - 8) { j = i; break; }
      }
      if (j < 0) {
        if (st > 0) scroll.scrollTo({ top: 0, behavior: 'auto' });
        else toast(t('firstImage'));
        return;
      }
      scroll.scrollTo({ top: list[j].wrap.offsetTop, behavior: 'auto' });
    }

    // ---- スレッド全体の読み込み（裏でページをスクロールして集める） ----
    async function autoLoad() {
      if (!threadMode || closed) return;
      const token = ++loaderToken;
      loading = true;
      updateInfo();
      try {
        window.scrollTo(0, 0);
        await sleep(400);
        let lastH = document.documentElement.scrollHeight;
        let idle = 0;
        let noNew = 0;
        let lastCount = currentItems().length;
        for (let i = 0; i < AUTO_MAX_STEPS && token === loaderToken && !closed; i++) {
          collect();
          sync();
          if (boundarySeen && boundaryAbove) break; // おすすめ欄まで来たら終了
          window.scrollBy(0, Math.floor(window.innerHeight * 0.8));
          await sleep(AUTO_STEP_MS);
          const h = document.documentElement.scrollHeight;
          const atBottom = window.scrollY + window.innerHeight >= h - 4;
          idle = atBottom && h === lastH ? idle + 1 : 0;
          lastH = h;
          const cnt = currentItems().length;
          noNew = cnt > lastCount ? 0 : noNew + 1;
          lastCount = cnt;
          if (idle >= 3 || noNew >= AUTO_NO_NEW_LIMIT) break;
        }
        if (token === loaderToken && !closed) {
          collect();
          sync();
        }
      } finally {
        if (token === loaderToken) {
          loading = false;
          if (!closed) {
            window.scrollTo(0, pageY);
            updateInfo();
          }
        }
      }
    }

    // タイムラインから詳細ページへの遷移が完了した
    async function arrive() {
      nav.arrived = true;
      curHref = location.href;
      threadMode = true;
      pageY = 0;
      reloadBtn.style.display = '';
      collect(); // パスが変わったので store を作り直す（表示中の画像はそのまま残る）
      updateInfo();
      await sleep(500); // 旧ページのセルが消えるのを待つ
      const ok = await waitFor(() => closed || !!focalCell(start.id), READY_TIMEOUT_MS, 250);
      if (closed) return;
      if (ok) autoLoad();
      else updateInfo();
    }

    // ---- イベント ----------------------------------------------------
    scroll.addEventListener('click', (e) => {
      // スクロールバー上のクリックは無視
      if (e.target === scroll && (e.offsetX >= scroll.clientWidth || e.offsetY >= scroll.clientHeight)) return;
      const item = e.target.closest ? e.target.closest('.item') : null;
      if (!item) {
        close(); // 余白クリックで閉じる
        return;
      }
      if (item.classList.contains('failed')) return;
      if (e.shiftKey) goPrev(); else goNext();
    });

    scroll.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return; // 通常のホイールはそのまま上下スクロール
      e.preventDefault();
      zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
    }, { passive: false });

    scroll.addEventListener('scroll', scheduleInfo, { passive: true });

    bar.addEventListener('click', (e) => {
      const b = e.target.closest ? e.target.closest('button') : null;
      if (!b) return;
      switch (b.dataset.act) {
        case 'mode': setMode(b.dataset.mode); break;
        case 'zin': zoomCenter(1.2); break;
        case 'zout': zoomCenter(1 / 1.2); break;
        case 'reload': autoLoad(); break;
        case 'close': close(); return;
        default: break;
      }
      scroll.focus({ preventScroll: true });
    });

    function onKey(e) {
      if (closed || !e.isTrusted) return; // ページ側が合成したキー入力は無視
      if (e.ctrlKey || e.metaKey || e.altKey) return; // ブラウザのショートカットは通す
      const k = e.key;
      let handled = true;
      if (k === 'Escape' || k === 'q') close();
      else if (k === 'ArrowRight' || k === 'j' || k === 'n') goNext();
      else if (k === 'ArrowLeft' || k === 'k' || k === 'p') goPrev();
      else if (k >= '1' && k <= '6') setMode(MODES[+k - 1]); // ボタンの並び順に対応（隠したモードは無視）
      else if (k === '+' || k === '=') zoomCenter(1.15);
      else if (k === '-') zoomCenter(1 / 1.15);
      else if (k === '0') resetZoom();
      else handled = false;
      if (handled) e.preventDefault();
      // Xのショートカット(j/k/n等)を発火させない。↑↓/Spaceの標準スクロールは止めない
      e.stopPropagation();
      e.stopImmediatePropagation();
    }

    // フォーカスがビューアの外（裏の X のボタン等）へ出たら戻す。
    // shadow 内のフォーカスは host に再ターゲットされて届く
    function onFocusIn(e) {
      if (!closed && e.target !== host) scroll.focus({ preventScroll: true });
    }

    const onResize = () => withAnchor(layoutAll);
    onModesChanged = updateInfo;
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);
    document.addEventListener('focusin', onFocusIn, true);

    const urlWatch = setInterval(() => {
      if (closed) return;
      if (location.href === curHref) {
        if (nav && !nav.arrived && !nav.gaveUp && Date.now() > nav.deadline) {
          nav.gaveUp = true; // 遷移しなかった：このツイートの画像だけで続ける
          updateInfo();
        }
        return;
      }
      const sid = pageStatusId();
      if (nav && !nav.arrived && !nav.gaveUp && sid === start.id) {
        arrive();
        return;
      }
      // 同じツイートのままURLだけ変わった（表記の正規化など）は継続
      if (sid && sid === hrefStatusId(curHref)) {
        curHref = location.href;
        return;
      }
      close();
    }, 300);

    function close() {
      if (closed) return;
      closed = true;
      loaderToken++;
      clearInterval(urlWatch);
      clearTimeout(toastTimer);
      if (infoRaf) cancelAnimationFrame(infoRaf);
      onModesChanged = null;
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('focusin', onFocusIn, true);
      list.forEach((r) => { r.img.removeAttribute('src'); });
      host.remove();
      if (prevOverflow[0]) rootStyle.setProperty('overflow', prevOverflow[0], prevOverflow[1]);
      else rootStyle.removeProperty('overflow');
      if (hostEl === host) hostEl = null;
      if (viewer === api) viewer = null;

      const here = location.href === curHref;
      if (nav && nav.arrived) {
        if (here) history.back(); // ビューアのために移動した詳細ページから元の画面へ戻る
      } else {
        if (here) window.scrollTo(0, pageY);
        if (nav) backIfLateArrival(start.id, fromHref);
      }
    }

    const api = { sync, close };

    // ---- 起動 --------------------------------------------------------
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    document.body.appendChild(host);
    hostEl = host;
    // 裏のページのスクロールバーが、ビューア自身のスクロールバーと並んで2本出ないよう隠す（閉じたら元に戻す）
    const rootStyle = document.documentElement.style;
    const prevOverflow = [rootStyle.getPropertyValue('overflow'), rootStyle.getPropertyPriority('overflow')];
    rootStyle.setProperty('overflow', 'hidden', 'important');
    sync();
    const sRec = els.get(start.key);
    if (sRec) scroll.scrollTop = sRec.wrap.offsetTop;
    updateInfo();
    scroll.focus({ preventScroll: true });
    if (!prefs.hint) {
      prefs.hint = true;
      savePref('hint', true);
      toast(t('hint'), 5000);
    }
    autoLoad();
    return api;
  }

  // 遷移前にビューアを閉じたのに、あとから詳細ページへ移ってしまった場合は戻す
  function backIfLateArrival(id, fromHref) {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (pageStatusId() === id && location.href !== fromHref) {
        clearInterval(iv);
        if (!viewer) history.back();
      } else if (Date.now() - t0 > 4000) {
        clearInterval(iv);
      }
    }, 200);
  }

  function openViewer(start) {
    if (viewer) viewer.close();
    viewer = createViewer(start);
  }

  // ------------------------------------------------------------------
  // 画像クリックの判定
  //  - クリックした要素そのものが画像リンクの内側にあるときだけ反応する
  //  - リンク内のボタン（ALT等）、重なった別要素、警告中の画像はXに任せる
  // ------------------------------------------------------------------
  function photoTarget(e) {
    if (!e.isTrusted) return null;
    const t = e.target;
    if (!(t instanceof Element)) return null;
    if (hostEl && (t === hostEl || hostEl.contains(t))) return null;
    const a = t.closest('a[href*="/photo/"]');
    if (!a) return null;
    const btn = t.closest('button,[role="button"]');
    if (btn && a.contains(btn)) return null;
    const m = PHOTO_RE.exec(a.pathname);
    if (!m) return null;
    const img = mediaImg(a);
    if (!img || !parseSrc(imgSrc(img))) return null;
    if (hasBlur(img, a) || judge(img, a) === 'obscured') return null;
    return { a, m, img };
  }

  // タイムライン上のツイートの「投稿時刻」リンク（Xの通常の画面遷移に使う）
  function findTweetLink(a, m) {
    const art = a.closest('article');
    if (!art) return null;
    const want = `/${m[1]}/status/${m[2]}`.toLowerCase();
    for (const l of art.querySelectorAll('a[href*="/status/"]')) {
      if (l.pathname.toLowerCase() === want && l.querySelector('time')) return l;
    }
    return null;
  }

  function openFromClick({ a, m, img }) {
    collect(a);
    const key = m[2] + '/' + m[3];
    const single = !store.has(key); // おすすめ欄など、スレッド外の画像
    if (single) {
      const it = makeItem(a, m, img);
      if (!it) return;
      it.outside = true;
      store.set(key, it);
    }
    addTweetImages(m[2], single);
    // タイムライン等から開いた場合は、裏で詳細ページへ移動してスレッドを読む
    const navLink = pageStatusId() ? null : findTweetLink(a, m);
    openViewer({ handleLc: m[1].toLowerCase(), id: m[2], n: parseInt(m[3], 10), key, single, nav: !!navLink });
    if (navLink) navLink.click(); // Xのルーターによる通常の画面遷移（ページの再読み込みなし）
  }

  function openInNewTab({ m }, active) {
    try {
      chrome.runtime.sendMessage(
        { type: 'xmv-open', handle: m[1], id: m[2], n: parseInt(m[3], 10), active: !!active },
        () => { void chrome.runtime.lastError; },
      );
    } catch (_) { /* ignore */ }
  }

  // 通常クリック → ビューア / Ctrl(Cmd)+クリック → 新しいタブで開いてビューア
  document.addEventListener('click', (e) => {
    if (e.button !== 0 || e.altKey) return;
    const newTab = e.ctrlKey || e.metaKey;
    if (!newTab && e.shiftKey) return; // Shift+クリック（新しいウィンドウ）は通常動作
    const p = photoTarget(e);
    if (!p) return;
    if (newTab) {
      if (!runtimeAlive()) return; // 拡張が更新直後などで使えないときは通常動作に任せる
      stopEvent(e);
      openInNewTab(p, e.shiftKey);
      return;
    }
    stopEvent(e);
    openFromClick(p);
  }, true);

  // 中クリック → 新しいタブで開いてビューア（Shift+中クリックは前面に開く）
  document.addEventListener('auxclick', (e) => {
    if (e.button !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
    const p = photoTarget(e);
    if (!p || !runtimeAlive()) return;
    stopEvent(e);
    openInNewTab(p, e.shiftKey);
  }, true);

  // ------------------------------------------------------------------
  // 新しいタブ側：このタブがビューア用に開かれたものなら、表示されたときに開く
  // ------------------------------------------------------------------
  async function openWhenReady(r) {
    const n = r.n;
    if (typeof r.id !== 'string' || !/^\d{1,25}$/.test(r.id) || !Number.isInteger(n) || n < 1 || n > 4) return;
    pendingOpen = true;
    try {
      if (document.visibilityState !== 'visible') {
        await new Promise((res) => {
          const f = () => {
            if (document.visibilityState !== 'visible') return;
            document.removeEventListener('visibilitychange', f);
            res();
          };
          document.addEventListener('visibilitychange', f);
        });
      }
      const key = r.id + '/' + n;
      const st = await waitFor(() => {
        if (viewer || pageStatusId() !== r.id) return 'abort';
        collect();
        return store.has(key) ? 'ok' : null;
      }, READY_TIMEOUT_MS, 300);
      if (st !== 'ok') return; // 警告付きの画像や読み込み失敗時は開かない
      const it = store.get(key);
      openViewer({ handleLc: it.handleLc, id: r.id, n, key, single: false, nav: false });
    } finally {
      pendingOpen = false;
    }
  }

  function claimPending(tries) {
    if (!pageStatusId() || !runtimeAlive()) return;
    try {
      chrome.runtime.sendMessage({ type: 'xmv-claim' }, (r) => {
        if (chrome.runtime.lastError) return;
        if (!r) {
          // タブ作成直後に目印の保存が間に合わなかった場合に備えて一度だけ再確認
          if (tries > 0) setTimeout(() => claimPending(tries - 1), 800);
          return;
        }
        if (r.id === pageStatusId()) openWhenReady(r);
      });
    } catch (_) { /* ignore */ }
  }
  claimPending(1);
})();
