// qrcode.js — ローカル完結の QR コード生成ライブラリ（同梱・外部送信なし）
//
// セキュリティ方針（重要）:
// - フレンドコードを含む URL を外部の QR 生成 API に送ることは絶対にしない。
//   このライブラリはブラウザ内だけで QR を計算・描画する純粋な実装で、
//   ネットワーク通信を一切行わない。
// 実装範囲: バイトモード / 誤り訂正レベル M / バージョン 1〜10（URL 用途に十分）。
// アルゴリズムは QR 仕様（ISO/IEC 18004）の標準手順: リード・ソロモン符号、
// マスク選択（ペナルティ最小）、フォーマット情報埋め込み。

const ECC_PER_BLOCK_M = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const NUM_BLOCKS_M = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const ALIGN_POS = [
  [], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
  [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
];

function getNumRawDataModules(ver) {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}
function getNumDataCodewords(ver) {
  return Math.floor(getNumRawDataModules(ver) / 8) - ECC_PER_BLOCK_M[ver] * NUM_BLOCKS_M[ver];
}

// --- Galois field GF(256) ---
const GF_EXP = new Array(512);
const GF_LOG = new Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x; GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
}
function gfMul(a, b) {
  return a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]];
}
function rsDivisor(degree) {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return result;
}
function rsRemainder(data, divisor) {
  const result = new Array(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ result.shift();
    result.push(0);
    divisor.forEach((coef, i) => { result[i] ^= gfMul(coef, factor); });
  }
  return result;
}

// --- ビットバッファ ---
class BitBuffer {
  constructor() { this.bits = []; }
  append(val, len) { for (let i = len - 1; i >= 0; i--) this.bits.push((val >>> i) & 1); }
  get length() { return this.bits.length; }
  toBytes() {
    const out = [];
    for (let i = 0; i < this.bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | (this.bits[i + j] || 0);
      out.push(b);
    }
    return out;
  }
}

function encodeDataCodewords(bytes) {
  for (let ver = 1; ver <= 10; ver++) {
    const capBits = getNumDataCodewords(ver) * 8;
    const countBits = ver <= 9 ? 8 : 16;
    if (4 + countBits + bytes.length * 8 > capBits) continue;
    const bb = new BitBuffer();
    bb.append(0x4, 4); // バイトモード
    bb.append(bytes.length, countBits);
    for (const b of bytes) bb.append(b, 8);
    bb.append(0, Math.min(4, capBits - bb.length)); // 終端
    bb.append(0, (8 - (bb.length % 8)) % 8); // バイト境界揃え
    for (let pad = 0xec; bb.length < capBits; pad ^= 0xec ^ 0x11) bb.append(pad, 8);
    return { version: ver, data: bb.toBytes() };
  }
  throw new Error("QRコードに収まりません（文字列が長すぎます）");
}

function addEccAndInterleave(version, data) {
  const numBlocks = NUM_BLOCKS_M[version];
  const eccLen = ECC_PER_BLOCK_M[version];
  const rawCodewords = Math.floor(getNumRawDataModules(version) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);
  const divisor = rsDivisor(eccLen);
  const blocks = [];
  let k = 0;
  for (let i = 0; i < numBlocks; i++) {
    const datLen = shortBlockLen - eccLen + (i >= numShortBlocks ? 1 : 0);
    const block = data.slice(k, k + datLen);
    k += datLen;
    const ecc = rsRemainder(block, divisor);
    blocks.push({ block, ecc });
  }
  const result = [];
  const maxLen = Math.max(...blocks.map((b) => b.block.length));
  for (let i = 0; i < maxLen; i++)
    for (const b of blocks) if (i < b.block.length) result.push(b.block[i]);
  for (let i = 0; i < eccLen; i++)
    for (const b of blocks) result.push(b.ecc[i]);
  return result;
}

