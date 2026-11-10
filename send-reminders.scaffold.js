// send-reminders.scaffold.js — サーバー発プッシュ（FCM）送信側の雛形
//
// このファイルは雛形です。デプロイしても何も送りません。
// サーバー発プッシュを有効化するには Cloud Functions（Blaze プラン＝
// カード登録が必要）で以下のような処理を実装する必要があります:
//
// 役割（有効化後）:
// - 定期実行（Cloud Scheduler / functions.pubsub.schedule）で全ユーザーを巡回し、
// 各冷蔵庫の「期限3日以内」「お気に入り残りわずか」を集計
// - users/{uid}/push_tokens に登録された FCM トークンへ
// admin.messaging().sendEachForMulticast() で送信
// - 無効なトークン（messaging/registration-token-not-registered）は削除
// - 同じ内容を1日に何度も送らないよう送信履歴で抑制
// - DB アクセスは Admin SDK（サーバー側専用。ブラウザに渡してはならない）
//
// 実装イメージ（コメントアウトした疑似コード）:
// const { onSchedule} = require("firebase-functions/v2/scheduler");
// const admin = require("firebase-admin");
// admin.initializeApp();
// exports.sendReminders = onSchedule("every day 08:00", async () => {
// // TODO: トークン収集 → リマインダー集計 → FCM 送信 → 無効トークン掃除
// // 現時点では未実装。実装するまではこの関数は作らない。
//});
//
// 代替案（Blaze を使いたくない場合）:
// - 外部の定期実行サービス（GitHub Actions の schedule 等）から、
// サービスアカウント鍵を使う小さな送信スクリプトを1日1回動かす方法もある。
// その場合も鍵はサーバー（CI の Secrets）だけに置き、アプリには入れない。
