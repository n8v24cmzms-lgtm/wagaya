// 【旧バックエンド・ロールバック用に保持】
// 2026-11-09 に本番バックエンドは Firebase（js/firebase-store.js）へ移行した。
// このファイルは Supabase に戻す場合のために残してある（config.js に
// SUPABASE_URL / SUPABASE_ANON_KEY が両方ある場合のみ app.js が読み込む）。
//
// supabase-store.js — 本番モード用データ層（Supabase Auth + Postgres + RLS）
//
// セキュリティ設計（設計メモ「セキュリティ対策（最優先）」に対応）:
// - フロントエンドが使うのは anon key のみ。service_role key は絶対に置かない。
// - すべてのテーブルで RLS が有効（supabase/schema.sql）。メンバーでない冷蔵庫の
//   データは、画面で隠すのではなく DB 側で読み書き自体が拒否される。
// - フレンドコードの平文は fridges テーブルに置かない。照合は
//   ハッシュ (invite_code_hash) + security definer 関数 join_fridge_by_code で行い、
//   平文そのものは fridge_invite_codes テーブルに分離し、RLS で
//   「冷蔵庫の作成者本人だけが select 可」にしてある。
// - コード参加は RPC 経由のみ。関数側で試行回数を記録し、上限を超えると拒否する。
// - パスワードは Supabase Auth が管理し、このアプリは一切保持しない。

import { generateInviteCode, normalizeCode } from "./util.js";

const CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
const BUCKET = "item-photos";

export class SupabaseStore {
  constructor(client) { this.client = client; this.mode = "supabase"; }
  static async create(url, anonKey) {
    const { createClient } = await import(CDN);
    return new SupabaseStore(createClient(url, anonKey));
  }

  // ---- 認証 ----
  async signUp(email, password, displayName) {
    const { data, error } = await this.client.auth.signUp({
      email, password, options: { data: { display_name: displayName || "" } },
    });
    if (error) throw new Error(error.message);
    // メール確認が有効なプロジェクトでは session が無い → 確認を促す
    if (!data.session) throw new Error("確認メールを送信しました。メール内のリンクを開いてからログインしてください");
    return this._user(data.user);
  }
  async signIn(email, password) {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw new Error("メールアドレスまたはパスワードが違います");
    return this._user(data.user);
  }
  async signOut() { await this.client.auth.signOut(); }
  // ---- 退会（アカウントと自分のデータを削除） ----
  // 実処理は RPC delete_my_account (security definer, schema.sql) が行う。
  // anon key のブラウザからは auth.users を直接消せないため、削除は
  // サーバー側の関数に任せる。共有冷蔵庫の在庫・買い物リスト・図鑑は
  // 家族のものとして残し、自分が作った冷蔵庫は他メンバーがいれば
  // 一番古いメンバーへ作成者を引き継ぎ、いなければ冷蔵庫ごと削除する。
  // 写真ファイル（Storage）は DB 削除と連動しないため、運営者が
  // バケット側で整理する必要がある（README「既知の制限」参照）。
  async deleteAccount(userId) {
    const { error } = await this.client.rpc("delete_my_account");
    if (error) throw new Error(error.message);
    await this.client.auth.signOut().catch(() => {});
  }
  async currentUser() {
    const { data } = await this.client.auth.getUser();
    return data?.user ? this._user(data.user) : null;
  }
  async _user(authUser) {
    if (!authUser) return null;
    const { data } = await this.client.from("profiles").select("display_name").eq("id", authUser.id).single();
    return { id: authUser.id, email: authUser.email, displayName: data?.display_name || authUser.user_metadata?.display_name || "なまえ未設定" };
  }

