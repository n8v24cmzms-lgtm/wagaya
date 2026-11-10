// firebase-store.js — 本番モード用データ層（Firebase Auth + Firestore + Storage）
//
// 2026-11-09: バックエンドを Supabase から Firebase へ移行（ユーザーの決定）。
// 旧実装 js/supabase-store.js と supabase/schema.sql はロールバック用に残置。
//
// セキュリティ設計（旧 RLS 設計と同じ保証を Firestore セキュリティルールで実現）:
// - フロントエンドが使うのは公開設定（apiKey 等）のみ。管理者用の秘密鍵は置かない。
// - firestore.rules / storage.rules（firebase/ フォルダ）で「冷蔵庫のメンバー
//   だけが、その冷蔵庫のデータを読み書きできる」を強制する。匿名アクセスなし。
// - フレンドコードの平文は置かない。fridge_codes/{SHA-256ハッシュ} に fridgeId
//   だけを置き、参加は「ハッシュをドキュメントIDとして引く」だけ（list/query 不可）。
//   平文の再表示用コピーは fridge_invite_codes に分離し、作成者だけが読める。
// - コード参加の試行回数制限は、Cloud Functions（Blaze プラン）なしには
//   サーバー側で強制できない既知の制限。緩和策は README 参照（長いランダム
//   コード、再発行で旧コード即無効、fridgeId は推測不能なランダムID）。
// - パスワードは Firebase Authentication が管理し、このアプリは保持しない。

import { generateInviteCode, normalizeCode, todayISO } from "./util.js";
import {
  inviteCodeHash, memberDocId, catalogDocId, favoriteDocId, pushTokenDocId,
  itemToDoc, itemFromDoc, itemPatchToDoc, shoppingToDoc, shoppingFromDoc,
  catalogToDoc, catalogFromDoc, favoriteToDoc, favoriteFromDoc, memberFromDoc,
} from "./firebase-model.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.5";

export class FirebaseStore {
  constructor(mods, config) {
    this.mode = "firebase";
    this._mods = mods; // { auth, fs, storage } の名前空間モジュール
    this.app = mods.initializeApp(config);
    this.auth = mods.getAuth(this.app);
    this.db = mods.getFirestore(this.app);
    this.storage = mods.getStorage(this.app);
    this._userCache = null;
  }
  static async create(config) {
    const [appM, authM, fsM, stM] = await Promise.all([
      import(`${SDK}/firebase-app.js`),
      import(`${SDK}/firebase-auth.js`),
      import(`${SDK}/firebase-firestore.js`),
      import(`${SDK}/firebase-storage.js`),
    ]);
    const mods = {
      initializeApp: appM.initializeApp,
      getAuth: authM.getAuth,
      createUserWithEmailAndPassword: authM.createUserWithEmailAndPassword,
      signInWithEmailAndPassword: authM.signInWithEmailAndPassword,
      sendEmailVerification: authM.sendEmailVerification,
      updateProfile: authM.updateProfile,
      onAuthStateChanged: authM.onAuthStateChanged,
      signOut: authM.signOut,
      getFirestore: fsM.getFirestore,
      doc: fsM.doc, collection: fsM.collection, getDoc: fsM.getDoc, getDocs: fsM.getDocs,
      setDoc: fsM.setDoc, addDoc: fsM.addDoc, updateDoc: fsM.updateDoc, deleteDoc: fsM.deleteDoc,
      query: fsM.query, where: fsM.where, orderBy: fsM.orderBy, writeBatch: fsM.writeBatch,
      onSnapshot: fsM.onSnapshot, increment: fsM.increment,
      getStorage: stM.getStorage, ref: stM.ref, uploadBytes: stM.uploadBytes,
      getDownloadURL: stM.getDownloadURL, deleteObject: stM.deleteObject,
    };
    return new FirebaseStore(mods, config);
  }

