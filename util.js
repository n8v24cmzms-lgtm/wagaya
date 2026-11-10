// util.js — 共通ユーティリティ（DOM生成・日付・招待コード・ハッシュ）
// セキュリティ方針:
// - ユーザー入力は必ず textContent 経由で描画する（innerHTML に混ぜない）ため、
//   ここでは DOM 生成ヘルパー el() を提供し、app.js はこれを使う。
// - 招待コードやパスワードは平文で保存せず、照合はハッシュで行う。

export function uid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

export async function sha256Hex(text) {
  const buf = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// 招待コード: 紛らわしい文字 (0/O, 1/I/L) を除いた文字種で 8 文字 = 例 "K7QX-3M9P"
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function generateInviteCode() {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  const chars = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
  return chars.slice(0, 4) + "-" + chars.slice(4);
}
export function normalizeCode(code) {
  return String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
export function formatCode(normalized) {
  const n = normalizeCode(normalized);
  return n.length === 8 ? n.slice(0, 4) + "-" + n.slice(4) : n;
}

// 日付ユーティリティ（ローカル日付ベース）
export function todayISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
export function daysUntil(isoDate) {
  if (!isoDate) return null;
  const [y, m, d] = isoDate.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86400000);
}
export function formatDate(isoDate) {
  if (!isoDate) return "期限なし";
  const [y, m, d] = isoDate.split("-").map(Number);
  return `${m}/${d}`;
}
export function expiryLabel(isoDate) {
  const days = daysUntil(isoDate);
  if (days === null) return "";
  if (days < 0) return `${-days}日過ぎ`;
  if (days === 0) return "今日まで";
  if (days === 1) return "明日まで";
  return `あと${days}日`;
}
// グループ: soon=すぐ使いたい(2日以内/期限切れ), week=今週中に(7日以内), later=まだ余裕あり
export function expiryGroup(isoDate) {
  const days = daysUntil(isoDate);
  if (days === null) return "later";
  if (days <= 2) return "soon";
  if (days <= 7) return "week";
  return "later";
}

// DOM 生成ヘルパー: 文字列はすべて textContent になる（XSS 対策）
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined) continue;
    if (key === "class") node.className = value;
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
    else if (key === "dataset") Object.assign(node.dataset, value);
    else node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function fmtAmount(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "";
  // 0.25 のような分数数量を潰さないよう、小数第2位まで保持する
  const v = Math.round(Number(n) * 100) / 100;
  return String(v);
}

// ---- 分数単位（玉）の扱い ----
// 白菜・キャベツなど「玉」単位の頭野菜は、半玉=1/2、1/4玉、3/4玉のように
// 1/4 刻みの分数で登録・表示・増減できるようにする。
// 他の単位（個・本・g など）は従来通り整数/小数のまま。
export function isFractionUnit(unit) { return String(unit || "").trim() === "玉"; }

// 数量の ± ボタンや入力欄の刻み幅: 玉は 1/4、他は 1
export function qtyStepFor(unit) { return isFractionUnit(unit) ? 0.25 : 1; }

// 浮動小数の誤差を防ぐため、数量は小数第2位に丸めて保持する
export function roundQty(n) { return Math.round(Number(n) * 100) / 100; }

const QUARTER_FRACTIONS = [[0.25, "1/4"], [0.5, "1/2"], [0.75, "3/4"]];
// ---- 在庫検索（カナの揺れを吸収する正規化） ----
// カタカナ→ひらがな化＋小文字化＋空白除去をしてから、名前同士を部分一致で比べる。
// 例: 検索「きゃべつ」は登録名「キャベツ」に一致する（表記ゆれを吸収）。
//     ※ 読みでの検索ではないため、検索「たまご」は登録名「卵」には一致しない。
export function normalizeForSearch(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/[\s　]+/g, "");
}
export function matchesSearch(name, query) {
  const q = normalizeForSearch(query);
  if (!q) return true;
  return normalizeForSearch(name).includes(q);
}

// ---- よく買うもの／最近登録したもの（ワンタップ再登録用） ----
// 図鑑コレクション（購入回数つき）から「よく買うもの」を回数順に返す。
export function topPurchased(catalog, limit = 8) {
  return [...(catalog || [])]
    .filter((c) => c && c.name)
    .sort((a, b) => (b.purchaseCount ?? 1) - (a.purchaseCount ?? 1) || String(a.name).localeCompare(String(b.name)))
    .slice(0, limit);
}
// 在庫アイテムから「最近登録したもの」を名前の重複なしで新しい順に返す。
export function recentRegistered(items, limit = 8) {
  const seen = new Set();
  const out = [];
  const sorted = [...(items || [])].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  for (const item of sorted) {
    if (!item || !item.name || seen.has(item.name)) continue;
    seen.add(item.name);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

// 数量の表示文字列（単位は付けない）。玉のときは分数表記にする:
//   0.5 → "1/2" / 0.25 → "1/4" / 0.75 → "3/4" / 1.5 → "1と1/2" / 2 → "2"
// 1/4 刻みでない値（例: 0.3玉）は通常の小数表示にフォールバックする。
export function fmtQtyValue(quantity, unit) {
  const q = Number(quantity);
  if (Number.isNaN(q)) return "";
  if (!isFractionUnit(unit)) return fmtAmount(q);
  const whole = Math.floor(q + 1e-9);
  const rest = roundQty(q - whole);
  if (rest === 0) return String(whole);
  for (const [val, label] of QUARTER_FRACTIONS) {
    if (Math.abs(rest - val) < 0.001) return whole > 0 ? `${whole}と${label}` : label;
  }
  return fmtAmount(q);
}
