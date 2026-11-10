// game.js — 食材クイズゲーム（学びながら遊べるゲーム）
//
// 食育コンテンツ（js/knowledge.js）の「旬・見分け方・からだにいいこと
// （栄養）・まめちしき・3択クイズ」と、郷土料理データ（js/recipes.js の
// REGIONS / REGIONAL_RECIPES）から、そのまま遊べるクイズを組み立てる
// 純粋ロジック。状態は持たず、在庫・買い物リストなどのデータには一切
// 触れない（ゲームの結果はどこにも保存しない）。
//
// 問題の種類（type）:
// - "knowledge": 知識ページの3択クイズそのもの
// - "season":    「いちばんおいしい季節（旬）はいつ？」を選ぶ
// - "name":      まめちしきをヒントに、食材の名前を当てる（キャラはシルエット表示）
// - "nutrition": 「この食材に多く入っている栄養は？」（body=からだにいいこと から出題）
// - "choose":    「おいしい○○の見分け方は？」（choose=見分け方 が正解、
//                  他の食材の見分け方が選択肢になる）
// - "seasonfood":「○○（季節）に旬の食べ物はどれ？」（名前の3択。シルエット表示）
// - "regional":  郷土料理クイズ「○○はどこの地域の名物？」（recipes.js の
//                  地域データから出題。料理名と由来メモを使う）
// 選択肢は必ず3つで、正解は1つだけ。seed を渡せば毎回同じ問題になる（テスト用）。
// ラウンドの長さは 5 / 10 / 15 問から選べる（GAME_COUNT_OPTIONS）。

import { knowledgeFor } from "./knowledge.js";
import { REGIONS, REGIONAL_RECIPES, ALL_RECIPES, EVENT_RECIPES } from "./recipes.js";

export const GAME_QUESTION_COUNT = 5;
export const GAME_COUNT_OPTIONS = [5, 10, 15];
export const GAME_TYPES = ["knowledge", "season", "name", "nutrition", "choose", "seasonfood", "regional"];
export const CORRECT_PRAISE = [
  "すごい！その調子！",
  "やったね！食材はかせに一歩近づいたよ",
  "かんぺきに覚えているね！",
];

