// firebase-model.js — Firebase（Firestore）用データ変換レイヤー（純粋関数）
//
// firebase-store.js から分離した「ドキュメント ⇔ アプリ内オブジェクト」の
// 変換と、ドキュメントID・招待コードハッシュの生成だけを担う。
// Firebase SDK に依存しないため、実プロジェクトが無くても単体テストできる
// （tests/demo-flow.test.mjs の「Firebase データ変換」節）。
//
// データモデル（Firestore コレクション構成。supabase/schema.sql と対応）:
//   users/{uid}                        プロフィール（本人のみ読み書き）
//     users/{uid}/push_tokens/{hash}   FCM トークン（本人のみ）
//   fridges/{fridgeId}                 冷蔵庫本体 { name, ownerId, createdAt }
//   fridge_members/{fridgeId}_{uid}    メンバー { fridgeId, userId, role, displayName, joinedAt }
//   fridge_invite_codes/{fridgeId}     コード平文 { codePlain, ownerId }（作成者だけが読める）
//   fridge_codes/{codeHash}            照合用 { fridgeId }（ID=SHA-256ハッシュのみ。平文は置かない）
//   items/{itemId}                     在庫（fridgeId を含む）
//   shopping_items/{id}                買い物リスト（fridgeId を含む）
//   fridge_catalog/{fridgeId}__{name}  図鑑コレクション（購入回数つき）
//   favorite_recipes/{複合ID}          レシピお気に入り（userId を含み本人だけ）
//   fridge_settings/{fridgeId}         設定 { familySize }

import { sha256Hex, normalizeCode, todayISO } from "./util.js";

/** フレンドコードの照合キー（fridge_codes のドキュメントID）。平文は保存しない */
export async function inviteCodeHash(rawCode) {
  return sha256Hex("invite:" + normalizeCode(rawCode));
}

/** メンバードキュメントのID（セキュリティルールからも同じ規則で参照される） */
export function memberDocId(fridgeId, userId) {
  return `${fridgeId}_${userId}`;
}

/** 図鑑ドキュメントのID（冷蔵庫×食材名で一意） */
export function catalogDocId(fridgeId, name) {
  return `${fridgeId}__${encodeURIComponent(String(name || ""))}`;
}

/** レシピお気に入りドキュメントのID（冷蔵庫×ユーザー×レシピキーで一意） */
export function favoriteDocId(fridgeId, userId, recipeKey) {
  return `${fridgeId}__${userId}__${encodeURIComponent(String(recipeKey || ""))}`;
}

/** FCMトークンの保存先ドキュメントID（トークン自体のハッシュ。長いトークンをIDにしない） */
export async function pushTokenDocId(token) {
  return sha256Hex("fcm:" + String(token || ""));
}

// ---- 在庫アイテム ----
export function itemToDoc(item) {
  return {
    fridgeId: item.fridgeId,
    name: String(item.name || ""),
    category: item.category || "その他",
    quantity: Number(item.quantity) || 0,
    unit: item.unit || "",
    expiryDate: item.expiryDate || null,
    storage: item.storage || "冷蔵庫",
    isFavorite: !!item.isFavorite,
    lowThreshold: Number(item.lowThreshold ?? 1),
    photoPath: item.photoPath || null,
    createdBy: item.createdBy || null,
    createdAt: item.createdAt || todayISO(),
  };
}
export function itemFromDoc(id, doc) {
  if (!doc) return null;
  return {
    id, fridgeId: doc.fridgeId, name: doc.name, category: doc.category,
    quantity: Number(doc.quantity) || 0, unit: doc.unit || "",
    expiryDate: doc.expiryDate || null, storage: doc.storage || "冷蔵庫",
    isFavorite: !!doc.isFavorite, lowThreshold: Number(doc.lowThreshold ?? 1),
    photoPath: doc.photoPath || null, photoDataUrl: null,
    createdBy: doc.createdBy || null,
    // 登録日（レシピの消費順＝期限の近さ→購入の古さ の並び替え用）
    createdAt: doc.createdAt ? String(doc.createdAt).slice(0, 10) : null,
  };
}
/** updateItem のパッチ（アプリ側キー）をドキュメント側キーへ変換する */
export function itemPatchToDoc(patch) {
  const out = {};
  const keys = ["name", "category", "quantity", "unit", "storage", "isFavorite", "photoPath"];
  for (const k of keys) if (k in patch) out[k] = patch[k];
  if ("expiryDate" in patch) out.expiryDate = patch.expiryDate || null;
  if ("lowThreshold" in patch) out.lowThreshold = Number(patch.lowThreshold ?? 1);
  if ("quantity" in patch) out.quantity = Number(patch.quantity) || 0;
  return out;
}