  // ---- 認証 ----
  async signUp(email, password, displayName) {
    const { createUserWithEmailAndPassword, updateProfile, sendEmailVerification, doc, setDoc } = this._mods;
    let cred;
    try {
      cred = await createUserWithEmailAndPassword(this.auth, String(email || "").trim(), password);
    } catch (e) {
      throw new Error(this._authError(e));
    }
    const name = displayName || "なまえ未設定";
    try { await updateProfile(cred.user, { displayName: name }); } catch { /* 表示名はプロフィールdoc側が正 */ }
    await setDoc(doc(this.db, "users", cred.user.uid), {
      displayName: name, email: cred.user.email || String(email || "").trim(), createdAt: todayISO(),
    });
    // メール確認（プロジェクト側で必須化しても破綻しないよう、送信だけ行う。
    // 確認前でもログイン自体は可能＝現行フローの「確認メール後に使える」と同等以上）
    try { await sendEmailVerification(cred.user); } catch { /* 送信失敗は登録を妨げない */ }
    return this._user(cred.user);
  }
  async signIn(email, password) {
    try {
      const cred = await this._mods.signInWithEmailAndPassword(this.auth, String(email || "").trim(), password);
      return await this._user(cred.user);
    } catch {
      throw new Error("メールアドレスまたはパスワードが違います");
    }
  }
  async signOut() { this._userCache = null; await this._mods.signOut(this.auth); }
  async currentUser() {
    const u = await new Promise((resolve) => {
      const off = this._mods.onAuthStateChanged(this.auth, (user) => { off(); resolve(user); });
    });
    return u ? this._user(u) : null;
  }
  async _user(authUser) {
    if (!authUser) return null;
    let displayName = authUser.displayName || "";
    try {
      const snap = await this._mods.getDoc(this._mods.doc(this.db, "users", authUser.uid));
      if (snap.exists()) displayName = snap.data().displayName || displayName;
    } catch { /* プロフィールが読めなくてもログインは継続 */ }
    return { id: authUser.uid, email: authUser.email || "", displayName: displayName || "なまえ未設定" };
  }
  _authError(e) {
    switch (e?.code) {
      case "auth/email-already-in-use": return "このメールアドレスは既に登録されています";
      case "auth/invalid-email": return "メールアドレスの形式が正しくありません";
      case "auth/weak-password": return "パスワードは6文字以上にしてください";
      default: return e?.message || "登録に失敗しました";
    }
  }

  // ---- 退会（アカウントと自分のデータを削除） ----
  // 共有冷蔵庫の在庫・買い物リスト・図鑑は家族のものとして残す。自分が作った
  // 冷蔵庫は、他のメンバーがいれば一番古くからのメンバーへ作成者を引き継ぎ、
  // メンバーが自分だけなら冷蔵庫ごと削除する（写真ファイルも可能な範囲で削除）。
  // 最後に Firebase Auth のユーザー自体を削除する。再認証が必要な場合は
  // auth/requires-recent-login が返るので、ログインし直して再実行を案内する。
  async deleteAccount(userId) {
    const fs = this._mods;
    const myFridges = await this.listMyFridges(userId);
    for (const f of myFridges) {
      if (f.ownerId !== userId) continue;
      const members = await this.listMembers(userId, f.id).catch(() => []);
      const others = members.filter((m) => m.userId !== userId)
        .sort((a, b) => String(a.joinedAt).localeCompare(String(b.joinedAt)));
      if (others.length === 0) {
        await this._deleteFridgeData(f.id);
      } else {
        const nextOwner = others[0].userId;
        await fs.updateDoc(fs.doc(this.db, "fridges", f.id), { ownerId: nextOwner });
        await fs.updateDoc(fs.doc(this.db, "fridge_members", memberDocId(f.id, nextOwner)), { role: "owner" });
        const invRef = fs.doc(this.db, "fridge_invite_codes", f.id);
        const inv = await fs.getDoc(invRef);
        if (inv.exists()) await fs.updateDoc(invRef, { ownerId: nextOwner });
      }
    }
    // 自分のメンバーシップ・お気に入り・プッシュトークンを消す
    for (const f of myFridges) {
      await fs.deleteDoc(fs.doc(this.db, "fridge_members", memberDocId(f.id, userId))).catch(() => {});
    }
    const favSnap = await fs.getDocs(fs.query(fs.collection(this.db, "favorite_recipes"), fs.where("userId", "==", userId)));
    for (const d of favSnap.docs) await fs.deleteDoc(d.ref).catch(() => {});
    const tokSnap = await fs.getDocs(fs.collection(this.db, "users", userId, "push_tokens")).catch(() => null);
    if (tokSnap) for (const d of tokSnap.docs) await fs.deleteDoc(d.ref).catch(() => {});
    await fs.deleteDoc(fs.doc(this.db, "users", userId)).catch(() => {});
    // Auth ユーザー削除（最後。失敗したら呼び出し側で案内する）
    const current = this.auth.currentUser;
    if (current && current.uid === userId) {
      try {
        await current.delete();
      } catch (e) {
        if (e?.code === "auth/requires-recent-login") {
          throw new Error("安全のため、もう一度ログインしてから退会手続きを行ってください（データの整理は完了しています）");
        }
        throw new Error(e?.message || "アカウントの削除に失敗しました");
      }
    }
    this._userCache = null;
  }
  async _deleteFridgeData(fridgeId) {
    const fs = this._mods;
    for (const col of ["items", "shopping_items", "fridge_catalog", "favorite_recipes", "fridge_members"]) {
      const snap = await fs.getDocs(fs.query(fs.collection(this.db, col), fs.where("fridgeId", "==", fridgeId)));
      for (const d of snap.docs) {
        // 写真ファイルの後始末（失敗してもDB削除は続ける）
        if (col === "items" && d.data().photoPath) {
          await fs.deleteObject(fs.ref(this.storage, d.data().photoPath)).catch(() => {});
        }
        await fs.deleteDoc(d.ref).catch(() => {});
      }
    }
    // コード照合ドキュメント（ハッシュID）は invite 平文側から引いて消す
    const invRef = fs.doc(this.db, "fridge_invite_codes", fridgeId);
    const inv = await fs.getDoc(invRef);
    if (inv.exists() && inv.data().codePlain) {
      await fs.deleteDoc(fs.doc(this.db, "fridge_codes", await inviteCodeHash(inv.data().codePlain))).catch(() => {});
    }
    await fs.deleteDoc(invRef).catch(() => {});
    await fs.deleteDoc(fs.doc(this.db, "fridge_settings", fridgeId)).catch(() => {});
    await fs.deleteDoc(fs.doc(this.db, "fridges", fridgeId)).catch(() => {});
  }

