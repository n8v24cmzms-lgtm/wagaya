// app.js — わが家の食材手帳（Web配布版）メイン
//
// モード:
// - config.js の Firebase 設定が空 → デモモード（DemoStore, 端末内のみ）
// - 設定あり → Firebase モード（FirebaseStore, Auth + Firestore ルールで家族共有）
// - ロールバック用: 旧 Supabase 設定が両方ある場合のみ SupabaseStore で動く
//
// セキュリティ関連:
// - ユーザー入力の描画はすべて textContent（util.el）経由。innerHTML は
//   静的な雛形だけに使い、ユーザー由来の文字列は混ぜない。
// - QR コードは同梱ライブラリ（js/qrcode.js）で端末内生成のみ。
//   フレンドコードを外部 QR 生成 API に送ることはしない。
// - 参加用リンク ?join=<code> を受けたら、コードを sessionStorage に退避し、
//   ログイン完了後に自動で参加を試みる（URL の履歴からは即座に消す）。

import { el, uid, todayISO, daysUntil, formatDate, expiryLabel, expiryGroup, formatCode, fmtQtyValue, qtyStepFor, roundQty, isFractionUnit, matchesSearch, topPurchased, recentRegistered } from "./util.js";
import { suggestRecipes, suggestMealSet, suggestEventMenu, EVENT_MENUS, suggestRegionalMenu, REGIONS } from "./recipes.js";
import { buildGameQuestions, scoreGame, CORRECT_PRAISE, GAME_QUESTION_COUNT, GAME_COUNT_OPTIONS } from "./game.js";
import { qrToCanvas } from "./qrcode.js";
import { iconEl, CATALOG, rarityOf, rarityCategory } from "./icons.js";
import { levelForCount, titleFor, remainingToNextLevel } from "./levels.js";
import { knowledgeFor } from "./knowledge.js";
import { DemoStore, DEMO_DB_KEY } from "./demo-store.js";
import { GUIDE_STEPS, guideSeen, markGuideSeen } from "./guide.js";
import { legalDocs } from "./legal.js";
import { buildReminders, notifyOnOpen, permissionState, subscribePush } from "./notify.js";

const CATEGORIES = ["野菜", "肉", "魚", "卵・乳製品", "豆腐・大豆", "調味料", "乾物・缶詰", "冷凍食品", "飲み物", "果物", "その他"];
const STORAGES = ["冷蔵庫", "冷凍庫", "野菜室", "常温"];

const appRoot = document.getElementById("app");
const toastNode = document.getElementById("toast");
let toastTimer = null;
function toast(msg, ms = 2600) {
  toastNode.replaceChildren(document.createTextNode(msg));
  toastNode.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastNode.hidden = true; }, ms);
}
// 「元に戻す」ボタン付きトースト（削除・数量変更の取り消し用）
function toastWithAction(msg, actionLabel, onAction, ms = 7000) {
  const btn = el("button", { class: "toast-action", type: "button" }, actionLabel);
  btn.addEventListener("click", async () => {
    clearTimeout(toastTimer);
    toastNode.hidden = true;
    try { await onAction(); } catch (e) { toast(e.message); }
  });
  toastNode.replaceChildren(document.createTextNode(msg), btn);
  toastNode.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastNode.hidden = true; }, ms);
}

// ---------- 購入のお祝い（激レアゲット／レベルアップ） ----------
// 購入前に図鑑の購入回数を控えておき、購入後に比べることで
// 「はじめて集めた激レア」「レベルアップ」を検出してお祝いする。
function catalogCountsBefore() {
  return new Map(state.catalog.map((c) => [c.name, c.purchaseCount ?? 1]));
}
function celebratePurchase(name, before) {
  const rec = state.catalog.find((c) => c.name === name);
  if (!rec) return false;
  const count = rec.purchaseCount ?? 1;
  const isNew = !before.has(name);
  const tier = rarityOf(name);
  if (isNew && tier === "ultra") {
    toast(`激レア食材『${name}』をゲット！🎉 ずかんに とうろくされたよ`, 5200);
    return true;
  }
  const beforeCount = before.get(name) ?? 0;
  if (!isNew && levelForCount(count) > levelForCount(beforeCount)) {
    toast(`${name}が Lv${levelForCount(count)}にアップ！称号『${titleFor(name, count)}』をゲット！🎉`, 5200);
    return true;
  }
  if (isNew && tier === "rare") {
    toast(`レア食材『${name}』をゲット！✨ ずかんに とうろくされたよ`, 4600);
    return true;
  }
  return false;
}

let store = null;
const state = {
  user: null, fridges: [], fridge: null, members: [],
  items: [], shopping: [], favRecipes: [], catalog: [], settings: { familySize: 2 },
  tab: "stock", authTab: "login", recipeMode: "stock", recipeView: "suggest",
  eventMenuId: null, // 選択中のイベント献立（null のときは先頭のイベント）
  regionId: null, // 選択中の地域（郷土料理。null のときは先頭の地域）
  gameView: false, // 食材クイズゲーム表示中
  game: null, // ゲームの進行状態 { questions, index, phase, selected, flags, streak, bestStreak }（保存しない）
  gameCount: GAME_QUESTION_COUNT, // ゲームの出題数（5 / 10 / 15 から選択。保存しない）
  zukanFilter: "all", // 図鑑のレアリティ絞り込み: all | ultra | rare
  knowledgeName: null, knowledgeCategory: null, // 食材の知識ページ表示中（食育）
  presetAdd: null, // 図鑑から在庫登録フォームへ渡す下書き { name, category, unit? }
  inviteCode: null, // 作成/再発行の直後に所有者へ見せるコード（平文）
  stockQuery: "", // 在庫の検索文字列
  showGuide: false, // はじめてガイド表示中
  legalView: null, // 法的ページ表示中: null | "privacy" | "terms"
  sessionTrash: [], // 本番モード用: この画面で削除した食材（セッション内のみ復元可）
  trash: [], // デモモード用: ストアのゴミ箱（refreshData で読み込む）
};

// ---- ?join= の受け取り ----
function captureJoinParam() {
  const url = new URL(location.href);
  const code = url.searchParams.get("join");
  if (code) {
    sessionStorage.setItem("wagaya_pending_join", code);
    url.searchParams.delete("join");
    history.replaceState(null, "", url.pathname + url.hash); // URL履歴にコードを残さない
    const banner = document.getElementById("join-banner");
    banner.hidden = false;
    banner.textContent = "QRコードから参加コードを受け取りました。ログインすると自動で参加します。";
  }
}
function pendingJoin() { return sessionStorage.getItem("wagaya_pending_join"); }
function clearPendingJoin() { sessionStorage.removeItem("wagaya_pending_join"); }