  // ---- 冷蔵庫 ----
  async listMyFridges(userId) {
    const { data, error } = await this.client
      .from("fridge_members")
      .select("role, fridges(id, name, owner_id, created_at)")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return data.map((r) => ({ id: r.fridges.id, name: r.fridges.name, ownerId: r.fridges.owner_id, role: r.role }));
  }
  async createFridge(userId, name) {
    // コードのハッシュ化・メンバー登録・設定初期化は RPC (security definer) 側で行う
    const code = generateInviteCode();
    const { data, error } = await this.client.rpc("create_fridge", { p_name: name || "わが家の冷蔵庫", p_code: normalizeCode(code) });
    if (error) throw new Error(error.message);
    return { fridge: { id: data, name: name || "わが家の冷蔵庫", ownerId: userId, role: "owner" }, inviteCode: code };
  }
  async getInviteCode(userId, fridgeId) {
    // RLS により作成者本人だけが読める。メンバーには null が返る。
    const { data, error } = await this.client
      .from("fridge_invite_codes").select("code_plain").eq("fridge_id", fridgeId).single();
    if (error || !data) return null;
    return data.code_plain;
  }
  async regenerateCode(userId, fridgeId) {
    const code = generateInviteCode();
    const { error } = await this.client.rpc("regenerate_invite_code", { p_fridge_id: fridgeId, p_code: normalizeCode(code) });
    if (error) throw new Error(error.message);
    return code;
  }
  async joinByCode(userId, rawCode) {
    // 照合は security definer 関数の中だけ。コード文字列をテーブル検索に使わない。
    const { data, error } = await this.client.rpc("join_fridge_by_code", { p_code: normalizeCode(rawCode) });
    if (error) throw new Error(error.message === "too_many_attempts"
      ? "試行回数が多すぎます。しばらく待ってからお試しください"
      : "コードが見つかりませんでした。入力を確認してください");
    const { data: fridge, error: e2 } = await this.client.from("fridges").select("id, name, owner_id").eq("id", data).single();
    if (e2) throw new Error(e2.message);
    return { id: fridge.id, name: fridge.name, ownerId: fridge.owner_id, role: "member" };
  }
  async listMembers(userId, fridgeId) {
    const { data, error } = await this.client
      .from("fridge_members")
      .select("user_id, role, joined_at, profiles(display_name)")
      .eq("fridge_id", fridgeId);
    if (error) throw new Error(error.message);
    return data.map((r) => ({ userId: r.user_id, role: r.role, joinedAt: r.joined_at, displayName: r.profiles?.display_name || "なまえ未設定", email: "" }));
  }
  async removeMember(userId, fridgeId, targetUserId) {
    const { error } = await this.client.from("fridge_members").delete()
      .eq("fridge_id", fridgeId).eq("user_id", targetUserId);
    if (error) throw new Error(error.message);
  }
  async leaveFridge(userId, fridgeId) {
    const { error } = await this.client.from("fridge_members").delete()
      .eq("fridge_id", fridgeId).eq("user_id", userId);
    if (error) throw new Error(error.message);
  }

  // ---- 在庫 ----
  _itemFrom(row) {
    return {
      id: row.id, fridgeId: row.fridge_id, name: row.name, category: row.category,
      quantity: Number(row.quantity), unit: row.unit, expiryDate: row.expiry_date,
      storage: row.storage_location, isFavorite: row.is_favorite, lowThreshold: Number(row.low_threshold),
      photoPath: row.photo_path, photoDataUrl: null, createdBy: row.created_by,
      // 登録日（レシピの消費順＝期限の近さ→購入の古さ の並び替え用）
      createdAt: row.created_at ? String(row.created_at).slice(0, 10) : null,
    };
  }
  _itemTo(item) {
    return {
      fridge_id: item.fridgeId, name: item.name, category: item.category, quantity: item.quantity,
      unit: item.unit, expiry_date: item.expiryDate || null, storage_location: item.storage,
      is_favorite: !!item.isFavorite, low_threshold: item.lowThreshold ?? 1, photo_path: item.photoPath || null,
    };
  }
  async listItems(userId, fridgeId) {
    const { data, error } = await this.client.from("items").select("*").eq("fridge_id", fridgeId).order("expiry_date", { ascending: true, nullsFirst: false });
    if (error) throw new Error(error.message);
    const items = data.map((r) => this._itemFrom(r));
    for (const item of items) if (item.photoPath) item.photoDataUrl = await this.photoUrl(item).catch(() => null);
    return items;
  }
  /** 図鑑コレクションへ登録し、購入回数を+1する（レベル/称号用。失敗しても在庫登録は妨げない） */
  async _bumpCatalog(userId, fridgeId, name, category) {
    try {
      const { data: existing } = await this.client.from("fridge_catalog")
        .select("id, purchase_count").eq("fridge_id", fridgeId).eq("name", name).maybeSingle();
      if (existing) {
        await this.client.from("fridge_catalog")
          .update({ purchase_count: (existing.purchase_count ?? 1) + 1 }).eq("id", existing.id);
      } else {
        await this.client.from("fridge_catalog").insert({
          fridge_id: fridgeId, name, category: category || "その他", added_by: userId, purchase_count: 1,
        });
      }
    } catch { /* 図鑑側の失敗は在庫登録を妨げない */ }
  }
  async addItem(userId, fridgeId, data) {
    const { data: row, error } = await this.client.from("items")
      .insert({ ...this._itemTo({ ...data, fridgeId }), created_by: userId }).select("*").single();
    if (error) throw new Error(error.message);
    // 食材図鑑コレクションへ自動登録（冷蔵庫単位）＋購入回数+1
    if (row.name) await this._bumpCatalog(userId, fridgeId, row.name, row.category);
    return this._itemFrom(row);
  }