  // ---- 冷蔵庫 ----
  async listMyFridges(userId) {
    const fs = this._mods;
    const snap = await fs.getDocs(fs.query(fs.collection(this.db, "fridge_members"), fs.where("userId", "==", userId)));
    const out = [];
    for (const d of snap.docs) {
      const m = d.data();
      const fSnap = await fs.getDoc(fs.doc(this.db, "fridges", m.fridgeId));
      if (!fSnap.exists()) continue;
      const f = fSnap.data();
      out.push({ id: fSnap.id, name: f.name, ownerId: f.ownerId, role: m.role });
    }
    return out;
  }
  async createFridge(userId, name) {
    const fs = this._mods;
    const me = await this._user(this.auth.currentUser).catch(() => null);
    const fridgeRef = fs.doc(fs.collection(this.db, "fridges"));
    const fridgeId = fridgeRef.id;
    const code = generateInviteCode();
    const hash = await inviteCodeHash(code);
    const batch = fs.writeBatch(this.db);
    batch.set(fridgeRef, { name: name || "わが家の冷蔵庫", ownerId: userId, createdAt: todayISO() });
    batch.set(fs.doc(this.db, "fridge_members", memberDocId(fridgeId, userId)), {
      fridgeId, userId, role: "owner", displayName: me?.displayName || "なまえ未設定", joinedAt: new Date().toISOString(),
    });
    batch.set(fs.doc(this.db, "fridge_settings", fridgeId), { familySize: 2 });
    batch.set(fs.doc(this.db, "fridge_codes", hash), { fridgeId, createdAt: new Date().toISOString() });
    batch.set(fs.doc(this.db, "fridge_invite_codes", fridgeId), { codePlain: code, ownerId: userId, updatedAt: new Date().toISOString() });
    await batch.commit();
    return { fridge: { id: fridgeId, name: name || "わが家の冷蔵庫", ownerId: userId, role: "owner" }, inviteCode: code };
  }
  async getInviteCode(userId, fridgeId) {
    // ルールにより作成者本人だけが読める。メンバーには null が返る。
    try {
      const snap = await this._mods.getDoc(this._mods.doc(this.db, "fridge_invite_codes", fridgeId));
      return snap.exists() ? (snap.data().codePlain || null) : null;
    } catch { return null; }
  }
  async regenerateCode(userId, fridgeId) {
    const fs = this._mods;
    const invRef = fs.doc(this.db, "fridge_invite_codes", fridgeId);
    const inv = await fs.getDoc(invRef);
    if (!inv.exists() || inv.data().ownerId !== userId) throw new Error("コードを再発行できるのは冷蔵庫を作った人だけです");
    const oldHash = inv.data().codePlain ? await inviteCodeHash(inv.data().codePlain) : null;
    const code = generateInviteCode();
    const newHash = await inviteCodeHash(code);
    const batch = fs.writeBatch(this.db);
    if (oldHash) batch.delete(fs.doc(this.db, "fridge_codes", oldHash)); // 旧コードは即無効
    batch.set(fs.doc(this.db, "fridge_codes", newHash), { fridgeId, createdAt: new Date().toISOString() });
    batch.set(invRef, { codePlain: code, ownerId: userId, updatedAt: new Date().toISOString() });
    await batch.commit();
    return code;
  }
  async joinByCode(userId, rawCode) {
    const fs = this._mods;
    // 照合は「ハッシュをドキュメントIDとして引く」だけ。一覧・検索はルールで禁止。
    const hash = await inviteCodeHash(rawCode);
    const codeSnap = await fs.getDoc(fs.doc(this.db, "fridge_codes", hash));
    if (!codeSnap.exists()) throw new Error("コードが見つかりませんでした。入力を確認してください");
    const fridgeId = codeSnap.data().fridgeId;
    const me = await this._user(this.auth.currentUser).catch(() => null);
    await fs.setDoc(fs.doc(this.db, "fridge_members", memberDocId(fridgeId, userId)), {
      fridgeId, userId, role: "member", displayName: me?.displayName || "なまえ未設定", joinedAt: new Date().toISOString(),
    }, { merge: true });
    const fSnap = await fs.getDoc(fs.doc(this.db, "fridges", fridgeId));
    if (!fSnap.exists()) throw new Error("冷蔵庫が見つかりませんでした");
    const f = fSnap.data();
    return { id: fSnap.id, name: f.name, ownerId: f.ownerId, role: "member" };
  }
  async listMembers(userId, fridgeId) {
    const fs = this._mods;
    const snap = await fs.getDocs(fs.query(fs.collection(this.db, "fridge_members"), fs.where("fridgeId", "==", fridgeId)));
    return snap.docs.map((d) => memberFromDoc(d.data()))
      .sort((a, b) => String(a.joinedAt).localeCompare(String(b.joinedAt)));
  }
  async removeMember(userId, fridgeId, targetUserId) {
    const fs = this._mods;
    const fSnap = await fs.getDoc(fs.doc(this.db, "fridges", fridgeId));
    if (!fSnap.exists() || fSnap.data().ownerId !== userId) throw new Error("メンバーを外せるのは冷蔵庫を作った人だけです");
    if (targetUserId === userId) throw new Error("自分を外すことはできません（退出を使ってください）");
    await fs.deleteDoc(fs.doc(this.db, "fridge_members", memberDocId(fridgeId, targetUserId)));
  }
  async leaveFridge(userId, fridgeId) {
    const fs = this._mods;
    const fSnap = await fs.getDoc(fs.doc(this.db, "fridges", fridgeId));
    if (fSnap.exists() && fSnap.data().ownerId === userId) throw new Error("冷蔵庫を作った人は退出できません");
    await fs.deleteDoc(fs.doc(this.db, "fridge_members", memberDocId(fridgeId, userId)));
  }

