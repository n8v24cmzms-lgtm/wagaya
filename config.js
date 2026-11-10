// config.js — Firebase 接続設定（本番モード用）
// Firebase コンソールの Web アプリ設定（firebaseConfig）から転記。
// apiKey は Web 公開用の値で、秘密鍵ではありません。
globalThis.WAGAYA_CONFIG = {
  FIREBASE: {
    apiKey: "AIzaSyCW8R9WlrvyRXW0AcnXL-gGjINC-AcdT_8",
    authDomain: "wagaya-shokuzai.firebaseapp.com",
    projectId: "wagaya-shokuzai",
    storageBucket: "wagaya-shokuzai.firebasestorage.app",
    messagingSenderId: "748197821760",
    appId: "1:748197821760:web:d948bd2436b803d7dc0ea5",
  },
  // サーバー発プッシュ（FCM）用。未使用のため空のまま
  FCM_VAPID_KEY: "",
};
