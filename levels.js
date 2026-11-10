// levels.js — 食材のレベルと称号（買った回数で育つ）
// ユーザー指定「回数は多い方がいい」: 家族の買い物を何か月も楽しめる
// 長い階段にする。最初のレベルアップ（Lv2=5回）だけは早めに届く
// ようにして、子どもの「できた！」を先に用意し、その後は伸ばす。
//   Lv1=1回, Lv2=5回, Lv3=10回, Lv4=20回, Lv5=35回,
//   Lv6=50回, Lv7=75回, Lv8=100回, Lv9=150回, Lv10=200回,
//   以降は +100回 ごとに Lv11, Lv12, …
// 称号はレベルごとに食材名入りで変わり、高レベルほど特別になる。

export const LEVEL_THRESHOLDS = [1, 5, 10, 20, 35, 50, 75, 100, 150, 200];

/** 買った回数 → レベル（未登録は 0） */
export function levelForCount(count) {
  const c = Math.max(0, Math.floor(Number(count) || 0));
  if (c <= 0) return 0;
  let lv = 0;
  for (const t of LEVEL_THRESHOLDS) if (c >= t) lv++;
  if (c >= LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1]) {
    lv += Math.floor((c - LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1]) / 100);
  }
  return lv;
}

/** 次のレベルに必要な累計回数（現在レベル Lv の次） */
export function nextLevelAt(count) {
  const lv = levelForCount(count);
  if (lv <= 0) return LEVEL_THRESHOLDS[0];
  if (lv < LEVEL_THRESHOLDS.length) return LEVEL_THRESHOLDS[lv];
  return LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1] + (lv - LEVEL_THRESHOLDS.length + 1) * 100;
}

/** 次のレベルまであと何回か */
export function remainingToNextLevel(count) {
  return Math.max(0, nextLevelAt(count) - Math.max(0, Math.floor(Number(count) || 0)));
}

const TITLE_PATTERNS = [
  (n) => `${n}ビギナー`,       // Lv1
  (n) => `${n}ファン`,         // Lv2
  (n) => `${n}はかせ`,         // Lv3
  (n) => `${n}マスター`,       // Lv4
  (n) => `${n}の達人`,         // Lv5
  (n) => `${n}の匠`,           // Lv6
  (n) => `${n}の賢者`,         // Lv7
  (n) => `伝説の${n}`,         // Lv8
  (n) => `${n}の覇王`,         // Lv9
  (n) => `${n}の神さま`,       // Lv10
];

/** 食材名と買った回数 → 称号（『』は付けない。未購入は空文字） */
export function titleFor(name, count) {
  const lv = levelForCount(count);
  if (lv < 1) return "";
  if (lv > TITLE_PATTERNS.length) return `真・${name}の神さま`;
  return TITLE_PATTERNS[lv - 1](name);
}
