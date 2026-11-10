// guide.js — はじめてガイド（初回だけ表示・設定から再表示可）
//
// - 内容は家族・子どもにも分かる言葉で「登録 → 買い物 → レシピ」の3ステップと、
//   フレンドコード／QRでの冷蔵庫参加の説明。
// - 「表示済み」の記録は端末内 localStorage にユーザーID単位で持つ
//   （デモ・本番共通。サーバーには送らない）。

export const GUIDE_STEPS = [
  {
    icon: "🧊",
    title: "ステップ1：食材を登録しよう",
    body: "「在庫」タブのフォームに、買ってきた食材の名前・数・期限を入れて登録します。白菜やキャベツは半玉（1/2玉）でも登録できます。写真を付けることもできます。",
  },
  {
    icon: "🛒",
    title: "ステップ2：買い物リストを使おう",
    body: "お気に入りの食材が少なくなると、買い物リストに自動で追加されます。お店で買えたら「買った！」を押すと在庫に戻ります。子どもは大きなキャラと名前を見ておつかいできます。",
  },
  {
    icon: "🍳",
    title: "ステップ3：レシピを見てみよう",
    body: "「レシピ」タブでは、冷蔵庫にある食材で作れる料理を提案します。期限の近いものから使う順番で表示されるので、食材を無駄にしにくいです。家族の人数に合わせて分量も変わります。",
  },
  {
    icon: "🔗",
    title: "家族で同じ冷蔵庫を使うには",
    body: "冷蔵庫を作った人が「共有・設定」タブでフレンドコード（またはQRコード）を家族に伝えます。家族は自分のアカウントでログインして、コードを入力するかQRを読み取れば、同じ冷蔵庫に参加して一緒に編集できます。コードは家族だけに教えてください。",
  },
];

const KEY_PREFIX = "wagaya_guide_seen_v1:";

export function guideStorageKey(userId) {
  return KEY_PREFIX + (userId || "anonymous");
}

/** そのユーザーがガイドを読み終わった（閉じた）かどうか */
export function guideSeen(storage, userId) {
  try {
    return !!storage?.getItem(guideStorageKey(userId));
  } catch {
    return false;
  }
}

/** ガイドを読み終わったとして記録する（次回から自動表示しない） */
export function markGuideSeen(storage, userId) {
  try {
    storage?.setItem(guideStorageKey(userId), new Date().toISOString());
  } catch { /* 保存できなくても致命的ではない */ }
}