async function initStore() {
  const cfg = globalThis.WAGAYA_CONFIG || {};
  const fb = cfg.FIREBASE || {};
  if (fb.apiKey && fb.projectId) {
    const { FirebaseStore } = await import("./firebase-store.js");
    store = await FirebaseStore.create(fb);
  } else if (cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY) {
    // ロールバック用（旧バックエンド）。通常は Firebase 設定を使う。
    const { SupabaseStore } = await import("./supabase-store.js");
    store = await SupabaseStore.create(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  } else {
    store = new DemoStore();
    document.getElementById("demo-banner").hidden = false;
  }
}

// ---------- リアルタイム更新 ----------
// 本番: Firestore の onSnapshot（store.subscribeFridge）で家族の編集を自動反映。
// デモ: localStorage の storage イベントで別タブの変更を自動反映。
// どちらも使えない場合は従来通り（操作・再読み込みで反映）にフォールバック。
let realtimeCleanup = null;
let realtimeTimer = null;
function scheduleRealtimeRefresh() {
  clearTimeout(realtimeTimer);
  realtimeTimer = setTimeout(async () => {
    if (!state.user || !state.fridge) return;
    await refreshData().catch(() => {});
    if (!state.knowledgeName && !state.legalView) renderMain();
  }, 400);
}
function setupRealtime() {
  stopRealtime();
  if (!state.fridge || typeof store.subscribeFridge !== "function") return;
  realtimeCleanup = store.subscribeFridge(state.fridge.id, scheduleRealtimeRefresh);
}
function stopRealtime() {
  if (realtimeCleanup) { try { realtimeCleanup(); } catch { /* noop */ } realtimeCleanup = null; }
}
window.addEventListener("storage", (e) => {
  if (!store || store.mode !== "demo") return;
  if (e.key !== DEMO_DB_KEY) return;
  scheduleRealtimeRefresh();
});

// ---------- はじめてガイド ----------
function renderGuideCard() {
  return el("div", { class: "card guide-card" },
    el("h2", {}, "👋 はじめてガイド"),
    GUIDE_STEPS.map((s) => el("div", { class: "guide-step" },
      el("span", { class: "guide-icon" }, s.icon),
      el("div", { class: "grow" }, el("strong", {}, s.title), el("p", { class: "hint" }, s.body)))),
    el("button", {
      class: "btn wide", onclick: () => {
        if (state.user) markGuideSeen(localStorage, state.user.id);
        state.showGuide = false;
        if (state.fridge) renderMain(); else renderFridgePicker();
      },
    }, "わかった！はじめる"),
  );
}

// ---------- 法的ページ（プライバシーポリシー／利用規約） ----------
function renderLegalPage() {
  appRoot.replaceChildren();
  const doc = legalDocs().find((d) => d.id === state.legalView) || legalDocs()[0];
  const wrap = el("div", { class: "card legal-page" },
    el("button", {
      class: "btn secondary small", onclick: () => {
        state.legalView = null;
        if (state.user && state.fridge) renderMain();
        else if (state.user) renderFridgePicker();
        else renderAuth();
      },
    }, "← もどる"),
    el("h2", {}, doc.title),
    el("p", { class: "hint" }, "※ これは下書きです。[運営者名] などの空欄は、公開前に運営者が記入します。"),
  );
  for (const sec of doc.sections) {
    wrap.append(el("h3", { class: "legal-h" }, sec.heading));
    if (sec.table) {
      wrap.append(el("div", {}, sec.table.map(([k, v]) =>
        el("div", { class: "legal-row" }, el("strong", {}, k), el("p", { class: "k-text" }, v)))));
    }
    for (const line of sec.lines || []) wrap.append(el("p", { class: "k-text" }, line));
  }
  appRoot.append(wrap);
  try { window.scrollTo(0, 0); } catch { /* 表示専用 */ }
}
function legalLinks() {
  return el("div", { class: "legal-links" },
    el("button", { class: "link-btn", type: "button", onclick: () => { state.legalView = "privacy"; renderLegalPage(); } }, "プライバシーポリシー"),
    el("span", {}, "・"),
    el("button", { class: "link-btn", type: "button", onclick: () => { state.legalView = "terms"; renderLegalPage(); } }, "利用規約"));
}

// ---------- サーバー発プッシュの購読（設定時のみ・本番モードのみ） ----------
// Firebase モード: FCM トークンを登録する（送信側は Cloud Functions 等が別途必要。
// トークン登録だけでは通知は届かない。README「プッシュ通知（サーバー発）」参照）。
// 旧 Supabase モード（ロールバック時）: Web Push（VAPID）購読を保存する。
async function maybeSubscribePush() {
  if (!store || !state.user) return;
  const cfg = globalThis.WAGAYA_CONFIG || {};
  try {
    if (store.mode === "firebase") {
      const key = cfg.FCM_VAPID_KEY || "";
      if (key && typeof store.registerPushToken === "function") {
        await store.registerPushToken(state.user.id, key);
      }
      return;
    }
    const vapid = cfg.VAPID_PUBLIC_KEY || "";
    if (!vapid || store.mode !== "supabase") return;
    const res = await subscribePush(vapid);
    if (res.ok) await store.savePushSubscription(state.user.id, res.subscription);
  } catch { /* 購読に失敗しても通知許可そのものには影響しない */ }
}

// ================= 認証画面 =================
function renderAuth(errorMsg = "") {
  if (state.legalView) { renderLegalPage(); return; }
  appRoot.replaceChildren();
  const email = el("input", { type: "email", autocomplete: "email", placeholder: "メールアドレス" });
  const pass = el("input", { type: "password", autocomplete: state.authTab === "login" ? "current-password" : "new-password", placeholder: "パスワード（6文字以上）" });
  const name = el("input", { type: "text", autocomplete: "nickname", placeholder: "表示名（ニックネームでOK）" });
  const card = el("div", { class: "card" },
    el("h2", {}, state.authTab === "login" ? "ログイン" : "アカウントを作る"),
    el("div", { class: "tabs" },
      el("button", { class: state.authTab === "login" ? "active" : "", onclick: () => { state.authTab = "login"; renderAuth(); } }, "ログイン"),
      el("button", { class: state.authTab === "signup" ? "active" : "", onclick: () => { state.authTab = "signup"; renderAuth(); } }, "新規登録"),
    ),
    el("label", {}, "メールアドレス"), email,
    el("label", {}, "パスワード"), pass,
    state.authTab === "signup" ? el("label", {}, "表示名") : null,
    state.authTab === "signup" ? name : null,
    errorMsg ? el("div", { class: "error" }, errorMsg) : null,
    el("button", {
      class: "btn wide", onclick: async () => {
        try {
          if (state.authTab === "login") state.user = await store.signIn(email.value, pass.value);
          else state.user = await store.signUp(email.value, pass.value, name.value.trim());
          toast(state.authTab === "login" ? "ログインしました" : "アカウントを作りました");
          await afterLogin();
        } catch (e) { renderAuth(e.message); }
      },
    }, state.authTab === "login" ? "ログインする" : "登録する"),
    el("p", { class: "hint" }, store.mode === "demo"
      ? "デモモードでは、この端末の中だけで使えるローカルアカウントです。別の人を試すときは、一度ログアウトして別のメールアドレスで登録してください。"
      : "パスワードはログイン専門の仕組み（Firebase Authentication）が管理し、このアプリは保持しません。本名などの個人情報は集めません。"),
    legalLinks(),
  );
  appRoot.append(card);
}

async function afterLogin() {
  state.tab = "stock";
  // 初回だけ、はじめてガイドを出す（設定からいつでも見直せる）
  if (state.user && !guideSeen(localStorage, state.user.id)) state.showGuide = true;
  state.fridges = await store.listMyFridges(state.user.id);
  const code = pendingJoin();
  if (code) {
    clearPendingJoin();
    document.getElementById("join-banner").hidden = true;
    try {
      const fridge = await store.joinByCode(state.user.id, code);
      toast(`「${fridge.name}」に参加しました`);
      state.fridges = await store.listMyFridges(state.user.id);
      await openFridge(fridge.id);
      return;
    } catch (e) {
      toast(e.message);
    }
  }
  if (state.fridges.length === 1) await openFridge(state.fridges[0].id);
  else renderFridgePicker();
}

// ================= 冷蔵庫の選択 =================
function renderFridgePicker(errorMsg = "") {
  appRoot.replaceChildren();
  if (state.showGuide) appRoot.append(renderGuideCard());
  const nameInput = el("input", { type: "text", placeholder: "例）わが家の冷蔵庫" });
  const codeInput = el("input", { type: "text", placeholder: "フレンドコード（例: K7QX-3M9P）", style: "text-transform:uppercase" });
  const pending = pendingJoin();
  if (pending) codeInput.value = formatCode(pending);
  const card = el("div", { class: "card" },
    el("h2", {}, "冷蔵庫を選ぶ"),
    state.fridges.length === 0
      ? el("p", { class: "hint" }, "まだ冷蔵庫がありません。下で新しく作るか、家族のフレンドコードで参加してください。")
      : el("div", {}, state.fridges.map((f) =>
          el("div", { class: "fridge-row" },
            el("span", { class: "grow" }, "🧊 " + f.name, el("span", { class: "chip" }, f.role === "owner" ? "作成者" : "メンバー")),
            el("button", { class: "btn small", onclick: () => openFridge(f.id) }, "開く"),
          ))),
    el("h3", {}, "冷蔵庫を作る"),
    nameInput,
    el("button", {
      class: "btn wide", onclick: async () => {
        try {
          const { fridge } = await store.createFridge(state.user.id, nameInput.value.trim());
          state.fridges = await store.listMyFridges(state.user.id);
          await openFridge(fridge.id);
          toast("冷蔵庫を作りました。共有タブでフレンドコードを家族に伝えてください");
        } catch (e) { renderFridgePicker(e.message); }
      },
    }, "この名前で作る"),
    el("h3", {}, "フレンドコードで参加する"),
    pending ? el("p", { class: "hint" }, "QRコードから受け取った参加コードが入っています。そのまま「参加する」を押してください。") : null,
    codeInput,
    errorMsg ? el("div", { class: "error" }, errorMsg) : null,
    el("button", {
      class: "btn secondary wide", onclick: async () => {
        try {
          const fridge = await store.joinByCode(state.user.id, codeInput.value);
          clearPendingJoin();
          toast(`「${fridge.name}」に参加しました`);
          state.fridges = await store.listMyFridges(state.user.id);
          await openFridge(fridge.id);
        } catch (e) { renderFridgePicker(e.message); }
      },
    }, "参加する"),
    el("button", {
      class: "btn ghost wide", onclick: async () => { await store.signOut(); state.user = null; renderAuth(); },
    }, "ログアウト"),
  );
  appRoot.append(card);
}

// ================= 冷蔵庫を開く =================
async function openFridge(fridgeId) {
  state.fridge = state.fridges.find((f) => f.id === fridgeId) || null;
  if (!state.fridge) { renderFridgePicker(); return; }
  state.sessionTrash = [];
  await refreshData();
  setupRealtime();
  // アプリを開いたタイミングのローカル通知（許可済み・1日1回・サーバー不要）
  notifyOnOpen(state.items).catch(() => {});
  renderMain();
}
async function refreshData() {
  const fid = state.fridge.id, uidNow = state.user.id;
  [state.items, state.shopping, state.settings, state.members] = await Promise.all([
    store.listItems(uidNow, fid), store.listShopping(uidNow, fid), store.getSettings(uidNow, fid), store.listMembers(uidNow, fid),
  ]);
  state.favRecipes = await store.listFavoriteRecipes(uidNow, fid).catch(() => []);
  state.catalog = await store.listCatalog(uidNow, fid).catch(() => []);
  state.inviteCode = await store.getInviteCode(uidNow, fid).catch(() => null);
  state.trash = store.mode === "demo" && typeof store.listTrash === "function"
    ? await store.listTrash(uidNow, fid).catch(() => []) : [];
}

// ================= メイン画面 =================
function renderMain() {
  if (state.legalView) { renderLegalPage(); return; }
  appRoot.replaceChildren();
  const content = el("div", {});
  if (state.showGuide) content.append(renderGuideCard());
  if (state.knowledgeName) content.append(renderKnowledgePage());
  else if (state.gameView) content.append(renderGamePage());
  else if (state.tab === "stock") content.append(renderStockTab());
  else if (state.tab === "shopping") content.append(renderShoppingTab());
  else if (state.tab === "recipes") content.append(renderRecipesTab());
  else if (state.tab === "zukan") content.append(renderZukanTab());
  else content.append(renderSettingsTab());
  appRoot.append(content);
  const nav = el("nav", { class: "bottom-nav" },
    navBtn("stock", "🧊", "在庫"), navBtn("shopping", "🛒", "買い物"),
    navBtn("recipes", "🍳", "レシピ"), navBtn("zukan", "📖", "図鑑"), navBtn("settings", "🔗", "共有・設定"),
  );
  appRoot.append(nav);
  document.getElementById("header-sub").textContent = state.fridge ? state.fridge.name : "";
}
function navBtn(tab, icon, label) {
  return el("button", { class: state.tab === tab && !state.knowledgeName && !state.gameView ? "active" : "", onclick: () => { state.tab = tab; state.knowledgeName = null; state.gameView = false; state.game = null; renderMain(); } },
    el("span", { class: "nav-icon" }, icon), label);
}

// ---------- 食材の知識ページ（食育） ----------
// 図鑑・在庫カード・買い物リストから開ける。キャラを大きく見せ、
// 「からだにいいこと／旬／見分け方／まめちしき／3択クイズ」をカードで表示する。
function openKnowledge(name, category) {
  state.knowledgeName = name;
  state.knowledgeCategory = category || null;
  renderMain();
  try { window.scrollTo(0, 0); } catch { /* 表示専用 */ }
}
function renderKnowledgePage() {
  const name = state.knowledgeName;
  const category = state.knowledgeCategory || rarityCategory(name) || "その他";
  const info = knowledgeFor(name, category);
  const tier = rarityOf(name);
  const rec = state.catalog.find((c) => c.name === name);
  const wrap = el("div", {});
  const heroIcon = iconEl(name, category);
  const count = rec ? (rec.purchaseCount ?? 1) : 0;
  const lv = levelForCount(count);
  const section = (title, ...kids) => el("div", { class: "card k-section" }, el("h3", { class: "k-title" }, title), ...kids);
  // クイズ（正解したら褒める。間違えたらもう一度考えられる）
  const quizResult = el("p", { class: "quiz-result", hidden: true }, "");
  let quizDone = false;
  const quizBtns = info.quiz.choices.map((choice, idx) => el("button", {
    class: "btn secondary wide quiz-btn", onclick: () => {
      if (quizDone) return;
      if (idx === info.quiz.answer) {
        quizDone = true;
        quizResult.hidden = false;
        quizResult.textContent = `せいかい！🎉 すごい！ ${info.quiz.why}`;
        quizResult.classList.add("correct");
        for (const b of quizBtns) b.disabled = true;
        quizBtns[idx].classList.add("right");
      } else {
        quizResult.hidden = false;
        quizResult.textContent = "おしい！ もういちど かんがえてみよう。";
        quizResult.classList.remove("correct");
        quizBtns[idx].disabled = true;
        quizBtns[idx].classList.add("wrong");
      }
    },
  }, `${idx + 1}. ${choice}`));
  wrap.append(
    el("button", { class: "btn secondary small", onclick: () => { state.knowledgeName = null; renderMain(); } }, "← もどる"),
    el("div", { class: "card knowledge-hero" },
      heroIcon,
      el("div", { class: "k-name" }, name),
      el("div", { class: "recipe-chips" },
        el("span", { class: "chip" }, category),
        tier === "ultra" ? el("span", { class: "rare-chip ultra" }, "激レア！") : tier === "rare" ? el("span", { class: "rare-chip rare" }, "レア") : null,
        rec ? el("span", { class: "chip" }, `Lv${lv} ・ ${count}回買ったよ`) : el("span", { class: "chip" }, "図鑑ではまだ未発見"),
        rec && titleFor(name, count) ? el("span", { class: "chip" }, `称号『${titleFor(name, count)}』`) : null,
      ),
      el("button", {
        class: "btn wide", onclick: () => {
          state.presetAdd = { name, category };
          state.knowledgeName = null;
          state.tab = "stock";
          renderMain();
          toast(`「${name}」を登録フォームに入れました`);
        },
      }, "この食材を在庫に登録する"),
    ),
    section("💪 からだにいいこと", el("p", { class: "k-text" }, info.body)),
    section("🌸 旬（おいしい季節）", el("p", { class: "k-text" }, info.season)),
    section("🔍 おいしいものの見分け方", el("p", { class: "k-text" }, info.choose)),
    section("💡 まめちしき", info.trivia.map((t) => el("p", { class: "k-text" }, "・" + t))),
    section("❓ 3択クイズ", el("p", { class: "k-text quiz-q" }, info.quiz.q), ...quizBtns, quizResult),
  );
  return wrap;
}

// ---------- 食材クイズゲーム（学びながら遊べるゲーム） ----------
// 図鑑タブから入る。問題は知識データ（旬・まめちしき・3択クイズ）から
// js/game.js が組み立てる。集めた食材を優先して出題し、足りなければ
// カタログから補う。結果は保存せず、在庫データには一切触れない。
function gamePool() {
  const catOf = new Map();
  for (const [, c, ns] of CATALOG) for (const n of ns) if (!catOf.has(n)) catOf.set(n, c);
  const collected = state.catalog.map((c) => ({
    name: c.name,
    category: c.category || catOf.get(c.name) || rarityCategory(c.name) || "その他",
  }));
  const seen = new Set(collected.map((p) => p.name));
  const rest = [...catOf.entries()]
    .filter(([n]) => !seen.has(n))
    .map(([name, category]) => ({ name, category }));
  // 集めた食材を中心に、プールが小さければカタログから補充する
  // （出題数が多いラウンドでは補充も多めにして顔ぶれを増やす）
  const want = state.gameCount || GAME_QUESTION_COUNT;
  return [...collected, ...rest.slice(0, Math.max(0, want * 2 - collected.length))];
}
function startGame() {
  const questions = buildGameQuestions(gamePool(), {
    count: state.gameCount || GAME_QUESTION_COUNT,
    seed: (Date.now() % 2147483646) + 1,
  });
  state.game = { questions, index: 0, phase: "ask", selected: null, flags: [], streak: 0, bestStreak: 0 };
  state.gameView = true;
  renderMain();
  try { window.scrollTo(0, 0); } catch { /* 表示専用 */ }
}
function answerGame(idx) {
  const g = state.game;
  if (!g || g.phase !== "ask") return;
  const q = g.questions[g.index];
  const correct = idx === q.answer;
  g.flags.push(correct);
  g.streak = correct ? g.streak + 1 : 0;
  if (g.streak > g.bestStreak) g.bestStreak = g.streak;
  g.selected = idx;
  g.phase = "feedback";
  renderMain();
}
function renderGamePage() {
  const wrap = el("div", {});
  const backBtn = el("button", {
    class: "btn secondary small", onclick: () => { state.gameView = false; state.game = null; renderMain(); },
  }, "← 図鑑にもどる");
  wrap.append(backBtn);
  const g = state.game;
  // スタート画面
  if (!g) {
    const hero = el("div", { class: "card knowledge-hero game-hero" },
      iconEl("トマト", "野菜"), iconEl("にんじん", "野菜"), iconEl("卵", "卵・乳製品"),
      el("div", { class: "k-name" }, "🎮 食材クイズゲーム"),
      el("p", { class: "k-text" }, "3択クイズ・旬クイズ・なまえ当てのほかに、栄養クイズ、見分け方クイズ、旬の食べ物クイズ、郷土料理クイズも出るよ。もんだいのかずを選んでね。集めた食材から問題が出るから、図鑑を集めるほど楽しくなるよ！"),
      el("div", { class: "tabs game-count-tabs", role: "tablist", "aria-label": "もんだいのかずを選ぶ" },
        GAME_COUNT_OPTIONS.map((n) => el("button", {
          class: (state.gameCount || GAME_QUESTION_COUNT) === n ? "active" : "",
          role: "tab", "aria-selected": (state.gameCount || GAME_QUESTION_COUNT) === n ? "true" : "false",
          onclick: () => { state.gameCount = n; renderMain(); },
        }, `${n}もん`))),
      el("button", { class: "btn wide", onclick: () => startGame() }, "ゲームスタート！"),
    );
    wrap.append(hero);
    return wrap;
  }
  // 結果画面
  if (g.index >= g.questions.length) {
    const result = scoreGame(g.flags);
    wrap.append(el("div", { class: "card knowledge-hero game-hero" },
      iconEl("かぼちゃ", "野菜"),
      el("div", { class: "k-name" }, "🎉 結果はっぴょう"),
      el("div", { class: "game-score" },
        el("span", { class: "chip" }, `${result.total}もん中 ${result.correct}もん せいかい`),
        el("span", { class: "chip" }, `いちばん長いれんぞくせいかいは ${result.bestStreak}もん`),
      ),
      el("p", { class: "k-text game-message" }, result.message),
      el("button", { class: "btn wide", onclick: () => startGame() }, "もう一回あそぶ"),
      el("button", { class: "btn secondary wide", onclick: () => { state.gameView = false; state.game = null; renderMain(); } }, "図鑑にもどる"),
    ));
    return wrap;
  }
  // 出題画面
  const q = g.questions[g.index];
  const scoreNow = g.flags.filter(Boolean).length;
  const heroIcon = iconEl(q.name, q.category);
  if ((q.type === "name" || q.type === "seasonfood") && g.phase === "ask") heroIcon.classList.add("game-mystery"); // 名前当て・旬の食べ物当ては答えがバレないようシルエット
  const typeLabel = {
    knowledge: "3択クイズ", season: "旬クイズ", name: "なまえ当てクイズ",
    nutrition: "栄養クイズ", choose: "見分け方クイズ", seasonfood: "旬の食べ物クイズ", regional: "郷土料理クイズ",
  }[q.type] || "3択クイズ";
  const card = el("div", { class: "card game-card" },
    el("div", { class: "game-score" },
      el("span", { class: "chip" }, `第${g.index + 1}もん / 全${g.questions.length}もん`),
      el("span", { class: "chip" }, typeLabel),
      el("span", { class: "chip" }, `スコア ${scoreNow}点`),
      g.streak >= 2 ? el("span", { class: "chip warn" }, `${g.streak}れんぞく せいかい中！`) : null,
    ),
    el("div", { class: "knowledge-hero game-hero" }, heroIcon),
    el("p", { class: "game-q" }, q.q),
  );
  const btns = q.choices.map((choice, idx) => {
    const b = el("button", {
      class: "btn secondary wide quiz-btn game-choice", type: "button",
      onclick: () => answerGame(idx),
    }, `${idx + 1}. ${choice}`);
    if (g.phase === "feedback") {
      b.disabled = true;
      if (idx === q.answer) b.classList.add("right");
      else if (idx === g.selected) b.classList.add("wrong");
    }
    return b;
  });
  card.append(...btns);
  if (g.phase === "feedback") {
    const wasCorrect = g.selected === q.answer;
    const praise = CORRECT_PRAISE[(g.streak + g.index) % CORRECT_PRAISE.length];
    card.append(
      el("p", { class: "quiz-result" + (wasCorrect ? " correct" : "") },
        wasCorrect ? `せいかい！🎉 ${praise}` : `おしい！ こたえは「${q.choices[q.answer]}」だよ`),
      el("p", { class: "k-text" }, q.explain),
      el("button", {
        class: "btn wide", onclick: () => { g.index += 1; g.phase = "ask"; g.selected = null; renderMain(); },
      }, g.index + 1 >= g.questions.length ? "結果を見る" : "つぎのもんだいへ"),
    );
  }
  wrap.append(card);
  return wrap;
}

// ---------- 在庫タブ ----------
function isLow(item) { return item.isFavorite && Number(item.quantity) <= Number(item.lowThreshold ?? 1); }

async function maybeAutoAddShopping(item) {
  if (!isLow(item)) return;
  const exists = state.shopping.some((s) => s.linkedItemId === item.id && !s.isChecked);
  if (exists) return;
  const row = await store.addShopping(state.user.id, state.fridge.id, {
    name: item.name, quantity: 1, unit: item.unit, source: "favorite", linkedItemId: item.id,
  });
  state.shopping.push(row);
  toast(`お気に入りの「${item.name}」を買い物リストに追加しました`);
}

function renderStockTab() {
  const wrap = el("div", {});
  // お知らせ
  const alerts = [];
  for (const item of state.items) {
    const d = daysUntil(item.expiryDate);
    if (d !== null && d <= 3) alerts.push(`⏰ 「${item.name}」は${expiryLabel(item.expiryDate)}（${formatDate(item.expiryDate)}）`);
    if (isLow(item)) alerts.push(`⭐ お気に入り「${item.name}」が残りわずかです`);
  }
  if (alerts.length) {
    wrap.append(el("div", { class: "card" }, el("h2", {}, "🔔 お知らせ"),
      alerts.map((a) => el("div", { class: "notice-item" }, a))));
  }
  wrap.append(renderAddItemForm());
  // 在庫の検索（名前の部分一致・カタカナ/ひらがなの揺れを吸収）。
  // 入力中に入力欄のフォーカスを失わないよう、再描画はリスト部分だけにする。
  const listBox = el("div", {});
  const updateStockList = () => listBox.replaceChildren(...stockListNodes());
  const searchInput = el("input", {
    type: "search", placeholder: "食材名で検索（例：たまご）", value: state.stockQuery || "",
  });
  searchInput.addEventListener("input", () => { state.stockQuery = searchInput.value; updateStockList(); });
  wrap.append(el("div", { class: "search-row" },
    el("span", { class: "search-icon" }, "🔍"),
    searchInput,
    el("button", {
      class: "btn ghost small", type: "button", onclick: () => {
        state.stockQuery = ""; searchInput.value = ""; updateStockList(); searchInput.focus();
      },
    }, "クリア"),
  ));
  wrap.append(listBox);
  updateStockList();
  return wrap;
}

// 在庫リスト部分（期限グループ表示）。検索文字列とも組み合わせる。
function stockListNodes() {
  const nodes = [];
  const query = state.stockQuery || "";
  const groups = [
    ["soon", "すぐ使いたい"], ["week", "今週中に"], ["later", "まだ余裕あり"],
  ];
  const sorted = [...state.items]
    .filter((i) => matchesSearch(i.name, query))
    .sort((a, b) => {
      const da = daysUntil(a.expiryDate), db = daysUntil(b.expiryDate);
      if (da === null && db === null) return a.name.localeCompare(b.name);
      if (da === null) return 1; if (db === null) return -1; return da - db;
    });
  if (state.items.length === 0) {
    nodes.push(el("div", { class: "card" }, el("p", { class: "empty" }, "まだ食材がありません。\n上のフォームから登録してみましょう。")));
    return nodes;
  }
  if (sorted.length === 0) {
    nodes.push(el("div", { class: "card" }, el("p", { class: "empty" }, `「${query}」に合う食材がありませんでした。\n別の名前で探してみてください。`)));
    return nodes;
  }
  if (query) nodes.push(el("p", { class: "hint" }, `「${query}」の検索結果：${sorted.length}件`));
  for (const [key, label] of groups) {
    const rows = sorted.filter((i) => expiryGroup(i.expiryDate) === key);
    if (!rows.length) continue;
    nodes.push(el("h3", { class: "group-title" }, el("span", { class: "dot " + key }), label));
    for (const item of rows) nodes.push(renderItemCard(item));
  }
  return nodes;
}

function renderItemCard(item) {
  const d = daysUntil(item.expiryDate);
  const meta = [
    el("span", { class: "chip" }, item.category),
    el("span", { class: "chip" }, item.storage),
    item.expiryDate ? el("span", { class: "chip" + (d !== null && d <= 2 ? " soon-chip" : "") }, `期限 ${formatDate(item.expiryDate)}・${expiryLabel(item.expiryDate)}`) : null,
    isLow(item) ? el("span", { class: "chip warn" }, "残りわずか") : null,
  ];
  const iconTile = iconEl(item.name, item.category);
  iconTile.classList.add("tile");
  iconTile.title = "食材の知識を見る";
  iconTile.style.cursor = "pointer";
  iconTile.addEventListener("click", () => openKnowledge(item.name, item.category));
  const card = el("div", { class: "card item-card" },
    item.photoDataUrl ? el("img", { class: "item-photo", src: item.photoDataUrl, alt: item.name }) : iconTile,
    el("div", { class: "item-main" },
      el("div", { class: "item-name" }, item.isFavorite ? el("span", { class: "star" }, "★ ") : null, item.name),
      el("div", { class: "item-meta" }, meta),
    ),
    el("div", { class: "qty-ctrl" },
      el("button", { class: "qty-btn", onclick: () => changeQty(item, -1) }, "−"),
      el("span", { class: "qty-num" }, `${fmtQtyValue(item.quantity, item.unit)}${item.unit || ""}`),
      el("button", { class: "qty-btn", onclick: () => changeQty(item, 1) }, "+"),
    ),
    el("button", {
      class: "icon-btn", title: "食材の知識（食育）", onclick: () => openKnowledge(item.name, item.category),
    }, "📖"),
    el("button", {
      class: "icon-btn", title: "削除", onclick: async () => {
        if (!confirm(`「${item.name}」を削除しますか？`)) return;
        const snapshot = { ...item };
        await store.deleteItem(state.user.id, item.id);
        // 本番モードはゴミ箱が端末内に無いので、この画面の間だけ復元用に保持する
        if (store.mode !== "demo") state.sessionTrash = [snapshot, ...state.sessionTrash].slice(0, 30);
        await refreshData(); renderMain();
        toastWithAction(`「${item.name}」を削除しました`, "元に戻す", async () => {
          await store.restoreDeletedItem(state.user.id, state.fridge.id, snapshot);
          state.sessionTrash = state.sessionTrash.filter((t) => t.id !== snapshot.id);
          await refreshData(); renderMain(); toast("元に戻しました");
        });
      },
    }, "🗑"),
  );
  card.style.padding = "12px 14px";
  return card;
}

async function changeQty(item, delta) {
  // 「玉」単位は 1/4 玉刻み、それ以外は 1 刻みで増減する
  const prev = Number(item.quantity);
  const next = Math.max(0, roundQty(prev + delta * qtyStepFor(item.unit)));
  if (next === prev) return;
  await store.updateItem(state.user.id, item.id, { quantity: next });
  item.quantity = next;
  await maybeAutoAddShopping(item);
  await refreshData();
  renderMain();
  toastWithAction(`「${item.name}」の数量を ${fmtQtyValue(next, item.unit)}${item.unit || ""} に変更しました`, "元に戻す", async () => {
    await store.updateItem(state.user.id, item.id, { quantity: prev });
    await refreshData(); renderMain(); toast("数量を元に戻しました");
  });
}

function renderAddItemForm() {
  const name = el("input", { type: "text", placeholder: "例）鶏もも肉" });
  const category = el("select", {}, CATEGORIES.map((c) => el("option", { value: c }, c)));
  const qty = el("input", { type: "number", value: "1", min: "0", step: "0.5" });
  const unit = el("input", { type: "text", placeholder: "個 / 本 / 玉 / 袋 / g", list: "unit-suggestions" });
  const unitList = el("datalist", { id: "unit-suggestions" },
    ["個", "本", "玉", "袋", "パック", "g", "kg", "mL", "L", "丁", "枚", "かけ", "缶", "箱"].map((u) => el("option", { value: u })));
  // 「玉」単位のときだけ出す分数クイック選択（白菜・キャベツなどの頭野菜用）
  const FRACS = [[0.25, "1/4玉"], [0.5, "半玉（1/2）"], [0.75, "3/4玉"], [1, "1玉"], [1.5, "1玉半"], [2, "2玉"]];
  const fracRow = el("div", { class: "frac-row", style: "display:none" },
    el("span", { class: "frac-label" }, "分数で選ぶ："),
    FRACS.map(([v, label]) => el("button", {
      type: "button", class: "frac-chip",
      onclick: () => { qty.value = String(v); },
    }, label)));
  // 食材名に合わせてアイコンをプレビュー表示（図鑑と同じアイコン）
  const namePreview = el("div", { class: "name-preview" }, iconEl("", category.value), "食材名を入れるとアイコンが出ます");
  const updateNamePreview = () => {
    namePreview.replaceChildren(iconEl(name.value, category.value),
      name.value.trim() ? `「${name.value.trim()}」のアイコン` : "食材名を入れるとアイコンが出ます");
  };
  name.addEventListener("input", updateNamePreview);
  category.addEventListener("change", updateNamePreview);
  if (state.presetAdd) { // 図鑑からの下書きを反映（1回だけ使う）
    name.value = state.presetAdd.name;
    if (CATEGORIES.includes(state.presetAdd.category)) category.value = state.presetAdd.category;
    if (state.presetAdd.unit) unit.value = state.presetAdd.unit;
    state.presetAdd = null;
    updateNamePreview();
  }
  const expiry = el("input", { type: "date", value: todayISO() });
  const storageSel = el("select", {}, STORAGES.map((s) => el("option", { value: s }, s)));
  const fav = el("input", { type: "checkbox" });
  const threshold = el("input", { type: "number", value: "1", min: "0", step: "0.5" });
  // 単位が「玉」のときは数量・しきい値を 1/4 刻みにし、分数クイック選択を出す
  const updateUnitUI = () => {
    const tama = isFractionUnit(unit.value);
    qty.step = tama ? "0.25" : "0.5";
    threshold.step = tama ? "0.25" : "0.5";
    fracRow.style.display = tama ? "" : "none";
  };
  unit.addEventListener("input", updateUnitUI);
  unit.addEventListener("change", updateUnitUI);
  updateUnitUI();
  // ---- よく買うもの／最近登録したもの（ワンタップ再登録） ----
  // 図鑑の購入回数と直近の登録から候補を出し、タップで名前・カテゴリ・単位を
  // フォームに入れる。あとは「登録する」を押すだけで再登録できる。
  const applyQuickPick = (n, c, u) => {
    name.value = n;
    if (c && CATEGORIES.includes(c)) category.value = c;
    if (u) unit.value = u;
    updateNamePreview(); updateUnitUI();
    try { name.focus(); } catch { /* noop */ }
    toast(`「${n}」をフォームに入れました。内容を確認して「登録する」を押してください`);
  };
  const quickChip = (label, sub, onclick) => el("button", {
    type: "button", class: "quick-chip", onclick,
  }, label, sub ? el("span", { class: "quick-sub" }, sub) : null);
  const quickKids = [];
  const top = topPurchased(state.catalog, 8);
  if (top.length) {
    quickKids.push(el("div", { class: "quick-label" }, "⭐ よく買うもの（タップで入力）"));
    quickKids.push(el("div", { class: "quick-row" }, top.map((c) => {
      const known = state.items.find((i) => i.name === c.name);
      return quickChip(c.name, `${c.purchaseCount ?? 1}回`, () =>
        applyQuickPick(c.name, rarityCategory(c.name) || (known ? known.category : ""), known ? known.unit : ""));
    })));
  }
  const recent = recentRegistered(state.items, 8);
  if (recent.length) {
    quickKids.push(el("div", { class: "quick-label" }, "🕘 最近登録したもの"));
    quickKids.push(el("div", { class: "quick-row" }, recent.map((i) =>
      quickChip(i.name, "", () => applyQuickPick(i.name, i.category, i.unit)))));
  }
  const quickBox = quickKids.length ? el("div", { class: "quick-box" }, ...quickKids) : null;
  const form = el("div", { class: "card" },
    el("h2", {}, "＋ 食材を登録"),
    quickBox,
    el("label", {}, "食材名"), name, namePreview,
    el("div", { class: "form-grid" },
      el("div", {}, el("label", {}, "カテゴリ"), category),
      el("div", {}, el("label", {}, "保管場所"), storageSel),
      el("div", {}, el("label", {}, "数量"), qty),
      el("div", {}, el("label", {}, "単位"), unit),
      el("div", {}, el("label", {}, "賞味・消費期限"), expiry),
      el("div", {}, el("label", {}, "残りわずか判定（お気に入り用）"), threshold),
    ),
    unitList,
    fracRow,
    el("p", { class: "hint" }, "白菜・キャベツなどの頭野菜は、単位を「玉」にすると半玉（1/2）・1/4玉・3/4玉のような分数で登録できます。"),
    el("label", { class: "check-line" }, fav, "お気に入りにする（少なくなったら買い物リストへ自動追加）"),
    el("button", {
      class: "btn wide", onclick: async () => {
        if (!name.value.trim()) { toast("食材名を入力してください"); return; }
        try {
          const beforeCounts = catalogCountsBefore();
          const item = await store.addItem(state.user.id, state.fridge.id, {
            name: name.value.trim(), category: category.value, quantity: roundQty(Number(qty.value) || 1),
            unit: unit.value.trim(), expiryDate: expiry.value || null, storage: storageSel.value,
            isFavorite: fav.checked, lowThreshold: roundQty(Number(threshold.value) || 0),
          });
          await refreshData(); renderMain();
          if (!celebratePurchase(item.name, beforeCounts)) toast(`「${item.name}」を登録しました`);
        } catch (e) { toast(e.message); }
      },
    }, "登録する"),
  );
  return form;
}

// ---------- 食材図鑑タブ ----------
// 在庫に登録した食材が自動でコレクションされる図鑑（スコープは冷蔵庫単位）。
// 定番カタログはカラー/薄いの対比で「集める楽しさ」を出し、
// セルをタップすると、その食材を在庫登録フォームに下書きして在庫タブへ進む。
function renderZukanTab() {
  const wrap = el("div", {});
  const collected = new Map(state.catalog.map((c) => [c.name, c]));
  const catalogNames = new Set(CATALOG.flatMap(([, , names]) => names));
  const totalInCatalog = catalogNames.size;
  const gotInCatalog = [...catalogNames].filter((n) => collected.has(n)).length;
  const extras = state.catalog.filter((c) => !catalogNames.has(c.name));
  // レアリティ別の収集状況（激レアは別枠で見せて「集める楽しさ」を出す）
  const tierNames = (tier) => CATALOG.flatMap(([, , names]) => names).filter((n) => rarityOf(n) === tier);
  const ultraNames = tierNames("ultra"), rareNames = tierNames("rare");
  const ultraGot = ultraNames.filter((n) => collected.has(n)).length;
  const rareGot = rareNames.filter((n) => collected.has(n)).length;
  const filterBtn = (key, label) => el("button", {
    class: state.zukanFilter === key ? "active" : "",
    onclick: () => { state.zukanFilter = key; renderMain(); },
  }, label);
  wrap.append(el("div", { class: "card" },
    el("h2", {}, "📖 食材図鑑"),
    el("p", { class: "hint" }, "食材を在庫に登録すると、図鑑にも自動で記録されます。家族みんなで1つの図鑑を育てましょう。お買い物で見つけたらゲット！セルをタップすると、その食材の知識（食育）ページが開きます。買った回数が増えると食材のレベルが上がって称号がつきます。"),
    el("div", { class: "zukan-progress" },
      el("span", { class: "zukan-count" }, `${gotInCatalog} / ${totalInCatalog}`),
      el("span", {}, "種類をコレクション中"),
      extras.length ? el("span", { class: "chip" }, `カタログ外 ${extras.length} 種`) : null,
    ),
    el("div", { class: "zukan-bar" }, el("div", { class: "zukan-bar-fill", style: `width:${totalInCatalog ? Math.round((gotInCatalog / totalInCatalog) * 100) : 0}%` })),
    el("div", { class: "zukan-rare-progress" },
      el("span", { class: "rare-chip ultra" }, `激レア ${ultraGot}/${ultraNames.length} ゲット`),
      el("span", { class: "rare-chip rare" }, `レア ${rareGot}/${rareNames.length} ゲット`),
    ),
    el("div", { class: "tabs zukan-filter" },
      filterBtn("all", "すべて"),
      filterBtn("ultra", "激レアだけ"),
      filterBtn("rare", "レアだけ"),
    ),
    el("button", {
      class: "btn wide", onclick: () => { state.game = null; state.gameView = true; renderMain(); },
    }, "🎮 食材クイズゲームであそぶ"),
    el("p", { class: "hint" }, "集めた食材の旬やまめちしきがクイズになるよ。遊びながら食材に詳しくなろう！"),
  ));
  const cellFor = (name, category) => {
    const rec = collected.get(name);
    const tier = rarityOf(name);
    const icon = iconEl(name, category);
    if (!rec) icon.classList.add(tier ? "mystery" : "locked");
    const kids = [icon, el("span", { class: "zukan-name" }, name)];
    if (tier === "ultra") kids.push(el("span", { class: "rare-badge ultra" }, "激レア！"));
    else if (tier === "rare") kids.push(el("span", { class: "rare-badge rare" }, "レア"));
    if (rec) {
      const count = rec.purchaseCount ?? 1;
      const lv = levelForCount(count);
      const title = titleFor(name, count);
      kids.push(el("span", { class: "zukan-lv" }, `Lv${lv} ・ ${count}回`));
      if (title) kids.push(el("span", { class: "zukan-title" }, `『${title}』`));
      kids.push(el("span", { class: "zukan-next" }, `あと${remainingToNextLevel(count)}回で Lv${lv + 1}`));
    } else {
      kids.push(el("span", { class: "zukan-state" }, tier ? "❓ 未発見" : "まだ"));
    }
    return el("button", {
      type: "button",
      class: "zukan-cell" + (rec ? " got" : "") + (tier ? ` tier-${tier}` : ""),
      title: rec ? `${name}（${rec.firstAddedAt || ""} に初登録）` : `${name}（まだ見つけていません）`,
      onclick: () => openKnowledge(name, rarityCategory(name) || category),
    }, ...kids);
  };
  for (const [group, category, names] of CATALOG) {
    const shown = state.zukanFilter === "all" ? names : names.filter((n) => rarityOf(n) === state.zukanFilter);
    if (!shown.length) continue;
    wrap.append(el("h3", { class: "group-title" }, el("span", { class: "dot week" }), group));
    wrap.append(el("div", { class: "zukan-grid" }, shown.map((n) => cellFor(n, category))));
  }
  if (extras.length && state.zukanFilter === "all") {
    wrap.append(el("h3", { class: "group-title" }, el("span", { class: "dot later" }), "自分で追加した食材"));
    wrap.append(el("div", { class: "zukan-grid" }, extras.map((c) => cellFor(c.name, c.category))));
  }
  return wrap;
}

// ---------- 買い物タブ ----------
const SOURCE_LABEL = { manual: "手入力", favorite: "お気に入り", recipe: "レシピの材料" };
function renderShoppingTab() {
  const wrap = el("div", {});
  const name = el("input", { type: "text", placeholder: "買うもの（例：牛乳）" });
  wrap.append(el("div", { class: "card" },
    el("h2", {}, "🛒 買い物リスト"),
    state.shopping.length === 0
      ? el("p", { class: "empty" }, "リストは空です。\nお気に入りが少なくなると自動で追加されます。")
      : state.shopping.map((s) => el("div", { class: "shop-row" },
          // おつかいの子が見分けやすいよう、キャラ＋名前を大きく目立たせる
          // キャラ／名前タップで食材の知識ページ（食育）にも行ける
          el("span", { class: "grow shop-main" },
            el("span", { class: "k-link", title: "食材の知識を見る", onclick: () => openKnowledge(s.name) }, iconEl(s.name)),
            el("span", { class: "shop-name k-link", title: "食材の知識を見る", onclick: () => openKnowledge(s.name) }, s.name), " ",
            rarityOf(s.name) === "ultra" ? el("span", { class: "rare-chip ultra" }, "激レア！") : rarityOf(s.name) === "rare" ? el("span", { class: "rare-chip rare" }, "レア") : null,
            el("span", { class: "chip" }, `${fmtQtyValue(s.quantity, s.unit)}${s.unit || ""}`),
            el("span", { class: "chip" }, SOURCE_LABEL[s.source] || "")),
          el("button", {
            class: "btn small", onclick: async () => {
              try {
                const beforeCounts = catalogCountsBefore();
                if (s.linkedItemId) {
                  const item = state.items.find((i) => i.id === s.linkedItemId);
                  if (item) {
                    await store.updateItem(state.user.id, item.id, { quantity: Number(item.quantity) + Number(s.quantity) });
                    // 数量を足すだけの経路でも「買った」として図鑑の購入回数を数える
                    await store.recordPurchase(state.user.id, state.fridge.id, s.name, rarityCategory(s.name) || "その他");
                  }
                } else {
                  await store.addItem(state.user.id, state.fridge.id, {
                    name: s.name, category: rarityCategory(s.name) || "その他", quantity: Number(s.quantity) || 1, unit: s.unit || "",
                    expiryDate: null, storage: "冷蔵庫", isFavorite: false, lowThreshold: 1,
                  });
                }
                await store.deleteShopping(state.user.id, s.id);
                await refreshData(); renderMain();
                if (!celebratePurchase(s.name, beforeCounts)) toast(`「${s.name}」を在庫に戻しました`);
              } catch (e) { toast(e.message); }
            },
          }, "買った！"),
          el("button", {
            class: "icon-btn", onclick: async () => {
              await store.deleteShopping(state.user.id, s.id);
              await refreshData(); renderMain();
            },
          }, "✕"),
        )),
    el("h3", {}, "買い物を追加"),
    name,
    el("button", {
      class: "btn secondary wide", onclick: async () => {
        if (!name.value.trim()) { toast("買うものを入力してください"); return; }
        await store.addShopping(state.user.id, state.fridge.id, { name: name.value.trim(), quantity: 1, unit: "", source: "manual" });
        await refreshData(); renderMain();
      },
    }, "リストに追加"),
  ));
  return wrap;
}

// ---------- レシピタブ ----------
// お気に入りは「レシピ×モード」をキーに、レシピの内容そのもの
// （名前・材料・分量・手順）をスナップショット保存する。
// レシピは在庫から都度生成されるため、保存しておかないと後で見返せない。
function recipeKeyOf(recipe, mode) { return `${recipe.id}:${mode}`; }
function findFavorite(recipe, mode) {
  return state.favRecipes.find((f) => f.recipeKey === recipeKeyOf(recipe, mode));
}
async function toggleRecipeFavorite(recipe, mode, size) {
  const existing = findFavorite(recipe, mode);
  try {
    if (existing) {
      await store.removeFavoriteRecipe(state.user.id, state.fridge.id, existing.id);
      state.favRecipes = state.favRecipes.filter((f) => f.id !== existing.id);
      toast("レシピのお気に入りを外しました");
    } else {
      const snapshot = {
        recipeKey: recipeKeyOf(recipe, mode), recipeId: recipe.id, mode,
        title: recipe.title, minutes: recipe.minutes, tip: recipe.tip || "",
        steps: [...recipe.steps],
        have: recipe.have.map((i) => ({ ...i })), missing: recipe.missing.map((i) => ({ ...i })),
        servings: size,
      };
      const saved = await store.addFavoriteRecipe(state.user.id, state.fridge.id, snapshot);
      state.favRecipes = [...state.favRecipes.filter((f) => f.recipeKey !== saved.recipeKey), saved];
      toast("レシピをお気に入りに保存しました");
    }
  } catch (e) { toast(e.message); }
  renderMain();
}
function favStarBtn(active, onclick) {
  return el("button", {
    class: "fav-btn" + (active ? " active" : ""), type: "button",
    title: active ? "お気に入りから外す" : "お気に入りに保存",
    "aria-label": active ? "お気に入りから外す" : "お気に入りに保存",
    onclick,
  }, active ? "★" : "☆");
}
async function addMissingToShopping(missing) {
  for (const m of missing)
    await store.addShopping(state.user.id, state.fridge.id, { name: m.name, quantity: m.amount, unit: m.unit, source: "recipe" });
  await refreshData(); toast("足りない材料を買い物リストに追加しました");
}
/** 材料行の消費順メモ（どのロットから使うかを家族に伝える） */
function fifoNote(ing) {
  const f = ing.fifo;
  if (!f) return "";
  const parts = [];
  if (f.expiryDate) parts.push(`期限 ${formatDate(f.expiryDate)} の分から`);
  else if (f.registeredAt) parts.push(`${formatDate(f.registeredAt)} に買った分から`);
  if (f.lotCount > 1) parts.push(`在庫${f.lotCount}件中`);
  return parts.length ? `（${parts.join("・")}）` : "";
}
function renderRecipeCard(r, { servingsLabel, starBtn, savedNote = "" }) {
  return el("div", { class: "card recipe-card" },
    el("div", { class: "recipe-head" },
      el("h2", { class: "grow" }, r.title),
      starBtn,
    ),
    el("div", { class: "recipe-chips" },
      r.minutes ? el("span", { class: "chip" }, `約${r.minutes}分`) : null,
      servingsLabel ? el("span", { class: "chip" }, servingsLabel) : null,
      savedNote ? el("span", { class: "chip" }, savedNote) : null,
      r.course ? el("span", { class: "chip" }, r.course) : null,
      r.genre ? el("span", { class: "chip" }, `${r.genre}・${r.method || ""}`) : null,
      r.useUp ? el("span", { class: "chip" }, "使い切り") : null,
      // 消費順の見える化: 期限の近いもの→先に買ったものの順で使うことを明示
      r.have.some((i) => i.fifo) ? el("span", { class: "chip fifo-chip" }, "期限の近いものから使います") : null,
    ),
    el("div", { class: "recipe-ing" },
      r.have.map((i) => el("div", { class: "have" }, "✓ ", iconEl(i.name), ` ${i.name} … ${fmtQtyValue(i.amount, i.unit)}${i.unit}`,
        i.fifo ? el("span", { class: "fifo-note" }, fifoNote(i)) : null)),
      r.missing.map((i) => el("div", { class: "missing" }, "＋ ", iconEl(i.name), ` ${i.name} … ${fmtQtyValue(i.amount, i.unit)}${i.unit}（買い足し）`)),
    ),
    el("ol", { class: "recipe-steps" }, r.steps.map((s) => el("li", {}, s))),
    r.tip ? el("p", { class: "hint" }, "💡 " + r.tip) : null,
    r.note ? el("p", { class: "hint region-note" }, "📍 " + (r.pref ? `【${r.pref}】` : "") + r.note) : null,
    r.missing.length ? el("button", {
      class: "btn secondary small", onclick: () => addMissingToShopping(r.missing),
    }, "足りない材料を買い物リストへ") : null,
  );
}
/**
 * イベント献立セクション: 行事を選ぶと、その行事の献立セット
 * （主菜・副菜・汁物/行事食・デザート）を通常レシピと同じカードで表示する。
 * 材料は在庫と照合して「ある／買い足し」を分け、不足分はまとめて
 * 買い物リストへ追加できる。分量は家族人数で換算する。
 */
function renderEventMenuSection(size) {
  const wrap = el("div", {});
  const selectedId = state.eventMenuId || EVENT_MENUS[0].id;
  const menu = suggestEventMenu(selectedId, state.items, { servings: size });
  const head = el("div", { class: "card" },
    el("h2", {}, "🎉 イベント献立"),
    el("p", { class: "hint" }, "行事タブを選ぶと、その日の献立セットが出ます。材料は今の在庫と比べて「あるもの／買い足し」を表示し、足りないものはまとめて買い物リストに入れられます。"),
    el("div", { class: "event-grid event-tabs", role: "tablist", "aria-label": "行事を選ぶ" },
      EVENT_MENUS.map((ev) => el("button", {
        class: "event-chip" + (ev.id === selectedId ? " active" : ""),
        role: "tab",
        "aria-selected": ev.id === selectedId ? "true" : "false",
        onclick: () => { state.eventMenuId = ev.id; renderMain(); },
      }, `${ev.emoji} ${ev.name}`))),
  );
  wrap.append(head);
  if (!menu) return wrap;
  const ev = menu.event;
  wrap.append(el("div", { class: "card event-head" },
    el("h2", {}, `${ev.emoji} ${ev.name}の献立`),
    el("div", { class: "recipe-chips" },
      el("span", { class: "chip" }, ev.when),
      el("span", { class: "chip" }, `${size}人分`),
      el("span", { class: "chip" }, `全${menu.dishes.length}品・合計 約${menu.totalMinutes}分`),
      el("span", { class: "chip" }, `在庫にある材料 ${menu.haveCount}品`),
      menu.missingCount ? el("span", { class: "chip warn" }, `買い足し ${menu.missingCount}品`) : el("span", { class: "chip" }, "全部そろっています"),
    ),
    el("p", { class: "k-text" }, ev.note),
    menu.missingAll.length ? el("button", {
      class: "btn secondary", onclick: () => addMissingToShopping(menu.missingAll),
    }, "イベントの足りない材料をまとめて買い物リストへ") : null,
  ));
  for (const d of menu.dishes) {
    const fav = findFavorite(d, state.recipeMode);
    wrap.append(renderRecipeCard(d, {
      servingsLabel: `${size}人分`,
      starBtn: favStarBtn(!!fav, () => toggleRecipeFavorite(d, state.recipeMode, size)),
    }));
  }
  return wrap;
}
/**
 * 郷土料理セクション: 地域タブを選ぶと、その土地の郷土料理・名物グルメの
 * 献立セットをイベント献立と同じカードで表示する。各料理には子ども向けの
 * 由来メモ（note）が付き、不足分はまとめて買い物リストへ追加できる。
 */
function renderRegionalMenuSection(size) {
  const wrap = el("div", {});
  const selectedId = state.regionId || REGIONS[0].id;
  const menu = suggestRegionalMenu(selectedId, state.items, { servings: size });
  const head = el("div", { class: "card" },
    el("h2", {}, "🗾 郷土料理・名物グルメ"),
    el("p", { class: "hint" }, "地域タブを選ぶと、その土地の名物料理の献立が出ます。材料は今の在庫と比べて「あるもの／買い足し」を表示し、足りないものはまとめて買い物リストに入れられます。料理の📍メモは、その土地ならではの由来です。"),
    el("div", { class: "event-grid event-tabs", role: "tablist", "aria-label": "地域を選ぶ" },
      REGIONS.map((r) => el("button", {
        class: "event-chip" + (r.id === selectedId ? " active" : ""),
        role: "tab",
        "aria-selected": r.id === selectedId ? "true" : "false",
        onclick: () => { state.regionId = r.id; renderMain(); },
      }, `${r.emoji} ${r.name}`))),
  );
  wrap.append(head);
  if (!menu) return wrap;
  const region = menu.region;
  wrap.append(el("div", { class: "card event-head" },
    el("h2", {}, `${region.emoji} ${region.name}の献立`),
    el("div", { class: "recipe-chips" },
      el("span", { class: "chip" }, `${size}人分`),
      el("span", { class: "chip" }, `全${menu.dishes.length}品・合計 約${menu.totalMinutes}分`),
      el("span", { class: "chip" }, `全国 ${REGIONS.reduce((s, r) => s + r.dishes.length, 0)}品・全47都道府県の名物`),
      el("span", { class: "chip" }, `在庫にある材料 ${menu.haveCount}品`),
      menu.missingCount ? el("span", { class: "chip warn" }, `買い足し ${menu.missingCount}品`) : el("span", { class: "chip" }, "全部そろっています"),
    ),
    el("p", { class: "k-text" }, region.intro),
    menu.missingAll.length ? el("button", {
      class: "btn secondary", onclick: () => addMissingToShopping(menu.missingAll),
    }, "この地域の足りない材料をまとめて買い物リストへ") : null,
  ));
  for (const d of menu.dishes) {
    const fav = findFavorite(d, state.recipeMode);
    wrap.append(renderRecipeCard(d, {
      servingsLabel: `${size}人分`,
      starBtn: favStarBtn(!!fav, () => toggleRecipeFavorite(d, state.recipeMode, size)),
    }));
  }
  return wrap;
}
function renderRecipesTab() {
  const wrap = el("div", {});
  const size = state.settings.familySize || 2;
  wrap.append(el("div", { class: "card" },
    el("h2", {}, "🍳 レシピ・献立"),
    el("div", { class: "stepper" },
      el("span", {}, "家族の人数"),
      el("button", { class: "qty-btn", onclick: () => setFamilySize(size - 1) }, "−"),
      el("span", { class: "num" }, `${size}人分`),
      el("button", { class: "qty-btn", onclick: () => setFamilySize(size + 1) }, "+"),
    ),
    el("div", { class: "tabs recipe-view-tabs", style: "margin-top:12px", role: "tablist", "aria-label": "レシピの表示を切り替える" },
      el("button", { class: state.recipeView === "suggest" ? "active" : "", role: "tab", "aria-selected": state.recipeView === "suggest" ? "true" : "false", onclick: () => { state.recipeView = "suggest"; renderMain(); } }, "おすすめ"),
      el("button", { class: state.recipeView === "event" ? "active" : "", role: "tab", "aria-selected": state.recipeView === "event" ? "true" : "false", onclick: () => { state.recipeView = "event"; renderMain(); } }, "🎉 イベント献立"),
      el("button", { class: state.recipeView === "region" ? "active" : "", role: "tab", "aria-selected": state.recipeView === "region" ? "true" : "false", onclick: () => { state.recipeView = "region"; renderMain(); } }, "🗾 郷土料理"),
      el("button", { class: state.recipeView === "favorites" ? "active" : "", role: "tab", "aria-selected": state.recipeView === "favorites" ? "true" : "false", onclick: () => { state.recipeView = "favorites"; renderMain(); } }, `★ お気に入り（${state.favRecipes.length}）`),
    ),
    state.recipeView === "suggest" ? el("div", { class: "tabs" },
      el("button", { class: state.recipeMode === "stock" ? "active" : "", onclick: () => { state.recipeMode = "stock"; renderMain(); } }, "あるもので作る"),
      el("button", { class: state.recipeMode === "shop" ? "active" : "", onclick: () => { state.recipeMode = "shop"; renderMain(); } }, "買い出しで作る"),
    ) : null,
    el("p", { class: "hint" }, state.recipeView === "favorites"
      ? "★で保存したレシピです。保存したときの材料・分量・手順をそのまま表示します。★を押すと取り消せます。"
      : state.recipeView === "event"
        ? "ハロウィン・クリスマス・お正月・冬至などの行事の献立です。下の行事タブを選ぶと献立が切り替わります。分量は家族の人数に合わせてあります。"
      : state.recipeView === "region"
        ? "北海道から沖縄まで、地域の郷土料理・名物グルメの献立です。下の地域タブを選ぶと献立が切り替わります。各料理に、その土地の由来メモが付いています。"
      : state.recipeMode === "stock"
        ? "登録されている食材だけで作れるレシピです（買い足しなし）。食材は消費期限の近いもの→先に買ったものの順で使う前提で提案します。気に入ったレシピは☆で保存できます。"
        : "あと少し買い足せば作れるレシピです。足りない材料は買い物リストに追加できます。食材は消費期限の近いもの→先に買ったものの順で使う前提で提案します。気に入ったレシピは☆で保存できます。"),
  ));
  if (state.recipeView === "favorites") {
    if (state.favRecipes.length === 0) {
      wrap.append(el("div", { class: "card" }, el("p", { class: "empty" },
        "まだお気に入りレシピがありません。\n「おすすめ」のレシピカードの☆を押すと、ここに残しておけます。")));
    }
    for (const f of state.favRecipes) {
      wrap.append(renderRecipeCard(f, {
        servingsLabel: f.servings ? `保存時 ${f.servings}人分` : "",
        savedNote: f.mode === "shop" ? "買い出しで作る" : "あるもので作る",
        starBtn: favStarBtn(true, async () => {
          try {
            await store.removeFavoriteRecipe(state.user.id, state.fridge.id, f.id);
            state.favRecipes = state.favRecipes.filter((x) => x.id !== f.id);
            toast("レシピのお気に入りを外しました");
          } catch (e) { toast(e.message); }
          renderMain();
        }),
      }));
    }
    return wrap;
  }
  // イベント献立タブ（ハロウィン・クリスマス・お正月・冬至など）: 行事タブで献立を切り替える
  if (state.recipeView === "event") {
    wrap.append(renderEventMenuSection(size));
    return wrap;
  }
  // 郷土料理タブ（北海道〜沖縄）: 地域タブで献立を切り替える
  if (state.recipeView === "region") {
    wrap.append(renderRegionalMenuSection(size));
    return wrap;
  }
  const recipes = suggestRecipes(state.items, { mode: state.recipeMode, servings: size });
  // 献立セット（主菜＋副菜＋汁物）: 在庫だけで揃う場合だけ先頭に出す
  if (state.recipeMode === "stock") {
    const set = suggestMealSet(state.items, { servings: size });
    if (set && set.recipes.length >= 2) {
      wrap.append(el("div", { class: "card" },
        el("h2", {}, "🍽 今日の献立セット"),
        el("p", { class: "hint" }, `主菜＋副菜＋汁物の組み合わせです（合計 約${set.totalMinutes}分・${size}人分）。食材は期限の近いものから使います。`),
        set.recipes.map((r) => el("div", { class: "fridge-row" },
          el("span", { class: "chip" }, r.course), el("span", { class: "grow" }, r.title),
          el("span", { class: "chip" }, `${r.genre}・${r.method}`))),
      ));
    }
  }
  if (recipes.length === 0) {
    wrap.append(el("div", { class: "card" }, el("p", { class: "empty" },
      state.recipeMode === "stock"
        ? "今の在庫だけで作れるレシピがまだありません。\n「買い出しで作る」も見てみてください。"
        : "提案できるレシピがありません。在庫を登録すると提案が増えます。")));
  }
  for (const r of recipes) {
    const fav = findFavorite(r, state.recipeMode);
    wrap.append(renderRecipeCard(r, {
      servingsLabel: `${size}人分`,
      starBtn: favStarBtn(!!fav, () => toggleRecipeFavorite(r, state.recipeMode, size)),
    }));
  }
  return wrap;
}
async function setFamilySize(n) {
  const size = Math.min(10, Math.max(1, n));
  state.settings = await store.updateSettings(state.user.id, state.fridge.id, { familySize: size });
  renderMain();
}

// ---------- 共有・設定タブ ----------
function joinUrl(code) {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("join", code);
  return url.toString();
}
function renderSettingsTab() {
  const wrap = el("div", {});
  const fridge = state.fridge;
  const isOwner = fridge.role === "owner" || fridge.ownerId === state.user.id;
  const size = state.settings.familySize || 2;

  // 共有（フレンドコード + QR）
  const shareCard = el("div", { class: "card" }, el("h2", {}, "🔗 冷蔵庫をシェア"));
  if (isOwner && state.inviteCode) {
    const code = state.inviteCode;
    const url = joinUrl(code);
    const canvas = el("canvas", {});
    shareCard.append(
      el("p", { class: "hint" }, "家族にこのフレンドコードを伝えるか、QRコードを読み取ってもらうと、同じ冷蔵庫に参加できます。QRコードはこの端末の中で生成しており、コードが外部に送信されることはありません。"),
      el("div", { class: "code-box" }, el("div", { class: "code-text" }, code)),
      el("div", { class: "qr-wrap" }, canvas, el("span", { class: "hint" }, "カメラで読み取ると参加コードが自動入力されます")),
      el("div", { class: "tabs" },
        el("button", {
          onclick: async () => {
            try { await navigator.clipboard.writeText(url); toast("参加用リンクをコピーしました"); }
            catch { toast(url); }
          },
        }, "参加リンクをコピー"),
        el("button", {
          onclick: async () => {
            if (!confirm("コードを再発行すると、今のコードとQRは使えなくなります。よろしいですか？")) return;
            try {
              const newCode = await store.regenerateCode(state.user.id, fridge.id);
              // サーバー側の平文コード表示を最新化するため再取得
              state.inviteCode = (await store.getInviteCode(state.user.id, fridge.id).catch(() => null)) || formatCode(newCode);
              renderMain(); toast("新しいコードを発行しました");
            } catch (e) { toast(e.message); }
          },
        }, "コードを再発行"),
      ),
    );
    requestAnimationFrame(() => { try { qrToCanvas(canvas, url, { scale: 5 }); } catch { /* 長すぎる場合はコードのみ */ } });
  } else {
    shareCard.append(el("p", { class: "hint" }, isOwner
      ? "フレンドコードを取得できませんでした。「コードを再発行」すると表示されます。"
      : "フレンドコードとQRコードは、冷蔵庫を作った人だけが表示できます。参加したい家族がいる場合は、作成者にコードを教えてもらってください。"));
    if (isOwner) {
      shareCard.append(el("button", {
        class: "btn secondary", onclick: async () => {
          try {
            const newCode = await store.regenerateCode(state.user.id, fridge.id);
            state.inviteCode = (await store.getInviteCode(state.user.id, fridge.id).catch(() => null)) || formatCode(newCode);
            renderMain(); toast("コードを発行しました");
          } catch (e) { toast(e.message); }
        },
      }, "コードを発行する"));
    }
  }
  wrap.append(shareCard);

  // メンバー
  const memberCard = el("div", { class: "card" }, el("h2", {}, "👨‍👩‍👧 メンバー"));
  for (const m of state.members) {
    memberCard.append(el("div", { class: "member-row" },
      el("span", { class: "grow" }, m.displayName || "なまえ未設定", " ",
        el("span", { class: "chip" }, m.role === "owner" ? "作成者" : "メンバー"),
        m.userId === state.user.id ? el("span", { class: "chip" }, "あなた") : null),
      isOwner && m.userId !== state.user.id
        ? el("button", {
            class: "btn danger small", onclick: async () => {
              if (!confirm(`${m.displayName}さんをメンバーから外しますか？`)) return;
              try { await store.removeMember(state.user.id, fridge.id, m.userId); await refreshData(); renderMain(); toast("メンバーを外しました"); }
              catch (e) { toast(e.message); }
            },
          }, "外す")
        : null,
    ));
  }
  wrap.append(memberCard);

  // 通知（この端末へのローカル通知が今すぐ使える範囲。
  // サーバー発プッシュは FCM 送信側などの公開後設定が済んでから有効になる）
  const notifyCard = el("div", { class: "card" }, el("h2", {}, "🔔 通知"));
  const perm = permissionState();
  const permLabel = perm === "unsupported" ? "このブラウザは通知に対応していません"
    : perm === "granted" ? "ON（この端末に通知します）"
    : perm === "denied" ? "ブロックされています（ブラウザの設定で許可してください）"
    : "まだOFFです";
  notifyCard.append(
    el("p", { class: "hint" }, "アプリを開いたときに、期限が近い食材や残りわずかのお気に入りがあれば、この端末に通知します（1日1回まで・サーバー不要）。アプリを開いていないときの通知（サーバー発プッシュ）は、公開後の追加設定が済むと有効になります。"),
    el("p", {}, "現在の状態：", el("strong", {}, permLabel)),
  );
  if (perm === "default") {
    notifyCard.append(el("button", {
      class: "btn wide", onclick: async () => {
        try {
          const result = await Notification.requestPermission();
          if (result === "granted") {
            toast("通知をONにしました");
            await maybeSubscribePush();
            await notifyOnOpen(state.items).catch(() => {});
          } else {
            toast("通知は許可されませんでした");
          }
        } catch { toast("通知の許可を取得できませんでした"); }
        renderMain();
      },
    }, "通知をONにする"));
  }
  if (perm === "granted") {
    notifyCard.append(el("button", {
      class: "btn secondary wide", onclick: async () => {
        if (!buildReminders(state.items).length) {
          toast("今は通知する内容がありません（期限3日以内・残りわずかの食材なし）");
          return;
        }
        // テスト送信: その日の「送信済み」記録を無視して1回だけ送る
        await notifyOnOpen(state.items, {
          permission: "granted",
          storage: { getItem: () => null, setItem: () => {} },
        }).catch(() => {});
        toast("テスト通知を送りました");
      },
    }, "テスト通知を送る"));
  }
  wrap.append(notifyCard);

  // 困ったとき・ルール
  wrap.append(el("div", { class: "card" },
    el("h2", {}, "❓ ヘルプ・ルール"),
    el("button", {
      class: "btn secondary wide", onclick: () => { state.showGuide = true; renderMain(); try { window.scrollTo(0, 0); } catch { /* noop */ } },
    }, "はじめてガイドを見る"),
    el("button", {
      class: "btn secondary wide", style: "margin-top:8px", onclick: () => { state.legalView = "privacy"; renderMain(); },
    }, "プライバシーポリシー"),
    el("button", {
      class: "btn secondary wide", style: "margin-top:8px", onclick: () => { state.legalView = "terms"; renderMain(); },
    }, "利用規約"),
  ));

  // ゴミ箱（削除した食材の復元）
  const trashCard = el("div", { class: "card" }, el("h2", {}, "🗑 ゴミ箱（削除した食材）"));
  const trashList = store.mode === "demo" ? (state.trash || []) : state.sessionTrash;
  if (!trashList.length) {
    trashCard.append(el("p", { class: "hint" }, store.mode === "demo"
      ? "ゴミ箱は空です。在庫で食材を削除すると、ここに入って元に戻せます。"
      : "この画面を開いている間に削除した食材がここに残り、元に戻せます。"));
  }
  for (const t of trashList) {
    trashCard.append(el("div", { class: "fridge-row" },
      el("span", { class: "grow" }, t.name, " ", el("span", { class: "chip" }, `${fmtQtyValue(t.quantity, t.unit)}${t.unit || ""}`)),
      el("button", {
        class: "btn small", onclick: async () => {
          try {
            await store.restoreDeletedItem(state.user.id, fridge.id, t);
            state.sessionTrash = state.sessionTrash.filter((x) => x.id !== t.id);
            await refreshData(); renderMain(); toast(`「${t.name}」を元に戻しました`);
          } catch (e) { toast(e.message); }
        },
      }, "元に戻す"),
    ));
  }
  wrap.append(trashCard);

  // 設定
  wrap.append(el("div", { class: "card" },
    el("h2", {}, "⚙️ 設定"),
    el("div", { class: "fridge-row" }, el("span", { class: "grow" }, "冷蔵庫の名前"), el("strong", {}, fridge.name)),
    el("div", { class: "stepper" },
      el("span", {}, "家族の人数（レシピの分量）"),
      el("button", { class: "qty-btn", onclick: () => setFamilySize(size - 1) }, "−"),
      el("span", { class: "num" }, `${size}人分`),
      el("button", { class: "qty-btn", onclick: () => setFamilySize(size + 1) }, "+"),
    ),
    el("button", { class: "btn secondary wide", onclick: () => { stopRealtime(); state.fridge = null; renderFridgePicker(); } }, "別の冷蔵庫に切り替える"),
    !isOwner ? el("button", {
      class: "btn danger wide", onclick: async () => {
        if (!confirm("この冷蔵庫から退出しますか？")) return;
        try { await store.leaveFridge(state.user.id, fridge.id); stopRealtime(); state.fridges = await store.listMyFridges(state.user.id); state.fridge = null; renderFridgePicker(); }
        catch (e) { toast(e.message); }
      },
    }, "この冷蔵庫から退出する") : null,
    el("button", {
      class: "btn ghost wide", onclick: async () => {
        stopRealtime();
        await store.signOut(); state.user = null; state.fridge = null; renderAuth();
      },
    }, "ログアウト"),
    el("button", {
      class: "btn danger wide", onclick: async () => {
        if (!confirm("退会すると、アカウントとあなたのレシピのお気に入りが削除されます。\n共有している冷蔵庫の在庫・買い物リストは家族のものとして残ります。\nあなたが作った冷蔵庫は、他のメンバーがいれば一番古くからのメンバーに引き継がれ、メンバーがあなただけなら冷蔵庫ごと削除されます。\n本当に退会しますか？")) return;
        if (!confirm("この操作は取り消せません。退会しますか？")) return;
        try {
          stopRealtime();
          await store.deleteAccount(state.user.id);
          state.user = null; state.fridge = null; state.fridges = [];
          state.items = []; state.shopping = []; state.members = []; state.favRecipes = []; state.catalog = [];
          renderAuth(); toast("退会しました");
        } catch (e) { toast(e.message); }
      },
    }, "退会する（アカウントを削除）"),
    el("p", { class: "hint" }, store.mode === "demo"
      ? "デモモード：データはこの端末の中だけです。別の端末の家族とは共有されません（本番公開時に Firebase と接続します）。"
      : "データはメンバーだけがアクセスできます（Firestore のセキュリティルールで保護）。退会は上の「退会する」からできます。共有の冷蔵庫の在庫は家族のものとして残ります。"),
  ));
  return wrap;
}

// ================= 起動 =================
captureJoinParam();
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => { /* file:// 等では無効でよい */ });
}
initStore()
  .then(async () => {
    state.user = await store.currentUser();
    if (state.user) await afterLogin();
    else renderAuth();
  })
  .catch((e) => {
    appRoot.replaceChildren(el("div", { class: "card" }, el("div", { class: "error" }, "読み込みに失敗しました: " + e.message)));
  });