// --- マトリクス描画 ---
class QrMatrix {
  constructor(version) {
    this.version = version;
    this.size = version * 4 + 17;
    this.modules = Array.from({ length: this.size }, () => new Array(this.size).fill(false));
    this.isFunction = Array.from({ length: this.size }, () => new Array(this.size).fill(false));
    this.drawFunctionPatterns();
  }
  set(x, y, dark) { if (0 <= x && x < this.size && 0 <= y && y < this.size) this.modules[y][x] = !!dark; }
  setFunc(x, y, dark) {
    if (0 <= x && x < this.size && 0 <= y && y < this.size) {
      this.modules[y][x] = !!dark; this.isFunction[y][x] = true;
    }
  }
  drawFunctionPatterns() {
    const size = this.size;
    for (let i = 0; i < size; i++) {
      this.setFunc(6, i, i % 2 === 0);
      this.setFunc(i, 6, i % 2 === 0);
    }
    this.drawFinder(3, 3); this.drawFinder(size - 4, 3); this.drawFinder(3, size - 4);
    const pos = ALIGN_POS[this.version];
    for (const a of pos) for (const b of pos) {
      if ((a === 6 && b === 6) || (a === 6 && b === size - 7) || (a === size - 7 && b === 6)) continue;
      this.drawAlignment(a, b);
    }
    this.drawFormatBits(0); // 仮置き（マスク決定後に再描画）
    this.drawVersionInfo();
  }
  drawFinder(cx, cy) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      this.setFunc(cx + dx, cy + dy, dist !== 2 && dist !== 4);
    }
  }
  drawAlignment(cx, cy) {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
      this.setFunc(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  drawVersionInfo() {
    if (this.version < 7) return;
    let rem = this.version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ (((rem >>> 11) & 1) * 0x1f25);
    const bits = (this.version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = ((bits >>> i) & 1) !== 0;
      this.setFunc(Math.floor(i / 3), i % 3 + this.size - 11, bit);
      this.setFunc(i % 3 + this.size - 11, Math.floor(i / 3), bit);
    }
  }
  drawFormatBits(mask) {
    const size = this.size;
    const data = mask; // ECL M の formatBits = 0b00
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ (((rem >>> 9) & 1) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const get = (i) => ((bits >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) this.setFunc(8, i, get(i));
    this.setFunc(8, 7, get(6));
    this.setFunc(8, 8, get(7));
    this.setFunc(7, 8, get(8));
    for (let i = 9; i < 15; i++) this.setFunc(14 - i, 8, get(i));
    for (let i = 0; i < 8; i++) this.setFunc(size - 1 - i, 8, get(i));
    for (let i = 8; i < 15; i++) this.setFunc(8, size - 15 + i, get(i));
    this.setFunc(8, size - 8, true); // ダークモジュール
  }
  placeData(codewords) {
    const size = this.size;
    let i = 0; // ビットインデックス
    const totalBits = codewords.length * 8;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (!this.isFunction[y][x] && i < totalBits) {
            this.modules[y][x] = ((codewords[Math.floor(i / 8)] >>> (7 - (i % 8))) & 1) !== 0;
            i++;
          }
        }
      }
    }
  }
  applyMask(mask) {
    const size = this.size;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (this.isFunction[y][x]) continue;
      let invert;
      switch (mask) {
        case 0: invert = (x + y) % 2 === 0; break;
        case 1: invert = y % 2 === 0; break;
        case 2: invert = x % 3 === 0; break;
        case 3: invert = (x + y) % 3 === 0; break;
        case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
        case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
        case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
        default: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
      }
      if (invert) this.modules[y][x] = !this.modules[y][x];
    }
  }
  penalty() {
    const size = this.size, m = this.modules;
    let score = 0;
    // ルール1: 同色ラン
    for (let i = 0; i < size; i++) {
      for (const getCell of [(k) => m[i][k], (k) => m[k][i]]) {
        let runColor = getCell(0), runLen = 1;
        for (let k = 1; k < size; k++) {
          if (getCell(k) === runColor) { runLen++; }
          else { if (runLen >= 5) score += runLen - 2; runColor = getCell(k); runLen = 1; }
        }
        if (runLen >= 5) score += runLen - 2;
      }
    }
    // ルール2: 2x2 同色ブロック
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++)
      if (m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) score += 3;
    // ルール3: ファインダ状パターン (1:1:3:1:1 + 前後4つの空白)
    const patA = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], patB = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    const matches = (arr, off, pat) => pat.every((v, i) => (arr[off + i] ? 1 : 0) === v);
    for (let i = 0; i < size; i++) {
      for (const line of [m[i], m.map((row) => row[i])]) {
        for (let off = 0; off + 11 <= size; off++)
          if (matches(line, off, patA) || matches(line, off, patB)) score += 40;
      }
    }
    // ルール4: 黒比率の偏り
    let dark = 0;
    for (const row of m) for (const c of row) if (c) dark++;
    const total = size * size;
    score += Math.floor(Math.abs(dark * 20 - total * 10) / total) * 10;
    return score;
  }
}

// テキスト → { size, modules } （true = 黒モジュール）
export function qrMatrix(text) {
  const bytes = [...new TextEncoder().encode(text)];
  const { version, data } = encodeDataCodewords(bytes);
  const codewords = addEccAndInterleave(version, data);
  let best = null, bestPenalty = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const qr = new QrMatrix(version);
    qr.placeData(codewords);
    qr.applyMask(mask);
    qr.drawFormatBits(mask);
    const p = qr.penalty();
    if (p < bestPenalty) { bestPenalty = p; best = qr; }
  }
  return { size: best.size, modules: best.modules };
}

// テキスト → SVG 文字列（配布用 PNG 化や印刷にも使えるベクター形式）
export function qrSvg(text, { scale = 6, border = 4, dark = "#3a2f26", light = "#ffffff" } = {}) {
  const { size, modules } = qrMatrix(text);
  const dim = (size + border * 2) * scale;
  let d = "";
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++)
    if (modules[y][x]) d += `M${(x + border) * scale},${(y + border) * scale}h${scale}v${scale}h-${scale}z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}"><rect width="100%" height="100%" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
}

// Canvas に描画（共有画面用）
export function qrToCanvas(canvas, text, { scale = 6, border = 4, dark = "#3a2f26", light = "#ffffff" } = {}) {
  const { size, modules } = qrMatrix(text);
  const dim = (size + border * 2) * scale;
  canvas.width = dim; canvas.height = dim;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = light; ctx.fillRect(0, 0, dim, dim);
  ctx.fillStyle = dark;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++)
    if (modules[y][x]) ctx.fillRect((x + border) * scale, (y + border) * scale, scale, scale);
}