  // ---- 食材図鑑コレクション（冷蔵庫単位） ----
  async listCatalog(userId, fridgeId) {
    const { data, error } = await this.client.from("fridge_catalog")
      .select("*").eq("fridge_id", fridgeId).order("first_added_at");
    if (error) throw new Error(error.message);
    return data.map((r) => ({
      id: r.id, fridgeId: r.fridge_id, name: r.name, category: r.category,
      firstAddedAt: r.first_added_at, addedBy: r.added_by,
      purchaseCount: r.purchase_count ?? 1,
    }));
  }
  /** 買い物リスト「買った！」等、在庫登録を伴わない購入の回数を+1する */
  async recordPurchase(userId, fridgeId, name, category) {
    if (name) await this._bumpCatalog(userId, fridgeId, name, category);
  }
  async updateItem(userId, itemId, patch) {
    const mapped = {};
    const conv = { name: "name", category: "category", quantity: "quantity", unit: "unit", expiryDate: "expiry_date", storage: "storage_location", isFavorite: "is_favorite", lowThreshold: "low_threshold", photoPath: "photo_path" };
    for (const [k, v] of Object.entries(patch)) if (conv[k]) mapped[conv[k]] = v;
    const { data, error } = await this.client.from("items").update(mapped).eq("id", itemId).select("*").single();
    if (error) throw new Error(error.message);
    return this._itemFrom(data);
  }
  async deleteItem(userId, itemId) {
    const { error } = await this.client.from("items").delete().eq("id", itemId);
    if (error) throw new Error(error.message);
  }
  /**
   * 削除した食材を元に戻す（「元に戻す」／ゴミ箱からの復元）。
   * スナップショットを元の id で再挿入する。図鑑の購入回数は増やさない
   * （削除でも減らしていないため）。写真ファイル自体は残っているので
   * photoPath があればそのまま表示できる。
   */
  async restoreDeletedItem(userId, fridgeId, snapshot) {
    if (!snapshot || !snapshot.name) throw new Error("戻す食材がありません");
    const row = this._itemTo(snapshot);
    if (snapshot.id) row.id = snapshot.id;
    row.fridge_id = fridgeId;
    row.created_by = userId;
    const { data, error } = await this.client.from("items").insert(row).select().single();
    if (error) throw new Error(error.message);
    const item = this._itemFrom(data);
    if (snapshot.photoDataUrl) item.photoDataUrl = snapshot.photoDataUrl;
    return item;
  }
  /** 本番ではゴミ箱は端末内セッションのみ（app.js 側で保持）。常に空を返す */
  async listTrash() { return []; }

