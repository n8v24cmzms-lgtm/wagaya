// sw.js — PWA 用 Service Worker
// 方針: アプリの殻（HTML/CSS/JS）はキャッシュして高速・オフライン表示に対応。
// Firebase への通信は常にネットワーク（キャッシュしない）ことで、
// 在庫データが古いまま固定される事故を防ぐ。
const CACHE = "wagaya-shokuzai-v18";
const SHELL = [
  "./", "./index.html", "./styles.css", "./config.js", "./manifest.webmanifest", "./icon.svg",
  "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png", "./favicon-32.png", "./favicon.ico",
  "./js/app.js", "./js/util.js", "./js/recipes.js", "./js/levels.js", "./js/knowledge.js", "./js/demo-store.js", "./js/supabase-store.js", "./js/firebase-store.js", "./js/firebase-model.js", "./js/qrcode.js", "./js/icons.js",
  "./js/guide.js", "./js/legal.js", "./js/notify.js", "./js/game.js",
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return; // 外部（Firebase等）は素通し
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }))
  );
});

// ---- FCM（Firebase Cloud Messaging）のバックグラウンド受信 ----
// config.js の Firebase 設定が入っているときだけ初期化する（デモモードでは無効）。
// 注意: 送信側（Cloud Functions 等）が用意できなければメッセージは届かない。
// config.js は globalThis.WAGAYA_CONFIG を使うため Service Worker でも読める。
try {
  importScripts("./config.js");
  importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js");
  importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js");
  const fc = (self.WAGAYA_CONFIG || {}).FIREBASE || {};
  if (fc.apiKey && typeof firebase !== "undefined") {
    firebase.initializeApp(fc);
    const messaging = firebase.messaging();
    messaging.onBackgroundMessage((payload) => {
      const n = payload.notification || {};
      const data = payload.data || {};
      self.registration.showNotification(n.title || "わが家の食材手帳", {
        body: n.body || data.body || "期限が近い食材があります。アプリで確認してください。",
        icon: "./icon-192.png",
        badge: "./icon-192.png",
        data: { url: data.url || "./" },
      });
    });
  }
} catch { /* デモモード・未設定では FCM を初期化しない */ }

// ---- Web Push（サーバー発通知）の受け口 ----
// 旧 Supabase 方式（ロールバック時）の Web Push もこのハンドラで表示できる。
// ペイロード形式: JSON { title, body, url }
self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { body: e.data ? e.data.text() : "" }; }
  const title = data.title || "わが家の食材手帳";
  const options = {
    body: data.body || "期限が近い食材があります。アプリで確認してください。",
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    data: { url: data.url || "./" },
  };
  e.waitUntil(self.registration.showNotification(title, options));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) { client.navigate(target).catch(() => {}); return client.focus(); }
      }
      return self.clients.openWindow(target);
    })
  );
});