  // ---- 在庫 ----
  async listItems(userId, fridgeId) {
    const fs = this._mods;
    const snap = await fs.getDocs(fs.query(fs.collection(this.db, "items"), fs.where("fridgeId", "==", fridgeId)));
    const items = snap.docs.map((d) => itemFromDoc(d.id, d.data()));
    items.sort((a, b) => {
      if (a.expiryDate && b.expiryDate) return a.expiryDate < b.expiryDate ? -1 : 1;
      if (a.expiryDate) return -1;
      if (b.expiryDate) return 1;
      return String(a.name).localeCompare(String(b.name));
    });
    for (const item of items) if (item.photoPath) item.photoDataUrl = await this.photoUrl(item).catch(() => null);
    return items;
  }
  async _bumpCatalog(userId, fridgeId, name, category) {
    try {
      const fs = this._mods;
      const ref = fs.doc(this.db, "fridge_catalog", catalogDocId(fridgeId, name));
      const snap = await fs.getDoc(ref);
      if (snap.exists()) {
        await fs.updateDoc(ref, { purchaseCount: fs.increment(1) });
      } else {
        await fs.setDoc(ref, catalogToDoc({ fridgeId, name, category, purchaseCount: 1 }, userId));
      }
    } catch { /* 図鑑側の失敗は在庫登録を妨げない */ }
  }
  async addItem(userId, fridgeId, data) {
    const fs = this._mods;
    const docData = itemToDoc({ ...data, fridgeId, createdBy: userId });
    const ref = await fs.addDoc(fs.collection(this.db, "items"), docData);
    if (docData.name) await this._bumpCatalog(userId, fridgeId, docData.name, docData.category);
    return itemFromDoc(ref.id, docData);
  }
  async listCatalog(userId, fridgeId) {
    const fs = this._mods;
    const snap = await fs.getDocs(fs.query(fs.collection(this.db, "fridge_catalog"), fs.where("fridgeId", "==", fridgeId)));
    return snap.docs.map((d) => catalogFromDoc(d.id, d.data()))
      .sort((a, b) => String(a.firstAddedAt).localeCompare(String(b.firstAddedAt)));
  }
  async recordPurchase(userId, fridgeId, name, category) {
    if (name) await this._bumpCatalog(userId, fridgeId, name, category);
  }
  async updateItem(userId, itemId, patch) {
    const fs = this._mods;
    const ref = fs.doc(this.db, "items", itemId);
    await fs.updateDoc(ref, itemPatchToDoc(patch));
    const snap = await fs.getDoc(ref);
    return itemFromDoc(snap.id, snap.data());
  }
  async deleteItem(userId, itemId) {
    await this._mods.deleteDoc(this._mods.doc(this.db, "items", itemId));
  }
  /** 削除した食材を元に戻す（スナップショットを元のIDで再作成。購入回数は増やさない） */
  async restoreDeletedItem(userId, fridgeId, snapshot) {
    if (!snapshot || !snapshot.name) throw new Error("戻す食材がありません");
    const fs = this._mods;
    const docData = itemToDoc({ ...snapshot, fridgeId, createdBy: userId });
    const ref = snapshot.id ? fs.doc(this.db, "items", snapshot.id) : fs.doc(fs.collection(this.db, "items"));
    await fs.setDoc(ref, docData);
    const item = itemFromDoc(ref.id, docData);
    if (snapshot.photoDataUrl) item.photoDataUrl = snapshot.photoDataUrl;
    return item;
  }
  /** 本番ではゴミ箱は端末内セッションのみ（app.js 側で保持）。常に空を返す */
  async listTrash() { return []; }

