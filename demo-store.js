// demo-store.js — デモモード用データ層（localStorage / この端末内だけ）
//
// 位置づけ:
// - Firebase 未設定（config.js が空）のときに使う、検証専用のローカル実装。
// - 同じ端末・同じブラウザの中だけで「複数アカウント」「複数冷蔵庫」
//   「フレンドコードで参加」「共有在庫の共同編集」を再現できる。
// - 本番（Firebase）と同じ Store インターフェースを実装し、app.js は
//   どちらのモードでも同じコードで動く。
//
// セキュリティ上の注意（デモ特有）:
// - デモは端末内に閉じており、ネットワーク送信は一切しない。
// - パスワードとフレンドコードは平文保存せず SHA-256 ハッシュで照合する
//   （ただしローカル保存のため本番の Firebase Auth + セキュリティルールの代替にはならない。
//    UI にも「デモ」と明示する）。
// - フレンドコードの平文は「発行者だけが見る」ため fridge_invite_codes 相当の
//   別領域に分け、owner 以外の getInviteCode は null を返す（本番 RLS と同等仕様）。
// - コード参加の試行回数制限（10分で10回まで）を実装し、総当たりを防ぐ。

import { uid, sha256Hex, generateInviteCode, normalizeCode, todayISO } from "./util.js";

const DB_KEY = "wagaya_demo_db_v1";
const SESSION_KEY = "wagaya_demo_session_v1";
// リアルタイム更新（別タブ連携）用に公開する: このキーへの storage イベントで
// 別タブが変更を知る。値は DemoStore が書く DB 本体のキーそのもの。
export const DEMO_DB_KEY = DB_KEY;
const MAX_JOIN_ATTEMPTS = 10;
const JOIN_WINDOW_MS = 10 * 60 * 1000;

