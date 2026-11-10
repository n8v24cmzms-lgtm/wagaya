// firebase-messaging-sw.js — FCM（Firebase Cloud Messaging）用 Service Worker（予備）
//
// 位置づけ:
// - アプリが実際に登録するのは sw.js で、sw.js 側にも FCM のバックグラウンド
//   受信（onBackgroundMessage）を同梱してある。通常はこのファイルは使わない。
// - FCM の標準構成（/firebase-messaging-sw.js を専用に登録する方式）に
//   切り替えたくなった場合のために、同じ設定で動く単独版を用意しておく。
//   両方を同時に登録しないこと（通知が二重に出る）。
//
// 設定は config.js（globalThis.WAGAYA_CONFIG.FIREBASE）から読む。
// 未設定（デモモード）では何も初期化しない。

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
} catch { /* デモモード・未設定では何もしない */ }

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