// ---- 買い物リスト ----
export function shoppingToDoc(data, fridgeId, userId) {
  return {
    fridgeId, name: String(data.name || ""), quantity: Number(data.quantity ?? 1),
    unit: data.unit || "", source: data.source || "manual",
    linkedItemId: data.linkedItemId || null, isChecked: !!data.isChecked,
    createdBy: userId, createdAt: new Date().toISOString(),
  };
}
export function shoppingFromDoc(id, doc) {
  if (!doc) return null;
  return {
    id, fridgeId: doc.fridgeId, name: doc.name, quantity: Number(doc.quantity) || 0,
    unit: doc.unit || "", source: doc.source || "manual",
    linkedItemId: doc.linkedItemId || null, isChecked: !!doc.isChecked,
    createdBy: doc.createdBy || null,
  };
}

// ---- 食材図鑑コレクション ----
export function catalogToDoc(data, userId) {
  return {
    fridgeId: data.fridgeId, name: String(data.name || ""), category: data.category || "その他",
    firstAddedAt: data.firstAddedAt || todayISO(), addedBy: data.addedBy || userId || null,
    purchaseCount: Number(data.purchaseCount ?? 1),
  };
}
export function catalogFromDoc(id, doc) {
  if (!doc) return null;
  return {
    id, fridgeId: doc.fridgeId, name: doc.name, category: doc.category,
    firstAddedAt: doc.firstAddedAt, addedBy: doc.addedBy,
    purchaseCount: doc.purchaseCount ?? 1,
  };
}

// ---- レシピお気に入り ----
export function favoriteToDoc(snapshot, fridgeId, userId) {
  const { title, minutes, tip, steps, have, missing, servings, recipeKey, recipeId, mode } = snapshot;
  return {
    fridgeId, userId, recipeKey, recipeId, mode, title,
    snapshot: { title, minutes: minutes ?? null, tip: tip || "", steps: steps || [], have: have || [], missing: missing || [], servings: servings ?? null },
    createdAt: new Date().toISOString(),
  };
}
export function favoriteFromDoc(id, doc) {
  if (!doc) return null;
  const s = doc.snapshot || {};
  return {
    id, fridgeId: doc.fridgeId, userId: doc.userId,
    recipeKey: doc.recipeKey, recipeId: doc.recipeId, mode: doc.mode,
    title: doc.title, minutes: s.minutes ?? null, tip: s.tip || "",
    steps: s.steps || [], have: s.have || [], missing: s.missing || [],
    servings: s.servings ?? null, createdAt: doc.createdAt,
  };
}

// ---- 冷蔵庫・メンバー ----
export function fridgeFromDoc(id, doc, myRole) {
  if (!doc) return null;
  return { id, name: doc.name, ownerId: doc.ownerId, role: myRole || (doc._role || "member") };
}
export function memberFromDoc(doc) {
  if (!doc) return null;
  return {
    userId: doc.userId, role: doc.role, joinedAt: doc.joinedAt,
    // 表示名はメンバー登録時のスナップショット（他人のプロフィールを読まない設計）
    displayName: doc.displayName || "なまえ未設定", email: "",
  };
}