/** 決定的乱数（mulberry32）。同じ seed では同じ並びになる */
function mulberry32(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled(arr, rng) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const SEASON_CHOICES = ["春", "夏", "秋", "冬", "一年中"];
/**
 * 旬テキスト（例: "秋〜冬（甘くなる）" "一年中" "春・秋"）から
 * 代表の季節バケットを返す。季節の字が無い場合は null。
 */
export function seasonBucket(seasonText) {
  const s = String(seasonText || "");
  let best = null, bestIdx = Infinity;
  for (const kanji of ["春", "夏", "秋", "冬"]) {
    const idx = s.indexOf(kanji);
    if (idx >= 0 && idx < bestIdx) { best = kanji; bestIdx = idx; }
  }
  if (best) return best;
  return s.includes("一年中") ? "一年中" : null;
}

// ---- 栄養クイズ用の栄養ワード（長い語を先に判定する） ----
const NUTRIENT_WORDS = [
  "アスタキサンチン", "ポリフェノール", "ビタミンB12", "ビタミンB1", "ビタミンB群",
  "食物繊維", "たんぱく質", "カルシウム", "カロテン", "リコピン", "ナスニン",
  "ビタミンA", "ビタミンC", "ビタミンD", "ビタミンE", "ビタミンK", "ビタミンU",
  "カリウム", "グアニル酸", "クエン酸", "ペクチン", "乳酸菌", "納豆菌", "タウリン",
  "葉酸", "鉄分", "亜鉛", "酵素", "DHA",
];
/** body（からだにいいこと）から代表の栄養ワードを1つ拾う。なければ null */
export function nutrientOf(bodyText) {
  const s = String(bodyText || "");
  for (const w of NUTRIENT_WORDS) if (s.includes(w)) return w;
  return null;
}

function knowledgeQuestion(target, info, rng) {
  const choices = shuffled(info.quiz.choices, rng);
  return {
    name: target.name, category: target.category, type: "knowledge",
    q: info.quiz.q,
    choices,
    answer: choices.indexOf(info.quiz.choices[info.quiz.answer]),
    explain: info.quiz.why,
  };
}
function seasonQuestion(target, info, rng) {
  const bucket = seasonBucket(info.season);
  if (!bucket) return null;
  const others = shuffled(SEASON_CHOICES.filter((c) => c !== bucket), rng).slice(0, 2);
  const choices = shuffled([bucket, ...others], rng);
  return {
    name: target.name, category: target.category, type: "season",
    q: `${target.name}が いちばん おいしい きせつ（旬）は いつ？`,
    choices,
    answer: choices.indexOf(bucket),
    explain: `${target.name}の旬は「${info.season}」だよ。旬のものはおいしくて栄養もたっぷりだよ。`,
  };
}
function nameQuestion(target, info, pool, rng) {
  const others = shuffled(pool.filter((p) => p.name !== target.name).map((p) => p.name), rng).slice(0, 2);
  if (others.length < 2) return null;
  // ヒント文に食材名そのものが入っていたら伏せ字にする（答えがバレないように）
  const hint = String(info.trivia[0] || "").split(target.name).join("○○○");
  const choices = shuffled([target.name, ...others], rng);
  return {
    name: target.name, category: target.category, type: "name",
    q: `ヒント：${hint} この たべものは なーんだ？`,
    choices,
    answer: choices.indexOf(target.name),
    explain: `正解は『${target.name}』！ 旬は「${info.season}」。${info.choose}`,
  };
}
function nutritionQuestion(target, info, rng) {
  const nutrient = nutrientOf(info.body);
  if (!nutrient) return null;
  const others = shuffled(NUTRIENT_WORDS.filter((w) => w !== nutrient), rng).slice(0, 2);
  const choices = shuffled([nutrient, ...others], rng);
  return {
    name: target.name, category: target.category, type: "nutrition",
    q: `${target.name}に 多く 入っていて、体に うれしい 栄養は どれ？`,
    choices,
    answer: choices.indexOf(nutrient),
    explain: `${target.name}のはたらき：${info.body}`,
  };
}
function chooseQuestion(target, info, pool, rng) {
  const others = [];
  for (const p of shuffled(pool.filter((x) => x.name !== target.name), rng)) {
    const other = knowledgeFor(p.name, p.category).choose;
    if (other && other !== info.choose && !others.includes(other)) others.push(other);
    if (others.length >= 2) break;
  }
  if (others.length < 2) return null;
  const choices = shuffled([info.choose, ...others], rng);
  return {
    name: target.name, category: target.category, type: "choose",
    q: `おいしい ${target.name} の 見分け方は どれ？`,
    choices,
    answer: choices.indexOf(info.choose),
    explain: `${target.name}の見分け方：${info.choose}`,
  };
}
function seasonFoodQuestion(target, info, pool, rng) {
  const bucket = seasonBucket(info.season);
  if (!bucket || bucket === "一年中") return null;
  const others = [];
  for (const p of shuffled(pool.filter((x) => x.name !== target.name), rng)) {
    const pi = knowledgeFor(p.name, p.category);
    const b = seasonBucket(pi.season);
    if (b && b !== bucket && !others.includes(p.name)) others.push(p.name);
    if (others.length >= 2) break;
  }
  if (others.length < 2) return null;
  const choices = shuffled([target.name, ...others], rng);
  return {
    name: target.name, category: target.category, type: "seasonfood",
    q: `${bucket}に いちばん おいしい（旬の）食べ物は どれ？`,
    choices,
    answer: choices.indexOf(target.name),
    explain: `${target.name}の旬は「${info.season}」だよ。旬の食べ物はおいしくて栄養もたっぷりだよ。`,
  };
}

// ---- 郷土料理クイズ（recipes.js の地域データから作る） ----
const REGIONAL_RECIPE_BY_ID = new Map(
  [...ALL_RECIPES, ...EVENT_RECIPES, ...REGIONAL_RECIPES].map((r) => [r.id, r]),
);
/** 地域クイズの出題プール: [{ region, recipe }]（由来メモのある料理だけ） */
export const REGIONAL_QUIZ_POOL = REGIONS.flatMap((region) =>
  region.dishes
    .map((id) => REGIONAL_RECIPE_BY_ID.get(id))
    .filter((recipe) => recipe && typeof recipe.note === "string" && recipe.note.length >= 15)
    .map((recipe) => ({ region, recipe })),
);
function regionalQuestion(rng) {
  if (REGIONAL_QUIZ_POOL.length === 0 || REGIONS.length < 3) return null;
  const { region, recipe } = REGIONAL_QUIZ_POOL[Math.floor(rng() * REGIONAL_QUIZ_POOL.length)];
  const others = shuffled(REGIONS.filter((r) => r.id !== region.id).map((r) => r.name), rng).slice(0, 2);
  const choices = shuffled([region.name, ...others], rng);
  const mainIng = recipe.ingredients && recipe.ingredients[0];
  return {
    name: mainIng ? mainIng.name : recipe.title, category: "郷土料理", type: "regional",
    dishTitle: recipe.title, regionName: region.name,
    q: `『${recipe.title}』は どこの 地域の 名物？`,
    choices,
    answer: choices.indexOf(region.name),
    explain: `${recipe.title}は${region.name}の名物だよ。${recipe.note}`,
  };
}

/**
 * ゲームの問題を作る。
 * pool: [{ name, category }]（集めた食材を優先して渡す想定。重複は名前で除く）
 * count: 問題数（5 / 10 / 15 など）。プールが問題数より少なくても、
 *        食材を使い回して（違うタイプで）count 問そろえる。プールが空なら 0 問。
 * 戻り値: [{ name, category, type, q, choices[3], answer, explain }]
 */
export function buildGameQuestions(pool, { count = GAME_QUESTION_COUNT, seed = 1 } = {}) {
  const rng = mulberry32(seed);
  const unique = [];
  const seen = new Set();
  for (const p of pool || []) {
    if (!p || !p.name || seen.has(p.name)) continue;
    seen.add(p.name);
    unique.push({ name: String(p.name), category: p.category || "その他" });
  }
  if (unique.length === 0) return [];
  const total = Math.max(1, Math.floor(count) || GAME_QUESTION_COUNT);
  const order = shuffled(unique, rng);
  let targetIdx = 0;
  const nextTarget = () => {
    const t = order[targetIdx % order.length];
    targetIdx += 1;
    if (targetIdx % order.length === 0) {
      // 一巡したら並び替えて、同じ食材でも違う顔ぶれで出題する
      const reshuffled = shuffled(unique, rng);
      order.splice(0, order.length, ...reshuffled);
    }
    return t;
  };
  const questions = [];
  for (let i = 0; i < total; i++) {
    const type = GAME_TYPES[i % GAME_TYPES.length];
    let q = null;
    if (type === "regional") {
      q = regionalQuestion(rng);
    } else {
      const target = nextTarget();
      const info = knowledgeFor(target.name, target.category);
      if (type === "season") q = seasonQuestion(target, info, rng);
      else if (type === "name") q = nameQuestion(target, info, unique, rng);
      else if (type === "nutrition") q = nutritionQuestion(target, info, rng);
      else if (type === "choose") q = chooseQuestion(target, info, unique, rng);
      else if (type === "seasonfood") q = seasonFoodQuestion(target, info, unique, rng);
      if (!q) q = knowledgeQuestion(target, info, rng);
    }
    if (!q) {
      const target = nextTarget();
      q = knowledgeQuestion(target, knowledgeFor(target.name, target.category), rng);
    }
    questions.push(q);
  }
  return questions;
}

/**
 * 結果を集計する。results は正誤の配列（true = 正解）。
 * 戻り値: { correct, total, bestStreak, rate, message }
 */
export function scoreGame(results) {
  const flags = Array.isArray(results) ? results : [];
  let bestStreak = 0, streak = 0;
  for (const f of flags) {
    streak = f ? streak + 1 : 0;
    if (streak > bestStreak) bestStreak = streak;
  }
  const correct = flags.filter(Boolean).length;
  const total = flags.length;
  let message;
  if (total > 0 && correct === total) message = "パーフェクト！🎉 きみは 食材はかせ だね！";
  else if (total > 0 && correct / total >= 0.6) message = "すごい！ よくできたね！🎉";
  else message = "よくがんばったね！ 食材の『まなび』を読んで、もう一回チャレンジしよう！";
  return { correct, total, bestStreak, rate: total ? correct / total : 0, message };
}
