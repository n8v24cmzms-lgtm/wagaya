// notify.js — 通知（プッシュ／ローカル通知）
//
// できること・できないこと（正直な切り分け）:
//
// - 通知許可の取得（設定画面のボタン）
// - アプリを開いたタイミングでのローカル通知：期限が近い／お気に入りが
// 残りわずかの食材があれば、Notification API でこの端末に通知する
// （1日に1回まで。サーバー不要）
// - Service Worker 側の push / notificationclick ハンドラ（sw.js）。
// サーバーから push が届けば表示できる状態にしてある。
//
// - サーバー発プッシュ（アプリを開いていないときの通知）。
// 現行バックエンドは FCM（Firebase Cloud Messaging）: クライアント側は
// FirebaseStore.registerPushToken がトークンを users/{uid}/push_tokens に
// 登録する（config.js の FCM_VAPID_KEY が必要）。送信側には Cloud Functions
// （Blaze プラン）等のサーバー処理が別途必要で、未設定の間は届かない。
// 下の subscribePush / urlBase64ToUint8Array は旧 Supabase 方式（Web Push +
// VAPID）のロールバック用に残してある。
// 手順は README「プッシュ通知（サーバー発）について」を参照。

import { daysUntil, expiryLabel, todayISO} from "./util.js";

export const NOTIFY_STAMP_KEY = "wagaya_notify_last_v1";

/** 通知すべき内容を在庫から組み立てる（純粋関数・テスト対象） */
export function buildReminders(items, today = todayISO()) {
const reminders = [];
for (const item of items || []) {
const d = daysUntil(item.expiryDate);
if (d!== null && d <= 3) {
reminders.push({
kind: "expiry", name: item.name,
message: d < 0
? `「${item.name}」の期限が過ぎています`
: `「${item.name}」は${expiryLabel(item.expiryDate)}です`,
});
}
if (item.isFavorite && Number(item.quantity) <= Number(item.lowThreshold?? 1)) {
reminders.push({ kind: "low", name: item.name, message: `お気に入り「${item.name}」が残りわずかです`});
}
}
return reminders;
}

export function notificationSupport(g = globalThis) {
return typeof g!== "undefined" && "Notification" in g;
}

export function permissionState(g = globalThis) {
if (!notificationSupport(g)) return "unsupported";
return g.Notification.permission; // "granted" | "denied" | "default"
}

/**
* アプリを開いたときのローカル通知。
* deps でテスト用の差し替えができるようにしてある:
* { permission, show(title, options), storage, today}
* 戻り値: { sent: boolean, reason?: string, count?: number}
*/
export async function notifyOnOpen(items, deps = {}) {
const storage = deps.storage?? (() => { try { return globalThis.localStorage;} catch { return null;}})();
const today = deps.today || todayISO();
const permission = deps.permission?? permissionState();
if (permission === "unsupported") return { sent: false, reason: "unsupported"};
if (permission!== "granted") return { sent: false, reason: "not_granted"};
const reminders = buildReminders(items, today);
if (reminders.length === 0) return { sent: false, reason: "no_reminders"};
try {
if (storage?.getItem(NOTIFY_STAMP_KEY) === today) return { sent: false, reason: "already_today"};
} catch { /* 読めなくても通知は試みる */}
const show = deps.show || (async (title, options) => {
const reg = await globalThis.navigator?.serviceWorker?.ready.catch(() => null);
if (reg?.showNotification) { await reg.showNotification(title, options); return;}
new globalThis.Notification(title, options); // eslint-disable-line no-new
});
const body = reminders.slice(0, 3).map((r) => r.message).join("\n")
+ (reminders.length > 3? `\nほか ${reminders.length - 3} 件`: "");
await show("わが家の食材手帳", { body, icon: "icon-192.png", data: { url: "./"}});
try { storage?.setItem(NOTIFY_STAMP_KEY, today);} catch { /* 保存失敗は無視 */}
return { sent: true, count: reminders.length};
}

/**
* サーバー発プッシュの購読を開始する。
* VAPID 公開鍵（config.js の VAPID_PUBLIC_KEY）が未設定なら開始しない。
* 戻り値: { ok, reason?, subscription?}
*/
export async function subscribePush(vapidPublicKey, deps = {}) {
if (!vapidPublicKey) return { ok: false, reason: "not_configured"};
const registration = deps.registration
?? (await globalThis.navigator?.serviceWorker?.ready.catch(() => null));
if (!registration?.pushManager) return { ok: false, reason: "unsupported"};
const key = deps.urlBase64ToUint8Array
? deps.urlBase64ToUint8Array(vapidPublicKey)
: urlBase64ToUint8Array(vapidPublicKey);
const subscription = await registration.pushManager.subscribe({
userVisibleOnly: true,
applicationServerKey: key,
});
return { ok: true, subscription: subscription.toJSON? subscription.toJSON(): subscription};
}

export function urlBase64ToUint8Array(base64String) {
const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
const raw = globalThis.atob? globalThis.atob(base64): Buffer.from(base64, "base64").toString("binary");
const out = new Uint8Array(raw.length);
for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
return out;
}
