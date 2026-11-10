// send-reminders — サーバー発プッシュ通知（雛形・未デプロイ）
//
// このファイルは雛形です。まだデプロイしておらず、現時点では
// サーバー発プッシュは動作しません。有効化の手順は README
// 「プッシュ通知（サーバー発）について」を参照してください。
//
// 役割（有効化後）:
// - 定期実行（Supabase の Scheduled Functions / pg_cron から呼び出し）で、
// 各ユーザーの冷蔵庫の「期限3日以内」「お気に入り残りわずか」を集計し、
// public.push_subscriptions に保存された購読先へ Web Push を送る。
// - 送信には VAPID 鍵ペアが必要。秘密鍵は Edge Function の Secrets にだけ置き、
// フロントエンド（config.js）には公開鍵だけを置く。
// - DB アクセスは service role（Secrets の SUPABASE_SERVICE_ROLE_KEY）を使う。
// これはサーバー側専用で、ブラウザに渡してはならない。
//
// 実装メモ（有効化時に行うこと）:
// 1. Web Push 送信ライブラリ（例: npm:@negrel/webpush 等、Deno 対応のもの）を
// import し、VAPID 鍵で署名して各 endpoint へ POST する。
// 2. 期限切れの購読（push 送信が 404/410）になった行は削除する。
// 3. 同じ内容を1日に何度も送らないよう、送信履歴テーブル等で抑制する。
// 4. 呼び出しは cron からのみ想定し、共有シークレットで検証する。

// Deno 環境でのみ意味を持つ雛形。未実装であることを明示して 501 を返す。
// @ts-ignore: Deno is provided by the Supabase Edge Runtime
const DenoRef = (globalThis as unknown as { Deno?: { serve: (fn: (req: Request) => Response) => void}}).Deno;
if (DenoRef) {
DenoRef.serve(() =>
new Response(JSON.stringify({ error: "not_implemented", message: "サーバー発プッシュは未設定です。README の手順を参照してください。"}), {
status: 501,
headers: { "Content-Type": "application/json"},
})
);
}