  // ---- 買い物リスト ----
  async listShopping(userId, fridgeId) {
    const { data, error } = await this.client.from("shopping_items").select("*").eq("fridge_id", fridgeId).order("created_at");
    if (error) throw new Error(error.message);
    return data.map((r) => ({
      id: r.id, fridgeId: r.fridge_id, name: r.name, quantity: Number(r.quantity), unit: r.unit,
      source: r.source, linkedItemId: r.linked_item_id, isChecked: r.is_checked, createdBy: r.created_by,
    }));
  }
  async addShopping(userId, fridgeId, data) {
    const { data: row, error } = await this.client.from("shopping_items").insert({
      fridge_id: fridgeId, name: data.name, quantity: data.quantity ?? 1, unit: data.unit || "",
      source: data.source || "manual", linked_item_id: data.linkedItemId || null, created_by: userId,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return { id: row.id, fridgeId: row.fridge_id, name: row.name, quantity: Number(row.quantity), unit: row.unit, source: row.source, linkedItemId: row.linked_item_id, isChecked: row.is_checked };
  }
  async deleteShopping(userId, shoppingId) {
    const { error } = await this.client.from("shopping_items").delete().eq("id", shoppingId);
    if (error) throw new Error(error.message);
  }

  // ---- 設定 ----
  async getSettings(userId, fridgeId) {
    const { data, error } = await this.client.from("fridge_settings").select("family_size").eq("fridge_id", fridgeId).single();
    if (error) return { familySize: 2 };
    return { familySize: data.family_size };
  }
  async updateSettings(userId, fridgeId, patch) {
    const { error } = await this.client.from("fridge_settings")
      .upsert({ fridge_id: fridgeId, family_size: patch.familySize }, { onConflict: "fridge_id" });
    if (error) throw new Error(error.message);
    return { familySize: patch.familySize };
  }

  // ---- レシピお気に入り ----
  // スナップショット（名前・材料・分量・手順）を jsonb で丸ごと保存する。
  // RLS により本人のお気に入りだけが読み書きできる（schema.sql 参照）。
  _favFrom(row) {
    const s = row.snapshot || {};
    return {
      id: row.id, fridgeId: row.fridge_id, userId: row.user_id,
      recipeKey: row.recipe_key, recipeId: row.recipe_id, mode: row.mode,
      title: row.title, minutes: s.minutes ?? null, tip: s.tip || "",
      steps: s.steps || [], have: s.have || [], missing: s.missing || [],
      servings: s.servings ?? null, createdAt: row.created_at,
    };
  }
  async listFavoriteRecipes(userId, fridgeId) {
    const { data, error } = await this.client.from("favorite_recipes")
      .select("*").eq("fridge_id", fridgeId).eq("user_id", userId).order("created_at");
    if (error) throw new Error(error.message);
    return data.map((r) => this._favFrom(r));
  }
  async addFavoriteRecipe(userId, fridgeId, snapshot) {
    const { title, minutes, tip, steps, have, missing, servings, recipeKey, recipeId, mode } = snapshot;
    const { data, error } = await this.client.from("favorite_recipes").upsert({
      fridge_id: fridgeId, user_id: userId, recipe_key: recipeKey, recipe_id: recipeId,
      mode, title, snapshot: { title, minutes, tip, steps, have, missing, servings },
    }, { onConflict: "fridge_id,user_id,recipe_key" }).select("*").single();
    if (error) throw new Error(error.message);
    return this._favFrom(data);
  }
  async removeFavoriteRecipe(userId, fridgeId, favId) {
    const { error } = await this.client.from("favorite_recipes").delete()
      .eq("id", favId).eq("user_id", userId).eq("fridge_id", fridgeId);
    if (error) throw new Error(error.message);
  }

  // ---- プッシュ通知の購読保存（push_subscriptions テーブル・本人のみRLS） ----
  // VAPID 鍵と送信側 Edge Function が揃うまでは呼ばれない想定。
  async savePushSubscription(userId, subscription) {
    const sub = typeof subscription?.toJSON === "function" ? subscription.toJSON() : subscription;
    if (!sub?.endpoint) return { saved: false, reason: "no_endpoint" };
    const { error } = await this.client.from("push_subscriptions").upsert({
      user_id: userId,
      endpoint: sub.endpoint,
      subscription: sub,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,endpoint" });
    if (error) throw new Error(error.message);
    return { saved: true };
  }

  // ---- リアルタイム更新（Supabase Realtime / postgres_changes） ----
  /**
   * 現在の冷蔵庫の items / shopping_items / fridge_catalog の変更を購読する。
   * 戻り値: 購読解除関数。Realtime が使えない環境では null を返し、
   * 呼び出し側は従来の再読み込み動作にフォールバックする。
   * 前提: schema.sql 末尾の publication 設定（supabase_realtime への追加）。
   */
  subscribeFridge(fridgeId, onChange) {
    if (!this.client || typeof this.client.channel !== "function" || !fridgeId) return null;
    try {
      const channel = this.client.channel(`wagaya-fridge-${fridgeId}`);
      for (const table of ["items", "shopping_items", "fridge_catalog"]) {
        channel.on("postgres_changes",
          { event: "*", schema: "public", table, filter: `fridge_id=eq.${fridgeId}` },
          () => { try { onChange(table); } catch { /* 描画側の失敗で購読を止めない */ } });
      }
      channel.subscribe();
      return () => { try { this.client.removeChannel(channel); } catch { /* noop */ } };
    } catch {
      return null;
    }
  }

  // ---- 写真（非公開バケット + 署名付きURL） ----
  async attachPhoto(userId, item, file) {
    if (!file) return null;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("写真は JPEG / PNG / WebP のみ対応しています");
    if (file.size > 5 * 1024 * 1024) throw new Error("写真は5MB以下にしてください");
    // パス先頭を fridge_id にする（Storage ポリシーでメンバー判定に使う）
    const safeName = `${item.id}-${Date.now()}.jpg`;
    const path = `${item.fridgeId}/${safeName}`;
    const { error } = await this.client.storage.from(BUCKET).upload(path, file, { upsert: true, contentType: file.type });
    if (error) throw new Error(error.message);
    await this.updateItem(userId, item.id, { photoPath: path });
    return path;
  }
  async photoUrl(item) {
    if (!item.photoPath) return null;
    const { data, error } = await this.client.storage.from(BUCKET).createSignedUrl(item.photoPath, 3600);
    if (error) return null;
    return data.signedUrl;
  }
}
