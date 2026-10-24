'use strict';

// ------------------------------------------------------------------
// 役割は「中クリック / Ctrl+クリックで新しいタブを開き、そのタブで
// ビューアを自動で開くための目印を渡す」ことだけ。
// tabs 権限は不要（URL・タイトルは読まない）。目印は chrome.storage.session
// （ブラウザ終了で消えるメモリ上の領域）にタブIDごとに置き、一度読んだら消す。
// ------------------------------------------------------------------

const HANDLE_RE = /^(?!i$)[A-Za-z0-9_]{1,50}$/;
const ID_RE = /^\d{1,25}$/;
const TTL_MS = 120000; // 2分以内に受け取られなかった目印は無効
const keyOf = (tabId) => 'pending:' + tabId;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // 自分の拡張のコンテンツスクリプトからのメッセージだけ受け付ける
  if (sender.id !== chrome.runtime.id || !sender.tab || typeof sender.tab.id !== 'number') return false;
  if (!msg || typeof msg !== 'object') return false;
  if (msg.type === 'xmv-open') {
    openTab(msg, sender.tab).catch(() => {});
    return false;
  }
  if (msg.type === 'xmv-claim') {
    claim(sender.tab.id).then(sendResponse, () => sendResponse(null));
    return true; // 非同期で応答
  }
  return false;
});

async function openTab(msg, src) {
  const { handle, id, n } = msg;
  if (typeof handle !== 'string' || !HANDLE_RE.test(handle)) return;
  if (typeof id !== 'string' || !ID_RE.test(id)) return;
  if (!Number.isInteger(n) || n < 1 || n > 4) return;

  // Chrome標準の中クリックと同じく、同じ元タブから開いたタブの後ろに並べる
  let index = src.index + 1;
  try {
    const tabs = await chrome.tabs.query({ windowId: src.windowId });
    tabs.sort((a, b) => a.index - b.index);
    for (const t of tabs) {
      if (t.index === index && t.openerTabId === src.id) index++;
    }
  } catch (_) { /* 位置調整に失敗しても開く */ }

  // URLは検証済みの値から組み立て直す（ステータスページ。photo ではない）
  const tab = await chrome.tabs.create({
    url: `https://x.com/${handle}/status/${id}`,
    active: msg.active === true,
    index,
    openerTabId: src.id,
    windowId: src.windowId,
  });
  if (tab && typeof tab.id === 'number') {
    await chrome.storage.session.set({ [keyOf(tab.id)]: { handle, id, n, ts: Date.now() } });
  }
}

async function claim(tabId) {
  const k = keyOf(tabId);
  const r = await chrome.storage.session.get(k);
  const v = r && r[k];
  if (!v) return null;
  await chrome.storage.session.remove(k);
  if (Date.now() - v.ts > TTL_MS) return null;
  return { handle: v.handle, id: v.id, n: v.n };
}

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(keyOf(tabId)).catch(() => {});
});