export class DemoStore {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.mode = "demo";
    if (!this.storage.getItem(DB_KEY)) {
      this._save({ users: [], fridges: [], inviteCodes: {}, members: [], items: [], shopping: [], settings: {}, favoriteRecipes: [], catalog: [], joinAttempts: {}, trash: [] });
    }
  }
  _load() { return JSON.parse(this.storage.getItem(DB_KEY)); }
  _save(db) { this.storage.setItem(DB_KEY, JSON.stringify(db)); }

  /** 旧データに trash が無い場合の保険 */
  _trash(db) {
    db.trash = Array.isArray(db.trash) ? db.trash : [];
    return db.trash;
  }

  // ---- 認証（ローカル） ----
  async signUp(email, password, displayName) {
    const db = this._load();
    email = String(email || "").trim().toLowerCase();
    if (!email || !password || password.length < 6) throw new Error("メールアドレスと6文字以上のパスワードを入力してください");
    if (db.users.some((u) => u.email === email)) throw new Error("このメールアドレスは既に登録されています");
    const user = { id: uid(), email, displayName: displayName || "なまえ未設定", passwordHash: await sha256Hex(email + ":" + password), createdAt: todayISO() };
    db.users.push(user);
    this._save(db);
    this.storage.setItem(SESSION_KEY, user.id);
    return this._publicUser(user);
  }
  async signIn(email, password) {
    const db = this._load();
    email = String(email || "").trim().toLowerCase();
    const user = db.users.find((u) => u.email === email);
    if (!user || user.passwordHash !== (await sha256Hex(email + ":" + password)))
      throw new Error("メールアドレスまたはパスワードが違います");
    this.storage.setItem(SESSION_KEY, user.id);
    return this._publicUser(user);
  }
  async signOut() { this.storage.removeItem(SESSION_KEY); }
  // ---- 退会（アカウントと自分のデータを削除） ----
  // 共有している冷蔵庫の在庫・買い物リスト・図鑑は家族のものとして残す。
  // 自分が作った冷蔵庫は、他のメンバーがいれば一番古くからいるメンバーへ
  // 作成者を引き継ぎ、メンバーが自分だけなら冷蔵庫ごと削除する。
  async deleteAccount(userId) {
    const db = this._load();
    const user = db.users.find((u) => u.id === userId);
    if (!user) throw new Error("アカウントが見つかりません");
    for (const fridge of db.fridges.filter((f) => f.ownerId === userId)) {
      const others = db.members
        .filter((m) => m.fridgeId === fridge.id && m.userId !== userId)
        .sort((a, b) => String(a.joinedAt).localeCompare(String(b.joinedAt)));
      if (others.length === 0) {
        db.fridges = db.fridges.filter((f) => f.id !== fridge.id);
        delete db.inviteCodes[fridge.id];
        db.members = db.members.filter((m) => m.fridgeId !== fridge.id);
        db.items = db.items.filter((i) => i.fridgeId !== fridge.id);
        db.shopping = db.shopping.filter((s) => s.fridgeId !== fridge.id);
        delete db.settings[fridge.id];
        db.catalog = (db.catalog || []).filter((c) => c.fridgeId !== fridge.id);
        db.favoriteRecipes = (db.favoriteRecipes || []).filter((r) => r.fridgeId !== fridge.id);
        db.trash = this._trash(db).filter((t) => t.fridgeId !== fridge.id);
      } else {
        const nextOwner = others[0].userId;
        fridge.ownerId = nextOwner;
        const rec = db.inviteCodes[fridge.id];
        if (rec) rec.ownerId = nextOwner;
        const m = db.members.find((x) => x.fridgeId === fridge.id && x.userId === nextOwner);
        if (m) m.role = "owner";
      }
    }
    db.members = db.members.filter((m) => m.userId !== userId);
    db.favoriteRecipes = (db.favoriteRecipes || []).filter((r) => r.userId !== userId);
    if (db.joinAttempts) delete db.joinAttempts[userId];
    db.users = db.users.filter((u) => u.id !== userId);
    this._save(db);
    this.storage.removeItem(SESSION_KEY);
  }
  async currentUser() {
    const id = this.storage.getItem(SESSION_KEY);
    if (!id) return null;
    const user = this._load().users.find((u) => u.id === id);
    return user ? this._publicUser(user) : null;
  }
  _publicUser(u) { return { id: u.id, email: u.email, displayName: u.displayName }; }

  // ---- 冷蔵庫 ----
  _myMemberships(db, userId) { return db.members.filter((m) => m.userId === userId); }
  async listMyFridges(userId) {
    const db = this._load();
    return this._myMemberships(db, userId)
      .map((m) => { const f = db.fridges.find((x) => x.id === m.fridgeId); return f ? { ...f, role: m.role } : null; })
      .filter(Boolean);
  }
  async createFridge(userId, name) {
    const db = this._load();
    const code = generateInviteCode();
    const fridge = { id: uid(), name: name || "わが家の冷蔵庫", ownerId: userId, createdAt: todayISO() };
    db.fridges.push(fridge);
    db.inviteCodes[fridge.id] = { codeHash: await sha256Hex("invite:" + normalizeCode(code)), codePlain: code, ownerId: userId };
    db.members.push({ fridgeId: fridge.id, userId, role: "owner", joinedAt: todayISO() });
    db.settings[fridge.id] = { familySize: 2 };
    this._save(db);
    return { fridge: { ...fridge, role: "owner" }, inviteCode: code };
  }
  async getInviteCode(userId, fridgeId) {
    const db = this._load();
    const rec = db.inviteCodes[fridgeId];
    if (!rec || rec.ownerId !== userId) return null; // 発行者以外には見せない
    return rec.codePlain;
  }
  async regenerateCode(userId, fridgeId) {
    const db = this._load();
    const rec = db.inviteCodes[fridgeId];
    if (!rec || rec.ownerId !== userId) throw new Error("コードを再発行できるのは冷蔵庫を作った人だけです");
    const code = generateInviteCode();
    rec.codeHash = await sha256Hex("invite:" + normalizeCode(code));
    rec.codePlain = code;
    this._save(db);
    return code;
  }
  async joinByCode(userId, rawCode) {
    const db = this._load();
    // 試行回数制限（総当たり対策）: 10分間に10回まで
    const now = Date.now();
    const attempts = (db.joinAttempts[userId] || []).filter((t) => now - t < JOIN_WINDOW_MS);
    if (attempts.length >= MAX_JOIN_ATTEMPTS) throw new Error("試行回数が多すぎます。しばらく待ってからお試しください");
    attempts.push(now);
    db.joinAttempts[userId] = attempts;
    const hash = await sha256Hex("invite:" + normalizeCode(rawCode));
    const entry = Object.entries(db.inviteCodes).find(([, rec]) => rec.codeHash === hash);
    if (!entry) { this._save(db); throw new Error("コードが見つかりませんでした。入力を確認してください"); }
    const fridgeId = entry[0];
    if (db.members.some((m) => m.fridgeId === fridgeId && m.userId === userId)) {
      this._save(db);
      const f = db.fridges.find((x) => x.id === fridgeId);
      return { ...f, role: "member", alreadyMember: true };
    }
    db.members.push({ fridgeId, userId, role: "member", joinedAt: todayISO() });
    this._save(db);
    const f = db.fridges.find((x) => x.id === fridgeId);
    return { ...f, role: "member" };
  }
  async listMembers(userId, fridgeId) {
    const db = this._load();
    if (!db.members.some((m) => m.fridgeId === fridgeId && m.userId === userId)) throw new Error("メンバーではありません");
    return db.members.filter((m) => m.fridgeId === fridgeId).map((m) => {
      const u = db.users.find((x) => x.id === m.userId);
      return { userId: m.userId, role: m.role, joinedAt: m.joinedAt, displayName: u ? u.displayName : "不明", email: u ? u.email : "" };
    });
  }
  async removeMember(userId, fridgeId, targetUserId) {
    const db = this._load();
    const fridge = db.fridges.find((f) => f.id === fridgeId);
    if (!fridge || fridge.ownerId !== userId) throw new Error("メンバーを外せるのは冷蔵庫を作った人だけです");
    if (targetUserId === userId) throw new Error("自分を外すことはできません（退出を使ってください）");
    db.members = db.members.filter((m) => !(m.fridgeId === fridgeId && m.userId === targetUserId));
    this._save(db);
  }
  async leaveFridge(userId, fridgeId) {
    const db = this._load();
    const fridge = db.fridges.find((f) => f.id === fridgeId);
    if (fridge && fridge.ownerId === userId) throw new Error("冷蔵庫を作った人は退出できません");
    db.members = db.members.filter((m) => !(m.fridgeId === fridgeId && m.userId === userId));
    this._save(db);
  }

  // ---- 在庫 ----
  _assertMember(db, userId, fridgeId) {
    if (!db.members.some((m) => m.fridgeId === fridgeId && m.userId === userId))
      throw new Error("この冷蔵庫のメンバーではありません");
  }
  async listItems(userId, fridgeId) {
    const db = this._load();
    this._assertMember(db, userId, fridgeId);
    return db.items.filter((i) => i.fridgeId === fridgeId).map((i) => ({ ...i }));
  }
  async addItem(userId, fridgeId, data) {
    const db = this._load();
    this._assertMember(db, userId, fridgeId);
    const item = { id: uid(), fridgeId, createdBy: userId, createdAt: todayISO(), photoDataUrl: null, photoPath: null, ...data };
    db.items.push(item);
    // 食材図鑑コレクションへ自動登録（冷蔵庫単位）。登録のたびに購入回数+1
    // （在庫が尽きて再登録した場合も「買った」として数える。レベル/称号用）
    db.catalog = db.catalog || [];
    if (data.name) {
      const entry = db.catalog.find((c) => c.fridgeId === fridgeId && c.name === data.name);
      if (entry) entry.purchaseCount = (entry.purchaseCount || 1) + 1;
      else db.catalog.push({ id: uid(), fridgeId, name: data.name, category: data.category || "その他", firstAddedAt: todayISO(), addedBy: userId, purchaseCount: 1 });
    }
    this._save(db);
    return { ...item };
  }

  // ---- 食材図鑑コレクション ----
  // スコープは「冷蔵庫単位」: 同じ冷蔵庫のメンバー全員で1つの図鑑を育てる。
  // 在庫から消しても図鑑の記録は残る（コレクションとして集める楽しさのため）。
  async listCatalog(userId, fridgeId) {
    const db = this._load();
    this._assertMember(db, userId, fridgeId);
    return (db.catalog || []).filter((c) => c.fridgeId === fridgeId).map((c) => ({ ...c }));
  }
  /** 買い物リスト「買った！」等、在庫登録を伴わない購入の回数を+1する */
  async recordPurchase(userId, fridgeId, name, category) {
    if (!name) return;
    const db = this._load();
    this._assertMember(db, userId, fridgeId);
    db.catalog = db.catalog || [];
    const entry = db.catalog.find((c) => c.fridgeId === fridgeId && c.name === name);
    if (entry) entry.purchaseCount = (entry.purchaseCount || 1) + 1;
    else db.catalog.push({ id: uid(), fridgeId, name, category: category || "その他", firstAddedAt: todayISO(), addedBy: userId, purchaseCount: 1 });
    this._save(db);
  }
  async updateItem(userId, itemId, patch) {
    const db = this._load();
    const item = db.items.find((i) => i.id === itemId);
    if (!item) throw new Error("食材が見つかりません");
    this._assertMember(db, userId, item.fridgeId);
    Object.assign(item, patch);
    this._save(db);
    return { ...item };
  }
  async deleteItem(userId, itemId) {
    const db = this._load();
    const item = db.items.find((i) => i.id === itemId);
    if (!item) return;
    this._assertMember(db, userId, item.fridgeId);
    db.items = db.items.filter((i) => i.id !== itemId);
    // 「元に戻す」用にゴミ箱へ移す（完全削除ではない）
    this._trash(db).push({ ...item, deletedAt: new Date().toISOString() });
    this._save(db);
  }
  /** ゴミ箱の一覧（削除した食材。新しい順） */
  async listTrash(userId, fridgeId) {
    const db = this._load();
    this._assertMember(db, userId, fridgeId);
    return this._trash(db).filter((t) => t.fridgeId === fridgeId)
      .sort((a, b) => String(b.deletedAt || "").localeCompare(String(a.deletedAt || "")))
      .map((t) => ({ ...t }));
  }
  /**
   * 削除した食材を元に戻す。ゴミ箱にあればそれを在庫へ戻し（購入回数は増やさない）、
   * 無ければスナップショット自体を在庫として挿入する。
   */
  async restoreDeletedItem(userId, fridgeId, snapshot) {
    const db = this._load();
    this._assertMember(db, userId, fridgeId);
    if (!snapshot || !snapshot.name) throw new Error("戻す食材がありません");
    const trash = this._trash(db);
    const idx = trash.findIndex((t) => t.id === snapshot.id && t.fridgeId === fridgeId);
    let row;
    if (idx >= 0) {
      row = { ...trash[idx] };
      delete row.deletedAt;
      trash.splice(idx, 1);
    } else {
      row = { ...snapshot };
      delete row.deletedAt;
      row.fridgeId = fridgeId;
      if (!row.id || db.items.some((i) => i.id === row.id)) row.id = uid();
    }
    db.items.push(row);
    this._save(db);
    return { ...row };
  }

  // ---- 買い物リスト ----
  async listShopping(userId, fridgeId) {
    const db = this._load();
    this._assertMember(db, userId, fridgeId);
    return db.shopping.filter((s) => s.fridgeId === fridgeId).map((s) => ({ ...s }));
  }
  async addShopping(userId, fridgeId, data) {
    const db = this._load();
    this._assertMember(db, userId, fridgeId);
    const row = { id: uid(), fridgeId, createdBy: userId, createdAt: todayISO(), isChecked: false, ...data };
    db.shopping.push(row);
    this._save(db);
    return { ...row };
  }
  async deleteShopping(userId, shoppingId) {
    const db = this._load();
    const row = db.shopping.find((s) => s.id === shoppingId);
    if (!row) return;
    this._assertMember(db, userId, row.fridgeId);
    db.shopping = db.shopping.filter((s) => s.id !== shoppingId);
    this._save(db);
  }

  // ---- レシピお気に入り ----
  // レシピは在庫から都度生成されるため、再表示できるよう内容そのものを
  // スナップショット（名前・材料・分量・手順）として保存する。
  // スコープは「ユーザー × 冷蔵庫」: 同じ冷蔵庫の他のメンバーのお気に入りとは混ざらない。
  async listFavoriteRecipes(userId, fridgeId) {
    const db = this._load();
    this._assertMember(db, userId, fridgeId);
    return (db.favoriteRecipes || [])
      .filter((r) => r.fridgeId === fridgeId && r.userId === userId)
      .map((r) => ({ ...r, have: [...(r.have || [])], missing: [...(r.missing || [])], steps: [...(r.steps || [])] }));
  }
  async addFavoriteRecipe(userId, fridgeId, snapshot) {
    const db = this._load();
    this._assertMember(db, userId, fridgeId);
    db.favoriteRecipes = db.favoriteRecipes || [];
    // 同じ recipeKey（レシピ×モード）は1件だけ。再登録は新しい内容で上書きする
    db.favoriteRecipes = db.favoriteRecipes.filter(
      (r) => !(r.fridgeId === fridgeId && r.userId === userId && r.recipeKey === snapshot.recipeKey));
    const row = { id: uid(), fridgeId, userId, createdAt: todayISO(), ...snapshot };
    db.favoriteRecipes.push(row);
    this._save(db);
    return { ...row };
  }
  async removeFavoriteRecipe(userId, fridgeId, favId) {
    const db = this._load();
    this._assertMember(db, userId, fridgeId);
    db.favoriteRecipes = (db.favoriteRecipes || []).filter(
      (r) => !(r.id === favId && r.fridgeId === fridgeId && r.userId === userId));
    this._save(db);
  }

  // ---- 設定 ----
  async getSettings(userId, fridgeId) {
    const db = this._load();
    this._assertMember(db, userId, fridgeId);
    return { ...(db.settings[fridgeId] || { familySize: 2 }) };
  }
  async updateSettings(userId, fridgeId, patch) {
    const db = this._load();
    this._assertMember(db, userId, fridgeId);
    db.settings[fridgeId] = { ...(db.settings[fridgeId] || { familySize: 2 }), ...patch };
    this._save(db);
    return { ...db.settings[fridgeId] };
  }

  // ---- 写真（デモ: 端末内に dataURL で保持） ----
  async attachPhoto(userId, item, file) {
    if (!file) return null;
    if (file.size > 1024 * 1024) throw new Error("写真は1MB以下にしてください（デモ）");
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    await this.updateItem(userId, item.id, { photoDataUrl: dataUrl });
    return dataUrl;
  }
  async photoUrl() { return null; } // デモは item.photoDataUrl を直接使う

  // ---- プッシュ通知の購読（デモでは保存先が無いので何もしない） ----
  async savePushSubscription() { return { saved: false, reason: "demo" }; }
}