  // ---- 買い物リスト ----
  async listShopping(userId, fridgeId) {
    const fs = this._mods;
    const snap = await fs.getDocs(fs.query(fs.collection(this.db, "shopping_items"), fs.where("fridgeId", "==", fridgeId)));
    return snap.docs.map((d) => shoppingFromDoc(d.id, d.data()))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  }
  async addShopping(userId, fridgeId, data) {
    const fs = this._mods;
    const docData = shoppingToDoc(data, fridgeId, userId);
    const ref = await fs.addDoc(fs.collection(this.db, "shopping_items"), docData);
    return shoppingFromDoc(ref.id, docData);
  }
  async deleteShopping(userId, shoppingId) {
    await this._mods.deleteDoc(this._mods.doc(this.db, "shopping_items", shoppingId));
  }

  // ---- 設定 ----
  async getSettings(userId, fridgeId) {
    try {
      const snap = await this._mods.getDoc(this._mods.doc(this.db, "fridge_settings", fridgeId));
      return { familySize: snap.exists() ? (snap.data().familySize ?? 2) : 2 };
    } catch { return { familySize: 2 }; }
  }
  async updateSettings(userId, fridgeId, patch) {
    const fs = this._mods;
    await fs.setDoc(fs.doc(this.db, "fridge_settings", fridgeId), { familySize: patch.familySize }, { merge: true });
    return { familySize: patch.familySize };
  }

