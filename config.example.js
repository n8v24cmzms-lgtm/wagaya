// config.example.js — 設定例。config.js にコピーして値を入れてください。
//
// Firebase コンソール → プロジェクトの設定 → 全般 → マイアプリ（Web）で
// 表示される firebaseConfig がそのまま対応します。
// ※ apiKey は Web 公開用の値で、秘密鍵ではありません。サービスアカウント
//    など管理者用の鍵は絶対に書かないでください。
globalThis.WAGAYA_CONFIG = {
  FIREBASE: {
    apiKey: "AIzaSy...（Web API Key）",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "1234567890",
    appId: "1:1234567890:web:xxxxxxxxxxxxxxxxxxxxxx",
  },
  // サーバー発プッシュ（FCM）を使う場合のみ: Web Push 証明書キー（公開鍵）
  FCM_VAPID_KEY: "",
};
