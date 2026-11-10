// make-qr.mjs — 配布用 QR 画像（SVG）をローカル生成するツール
//
// 使い方:
//   node tools/make-qr.mjs "https://公開URL/?join=フレンドコード" [出力ファイル.svg]
//   node tools/make-qr.mjs "https://公開URL/" distribution-qr.svg   ← アプリ自体の配布用
//
// セキュリティ: QR 生成は同梱ライブラリ（js/qrcode.js）でローカル計算のみ。
// フレンドコードを外部の QR 生成サービスに送ることは絶対にしないこと。
// SVG → PNG が必要な場合は、ブラウザで SVG を開いて保存するか、
// 画像編集アプリで開いて PNG に書き出してください（この手順も外部送信なし）。
import { writeFileSync } from "node:fs";
import { qrSvg } from "../js/qrcode.js";

const url = process.argv[2];
const out = process.argv[3] || "qr.svg";
if (!url) {
  console.error("使い方: node tools/make-qr.mjs <URL> [出力ファイル.svg]");
  process.exit(1);
}
writeFileSync(out, qrSvg(url, { scale: 10 }), "utf8");
console.log(`生成しました: ${out} （URL: ${url}）`);