  // ---- レシピお気に入り（ユーザー × 冷蔵庫・本人のみ） ----
  async listFavoriteRecipes(userId, fridgeId) {
    const fs = this._mods;
    const snap = await fs.getDocs(fs.query(
      fs.collection(this.db, "favorite_recipes"),
      fs.where("fridgeId", "==", fridgeId), fs.where("userId", "==", userId)));
    return snap.docs.map((d) => favoriteFromDoc(d.id, d.data()));
  }
  async addFavoriteRecipe(userId, fridgeId, snapshot) {
    const fs = this._mods;
    const docData = favoriteToDoc(snapshot, fridgeId, userId);
    const ref = fs.doc(this.db, "favorite_recipes", favoriteDocId(fridgeId, userId, snapshot.recipeKey));
    await fs.setDoc(ref, docData);
    return favoriteFromDoc(ref.id, docData);
  }
  async removeFavoriteRecipe(userId, fridgeId, favId) {
    await this._mods.deleteDoc(this._mods.doc(this.db, "favorite_recipes", favId));
  }

  // ---- プッシュ通知（FCM） ----
  // トークン登録だけを担う。送信には Cloud Functions（Blaze）等のサーバー側が
  // 必要で、未設定の間はトークンが貯まるだけで通知は届かない（README 参照）。
  async saveFcmToken(userId, token) {
    if (!token) return { saved: false, reason: "no_token" };
    const fs = this._mods;
    const id = await pushTokenDocId(token);
    await fs.setDoc(fs.doc(this.db, "users", userId, "push_tokens", id), {
      token, updatedAt: new Date().toISOString(), platform: "web",
    });
    return { saved: true };
  }
  /** 互換: Web Push 購読オブジェクトが渡された場合は何もしない（FCM方式に移行済み） */
  async savePushSubscription() { return { saved: false, reason: "fcm_only" }; }
  async registerPushToken(userId, vapidKey) {
    if (!vapidKey) return { saved: false, reason: "not_configured" };
    try {
      const msgM = await import(`${SDK}/firebase-messaging.js`);
      if (!msgM.isSupported || !(await msgM.isSupported())) return { saved: false, reason: "unsupported" };
      const messaging = msgM.getMessaging(this.app);
      const registration = await globalThis.navigator?.serviceWorker?.ready.catch(() => null);
      const token = await msgM.getToken(messaging, { vapidKey, serviceWorkerRegistration: registration || undefined });
      if (!token) return { saved: false, reason: "no_token" };
      return this.saveFcmToken(userId, token);
    } catch { return { saved: false, reason: "error" }; }
  }

  // ---- リアルタイム更新（Firestore onSnapshot） ----
  /**
   * 現在の冷蔵庫の items / shopping_items / fridge_catalog の変更を購読する。
   * 戻り値: 購読解除関数。Firestore が使えない場合は null（従来動作にフォールバック）。
   */
  subscribeFridge(fridgeId, onChange) {
    if (!this.db || !fridgeId || typeof this._mods?.onSnapshot !== "function") return null;
    try {
      const fs = this._mods;
      const offs = [];
      for (const col of ["items", "shopping_items", "fridge_catalog"]) {
        const q = fs.query(fs.collection(this.db, col), fs.where("fridgeId", "==", fridgeId));
        offs.push(fs.onSnapshot(q, () => { try { onChange(col); } catch { /* 描画側の失敗で購読を止めない */ } }, () => {}));
      }
      return () => { for (const off of offs) { try { off(); } catch { /* noop */ } } };
    } catch { return null; }
  }

  // ---- 写真（Firebase Storage・パス先頭でメンバー判定） ----
  async attachPhoto(userId, item, file) {
    if (!file) return null;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("写真は JPEG / PNG / WebP のみ対応しています");
    if (file.size > 5 * 1024 * 1024) throw new Error("写真は5MB以下にしてください");
    const fs = this._mods;
    const path = `fridges/${item.fridgeId}/items/${item.id}-${Date.now()}.jpg`;
    await fs.uploadBytes(fs.ref(this.storage, path), file, { contentType: file.type });
    await this.updateItem(userId, item.id, { photoPath: path });
    return path;
  }
  async photoUrl(item) {
    if (!item.photoPath) return null;
    try { return await this._mods.getDownloadURL(this._mods.ref(this.storage, item.photoPath)); }
    catch { return null; }
  }
}
