// recipes.js — ルールベースのレシピ提案
// 在庫の食材名とレシピ材料のキーワードを照合し、
// モード "stock"  = あるもので作る（買い足し 0 件のみ）
// モード "shop"   = 買い出しで作る（買い足し最大 3 件まで、買い物リストへ追加可）
// 分量は家族人数 (servings) に比例して換算する。
//
// バリエーション拡充（2026-11-09「レシピはもう少しバリエーション出せた方が嬉しい」）:
// - 同じ主材料でも調理法・味付けの違う料理を複数用意（和風・洋風・中華／
//   炒める・煮る・焼く・蒸す・揚げる・スープ・サラダ）
// - 各レシピに course（主菜／副菜／汁物／主食／サラダ）を持たせ、
//   suggestMealSet で「主菜＋副菜＋汁物」の献立セットも提案できる
// - 少量の残り食材を活かす「使い切り」レシピ（useUp）
// - 提案順には日替わりローテーション（rotateKey、既定は今日の日付）を
//   小さく効かせ、同じ顔ぶれが毎日先頭に並ばないようにする（期限の近い
//   食材を優先するスコア差の方が大きいので、FIFO の優先順位は崩れない）

export const RECIPES = [
  { id: "oyakodon", title: "親子丼", minutes: 20, ingredients: [
    { name: "鶏もも肉", match: ["鶏もも", "鶏肉", "とり肉"], per: 75, unit: "g" },
    { name: "卵", match: ["卵", "たまご"], per: 1.5, unit: "個" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.5, unit: "個" },
  ], steps: ["玉ねぎを薄切りにし、鶏肉は一口大に切る", "だし・醤油・みりん・砂糖で鶏肉と玉ねぎを煮る", "溶き卵を回し入れ、半熟で火を止める", "ごはんにのせて完成"], tip: "卵は2回に分けて入れるとふんわりします" },
  { id: "teriyaki", title: "鶏の照り焼き", minutes: 20, ingredients: [
    { name: "鶏もも肉", match: ["鶏もも", "鶏肉", "とり肉"], per: 100, unit: "g" },
    { name: "キャベツ", match: ["キャベツ"], per: 50, unit: "g" },
  ], steps: ["鶏肉の皮目から焼いて脂を出す", "醤油・みりん・砂糖のタレを絡めて照りを出す", "千切りキャベツを添える"], tip: "焼く前にキッチンペーパーで水分を拭くと皮がパリッとします" },
  { id: "nikujaga", title: "肉じゃが", minutes: 35, ingredients: [
    { name: "豚肉", match: ["豚肉", "牛肉"], per: 75, unit: "g" },
    { name: "じゃがいも", match: ["じゃがいも", "ジャガイモ"], per: 1.5, unit: "個" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.5, unit: "本" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.5, unit: "個" },
  ], steps: ["野菜は大きめに切る", "肉を炒め、野菜とだし・調味料を加えて煮る", "落し蓋をして15分煮込み、火を止めて味をなじませる"], tip: "一度冷ますと味がしみます" },
  { id: "yasai-itame", title: "野菜炒め", minutes: 15, ingredients: [
    { name: "豚肉", match: ["豚肉"], per: 60, unit: "g" },
    { name: "キャベツ", match: ["キャベツ"], per: 60, unit: "g" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
    { name: "もやし", match: ["もやし"], per: 0.5, unit: "袋" },
  ], steps: ["肉と野菜を強火で手早く炒める", "塩こしょうと醤油で味付け"], tip: "野菜の水分を飛ばすように炒めるのがコツ" },
  { id: "omurice", title: "オムライス", minutes: 25, ingredients: [
    { name: "卵", match: ["卵", "たまご"], per: 2, unit: "個" },
    { name: "鶏もも肉", match: ["鶏もも", "鶏肉"], per: 50, unit: "g" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.5, unit: "個" },
    { name: "ケチャップ", match: ["ケチャップ"], per: 2, unit: "大さじ" },
  ], steps: ["鶏肉と玉ねぎを炒め、ごはんとケチャップでチキンライスを作る", "卵を半熟に焼いてライスを包む"], tip: "卵に牛乳を少し加えるとふんわりします" },
  { id: "curry", title: "カレーライス", minutes: 40, ingredients: [
    { name: "豚肉", match: ["豚肉", "鶏肉", "牛肉"], per: 75, unit: "g" },
    { name: "じゃがいも", match: ["じゃがいも", "ジャガイモ"], per: 1, unit: "個" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.5, unit: "本" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.75, unit: "個" },
    { name: "カレールー", match: ["カレールー", "ルー"], per: 1, unit: "かけ" },
  ], steps: ["材料を炒めて水を加え、野菜が柔らかくなるまで煮る", "火を止めてルーを溶かし、とろみがつくまで煮込む"], tip: "玉ねぎをよく炒めると甘みが出ます" },
  { id: "misoshiru", title: "具だくさん味噌汁", minutes: 15, ingredients: [
    { name: "豆腐", match: ["豆腐"], per: 0.25, unit: "丁" },
    { name: "味噌", match: ["味噌", "みそ"], per: 1.5, unit: "大さじ" },
    { name: "わかめ", match: ["わかめ"], per: 2, unit: "g" },
  ], steps: ["だしで豆腐とわかめを温める", "火を弱めて味噌を溶く（沸騰させない）"], tip: "余り野菜を入れてもおいしい一品" },
  { id: "salad", title: "トマトと卵のサラダ", minutes: 10, ingredients: [
    { name: "トマト", match: ["トマト"], per: 1, unit: "個" },
    { name: "卵", match: ["卵", "たまご"], per: 1, unit: "個" },
    { name: "レタス", match: ["レタス", "キャベツ"], per: 30, unit: "g" },
  ], steps: ["卵はゆで卵にして粗く崩す", "トマトとレタスと合わせてドレッシングで和える"], tip: "食べる直前に和えると水っぽくなりません" },
  { id: "shogayaki", title: "豚の生姜焼き", minutes: 20, ingredients: [
    { name: "豚肉", match: ["豚肉"], per: 100, unit: "g" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.5, unit: "個" },
    { name: "生姜", match: ["生姜", "しょうが"], per: 5, unit: "g" },
  ], steps: ["生姜・醤油・みりんのタレに豚肉を漬ける", "玉ねぎと一緒に焼き、タレを絡める"], tip: "漬け込み10分で味がしっかり入ります" },
  { id: "fried-rice", title: "チャーハン", minutes: 15, ingredients: [
    { name: "卵", match: ["卵", "たまご"], per: 1.5, unit: "個" },
    { name: "ねぎ", match: ["ねぎ", "ネギ", "長ねぎ"], per: 0.3, unit: "本" },
    { name: "ハム", match: ["ハム", "ベーコン", "ウインナー"], per: 20, unit: "g" },
  ], steps: ["ごはんと卵を強火でパラッと炒める", "ハムとねぎを加え、醤油で香り付け"], tip: "ごはんは温かいものを使うとパラッと仕上がります" },
  { id: "mabo-dofu", title: "麻婆豆腐", minutes: 20, ingredients: [
    { name: "豆腐", match: ["豆腐"], per: 0.75, unit: "丁" },
    { name: "豚ひき肉", match: ["ひき肉", "豚肉"], per: 60, unit: "g" },
    { name: "ねぎ", match: ["ねぎ", "ネギ", "長ねぎ"], per: 0.3, unit: "本" },
  ], steps: ["ひき肉を炒め、豆板醤と調味料で味付け", "豆腐を加えて煮し、水溶き片栗粉でとろみをつける"], tip: "豆腐は塩ゆでしておくと崩れにくいです" },
  { id: "potato-sarada", title: "ポテトサラダ", minutes: 25, ingredients: [
    { name: "じゃがいも", match: ["じゃがいも", "ジャガイモ"], per: 1.5, unit: "個" },
    { name: "きゅうり", match: ["きゅうり"], per: 0.3, unit: "本" },
    { name: "ハム", match: ["ハム"], per: 15, unit: "g" },
    { name: "卵", match: ["卵", "たまご"], per: 0.5, unit: "個" },
  ], steps: ["じゃがいもを柔らかく茹でて熱いうちに潰す", "具材とマヨネーズで和える"], tip: "じゃがいもに酢を少し加えると味が引き締まります" },
];

// ---- 既存12品のメタ情報（ジャンル・調理法・コース） ----
export const RECIPE_META = {
  oyakodon: { genre: "和風", method: "煮る", course: "主食" },
  teriyaki: { genre: "和風", method: "焼く", course: "主菜" },
  nikujaga: { genre: "和風", method: "煮る", course: "主菜" },
  "yasai-itame": { genre: "中華", method: "炒める", course: "主菜" },
  omurice: { genre: "洋風", method: "炒める", course: "主食" },
  curry: { genre: "洋風", method: "煮る", course: "主食" },
  misoshiru: { genre: "和風", method: "スープ", course: "汁物", useUp: true },
  salad: { genre: "洋風", method: "サラダ", course: "副菜" },
  shogayaki: { genre: "和風", method: "焼く", course: "主菜" },
  "fried-rice": { genre: "中華", method: "炒める", course: "主食" },
  "mabo-dofu": { genre: "中華", method: "煮る", course: "主菜" },
  "potato-sarada": { genre: "洋風", method: "サラダ", course: "副菜" },
};

// ---- 追加レシピ（同じ主材料に複数の調理法・味付け、使い切り、セット用） ----
export const EXTRA_RECIPES = [
  // 鶏肉のバリエーション
  { id: "karaage", title: "鶏の唐揚げ", minutes: 25, genre: "和風", method: "揚げる", course: "主菜", ingredients: [
    { name: "鶏もも肉", match: ["鶏もも", "鶏肉", "とり肉"], per: 100, unit: "g" },
    { name: "生姜", match: ["生姜", "しょうが"], per: 5, unit: "g" },
    { name: "片栗粉", match: ["片栗粉"], per: 1, unit: "大さじ" },
  ], steps: ["鶏肉を生姜・醤油に15分漬ける", "片栗粉をまぶしてカラッと揚げる"], tip: "二度揚げすると中まで火が通り外はサクッとします" },
  { id: "tori-shioyaki", title: "鶏の塩焼き", minutes: 15, genre: "和風", method: "焼く", course: "主菜", ingredients: [
    { name: "鶏もも肉", match: ["鶏もも", "鶏肉", "とり肉"], per: 100, unit: "g" },
    { name: "レタス", match: ["レタス", "キャベツ"], per: 30, unit: "g" },
  ], steps: ["鶏肉に塩こしょうして皮目から焼く", "両面こんがり焼いてレタスを添える"], tip: "焼く前に常温に戻すと火の通りが均一になります" },
  { id: "mushidori-salad", title: "蒸し鶏のサラダ", minutes: 20, genre: "中華", method: "蒸す", course: "副菜", ingredients: [
    { name: "鶏むね肉", match: ["鶏むね", "むね肉", "鶏肉"], per: 75, unit: "g" },
    { name: "きゅうり", match: ["きゅうり"], per: 0.5, unit: "本" },
    { name: "トマト", match: ["トマト"], per: 0.5, unit: "個" },
  ], steps: ["鶏肉を酒と塩で蒸して（またはレンジで）火を通す", "手で裂いて野菜とごまだれで和える"], tip: "蒸し汁はスープに使うと無駄がありません" },
  { id: "chicken-tomato", title: "チキンのトマト煮", minutes: 30, genre: "洋風", method: "煮る", course: "主菜", ingredients: [
    { name: "鶏もも肉", match: ["鶏もも", "鶏肉", "とり肉"], per: 75, unit: "g" },
    { name: "トマト", match: ["トマト"], per: 1, unit: "個" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.5, unit: "個" },
  ], steps: ["鶏肉と玉ねぎを炒める", "ざく切りトマトとコンソメで15分煮込む"], tip: "仕上げにチーズをのせてもおいしいです" },
  { id: "yurinchi", title: "油淋鶏", minutes: 25, genre: "中華", method: "揚げる", course: "主菜", ingredients: [
    { name: "鶏もも肉", match: ["鶏もも", "鶏肉", "とり肉"], per: 100, unit: "g" },
    { name: "ねぎ", match: ["ねぎ", "ネギ", "長ねぎ"], per: 0.3, unit: "本" },
  ], steps: ["鶏肉に片栗粉をまぶして揚げ焼きにする", "ねぎ・酢・醤油のタレをかける"], tip: "タレは食べる直前にかけると衣がサクッとします" },
  { id: "tori-soup", title: "鶏と野菜のスープ", minutes: 25, genre: "洋風", method: "スープ", course: "汁物", useUp: true, ingredients: [
    { name: "鶏もも肉", match: ["鶏もも", "鶏肉", "とり肉"], per: 40, unit: "g" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.25, unit: "個" },
    { name: "キャベツ", match: ["キャベツ"], per: 30, unit: "g" },
  ], steps: ["材料を一口大に切って水から煮る", "コンソメと塩こしょうで味を整える"], tip: "残り野菜の使い切りに向くスープです" },
  // 豚肉のバリエーション
  { id: "tonjiru", title: "豚汁", minutes: 25, genre: "和風", method: "スープ", course: "汁物", ingredients: [
    { name: "豚肉", match: ["豚肉"], per: 40, unit: "g" },
    { name: "大根", match: ["大根", "だいこん"], per: 50, unit: "g" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
    { name: "味噌", match: ["味噌", "みそ"], per: 1.5, unit: "大さじ" },
  ], steps: ["豚肉と根菜を炒めてからだしで煮る", "味噌を溶いて仕上げる"], tip: "具だくさんにすると一品で満足感があります" },
  { id: "buta-kimchi", title: "豚キムチ炒め", minutes: 15, genre: "中華", method: "炒める", course: "主菜", ingredients: [
    { name: "豚肉", match: ["豚肉"], per: 75, unit: "g" },
    { name: "キムチ", match: ["キムチ"], per: 50, unit: "g" },
    { name: "もやし", match: ["もやし"], per: 0.5, unit: "袋" },
  ], steps: ["豚肉を炒め、キムチともやしを加える", "醤油で香りをつけて手早く仕上げる"], tip: "キムチの汁ごと使うとうまみが増します" },
  { id: "hoikoro", title: "回鍋肉風キャベツ炒め", minutes: 20, genre: "中華", method: "炒める", course: "主菜", ingredients: [
    { name: "豚肉", match: ["豚肉"], per: 75, unit: "g" },
    { name: "キャベツ", match: ["キャベツ"], per: 60, unit: "g" },
    { name: "ピーマン", match: ["ピーマン"], per: 1, unit: "個" },
  ], steps: ["豚肉と野菜を強火で炒める", "味噌・醤油・砂糖のタレを絡める"], tip: "キャベツは最後に入れるとシャキッとします" },
  { id: "shabu-salad", title: "冷しゃぶサラダ", minutes: 15, genre: "和風", method: "サラダ", course: "主菜", ingredients: [
    { name: "豚肉", match: ["豚肉"], per: 75, unit: "g" },
    { name: "レタス", match: ["レタス", "キャベツ"], per: 30, unit: "g" },
    { name: "トマト", match: ["トマト"], per: 0.5, unit: "個" },
    { name: "きゅうり", match: ["きゅうり"], per: 0.5, unit: "本" },
  ], steps: ["豚肉を弱火でゆでて冷ます", "野菜の上にのせ、ごまだれやポン酢で"], tip: "ゆで汁はスープに再利用できます" },
  // 卵のバリエーション
  { id: "tamagoyaki", title: "だし巻き卵", minutes: 10, genre: "和風", method: "焼く", course: "副菜", ingredients: [
    { name: "卵", match: ["卵", "たまご"], per: 2, unit: "個" },
    { name: "ねぎ", match: ["ねぎ", "ネギ", "長ねぎ"], per: 0.2, unit: "本" },
  ], steps: ["卵にだしと塩を混ぜる", "フライパンで少しずつ巻いていく"], tip: "弱めの中火で巻くとふんわりします" },
  { id: "niratama", title: "ニラ玉", minutes: 10, genre: "中華", method: "炒める", course: "主菜", ingredients: [
    { name: "卵", match: ["卵", "たまご"], per: 2, unit: "個" },
    { name: "ニラ", match: ["ニラ", "にら"], per: 0.5, unit: "束" },
  ], steps: ["ニラを炒めて溶き卵を流し入れる", "大きく混ぜて半熟で止める"], tip: "卵は余熱で火が入るので早めに止めます" },
  { id: "tamago-soup", title: "卵とわかめのスープ", minutes: 10, genre: "中華", method: "スープ", course: "汁物", useUp: true, ingredients: [
    { name: "卵", match: ["卵", "たまご"], per: 1, unit: "個" },
    { name: "わかめ", match: ["わかめ"], per: 2, unit: "g" },
    { name: "ねぎ", match: ["ねぎ", "ネギ", "長ねぎ"], per: 0.2, unit: "本" },
  ], steps: ["中華だしでわかめを煮る", "溶き卵を糸のように流し入れる"], tip: "卵1個から作れる使い切りスープです" },
  // 豆腐のバリエーション
  { id: "tofu-salad", title: "豆腐とトマトのサラダ", minutes: 10, genre: "和風", method: "サラダ", course: "副菜", ingredients: [
    { name: "豆腐", match: ["豆腐"], per: 0.5, unit: "丁" },
    { name: "トマト", match: ["トマト"], per: 0.5, unit: "個" },
    { name: "きゅうり", match: ["きゅうり"], per: 0.5, unit: "本" },
    { name: "わかめ", match: ["わかめ"], per: 2, unit: "g" },
  ], steps: ["豆腐は水切りして一口大に", "野菜と合わせて和風ドレッシングで和える"], tip: "食べる直前に和えると水っぽくなりません" },
  { id: "tofu-hamburg", title: "豆腐ハンバーグ", minutes: 25, genre: "和風", method: "焼く", course: "主菜", ingredients: [
    { name: "豆腐", match: ["豆腐"], per: 0.5, unit: "丁" },
    { name: "ひき肉", match: ["ひき肉"], per: 75, unit: "g" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.25, unit: "個" },
  ], steps: ["水切りした豆腐とひき肉・玉ねぎを練る", "形を整えて両面焼き、和風あんをかける"], tip: "豆腐の水切りをしっかりすると崩れません" },
  { id: "shiraae", title: "ほうれん草の白和え", minutes: 15, genre: "和風", method: "和える", course: "副菜", ingredients: [
    { name: "豆腐", match: ["豆腐"], per: 0.5, unit: "丁" },
    { name: "ほうれん草", match: ["ほうれん草"], per: 0.5, unit: "束" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
  ], steps: ["野菜をゆでて水気を絞る", "潰した豆腐と砂糖・醤油で和える"], tip: "豆腐は粗く潰すと食感が残ります" },
  // 魚（鮭）のバリエーション
  { id: "sake-shioyaki", title: "鮭の塩焼き", minutes: 15, genre: "和風", method: "焼く", course: "主菜", ingredients: [
    { name: "鮭", match: ["鮭", "さけ"], per: 1, unit: "切れ" },
    { name: "大根", match: ["大根", "だいこん"], per: 30, unit: "g" },
  ], steps: ["鮭に塩をして10分置く", "グリルやフライパンで焼き、大根おろしを添える"], tip: "水分を拭いてから焼くと臭みが減ります" },
  { id: "sake-meuniere", title: "鮭のムニエル", minutes: 20, genre: "洋風", method: "焼く", course: "主菜", ingredients: [
    { name: "鮭", match: ["鮭", "さけ"], per: 1, unit: "切れ" },
    { name: "小麦粉", match: ["小麦粉"], per: 1, unit: "大さじ" },
    { name: "レモン", match: ["レモン"], per: 0.25, unit: "個" },
  ], steps: ["鮭に塩こしょうと小麦粉をまぶす", "バターで焼いてレモンを絞る"], tip: "粉は薄くまぶすとカリッと仕上がります" },
  { id: "chanchan", title: "鮭のちゃんちゃん焼き", minutes: 25, genre: "和風", method: "蒸す", course: "主菜", ingredients: [
    { name: "鮭", match: ["鮭", "さけ"], per: 1, unit: "切れ" },
    { name: "キャベツ", match: ["キャベツ"], per: 50, unit: "g" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.5, unit: "個" },
    { name: "味噌", match: ["味噌", "みそ"], per: 1, unit: "大さじ" },
  ], steps: ["野菜の上に鮭をのせて蒸し焼きにする", "味噌だれを絡めてほぐす"], tip: "ホットプレートでも作れる北海道の郷土料理です", note: "北海道の漁師ごはん。鉄板の上で鮭と野菜を味噌だれで蒸し焼きにして、みんなでほぐしながら食べるよ。" },
  // 野菜のバリエーション・使い切り
  { id: "millefeuille", title: "白菜と豚肉の重ね煮", minutes: 25, genre: "和風", method: "煮る", course: "主菜", ingredients: [
    { name: "白菜", match: ["白菜"], per: 0.25, unit: "玉" },
    { name: "豚肉", match: ["豚肉"], per: 75, unit: "g" },
    { name: "生姜", match: ["生姜", "しょうが"], per: 5, unit: "g" },
  ], steps: ["白菜と豚肉を交互に重ねて切る", "だしと生姜で煮てポン酢で食べる"], tip: "白菜から水分が出るので水は少なめで大丈夫です" },
  { id: "hakusai-salad", title: "白菜の浅漬け風サラダ", minutes: 10, genre: "和風", method: "サラダ", course: "副菜", useUp: true, ingredients: [
    { name: "白菜", match: ["白菜"], per: 0.125, unit: "玉" },
    { name: "きゅうり", match: ["きゅうり"], per: 0.5, unit: "本" },
  ], steps: ["白菜を塩もみして水気を絞る", "きゅうりとごま油・酢で和える"], tip: "少し残った白菜の使い切りに" },
  { id: "cabbage-soup", title: "キャベツとハムのスープ", minutes: 15, genre: "洋風", method: "スープ", course: "汁物", useUp: true, ingredients: [
    { name: "キャベツ", match: ["キャベツ"], per: 40, unit: "g" },
    { name: "ハム", match: ["ハム"], per: 15, unit: "g" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.25, unit: "個" },
  ], steps: ["材料をコンソメで柔らかく煮る", "塩こしょうで味を整える"], tip: "端野菜の使い切りスープです" },
  { id: "german-potato", title: "ジャーマンポテト", minutes: 20, genre: "洋風", method: "炒める", course: "副菜", ingredients: [
    { name: "じゃがいも", match: ["じゃがいも", "ジャガイモ"], per: 1, unit: "個" },
    { name: "ウインナー", match: ["ウインナー", "ソーセージ"], per: 2, unit: "本" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.25, unit: "個" },
  ], steps: ["じゃがいもをゆでてから切る", "ウインナーと玉ねぎと炒め、塩こしょう"], tip: "じゃがいもの表面をカリッと焼くのがコツ" },
  { id: "potato-soup", title: "ポテトのミルクスープ", minutes: 20, genre: "洋風", method: "スープ", course: "汁物", ingredients: [
    { name: "じゃがいも", match: ["じゃがいも", "ジャガイモ"], per: 1, unit: "個" },
    { name: "牛乳", match: ["牛乳"], per: 100, unit: "mL" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.25, unit: "個" },
  ], steps: ["じゃがいもと玉ねぎを柔らかく煮て潰す", "牛乳でのばしてコンソメで味付け"], tip: "潰し加減でポタージュ風にもなります" },
  { id: "tomato-egg", title: "トマトと卵の中華炒め", minutes: 10, genre: "中華", method: "炒める", course: "主菜", ingredients: [
    { name: "トマト", match: ["トマト"], per: 1, unit: "個" },
    { name: "卵", match: ["卵", "たまご"], per: 2, unit: "個" },
  ], steps: ["卵をふんわり炒めて一度取り出す", "トマトを炒めて卵を戻し、塩と砂糖ひとつまみ"], tip: "トマトの酸味と卵の甘さが合います" },
  { id: "kinpira", title: "きんぴらごぼう", minutes: 15, genre: "和風", method: "炒める", course: "副菜", useUp: true, ingredients: [
    { name: "ごぼう", match: ["ごぼう"], per: 0.5, unit: "本" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
  ], steps: ["ごぼうとにんじんを細切りにする", "ごま油で炒め、醤油・みりん・砂糖で甘辛く"], tip: "少し残った根菜の使い切りに" },
  { id: "yasai-soup", title: "野菜たっぷりコンソメスープ", minutes: 20, genre: "洋風", method: "スープ", course: "汁物", useUp: true, ingredients: [
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.25, unit: "個" },
    { name: "キャベツ", match: ["キャベツ"], per: 30, unit: "g" },
    { name: "じゃがいも", match: ["じゃがいも", "ジャガイモ"], per: 0.5, unit: "個" },
  ], steps: ["全部一口大に切ってコンソメで煮る", "塩こしょうで仕上げる"], tip: "端野菜をまとめて使い切れるスープです" },
];

export const ALL_RECIPES = [...RECIPES, ...EXTRA_RECIPES];

function metaFor(recipe) {
  return RECIPE_META[recipe.id] || {};
}

// ---------- 消費順（先入れ先出しの原則＋ユーザーの優先順位） ----------
// ユーザーの指定: 「消費期限の近いもの → 先に買ったもの → 期限がまだなものの順」
//  1) 消費期限が近いロットから（期限の近さが購入順より優先する）
//  2) 期限が同じなら、先に買った（登録した）ロットから
//  3) 期限なしは期限ありの後ろに回し、その中では購入順
// データモデル上、在庫は「食材ごとに複数エントリ（ロット）」で持つ。
// 実際に料理で使う分はこの並びの先頭ロットから割り当てる（planUsage）。

/** 消費優先度の比較関数（先に使うべきロットが小さい） */
export function compareLotsForUse(a, b) {
  const ea = a.expiryDate || null, eb = b.expiryDate || null;
  if (ea && eb && ea !== eb) return ea < eb ? -1 : 1;
  if (ea && !eb) return -1;
  if (!ea && eb) return 1;
  const ca = a.createdAt || "", cb = b.createdAt || "";
  if (ca !== cb) return ca < cb ? -1 : 1;
  return 0;
}

function matches(item, ingredient) {
  return ingredient.match.some((kw) => item.name.includes(kw) || kw.includes(item.name));
}

/** その材料に使える在庫ロットを、消費順（期限→購入順）に並べて返す */
export function lotsForIngredient(stockItems, ingredient) {
  return stockItems.filter((item) => matches(item, ingredient)).sort(compareLotsForUse);
}

/** 必要量を消費順に先頭ロットから割り当てる使用計画（同単位のロットのみ対象） */
export function planUsage(stockItems, ingredient, amount, unit) {
  const plan = [];
  let rest = amount;
  for (const lot of lotsForIngredient(stockItems, ingredient)) {
    if (rest <= 0) break;
    if (unit && lot.unit !== unit) continue;
    const use = Math.min(rest, Number(lot.quantity) || 0);
    if (use <= 0) continue;
    plan.push({ itemId: lot.id, stockName: lot.name, use, unit: lot.unit, expiryDate: lot.expiryDate || null, registeredAt: lot.createdAt || null });
    rest = Math.round((rest - use) * 1000) / 1000;
  }
  return plan;
}

function findStock(stockItems, ingredient) {
  return lotsForIngredient(stockItems, ingredient)[0] || null;
}

function todayLocalISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function daysBetween(fromISO, toISO) {
  return Math.round((Date.parse(toISO) - Date.parse(fromISO)) / 86400000);
}
/** 代表ロット（消費順の先頭）の「早く使いたい度」ボーナス。期限が近いほど大、期限なしは寝かせた日数で小 */
function urgencyBonus(lot, today) {
  if (!lot) return 0;
  if (lot.expiryDate) {
    const d = daysBetween(today, lot.expiryDate);
    if (d <= 0) return 6;
    if (d <= 2) return 5;
    if (d <= 5) return 3.5;
    if (d <= 10) return 2;
    return 0.5;
  }
  if (lot.createdAt) return Math.min(2, Math.max(0, daysBetween(lot.createdAt, today)) * 0.1);
  return 0;
}

/** ローテーション用の決定的ハッシュ（同じキーでは毎回同じ値） */
function rotationJitter(id, key) {
  let h = 0;
  const s = `${id}|${key}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (h % 90) / 100; // 0〜0.89。期限優先のスコア差（最大で数点）より小さい
}

/**
 * 1品を在庫と照合して評価する共通処理（通常の提案・イベント献立で共用）。
 * 材料を家族人数で換算し、在庫にある材料（have、消費順の先頭ロット付き）と
 * 足りない材料（missing）に分ける。bonus は期限の近さの加点、earliestExpiry は
 * その料理で使う材料のうち最も近い期限。
 */
export function evaluateRecipe(recipe, stockItems, servings = 2, today = todayLocalISO()) {
  const have = [], missing = [];
  let bonus = 0, earliestExpiry = null;
  for (const ing of recipe.ingredients) {
    const entry = { name: ing.name, amount: Math.round(ing.per * servings * 10) / 10, unit: ing.unit };
    const lots = lotsForIngredient(stockItems, ing);
    const rep = lots[0];
    if (rep) {
      // 消費順の先頭ロット（＝この料理で最初に使う分）を材料行に添える（UI表示用）
      entry.fifo = {
        stockName: rep.name,
        expiryDate: rep.expiryDate || null,
        registeredAt: rep.createdAt || null,
        lotCount: lots.length,
      };
      bonus += urgencyBonus(rep, today);
      if (rep.expiryDate && (!earliestExpiry || rep.expiryDate < earliestExpiry)) earliestExpiry = rep.expiryDate;
      have.push(entry);
    } else {
      missing.push(entry);
    }
  }
  const meta = metaFor(recipe);
  return {
    ...recipe, genre: recipe.genre || meta.genre || "その他",
    method: recipe.method || meta.method || "作る", course: recipe.course || meta.course || "主菜",
    useUp: recipe.useUp || meta.useUp || false,
    have, missing, bonus, earliestExpiry,
  };
}

export function suggestRecipes(stockItems, { mode = "stock", servings = 2, limit = 8, rotateKey = null } = {}) {
  const today = todayLocalISO();
  const rotKey = rotateKey ?? today; // 既定は日替わり
  const results = [];
  for (const recipe of ALL_RECIPES) {
    const { bonus, earliestExpiry, ...evaluated } = evaluateRecipe(recipe, stockItems, servings, today);
    const { have, missing } = evaluated;
    if (mode === "stock" && missing.length > 0) continue;
    if (mode === "shop" && missing.length > 3) continue;
    if (have.length === 0) continue;
    results.push({
      ...evaluated,
      score: have.length * 10 - missing.length * 4 + bonus + rotationJitter(recipe.id, rotKey),
      _fifoKey: earliestExpiry,
    });
  }
  // スコア優先、同点なら「いちばん期限が近い材料を持つ料理」を先に
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ea = a._fifoKey, eb = b._fifoKey;
    if (ea && eb) return ea < eb ? -1 : 1;
    if (ea) return -1;
    if (eb) return 1;
    return 0;
  });
  for (const r of results) delete r._fifoKey;
  return results.slice(0, limit);
}

/**
 * 献立セット提案: 「主菜＋副菜＋汁物」の組み合わせを在庫だけで作れるものから選ぶ。
 * 作れるものが無いコースは null。主菜が無ければ全体を null にする。
 * 戻り値: { main, side, soup, recipes: [主菜, 副菜?, 汁物?], totalMinutes }
 */
export function suggestMealSet(stockItems, { servings = 2, rotateKey = null } = {}) {
  const all = suggestRecipes(stockItems, { mode: "stock", servings, limit: ALL_RECIPES.length, rotateKey });
  const pick = (courses, exclude) => all.find((r) => courses.includes(r.course) && !exclude.has(r.id)) || null;
  const used = new Set();
  const main = pick(["主菜", "主食"], used);
  if (!main) return null;
  used.add(main.id);
  const side = pick(["副菜", "サラダ"], used);
  if (side) used.add(side.id);
  const soup = pick(["汁物"], used);
  const recipes = [main, side, soup].filter(Boolean);
  return { main, side, soup, recipes, totalMinutes: recipes.reduce((s, r) => s + (r.minutes || 0), 0) };
}

// ============================================================
// イベント献立（2026-11-10「ハロウィンやクリスマス、正月、冬至などの
// イベント献立も立てれるようにして」）
// 行事ごとに「主菜・副菜・汁物/行事食・デザート」の献立セットを用意する。
// 料理は通常レシピと同じデータモデル（ingredients の match/per/unit、
// 家族人数で換算、have/missing の照合は evaluateRecipe を共用）。
// 既存レシピ（ALL_RECIPES）も献立に再利用し、行事専用の料理は
// EVENT_RECIPES に足す（並行する別システムは作らない）。
// ============================================================

export const EVENT_RECIPES = [
  // ---- ハロウィン ----
  { id: "ev-kabocha-gratin", title: "かぼちゃのグラタン", minutes: 30, genre: "洋風", method: "焼く", course: "主菜", ingredients: [
    { name: "かぼちゃ", match: ["かぼちゃ", "南瓜"], per: 100, unit: "g" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.5, unit: "個" },
    { name: "牛乳", match: ["牛乳"], per: 100, unit: "mL" },
    { name: "チーズ", match: ["チーズ"], per: 20, unit: "g" },
  ], steps: ["かぼちゃと玉ねぎを炒めて牛乳で煮る", "耐熱皿に移してチーズをのせ、焼き色がつくまで焼く"], tip: "かぼちゃの顔をチーズで描くとハロウィンらしくなります" },
  { id: "ev-kabocha-soup", title: "かぼちゃのポタージュ", minutes: 25, genre: "洋風", method: "スープ", course: "汁物", ingredients: [
    { name: "かぼちゃ", match: ["かぼちゃ", "南瓜"], per: 100, unit: "g" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.25, unit: "個" },
    { name: "牛乳", match: ["牛乳"], per: 100, unit: "mL" },
  ], steps: ["かぼちゃと玉ねぎを柔らかく煮て潰す", "牛乳でのばしてコンソメと塩で味を整える"], tip: "皮をむくと色がきれいなオレンジになります" },
  { id: "ev-halloween-salad", title: "かぼちゃとハムのサラダ", minutes: 15, genre: "洋風", method: "サラダ", course: "副菜", ingredients: [
    { name: "かぼちゃ", match: ["かぼちゃ", "南瓜"], per: 75, unit: "g" },
    { name: "ハム", match: ["ハム"], per: 15, unit: "g" },
    { name: "レタス", match: ["レタス", "キャベツ"], per: 30, unit: "g" },
  ], steps: ["かぼちゃを蒸して一口大に切る", "ハムとレタスとマヨネーズで和える"], tip: "レーズンを散らすと甘みが増します" },
  { id: "ev-kabocha-pudding", title: "かぼちゃプリン", minutes: 20, genre: "洋風", method: "蒸す", course: "デザート", ingredients: [
    { name: "かぼちゃ", match: ["かぼちゃ", "南瓜"], per: 75, unit: "g" },
    { name: "卵", match: ["卵", "たまご"], per: 1, unit: "個" },
    { name: "牛乳", match: ["牛乳"], per: 75, unit: "mL" },
    { name: "砂糖", match: ["砂糖"], per: 1, unit: "大さじ" },
  ], steps: ["蒸したかぼちゃを潰し、卵・牛乳・砂糖と混ぜる", "こしてから弱火で蒸し、冷やして固める"], tip: "ジャック・オー・ランタンの顔を描くと子どもが喜びます" },
  // ---- クリスマス ----
  { id: "ev-roast-chicken", title: "ローストチキン", minutes: 45, genre: "洋風", method: "焼く", course: "主菜", ingredients: [
    { name: "鶏もも肉", match: ["鶏もも", "鶏肉", "とり肉"], per: 150, unit: "g" },
    { name: "じゃがいも", match: ["じゃがいも", "ジャガイモ"], per: 1, unit: "個" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.5, unit: "本" },
  ], steps: ["鶏肉に塩こしょうとにんにくをもみ込む", "野菜と一緒にオーブン（またはフライパン＋蓋）でこんがり焼く"], tip: "焼く前に常温に戻すと中まで火が通りやすくなります" },
  { id: "ev-corn-soup", title: "コーンポタージュ", minutes: 15, genre: "洋風", method: "スープ", course: "汁物", ingredients: [
    { name: "コーン缶", match: ["コーン缶", "とうもろこし"], per: 0.5, unit: "缶" },
    { name: "牛乳", match: ["牛乳"], per: 100, unit: "mL" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.25, unit: "個" },
  ], steps: ["玉ねぎを炒め、コーンと水で煮る", "牛乳を加えてコンソメで味を整える"], tip: "コーンを少し残して混ぜると粒の食感が楽しめます" },
  { id: "ev-ichigo-cake", title: "いちごのショートケーキ風", minutes: 15, genre: "洋風", method: "和える", course: "デザート", ingredients: [
    { name: "いちご", match: ["いちご", "苺"], per: 3, unit: "個" },
    { name: "生クリーム", match: ["生クリーム", "ホイップ"], per: 50, unit: "mL" },
    { name: "カステラ", match: ["カステラ", "スポンジ"], per: 1, unit: "切れ" },
  ], steps: ["生クリームを泡立てる", "カステラにクリームといちごを重ねてのせる"], tip: "グラスに重ねるとパフェ風になって簡単です" },
  // ---- お正月（おせち） ----
  { id: "ev-ozoni", title: "お雑煮", minutes: 20, genre: "和風", method: "スープ", course: "行事食", ingredients: [
    { name: "餅", match: ["餅", "もち"], per: 2, unit: "個" },
    { name: "鶏もも肉", match: ["鶏もも", "鶏肉", "とり肉"], per: 40, unit: "g" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
    { name: "大根", match: ["大根", "だいこん"], per: 50, unit: "g" },
  ], steps: ["だしで鶏肉と野菜を煮る", "焼いた餅を入れ、醤油と塩で味を整える"], tip: "地域で味付けが違うので、家の味を子どもに伝える機会に" },
  { id: "ev-datemaki", title: "伊達巻", minutes: 20, genre: "和風", method: "焼く", course: "行事食", ingredients: [
    { name: "卵", match: ["卵", "たまご"], per: 2, unit: "個" },
    { name: "はんぺん", match: ["はんぺん"], per: 0.5, unit: "枚" },
  ], steps: ["はんぺんを潰して卵と混ぜ、砂糖とだしで味付け", "フライパンで焼いて熱いうちに巻く"], tip: "巻物の形は「学問が身につくように」という願いから" },
  { id: "ev-kurikinton", title: "栗きんとん", minutes: 25, genre: "和風", method: "煮る", course: "行事食", ingredients: [
    { name: "さつまいも", match: ["さつまいも", "薩摩芋"], per: 100, unit: "g" },
    { name: "栗", match: ["栗"], per: 2, unit: "個" },
    { name: "砂糖", match: ["砂糖"], per: 1.5, unit: "大さじ" },
  ], steps: ["さつまいもを茹でて熱いうちに潰す", "砂糖と煮汁で練り、栗を混ぜる"], tip: "金色の見た目から「金運」の縁起物です" },
  { id: "ev-kuromame", title: "黒豆", minutes: 30, genre: "和風", method: "煮る", course: "行事食", ingredients: [
    { name: "黒豆", match: ["黒豆"], per: 40, unit: "g" },
    { name: "砂糖", match: ["砂糖"], per: 1.5, unit: "大さじ" },
  ], steps: ["黒豆を一晩水に浸す", "弱火で柔らかくなるまで煮て甘く味付ける"], tip: "「まめに働けるように」という元気の願いがこもっています" },
  { id: "ev-namasu", title: "紅白なます", minutes: 15, genre: "和風", method: "和える", course: "副菜", ingredients: [
    { name: "大根", match: ["大根", "だいこん"], per: 75, unit: "g" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
  ], steps: ["大根とにんじんを千切りにして塩もみする", "甘酢で和えてなじませる"], tip: "紅白の色はお祝いの色です" },
  // ---- 冬至 ----
  { id: "ev-kabocha-croquette", title: "かぼちゃコロッケ", minutes: 30, genre: "和風", method: "揚げる", course: "主菜", ingredients: [
    { name: "かぼちゃ", match: ["かぼちゃ", "南瓜"], per: 100, unit: "g" },
    { name: "豚ひき肉", match: ["ひき肉", "豚肉"], per: 40, unit: "g" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.25, unit: "個" },
    { name: "パン粉", match: ["パン粉"], per: 2, unit: "大さじ" },
  ], steps: ["蒸したかぼちゃを潰し、炒めたひき肉と玉ねぎを混ぜる", "丸めて衣をつけ、カラッと揚げる"], tip: "かぼちゃの甘みで子どもも食べやすいコロッケです" },
  { id: "ev-itokoni", title: "かぼちゃのいとこ煮", minutes: 25, genre: "和風", method: "煮る", course: "副菜", ingredients: [
    { name: "かぼちゃ", match: ["かぼちゃ", "南瓜"], per: 100, unit: "g" },
    { name: "ゆであずき缶", match: ["あずき缶", "小豆缶", "ゆであずき"], per: 0.3, unit: "缶" },
  ], steps: ["かぼちゃをだしで煮る", "ゆであずきを加えて甘く仕上げる"], tip: "冬至にかぼちゃと小豆を食べると風邪をひかないと言われます" },
  { id: "ev-yuzu-daikon", title: "ゆず大根", minutes: 10, genre: "和風", method: "和える", course: "副菜", ingredients: [
    { name: "大根", match: ["大根", "だいこん"], per: 75, unit: "g" },
    { name: "ゆず", match: ["ゆず", "柚子"], per: 0.25, unit: "個" },
  ], steps: ["大根を薄切りにして塩もみする", "ゆずの皮と甘酢で和える"], tip: "冬至のゆず湯と同じく、香りでリラックスできます" },
  // ---- 節分 ----
  { id: "ev-ehomaki", title: "恵方巻", minutes: 25, genre: "和風", method: "和える", course: "行事食", ingredients: [
    { name: "卵", match: ["卵", "たまご"], per: 1, unit: "個" },
    { name: "きゅうり", match: ["きゅうり"], per: 0.5, unit: "本" },
    { name: "かにかま", match: ["かにかま", "カニカマ"], per: 2, unit: "本" },
    { name: "海苔", match: ["海苔", "のり"], per: 1, unit: "枚" },
  ], steps: ["卵は厚焼きにして細長く切る", "酢飯と具を海苔で巻く（ごはんは別に用意）"], tip: "7種類の具は七福神にちなんだ縁起担ぎです" },
  { id: "ev-iwashi", title: "いわしの塩焼き", minutes: 15, genre: "和風", method: "焼く", course: "主菜", ingredients: [
    { name: "いわし", match: ["いわし", "鰯"], per: 2, unit: "尾" },
    { name: "大根", match: ["大根", "だいこん"], per: 30, unit: "g" },
  ], steps: ["いわしに塩をして焼く", "大根おろしを添える"], tip: "いわしの匂いで鬼が近寄らないと言われます" },
  { id: "ev-gomokuni", title: "大豆の五目煮", minutes: 30, genre: "和風", method: "煮る", course: "副菜", ingredients: [
    { name: "大豆", match: ["大豆"], per: 40, unit: "g" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
    { name: "ごぼう", match: ["ごぼう"], per: 0.3, unit: "本" },
  ], steps: ["材料を小さく切ってだしで煮る", "醤油と砂糖で甘辛く仕上げる"], tip: "年の数だけ豆を食べる風習にちなんだ一品です" },
  { id: "ev-kenchin", title: "けんちん汁", minutes: 25, genre: "和風", method: "スープ", course: "汁物", ingredients: [
    { name: "大根", match: ["大根", "だいこん"], per: 50, unit: "g" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
    { name: "ごぼう", match: ["ごぼう"], per: 0.3, unit: "本" },
    { name: "豆腐", match: ["豆腐"], per: 0.25, unit: "丁" },
  ], steps: ["根菜をごま油で炒めてからだしで煮る", "豆腐を崩し入れ、醤油で味を整える"], tip: "野菜たっぷりで体が温まります" },
  // ---- ひな祭り ----
  { id: "ev-chirashi", title: "ちらし寿司", minutes: 30, genre: "和風", method: "和える", course: "行事食", ingredients: [
    { name: "卵", match: ["卵", "たまご"], per: 1.5, unit: "個" },
    { name: "えび", match: ["えび", "海老"], per: 3, unit: "尾" },
    { name: "きゅうり", match: ["きゅうり"], per: 0.5, unit: "本" },
    { name: "海苔", match: ["海苔", "のり"], per: 0.5, unit: "枚" },
  ], steps: ["酢飯を作り（ごはんは別に用意）、錦糸卵を作る", "茹でえびときゅうりを彩りよく散らす"], tip: "えびは「長生き」、れんこんは「見通しがよい」の縁起物です" },
  { id: "ev-hamaguri", title: "はまぐりのお吸い物", minutes: 15, genre: "和風", method: "スープ", course: "汁物", ingredients: [
    { name: "はまぐり", match: ["はまぐり", "蛤"], per: 2, unit: "個" },
    { name: "三つ葉", match: ["三つ葉", "みつば"], per: 2, unit: "本" },
  ], steps: ["砂抜きしたはまぐりを水から温める", "口が開いたら塩と醤油で薄く味付け"], tip: "はまぐりの貝殻は対でぴったり合うことから仲良しの象徴です" },
  { id: "ev-nanohana", title: "菜の花の辛子和え", minutes: 10, genre: "和風", method: "和える", course: "副菜", ingredients: [
    { name: "菜の花", match: ["菜の花"], per: 0.5, unit: "束" },
  ], steps: ["菜の花をさっと茹でて水に取る", "醤油と練り辛子（子どもには抜き）で和える"], tip: "春の訪れを告げる野菜です" },
  { id: "ev-ichigo-kanten", title: "いちごミルク寒天", minutes: 15, genre: "和風", method: "冷やす", course: "デザート", ingredients: [
    { name: "いちご", match: ["いちご", "苺"], per: 3, unit: "個" },
    { name: "牛乳", match: ["牛乳"], per: 100, unit: "mL" },
    { name: "寒天", match: ["寒天", "粉寒天"], per: 1, unit: "g" },
  ], steps: ["寒天を煮溶かして牛乳と砂糖を混ぜる", "いちごを入れて冷やし固める"], tip: "ひし餅のピンク（桃の花）の色をイメージしたデザートです" },
  // ---- こどもの日 ----
  { id: "ev-takenoko-gohan", title: "たけのこごはん", minutes: 15, genre: "和風", method: "煮る", course: "主食", ingredients: [
    { name: "たけのこ", match: ["たけのこ", "筍"], per: 75, unit: "g" },
    { name: "油揚げ", match: ["油揚げ"], per: 0.5, unit: "枚" },
  ], steps: ["たけのこと油揚げをだしで軽く煮る", "炊きたてごはんに混ぜる（ごはんは別に用意）"], tip: "たけのこはすくすく伸びることから成長の象徴です" },
  { id: "ev-wakatake-ni", title: "若竹煮", minutes: 20, genre: "和風", method: "煮る", course: "副菜", ingredients: [
    { name: "たけのこ", match: ["たけのこ", "筍"], per: 75, unit: "g" },
    { name: "わかめ", match: ["わかめ"], per: 3, unit: "g" },
  ], steps: ["たけのこをだしで煮る", "わかめを加えてひと煮立ちさせる"], tip: "春の山と海の幸の組み合わせです" },
  { id: "ev-fruit-punch", title: "フルーツポンチ", minutes: 10, genre: "洋風", method: "和える", course: "デザート", ingredients: [
    { name: "みかん缶", match: ["みかん缶", "みかん"], per: 0.3, unit: "缶" },
    { name: "バナナ", match: ["バナナ"], per: 0.5, unit: "本" },
    { name: "キウイ", match: ["キウイ"], per: 0.5, unit: "個" },
  ], steps: ["果物を一口大に切る", "缶のシロップとサイダーで和える"], tip: "こいのぼりの色みたいにカラフルに仕上げましょう" },
  // ---- 七夕 ----
  { id: "ev-tanabata-somen", title: "七夕そうめん", minutes: 15, genre: "和風", method: "ゆでる", course: "行事食", ingredients: [
    { name: "そうめん", match: ["そうめん", "素麺"], per: 1, unit: "束" },
    { name: "卵", match: ["卵", "たまご"], per: 0.5, unit: "個" },
    { name: "オクラ", match: ["オクラ"], per: 2, unit: "本" },
    { name: "ハム", match: ["ハム"], per: 15, unit: "g" },
  ], steps: ["そうめんをゆでて冷水でしめる", "星形に切った卵・オクラ・ハムをのせる"], tip: "そうめんの細い麺は天の川に見立てられています" },
  { id: "ev-hoshi-salad", title: "オクラとトマトの星サラダ", minutes: 10, genre: "洋風", method: "サラダ", course: "副菜", ingredients: [
    { name: "オクラ", match: ["オクラ"], per: 2, unit: "本" },
    { name: "トマト", match: ["トマト"], per: 0.5, unit: "個" },
    { name: "きゅうり", match: ["きゅうり"], per: 0.5, unit: "本" },
  ], steps: ["オクラをゆでて輪切りにする（切り口が星形）", "トマトときゅうりとドレッシングで和える"], tip: "オクラの切り口の星が七夕らしい一品です" },
  { id: "ev-suika", title: "すいか", minutes: 5, genre: "和風", method: "切る", course: "デザート", ingredients: [
    { name: "すいか", match: ["すいか", "スイカ", "西瓜"], per: 0.125, unit: "玉" },
  ], steps: ["食べやすく切ってよく冷やす"], tip: "夏の水分補給にもなるデザートです" },
  // ---- お月見 ----
  { id: "ev-sanma", title: "さんまの塩焼き", minutes: 15, genre: "和風", method: "焼く", course: "主菜", ingredients: [
    { name: "さんま", match: ["さんま", "秋刀魚"], per: 1, unit: "尾" },
    { name: "大根", match: ["大根", "だいこん"], per: 30, unit: "g" },
  ], steps: ["さんまに塩をして焼く", "大根おろしとすだち（あれば）を添える"], tip: "秋の味覚の代表です" },
  { id: "ev-satoimo-ni", title: "里芋の煮っころがし", minutes: 20, genre: "和風", method: "煮る", course: "副菜", ingredients: [
    { name: "里芋", match: ["里芋"], per: 3, unit: "個" },
  ], steps: ["里芋の下ゆでをしてぬめりを取る", "だしと醤油・砂糖で転がしながら煮る"], tip: "お月見では里芋をお供えする風習から『芋名月』とも呼ばれます" },
  { id: "ev-tsukimi-jiru", title: "月見汁（里芋の味噌汁）", minutes: 15, genre: "和風", method: "スープ", course: "汁物", ingredients: [
    { name: "里芋", match: ["里芋"], per: 2, unit: "個" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
    { name: "味噌", match: ["味噌", "みそ"], per: 1.5, unit: "大さじ" },
  ], steps: ["里芋とにんじんをだしで煮る", "味噌を溶いて仕上げる"], tip: "丸い里芋がお月さまみたいです" },
  { id: "ev-tsukimi-dango", title: "月見団子", minutes: 20, genre: "和風", method: "ゆでる", course: "デザート", ingredients: [
    { name: "白玉粉", match: ["白玉粉", "だんご粉"], per: 25, unit: "g" },
    { name: "砂糖", match: ["砂糖"], per: 1, unit: "大さじ" },
  ], steps: ["白玉粉を水でこねて丸める", "ゆでて浮いてきたら冷水に取り、きな粉や砂糖醤油で"], tip: "十五夜には15個お供えする風習があります" },
  { id: "ev-kuri-gohan", title: "栗ごはん", minutes: 15, genre: "和風", method: "煮る", course: "主食", ingredients: [
    { name: "栗", match: ["栗"], per: 4, unit: "個" },
    { name: "塩", match: ["塩"], per: 0.5, unit: "小さじ" },
  ], steps: ["栗の皮をむく", "ごはんと塩で炊き込む（ごはんは別に用意）"], tip: "秋の実りを味わうごはんです" },
  // ---- 敬老の日 ----
  { id: "ev-chawanmushi", title: "茶碗蒸し", minutes: 20, genre: "和風", method: "蒸す", course: "副菜", ingredients: [
    { name: "卵", match: ["卵", "たまご"], per: 1.5, unit: "個" },
    { name: "鶏もも肉", match: ["鶏もも", "鶏肉", "とり肉"], per: 25, unit: "g" },
    { name: "しいたけ", match: ["しいたけ", "椎茸"], per: 1, unit: "個" },
    { name: "かまぼこ", match: ["かまぼこ"], per: 1, unit: "切れ" },
  ], steps: ["卵液にだしを混ぜてこす", "具を入れて弱火で蒸す"], tip: "柔らかくて食べやすい、感謝を伝える一品です" },
  // ---- 母の日 ----
  { id: "ev-heart-hamburg", title: "ハートのハンバーグ", minutes: 25, genre: "洋風", method: "焼く", course: "主菜", ingredients: [
    { name: "ひき肉", match: ["ひき肉"], per: 100, unit: "g" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.5, unit: "個" },
    { name: "卵", match: ["卵", "たまご"], per: 0.5, unit: "個" },
    { name: "パン粉", match: ["パン粉"], per: 2, unit: "大さじ" },
  ], steps: ["材料をよくこねてハート形に整える", "両面焼いて中まで火を通す"], tip: "形で気持ちが伝わるハンバーグです" },
  { id: "ev-ichigo-yogurt", title: "いちごのヨーグルト和え", minutes: 5, genre: "洋風", method: "和える", course: "デザート", ingredients: [
    { name: "いちご", match: ["いちご", "苺"], per: 3, unit: "個" },
    { name: "ヨーグルト", match: ["ヨーグルト"], per: 75, unit: "g" },
  ], steps: ["いちごを半分に切る", "ヨーグルトと蜂蜜（あれば）で和える"], tip: "カーネーション色のピンクが母の日らしいデザートです" },
  // ---- 父の日 ----
  { id: "ev-hiyayakko", title: "冷奴", minutes: 5, genre: "和風", method: "切る", course: "副菜", ingredients: [
    { name: "豆腐", match: ["豆腐"], per: 0.5, unit: "丁" },
    { name: "ねぎ", match: ["ねぎ", "ネギ", "長ねぎ"], per: 0.2, unit: "本" },
    { name: "生姜", match: ["生姜", "しょうが"], per: 3, unit: "g" },
  ], steps: ["豆腐の水気を軽く切る", "ねぎとおろし生姜をのせて醤油をかける"], tip: "おつまみにもなる定番です" },
  { id: "ev-edamame", title: "枝豆", minutes: 10, genre: "和風", method: "ゆでる", course: "副菜", ingredients: [
    { name: "枝豆", match: ["枝豆"], per: 75, unit: "g" },
  ], steps: ["枝豆を塩もみしてゆでる", "塩を振って出す"], tip: "初夏の味覚です" },
  // ---- バレンタイン ----
  { id: "ev-beef-stew", title: "ビーフシチュー", minutes: 50, genre: "洋風", method: "煮る", course: "主菜", ingredients: [
    { name: "牛肉", match: ["牛肉"], per: 100, unit: "g" },
    { name: "じゃがいも", match: ["じゃがいも", "ジャガイモ"], per: 1, unit: "個" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.5, unit: "本" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.5, unit: "個" },
    { name: "デミグラスソース", match: ["デミグラス"], per: 0.25, unit: "缶" },
  ], steps: ["牛肉と野菜を炒めて水で煮込む", "デミグラスソースを加えてさらに煮込む"], tip: "にんじんをハート形に抜くとバレンタインらしくなります" },
  { id: "ev-heart-salad", title: "トマトとチーズのサラダ", minutes: 10, genre: "洋風", method: "サラダ", course: "副菜", ingredients: [
    { name: "トマト", match: ["トマト"], per: 1, unit: "個" },
    { name: "チーズ", match: ["チーズ"], per: 20, unit: "g" },
    { name: "レタス", match: ["レタス", "キャベツ"], per: 30, unit: "g" },
  ], steps: ["トマトとチーズを重ねてレタスにのせる", "オリーブオイルと塩でシンプルに"], tip: "チーズをハート形に抜くのもおすすめです" },
  { id: "ev-choco-pudding", title: "チョコプリン", minutes: 15, genre: "洋風", method: "冷やす", course: "デザート", ingredients: [
    { name: "チョコレート", match: ["チョコレート", "チョコ"], per: 25, unit: "g" },
    { name: "牛乳", match: ["牛乳"], per: 100, unit: "mL" },
    { name: "卵", match: ["卵", "たまご"], per: 0.5, unit: "個" },
  ], steps: ["チョコレートを牛乳で溶かす", "卵を混ぜて蒸すか、ゼラチンで冷やし固める"], tip: "手作りチョコの定番デザートです" },
  // ---- ホワイトデー ----
  { id: "ev-carbonara", title: "カルボナーラ", minutes: 20, genre: "洋風", method: "ゆでる", course: "主食", ingredients: [
    { name: "スパゲッティ", match: ["スパゲッティ", "パスタ"], per: 100, unit: "g" },
    { name: "ベーコン", match: ["ベーコン"], per: 30, unit: "g" },
    { name: "卵", match: ["卵", "たまご"], per: 1, unit: "個" },
    { name: "チーズ", match: ["チーズ"], per: 15, unit: "g" },
  ], steps: ["パスタをゆで、ベーコンを炒める", "火を止めて卵とチーズを絡める"], tip: "余熱で絡めると卵が固まりすぎません" },
  { id: "ev-caesar-salad", title: "シーザーサラダ", minutes: 10, genre: "洋風", method: "サラダ", course: "副菜", ingredients: [
    { name: "レタス", match: ["レタス"], per: 40, unit: "g" },
    { name: "ベーコン", match: ["ベーコン"], per: 15, unit: "g" },
    { name: "チーズ", match: ["チーズ"], per: 10, unit: "g" },
  ], steps: ["ベーコンをカリッと焼く", "レタスにのせてドレッシングとチーズをかける"], tip: "白いドレッシングがホワイトデーらしいサラダです" },
  { id: "ev-pudding", title: "カスタードプリン", minutes: 20, genre: "洋風", method: "蒸す", course: "デザート", ingredients: [
    { name: "卵", match: ["卵", "たまご"], per: 1.5, unit: "個" },
    { name: "牛乳", match: ["牛乳"], per: 100, unit: "mL" },
    { name: "砂糖", match: ["砂糖"], per: 1.5, unit: "大さじ" },
  ], steps: ["卵・牛乳・砂糖を混ぜてこす", "弱火で蒸して冷やす"], tip: "白くて甘いお返しの定番です" },
  // ---- 土用の丑の日 ----
  { id: "ev-unadon", title: "うなぎの蒲焼き丼", minutes: 15, genre: "和風", method: "焼く", course: "行事食", ingredients: [
    { name: "うなぎ", match: ["うなぎ", "鰻"], per: 0.5, unit: "尾" },
    { name: "海苔", match: ["海苔", "のり"], per: 0.5, unit: "枚" },
  ], steps: ["うなぎを温め直して香ばしく焼く", "ごはんにのせてタレをかける（ごはんは別に用意）"], tip: "「う」のつく食べ物で暑さを乗り切る風習です" },
  { id: "ev-shijimi-jiru", title: "しじみの味噌汁", minutes: 15, genre: "和風", method: "スープ", course: "汁物", ingredients: [
    { name: "しじみ", match: ["しじみ"], per: 50, unit: "g" },
    { name: "味噌", match: ["味噌", "みそ"], per: 1.5, unit: "大さじ" },
  ], steps: ["砂抜きしたしじみを水から煮る", "味噌を溶いて仕上げる"], tip: "土用しじみは夏バテ防止の知恵です", note: "島根県の宍道湖（しんじこ）はしじみで有名。お味噌汁にして、湖の恵みをいただく郷土の味だよ。" },
  { id: "ev-sumono", title: "きゅうりとわかめの酢の物", minutes: 10, genre: "和風", method: "和える", course: "副菜", ingredients: [
    { name: "きゅうり", match: ["きゅうり"], per: 0.5, unit: "本" },
    { name: "わかめ", match: ["わかめ"], per: 3, unit: "g" },
  ], steps: ["きゅうりを薄切りにして塩もみする", "わかめと甘酢で和える"], tip: "さっぱりして食欲がない日にも食べやすい一品です" },
  // ---- 七五三 ----
  { id: "ev-sekihan", title: "赤飯", minutes: 15, genre: "和風", method: "煮る", course: "行事食", ingredients: [
    { name: "小豆", match: ["小豆", "あずき"], per: 25, unit: "g" },
    { name: "もち米", match: ["もち米"], per: 0.5, unit: "合" },
  ], steps: ["小豆をゆでて煮汁ごと冷ます", "もち米と一緒に炊く"], tip: "赤い色は魔除けとお祝いの色です" },
  { id: "ev-tai-shioyaki", title: "鯛の塩焼き", minutes: 20, genre: "和風", method: "焼く", course: "主菜", ingredients: [
    { name: "鯛", match: ["鯛", "たい"], per: 1, unit: "切れ" },
    { name: "大根", match: ["大根", "だいこん"], per: 30, unit: "g" },
  ], steps: ["鯛に塩をして焼く", "大根おろしを添える"], tip: "「めでたい」の鯛はお祝いの席の主役です" },
  { id: "ev-chikuzenni", title: "筑前煮", minutes: 35, genre: "和風", method: "煮る", course: "副菜", ingredients: [
    { name: "鶏もも肉", match: ["鶏もも", "鶏肉", "とり肉"], per: 50, unit: "g" },
    { name: "ごぼう", match: ["ごぼう"], per: 0.3, unit: "本" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
    { name: "れんこん", match: ["れんこん", "蓮根"], per: 40, unit: "g" },
  ], steps: ["材料を炒めてだしで煮る", "醤油と砂糖で甘辛く仕上げる"], tip: "たくさんの具材が「家族の結びつき」を表します" },
  // ---- 年越し ----
  { id: "ev-toshikoshi-soba", title: "年越しそば", minutes: 15, genre: "和風", method: "ゆでる", course: "行事食", ingredients: [
    { name: "そば", match: ["そば", "蕎麦"], per: 1, unit: "束" },
    { name: "ねぎ", match: ["ねぎ", "ネギ", "長ねぎ"], per: 0.3, unit: "本" },
    { name: "かまぼこ", match: ["かまぼこ"], per: 2, unit: "切れ" },
    { name: "卵", match: ["卵", "たまご"], per: 0.5, unit: "個" },
  ], steps: ["そばをゆでて温かいつゆに入れる", "かまぼことねぎ、月見卵をのせる"], tip: "細く長いそばは「長生き」の願い、切れやすさは「今年の苦労を断ち切る」意味です" },
  { id: "ev-tempura", title: "えびとかぼちゃの天ぷら", minutes: 25, genre: "和風", method: "揚げる", course: "主菜", ingredients: [
    { name: "えび", match: ["えび", "海老"], per: 2, unit: "尾" },
    { name: "かぼちゃ", match: ["かぼちゃ", "南瓜"], per: 50, unit: "g" },
    { name: "天ぷら粉", match: ["天ぷら粉", "小麦粉"], per: 2, unit: "大さじ" },
  ], steps: ["えびとかぼちゃに薄く衣をつける", "カラッと揚げて塩で"], tip: "年越しそばの名脇役です" },
  // ---- お花見 ----
  { id: "ev-sanshoku-dango", title: "三色団子", minutes: 20, genre: "和風", method: "ゆでる", course: "デザート", ingredients: [
    { name: "白玉粉", match: ["白玉粉", "だんご粉"], per: 25, unit: "g" },
    { name: "砂糖", match: ["砂糖"], per: 1, unit: "大さじ" },
  ], steps: ["白玉粉をこねて3色（白・ピンク・緑）に分けて丸める", "ゆでて串に刺す"], tip: "ピンクは桜、白は雪、緑は新芽で春を表します" },
  // ---- 夏の旬 ----
  { id: "ev-hiyashi-chuka", title: "冷やし中華", minutes: 20, genre: "中華", method: "ゆでる", course: "主食", ingredients: [
    { name: "中華麺", match: ["中華麺"], per: 1, unit: "玉" },
    { name: "卵", match: ["卵", "たまご"], per: 1, unit: "個" },
    { name: "ハム", match: ["ハム"], per: 20, unit: "g" },
    { name: "きゅうり", match: ["きゅうり"], per: 0.5, unit: "本" },
    { name: "トマト", match: ["トマト"], per: 0.5, unit: "個" },
  ], steps: ["麺をゆでて冷水でしめる", "錦糸卵と細切りの具を彩りよくのせ、タレをかける"], tip: "夏の定番。具を並べるのは子どもにもお手伝いできます" },
  { id: "ev-goya-champuru", title: "ゴーヤチャンプルー", minutes: 15, genre: "和風", method: "炒める", course: "主菜", ingredients: [
    { name: "ゴーヤ", match: ["ゴーヤ", "にがうり"], per: 0.5, unit: "本" },
    { name: "豆腐", match: ["豆腐"], per: 0.5, unit: "丁" },
    { name: "豚肉", match: ["豚肉"], per: 50, unit: "g" },
    { name: "卵", match: ["卵", "たまご"], per: 1, unit: "個" },
  ], steps: ["ゴーヤは薄切りにして塩もみする", "豆腐と豚肉と炒め、卵でとじる"], tip: "沖縄の夏の元気ごはんです", note: "沖縄の家庭料理。『チャンプルー』は沖縄の言葉で『混ぜこぜ』という意味だよ。" },
  { id: "ev-tomorokoshi", title: "ゆでとうもろこし", minutes: 10, genre: "和風", method: "ゆでる", course: "副菜", ingredients: [
    { name: "とうもろこし", match: ["とうもろこし", "コーン"], per: 1, unit: "本" },
  ], steps: ["皮を薄く残して塩ゆでする", "熱いうちに塩を振る"], tip: "夏祭りの屋台の味です" },
  // ---- 秋の味覚 ----
  { id: "ev-kinoko-gohan", title: "きのこごはん", minutes: 15, genre: "和風", method: "煮る", course: "主食", ingredients: [
    { name: "しめじ", match: ["しめじ"], per: 0.5, unit: "パック" },
    { name: "まいたけ", match: ["まいたけ", "舞茸"], per: 0.5, unit: "パック" },
    { name: "油揚げ", match: ["油揚げ"], per: 0.5, unit: "枚" },
  ], steps: ["きのこをほぐしてだしで軽く煮る", "炊きたてごはんに混ぜる（ごはんは別に用意）"], tip: "秋の香りを味わうごはんです" },
  { id: "ev-satsumaimo-ni", title: "さつまいもの甘煮", minutes: 20, genre: "和風", method: "煮る", course: "副菜", ingredients: [
    { name: "さつまいも", match: ["さつまいも", "薩摩芋"], per: 100, unit: "g" },
    { name: "砂糖", match: ["砂糖"], per: 1, unit: "大さじ" },
  ], steps: ["さつまいもを輪切りにして水にさらす", "砂糖とレモン（あれば）で柔らかく煮る"], tip: "お弁当にも入る秋の甘い一品です" },
];

// ---- イベント献立セット（暦の順） ----
// note は子どもにも分かる「なぜその食べ物なのか」を1〜2行で。
// dishes は EVENT_RECIPES と既存 ALL_RECIPES の id を混ぜて参照する。
export const EVENT_MENUS = [
  { id: "osechi", name: "お正月", emoji: "🎍", when: "1月1日〜3日", dishes: ["ev-ozoni", "ev-datemaki", "ev-kurikinton", "ev-kuromame", "ev-namasu"],
    note: "おせちは1年のはじまりのお祝いごはん。伊達巻は学び、栗きんとんは金運、黒豆は元気に働けるように、と一品ごとに願いがこめられています。" },
  { id: "setsubun", name: "節分", emoji: "👹", when: "2月3日ごろ", dishes: ["ev-ehomaki", "ev-iwashi", "ev-gomokuni", "ev-kenchin"],
    note: "恵方巻をその年の良い方角を向いて食べると願いが叶うと言われます。豆まきの豆と、鬼が苦手ないわしで悪いものを追い払います。" },
  { id: "valentine", name: "バレンタイン", emoji: "🍫", when: "2月14日", dishes: ["ev-beef-stew", "ev-heart-salad", "ev-corn-soup", "ev-choco-pudding"],
    note: "大切な人にチョコレートを贈る日。ごはんもハートを散らして、気持ちが伝わる献立にしました。" },
  { id: "hinamatsuri", name: "ひな祭り", emoji: "🎎", when: "3月3日", dishes: ["ev-chirashi", "ev-hamaguri", "ev-nanohana", "ev-ichigo-kanten"],
    note: "女の子の健やかな成長を願う桃の節句。ちらし寿司やはまぐりなど、春らしく彩りの良いものを食べます。" },
  { id: "whiteday", name: "ホワイトデー", emoji: "🤍", when: "3月14日", dishes: ["ev-carbonara", "ev-caesar-salad", "ev-pudding"],
    note: "バレンタインのお返しをする日。白いものを贈る風習にちなんで、白っぽい洋食の献立にしました。" },
  { id: "hanami", name: "お花見", emoji: "🌸", when: "3月〜4月（桜の季節）", dishes: ["ev-takenoko-gohan", "karaage", "tamagoyaki", "ev-nanohana", "ev-sanshoku-dango"],
    note: "桜の下で春のごちそうを楽しむ行楽の献立。三色団子のピンク・白・緑は、桜・雪・新芽で春そのものを表します。" },
  { id: "hahanohi", name: "母の日", emoji: "💐", when: "5月の第2日曜日", dishes: ["ev-heart-hamburg", "omurice", "potato-sarada", "ev-ichigo-yogurt"],
    note: "お母さんに「ありがとう」を伝える日。ハート形のハンバーグなど、子どもと一緒に作って感謝を届ける献立です。" },
  { id: "kodomonohi", name: "こどもの日", emoji: "🎏", when: "5月5日", dishes: ["karaage", "ev-takenoko-gohan", "ev-wakatake-ni", "ev-fruit-punch"],
    note: "子どもの成長を祝う日。たけのこはまっすぐ伸びる元気の象徴で、柏餅やちまきを食べる風習もあります。" },
  { id: "chichinohi", name: "父の日", emoji: "👔", when: "6月の第3日曜日", dishes: ["shogayaki", "ev-hiyayakko", "ev-edamame", "misoshiru"],
    note: "お父さんに「ありがとう」を伝える日。おつまみにもなる、がっつり元気の出る献立にしました。" },
  { id: "tanabata", name: "七夕", emoji: "🎋", when: "7月7日", dishes: ["ev-tanabata-somen", "ev-hoshi-salad", "tamago-soup", "ev-suika"],
    note: "織姫と彦星が1年に1度会える日。そうめんは天の川、オクラの切り口は星に見立てて、願い事をしながら食べます。" },
  { id: "doyou", name: "土用の丑の日", emoji: "🍱", when: "7月下旬ごろ", dishes: ["ev-unadon", "ev-sumono", "ev-shijimi-jiru"],
    note: "夏の暑さに負けないよう、栄養のあるうなぎを食べる日。「う」のつく食べ物で元気をつける江戸時代からの知恵です。" },
  { id: "natsu", name: "夏の旬・夏祭り", emoji: "🎆", when: "7月〜8月（夏）", dishes: ["ev-goya-champuru", "ev-hiyashi-chuka", "ev-tomorokoshi", "ev-suika"],
    note: "夏祭りの屋台みたいな、暑い日に元気が出る旬の献立。冷たい麺と甘いとうもろこし、仕上げはすいかです。" },
  { id: "keirou", name: "敬老の日", emoji: "🍵", when: "9月の第3月曜日", dishes: ["sake-shioyaki", "ev-chawanmushi", "ev-kuri-gohan", "misoshiru"],
    note: "おじいちゃん・おばあちゃんに長生きと感謝を伝える日。柔らかく食べやすい和食の献立にしました。" },
  { id: "tsukimi", name: "お月見", emoji: "🌕", when: "秋の十五夜", dishes: ["ev-sanma", "ev-satoimo-ni", "ev-tsukimi-jiru", "ev-tsukimi-dango"],
    note: "きれいなお月さまに秋の実りを感謝する日。丸いお団子や里芋をお供えしてから、みんなでいただきます。" },
  { id: "aki", name: "秋の味覚", emoji: "🍄", when: "9月〜11月（秋）", dishes: ["ev-sanma", "ev-kinoko-gohan", "ev-satsumaimo-ni", "ev-kenchin"],
    note: "きのこ、さんま、栗、さつまいも。秋にいちばんおいしくなるものばかり集めた旬の献立です。" },
  { id: "halloween", name: "ハロウィン", emoji: "🎃", when: "10月31日", dishes: ["ev-kabocha-gratin", "ev-halloween-salad", "ev-kabocha-soup", "ev-kabocha-pudding"],
    note: "かぼちゃをくり抜いたランタンを飾る外国のお祭り。献立もかぼちゃづくしで、オレンジ色の食卓にしました。" },
  { id: "shichigosan", name: "七五三", emoji: "👘", when: "11月15日", dishes: ["ev-sekihan", "ev-tai-shioyaki", "ev-chikuzenni", "ev-hamaguri"],
    note: "3歳・5歳・7歳の成長をお祝いする日。赤飯や鯛などお祝いの食べ物を用意して、長い千歳飴で長生きを願います。" },
  { id: "touji", name: "冬至", emoji: "🍊", when: "12月22日ごろ", dishes: ["ev-kabocha-croquette", "ev-itokoni", "ev-yuzu-daikon", "ev-kabocha-soup"],
    note: "1年でいちばん夜が長い日。かぼちゃを食べて栄養をつけ、ゆず湯に入ると風邪をひかないと言われます。" },
  { id: "christmas", name: "クリスマス", emoji: "🎄", when: "12月24日〜25日", dishes: ["ev-roast-chicken", "potato-sarada", "ev-corn-soup", "ev-ichigo-cake"],
    note: "家族で食卓を囲む特別な日。大きなチキンと赤いいちごのケーキで、クリスマスカラーの献立にしました。" },
  { id: "toshikoshi", name: "年越し・大みそか", emoji: "🔔", when: "12月31日", dishes: ["ev-toshikoshi-soba", "ev-tempura", "ev-chikuzenni", "ev-yuzu-daikon"],
    note: "1年の最後のごはんは年越しそば。細く長いそばに長生きの願い、切れやすさに「今年の苦労は断ち切る」意味があります。" },
];

const EVENT_DISH_BY_ID = new Map([...ALL_RECIPES, ...EVENT_RECIPES].map((r) => [r.id, r]));

/** id からイベントを引く */
export function eventById(eventId) {
  return EVENT_MENUS.find((e) => e.id === eventId) || null;
}

/**
 * イベント献立を組み立てる。
 * 各料理を通常レシピと同じ評価（evaluateRecipe）で在庫と照合し、家族人数で換算する。
 * 戻り値: { event, dishes, missingAll, totalMinutes, haveCount, missingCount }
 *  - dishes: 献立の順（主菜→副菜→汁物/行事食→デザートなど定義順）の評価済みレシピ
 *  - missingAll: 全料理の不足材料を名前＋単位でまとめたもの（買い物リスト追加用）
 * イベントが無ければ null。
 */
export function suggestEventMenu(eventId, stockItems, { servings = 2 } = {}) {
  const event = eventById(eventId);
  if (!event) return null;
  const today = todayLocalISO();
  const dishes = [];
  for (const id of event.dishes) {
    const recipe = EVENT_DISH_BY_ID.get(id);
    if (!recipe) continue;
    const { bonus, earliestExpiry, ...evaluated } = evaluateRecipe(recipe, stockItems, servings, today);
    dishes.push(evaluated);
  }
  const missingMap = new Map();
  let haveCount = 0;
  for (const d of dishes) {
    haveCount += d.have.length;
    for (const m of d.missing) {
      const key = `${m.name}|${m.unit}`;
      if (missingMap.has(key)) missingMap.get(key).amount = Math.round((missingMap.get(key).amount + m.amount) * 10) / 10;
      else missingMap.set(key, { ...m });
    }
  }
  return {
    event, dishes,
    missingAll: [...missingMap.values()],
    totalMinutes: dishes.reduce((s, d) => s + (d.minutes || 0), 0),
    haveCount, missingCount: missingMap.size,
  };
}

// ============================================================
// 地域の郷土料理・名物グルメ（2026-11-10「地域の郷土料理や名物
// グルメレシピも追加して。季節の献立と同じようにタブで選択」）
// イベント献立と同じ作り: 地域ごとに献立セットを用意し、料理は
// 通常レシピと同じデータモデル（evaluateRecipe で在庫照合・家族
// 人数換算・FIFO）。郷土料理専用の料理は REGIONAL_RECIPES に足し、
// 既存レシピ（ちゃんちゃん焼き等）も再利用する。各料理には
// 子ども向けの由来メモ（note）を付ける。
// ============================================================

export const REGIONAL_RECIPES = [
  // ---- 北海道 ----
  { id: "rg-jingisukan", title: "ジンギスカン風焼肉", minutes: 25, genre: "和風", method: "焼く", course: "主菜", note: "北海道の名物。羊のお肉を、真ん中が盛り上がった鍋で焼くよ。名前はモンゴルの英雄チンギス・ハンから来たと言われるよ。", ingredients: [
    { name: "ラム肉", match: ["ラム", "羊肉"], per: 100, unit: "g" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.5, unit: "個" },
    { name: "キャベツ", match: ["キャベツ"], per: 50, unit: "g" },
    { name: "ピーマン", match: ["ピーマン"], per: 1, unit: "個" },
  ], steps: ["ラム肉と野菜をホットプレートやフライパンで焼く", "焼けたものからタレにつけて食べる"], tip: "もやしを山盛りにすると本場っぽくなります" },
  { id: "rg-ishikari", title: "石狩鍋風スープ", minutes: 25, genre: "和風", method: "スープ", course: "汁物", note: "北海道・石狩川の鮭漁師が生んだ鍋。鮭と野菜を味噌で煮込む、寒い日にぴったりのごちそうだよ。", ingredients: [
    { name: "鮭", match: ["鮭", "さけ"], per: 1, unit: "切れ" },
    { name: "じゃがいも", match: ["じゃがいも", "ジャガイモ"], per: 1, unit: "個" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.5, unit: "個" },
    { name: "キャベツ", match: ["キャベツ"], per: 40, unit: "g" },
    { name: "味噌", match: ["味噌", "みそ"], per: 1.5, unit: "大さじ" },
  ], steps: ["野菜をだしで煮て、鮭を入れる", "味噌を溶いて仕上げる（バターを少しのせても）"], tip: "鮭のアラがあればだしがよく出ます" },
  { id: "rg-buttercorn", title: "バターコーン", minutes: 10, genre: "和風", method: "ゆでる", course: "副菜", note: "北海道の甘いとうもろこしにバターをのせた屋台の味。札幌のラーメンにのせるのも定番だよ。", ingredients: [
    { name: "とうもろこし", match: ["とうもろこし", "コーン"], per: 1, unit: "本" },
    { name: "バター", match: ["バター"], per: 10, unit: "g" },
  ], steps: ["とうもろこしを茹でる（またはレンジで蒸す）", "熱いうちにバターをのせ、軽く塩を振る"], tip: "醤油を少し垂らすと香ばしくなります" },
  // ---- 東北 ----
  { id: "rg-kiritanpo", title: "きりたんぽ鍋風", minutes: 30, genre: "和風", method: "煮る", course: "主菜", note: "秋田の郷土鍋。ごはんを棒に巻いて焼いた『きりたんぽ』を、鶏のだしで煮込むよ。", ingredients: [
    { name: "きりたんぽ", match: ["きりたんぽ"], per: 2, unit: "本" },
    { name: "鶏もも肉", match: ["鶏もも", "鶏肉", "とり肉"], per: 75, unit: "g" },
    { name: "ごぼう", match: ["ごぼう"], per: 0.5, unit: "本" },
    { name: "まいたけ", match: ["まいたけ", "舞茸"], per: 0.5, unit: "パック" },
    { name: "ねぎ", match: ["ねぎ", "ネギ", "長ねぎ"], per: 0.5, unit: "本" },
  ], steps: ["鶏肉とごぼう・まいたけをだしで煮る", "斜め切りのきりたんぽとねぎを入れてひと煮立ち"], tip: "きりたんぽは煮崩れしやすいので最後に入れます" },
  { id: "rg-imoni", title: "芋煮風", minutes: 30, genre: "和風", method: "煮る", course: "主菜", note: "山形の秋の風物詩。河原で大きな鍋を囲む『芋煮会』が有名だよ。味付けは地域で醤油と味噌に分かれるんだ。", ingredients: [
    { name: "里芋", match: ["里芋"], per: 3, unit: "個" },
    { name: "牛肉", match: ["牛肉"], per: 75, unit: "g" },
    { name: "こんにゃく", match: ["こんにゃく"], per: 0.5, unit: "枚" },
    { name: "ねぎ", match: ["ねぎ", "ネギ", "長ねぎ"], per: 0.3, unit: "本" },
  ], steps: ["里芋とこんにゃくをだしで煮る", "牛肉とねぎを入れ、醤油と砂糖で甘辛く仕上げる"], tip: "里芋は下ゆでするとぬめりが取れます" },
  { id: "rg-senbeijiru", title: "せんべい汁風", minutes: 20, genre: "和風", method: "スープ", course: "汁物", note: "青森・八戸の郷土汁。鍋用の南部せんべいをお汁に入れると、もちもちのお餅みたいになるよ。", ingredients: [
    { name: "せんべい", match: ["せんべい", "南部せんべい"], per: 2, unit: "枚" },
    { name: "大根", match: ["大根", "だいこん"], per: 50, unit: "g" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
    { name: "ごぼう", match: ["ごぼう"], per: 0.3, unit: "本" },
    { name: "ねぎ", match: ["ねぎ", "ネギ", "長ねぎ"], per: 0.3, unit: "本" },
  ], steps: ["根菜をだしで煮て醤油で味付け", "食べる直前に鍋用せんべいを割り入れる"], tip: "普通のお菓子せんべいではなく鍋用を使ってください" },
  { id: "rg-zunda", title: "ずんだ餅風", minutes: 15, genre: "和風", method: "和える", course: "デザート", note: "宮城の名物。枝豆をすりつぶした緑色のあん『ずんだ』をお餅にからめるよ。枝豆の香りが自慢だよ。", ingredients: [
    { name: "枝豆", match: ["枝豆"], per: 75, unit: "g" },
    { name: "餅", match: ["餅", "もち"], per: 2, unit: "個" },
    { name: "砂糖", match: ["砂糖"], per: 1, unit: "大さじ" },
  ], steps: ["枝豆を茹でてさやから出し、砂糖と塩少々ですりつぶす", "焼いた餅にからめる"], tip: "少し粒を残すと食感が楽しいです" },
  // ---- 関東 ----
  { id: "rg-fukagawa", title: "深川めし風", minutes: 20, genre: "和風", method: "煮る", course: "主食", note: "東京・深川の漁師ごはん。あさりを味噌や醤油で煮て、汁ごとごはんにのせたり炊き込んだりするよ。", ingredients: [
    { name: "あさり", match: ["あさり"], per: 75, unit: "g" },
    { name: "ねぎ", match: ["ねぎ", "ネギ", "長ねぎ"], per: 0.3, unit: "本" },
  ], steps: ["砂抜きしたあさりをだしで煮て味付け", "炊きたてごはんにのせる（ごはんは別に用意）"], tip: "あさりの煮汁をごはんにかけるとうま味たっぷりです" },
  { id: "rg-monja", title: "もんじゃ焼き風", minutes: 20, genre: "和風", method: "焼く", course: "主菜", note: "東京・月島の名物。ゆるい生地を鉄板で焼いて、小さいヘラで少しずつ食べるのが楽しいよ。昔、駄菓子屋で子どもが文字を書いて遊んだ『もんじ焼き』が始まりだと言われるよ。", ingredients: [
    { name: "キャベツ", match: ["キャベツ"], per: 60, unit: "g" },
    { name: "小麦粉", match: ["小麦粉"], per: 2, unit: "大さじ" },
    { name: "明太子", match: ["明太子"], per: 20, unit: "g" },
    { name: "チーズ", match: ["チーズ"], per: 15, unit: "g" },
    { name: "ソース", match: ["ソース"], per: 1, unit: "大さじ" },
  ], steps: ["刻んだキャベツに水で溶いた生地を混ぜる", "ホットプレートで広げて焼き、焦げ目をつけて食べる"], tip: "土手を作って生地を流すのが本場流です" },
  { id: "rg-shumai", title: "横浜シュウマイ風", minutes: 25, genre: "中華", method: "蒸す", course: "主菜", note: "横浜中華街の名物。崎陽軒のシウマイで有名になり、横浜みやげの定番になったよ。", ingredients: [
    { name: "ひき肉", match: ["ひき肉"], per: 75, unit: "g" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.25, unit: "個" },
    { name: "シュウマイの皮", match: ["シュウマイの皮", "餃子の皮"], per: 8, unit: "枚" },
  ], steps: ["ひき肉と玉ねぎを練って皮で包む", "蒸し器やフライパンで10分蒸す"], tip: "干し貝柱を入れると本格的になります" },
  { id: "rg-chanko", title: "ちゃんこ鍋風", minutes: 30, genre: "和風", method: "煮る", course: "主菜", note: "東京・両国のお相撲さんのごはん。力士が食べる鍋は全部『ちゃんこ』と呼ばれるよ。栄養満点で体を作るよ。", ingredients: [
    { name: "鶏もも肉", match: ["鶏もも", "鶏肉", "とり肉"], per: 75, unit: "g" },
    { name: "白菜", match: ["白菜"], per: 0.125, unit: "玉" },
    { name: "豆腐", match: ["豆腐"], per: 0.5, unit: "丁" },
    { name: "ねぎ", match: ["ねぎ", "ネギ", "長ねぎ"], per: 0.3, unit: "本" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
  ], steps: ["鶏肉と野菜をだしで煮る", "豆腐を入れて醤油や味噌で味付け"], tip: "肉団子を入れると子どもも喜びます" },
  // ---- 中部 ----
  { id: "rg-misokatsu", title: "名古屋みそカツ", minutes: 30, genre: "和風", method: "揚げる", course: "主菜", note: "名古屋名物『名古屋めし』のひとつ。甘い赤味噌のタレをとんかつにかけるよ。赤味噌は豆味噌で、コクが深いんだ。", ingredients: [
    { name: "豚ロース", match: ["豚ロース", "豚肉"], per: 100, unit: "g" },
    { name: "パン粉", match: ["パン粉"], per: 2, unit: "大さじ" },
    { name: "味噌", match: ["味噌", "みそ"], per: 1, unit: "大さじ" },
    { name: "キャベツ", match: ["キャベツ"], per: 40, unit: "g" },
  ], steps: ["豚肉に衣をつけてカラッと揚げる", "味噌・砂糖・みりんを煮詰めたタレをたっぷりかける"], tip: "千切りキャベツを山盛りに添えるのが名古屋流です" },
  { id: "rg-tebasaki", title: "手羽先の甘辛焼き", minutes: 20, genre: "和風", method: "焼く", course: "主菜", note: "名古屋の居酒屋名物。カリッと焼いた手羽に甘辛タレとごま。手で持って食べるのが本場流だよ。", ingredients: [
    { name: "手羽元", match: ["手羽元", "手羽先", "手羽"], per: 3, unit: "本" },
    { name: "生姜", match: ["生姜", "しょうが"], per: 3, unit: "g" },
  ], steps: ["手羽を揚げ焼きしてカリッとさせる", "醤油・みりん・砂糖のタレを絡めてごまを振る"], tip: "タレは煮詰めすぎないのがコツです" },
  { id: "rg-hoto", title: "ほうとう風", minutes: 25, genre: "和風", method: "煮る", course: "主食", note: "山梨の郷土麺。太くて平たい麺を、かぼちゃと野菜と一緒に味噌で煮込むよ。武将・武田信玄の陣中食だったという話もあるよ。", ingredients: [
    { name: "ほうとう麺", match: ["ほうとう", "うどん"], per: 1, unit: "玉" },
    { name: "かぼちゃ", match: ["かぼちゃ", "南瓜"], per: 75, unit: "g" },
    { name: "白菜", match: ["白菜"], per: 0.125, unit: "玉" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
    { name: "味噌", match: ["味噌", "みそ"], per: 1.5, unit: "大さじ" },
  ], steps: ["野菜をだしで煮て、ほうとう麺をそのまま入れる", "味噌を溶いて麺が柔らかくなるまで煮込む"], tip: "麺は茹でずに入れるのがほうとう流（とろみが出ます）" },
  { id: "rg-hamamatsu-gyoza", title: "浜松餃子風", minutes: 25, genre: "中華", method: "焼く", course: "主菜", note: "静岡・浜松の名物。キャベツたっぷりで甘みがあり、真ん中に茹でもやしを添えるのが浜松流だよ。", ingredients: [
    { name: "ひき肉", match: ["ひき肉"], per: 60, unit: "g" },
    { name: "キャベツ", match: ["キャベツ"], per: 50, unit: "g" },
    { name: "餃子の皮", match: ["餃子の皮"], per: 8, unit: "枚" },
    { name: "もやし", match: ["もやし"], per: 0.5, unit: "袋" },
  ], steps: ["キャベツとひき肉の餡を皮で包む", "フライパンで円形に焼き、真ん中に茹でもやしを添える"], tip: "野菜多めで甘いのが浜松餃子の特徴です" },
  // ---- 関西 ----
  { id: "rg-takoyaki", title: "たこ焼き", minutes: 20, genre: "和風", method: "焼く", course: "主食", note: "大阪のソウルフード。丸い鉄板でころころ焼くよ。外はカリッ、中はとろ〜りが本場の合言葉だよ。", ingredients: [
    { name: "たこ", match: ["たこ"], per: 40, unit: "g" },
    { name: "小麦粉", match: ["小麦粉"], per: 3, unit: "大さじ" },
    { name: "卵", match: ["卵", "たまご"], per: 0.5, unit: "個" },
    { name: "ねぎ", match: ["ねぎ", "ネギ", "長ねぎ"], per: 0.2, unit: "本" },
    { name: "ソース", match: ["ソース"], per: 1, unit: "大さじ" },
  ], steps: ["生地にたことねぎを入れてたこ焼き器で焼く", "ソースとマヨネーズ（あれば）で仕上げる"], tip: "回し続けるように焼くとまん丸になります" },
  { id: "rg-okonomiyaki", title: "お好み焼き", minutes: 20, genre: "和風", method: "焼く", course: "主菜", note: "関西の家庭の味。キャベツたっぷりの生地を焼いて、ソースとマヨネーズで仕上げるよ。名前は『お好み』の具を入れることから来たよ。", ingredients: [
    { name: "キャベツ", match: ["キャベツ"], per: 60, unit: "g" },
    { name: "豚肉", match: ["豚バラ", "豚肉"], per: 50, unit: "g" },
    { name: "卵", match: ["卵", "たまご"], per: 1, unit: "個" },
    { name: "小麦粉", match: ["小麦粉"], per: 2, unit: "大さじ" },
    { name: "ソース", match: ["ソース"], per: 1, unit: "大さじ" },
  ], steps: ["キャベツと生地を混ぜてフライパンで焼く", "豚肉をのせて返し、ソースとマヨネーズで仕上げる"], tip: "生地は混ぜすぎないとふんわりします" },
  { id: "rg-kitsune-udon", title: "きつねうどん", minutes: 15, genre: "和風", method: "ゆでる", course: "主食", note: "大阪生まれと言われるうどん。甘く煮た油揚げが、キツネの好物にちなんで『きつね』と呼ばれるよ。", ingredients: [
    { name: "うどん", match: ["うどん"], per: 1, unit: "玉" },
    { name: "油揚げ", match: ["油揚げ"], per: 1, unit: "枚" },
  ], steps: ["油揚げを砂糖と醤油で甘く煮る", "うどんをゆで、温かいつゆと油揚げをのせる"], tip: "青ねぎを散らすと彩りがよくなります" },
  { id: "rg-kushikatsu", title: "串カツ風", minutes: 25, genre: "和風", method: "揚げる", course: "主菜", note: "大阪・新世界の名物。串に刺して揚げたカツをソースにどっぷり。本場では『ソース二度づけ禁止』が合言葉だよ。", ingredients: [
    { name: "豚肉", match: ["豚肉"], per: 75, unit: "g" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.5, unit: "個" },
    { name: "パン粉", match: ["パン粉"], per: 2, unit: "大さじ" },
    { name: "ソース", match: ["ソース"], per: 1, unit: "大さじ" },
  ], steps: ["豚肉と玉ねぎを交互に串に刺して衣をつける", "カラッと揚げてソースにつける"], tip: "衣の粉は水でドロッと溶くのが大阪流です" },
  // ---- 中国 ----
  { id: "rg-hiroshima-okonomi", title: "広島お好み焼き", minutes: 25, genre: "和風", method: "焼く", course: "主菜", note: "広島流は生地と具を重ねて焼き、中華麺が入るのが特徴。戦後の広島で、鉄板の上のごちそうとして広まったよ。", ingredients: [
    { name: "キャベツ", match: ["キャベツ"], per: 60, unit: "g" },
    { name: "中華麺", match: ["中華麺"], per: 1, unit: "玉" },
    { name: "豚肉", match: ["豚バラ", "豚肉"], per: 40, unit: "g" },
    { name: "卵", match: ["卵", "たまご"], per: 1, unit: "個" },
    { name: "ソース", match: ["ソース"], per: 1, unit: "大さじ" },
  ], steps: ["薄い生地にキャベツと豚肉を重ねて蒸し焼き", "炒めた中華麺と卵を重ねてソースで仕上げる"], tip: "キャベツは山盛りでも焼くとしんなりします" },
  { id: "rg-kawara-soba", title: "瓦そば風", minutes: 20, genre: "和風", method: "焼く", course: "主食", note: "山口の郷土麺。本当は熱く焼いた瓦の上に茶そばをのせて、温かいおつゆにつけて食べるよ。ここではフライパンで再現するよ。", ingredients: [
    { name: "そば", match: ["茶そば", "そば"], per: 1, unit: "束" },
    { name: "牛肉", match: ["牛肉"], per: 50, unit: "g" },
    { name: "卵", match: ["卵", "たまご"], per: 1, unit: "個" },
    { name: "ねぎ", match: ["ねぎ", "ネギ", "長ねぎ"], per: 0.3, unit: "本" },
    { name: "レモン", match: ["レモン"], per: 0.25, unit: "個" },
  ], steps: ["そばをゆでてフライパンで軽く焼く", "甘辛牛肉と錦糸卵をのせ、温かいつゆにレモンを絞って食べる"], tip: "そばの底が少しカリッとするのがおいしいポイントです" },
  { id: "rg-demikatsu", title: "岡山デミカツ丼風", minutes: 25, genre: "洋風", method: "揚げる", course: "主食", note: "岡山のご当地丼。とんかつにデミグラスソースをかけた洋食風の丼で、喫茶店や洋食屋さんで生まれた味だよ。", ingredients: [
    { name: "豚肉", match: ["豚ロース", "豚肉"], per: 100, unit: "g" },
    { name: "パン粉", match: ["パン粉"], per: 2, unit: "大さじ" },
    { name: "デミグラスソース", match: ["デミグラス"], per: 0.25, unit: "缶" },
    { name: "キャベツ", match: ["キャベツ"], per: 30, unit: "g" },
  ], steps: ["豚肉をカツに揚げる", "ごはんにキャベツとカツをのせ、デミグラスソースをかける（ごはんは別に用意）"], tip: "ソースは温めてからかけるとごはんが冷めません" },
  // ---- 四国 ----
  { id: "rg-sanuki-udon", title: "讃岐うどん風", minutes: 15, genre: "和風", method: "ゆでる", course: "主食", note: "香川は『うどん県』と呼ばれるうどん王国。コシの強い麺を、いりこだしでいただくのが讃岐流だよ。", ingredients: [
    { name: "うどん", match: ["うどん"], per: 1, unit: "玉" },
    { name: "ねぎ", match: ["ねぎ", "ネギ", "長ねぎ"], per: 0.2, unit: "本" },
    { name: "生姜", match: ["生姜", "しょうが"], per: 3, unit: "g" },
  ], steps: ["うどんをコシが残るようゆでる", "いりこだし（だしで代用）をかけ、ねぎとおろし生姜をのせる"], tip: "天かすを散らすと『たぬき』になります" },
  { id: "rg-katsuo-tataki", title: "かつおのたたき", minutes: 15, genre: "和風", method: "焼く", course: "主菜", note: "高知の名物。かつおの表面だけを焼いて香ばしくし、塩やポン酢で食べるよ。坂本龍馬も好んだと言われるよ。", ingredients: [
    { name: "かつお", match: ["かつお", "カツオ"], per: 100, unit: "g" },
    { name: "玉ねぎ", match: ["玉ねぎ", "たまねぎ"], per: 0.25, unit: "個" },
    { name: "大葉", match: ["大葉", "しそ"], per: 2, unit: "枚" },
  ], steps: ["かつおの表面を強火でさっと炙る", "厚めに切って玉ねぎと大葉を添え、塩やポン酢で"], tip: "中は生、外は香ばしいのがたたきの命です" },
  { id: "rg-taimeshi", title: "鯛めし風", minutes: 20, genre: "和風", method: "煮る", course: "主食", note: "愛媛の郷土ごはん。宇和島では鯛のお刺身を卵のタレにからめてごはんにのせる、珍しい食べ方が有名だよ。", ingredients: [
    { name: "鯛", match: ["鯛", "たい"], per: 1, unit: "切れ" },
    { name: "卵", match: ["卵", "たまご"], per: 1, unit: "個" },
  ], steps: ["鯛を焼いてほぐし、炊きたてごはんに混ぜる（ごはんは別に用意）", "好みで卵黄をタレに混ぜてかけても"], tip: "鯛のアラでだしを取るとごちそう感が増します" },
  { id: "rg-imotaki", title: "愛媛の芋炊き風", minutes: 25, genre: "和風", method: "煮る", course: "副菜", note: "愛媛の秋の味。河原で大きな鍋で里芋を炊く『いもたき』は、松山の秋の風物詩だよ。", ingredients: [
    { name: "里芋", match: ["里芋"], per: 3, unit: "個" },
    { name: "鶏もも肉", match: ["鶏もも", "鶏肉", "とり肉"], per: 40, unit: "g" },
    { name: "こんにゃく", match: ["こんにゃく"], per: 0.5, unit: "枚" },
    { name: "にんじん", match: ["にんじん", "人参"], per: 0.3, unit: "本" },
  ], steps: ["材料をだしで煮る", "醤油と砂糖でほんのり甘く仕上げる"], tip: "里芋の形が残るよう煮すぎないのがコツです" },
  // ---- 九州 ----
  { id: "rg-chicken-nanban", title: "宮崎チキン南蛮", minutes: 25, genre: "洋風", method: "揚げる", course: "主菜", note: "宮崎の名物。揚げた鶏肉を甘酢にくぐらせて、タルタルソースをたっぷり。洋食屋さんのまかないが始まりだと言われるよ。", ingredients: [
    { name: "鶏もも肉", match: ["鶏もも", "鶏肉", "とり肉"], per: 100, unit: "g" },
    { name: "卵", match: ["卵", "たまご"], per: 1, unit: "個" },
    { name: "小麦粉", match: ["小麦粉"], per: 1, unit: "大さじ" },
    { name: "酢", match: ["酢"], per: 1, unit: "大さじ" },
  ], steps: ["鶏肉に衣をつけて揚げ、甘酢にくぐらせる", "ゆで卵のタルタルソースをたっぷりのせる"], tip: "タルタルは卵を粗く崩すと食べ応えが出ます" },
  { id: "rg-champon", title: "長崎ちゃんぽん", minutes: 20, genre: "中華", method: "煮る", course: "主食", note: "長崎の名物麺。中国から来た料理が元になり、太麺に海と山の具をたっぷりのせるよ。『ちゃんぽん』は混ぜるという意味だと言われるよ。", ingredients: [
    { name: "中華麺", match: ["中華麺"], per: 1, unit: "玉" },
    { name: "豚肉", match: ["豚肉"], per: 40, unit: "g" },
    { name: "えび", match: ["えび", "海老"], per: 2, unit: "尾" },
    { name: "キャベツ", match: ["キャベツ"], per: 40, unit: "g" },
    { name: "もやし", match: ["もやし"], per: 0.5, unit: "袋" },
    { name: "かまぼこ", match: ["かまぼこ"], per: 2, unit: "切れ" },
  ], steps: ["豚肉と野菜を炒めてスープで煮る", "麺を入れてひと煮立ちさせる"], tip: "具だくさんにするほどちゃんぽんらしくなります" },
  { id: "rg-tonkotsu", title: "博多とんこつラーメン風", minutes: 20, genre: "中華", method: "ゆでる", course: "主食", note: "福岡・博多の名物。白く濁った豚骨スープと細い麺が特徴。麺のおかわり『替え玉』も博多の文化だよ。", ingredients: [
    { name: "ラーメン", match: ["ラーメン", "中華麺"], per: 1, unit: "玉" },
    { name: "豚肉", match: ["豚肉"], per: 40, unit: "g" },
    { name: "ねぎ", match: ["ねぎ", "ネギ", "長ねぎ"], per: 0.3, unit: "本" },
    { name: "生姜", match: ["生姜", "しょうが"], per: 3, unit: "g" },
  ], steps: ["豚骨風スープ（市販の素でOK）で麺を短めにゆでる", "焼いた豚肉とねぎをのせる"], tip: "紅生姜をのせると博多らしくなります" },
  { id: "rg-satsumajiru", title: "鹿児島さつま汁", minutes: 25, genre: "和風", method: "スープ", course: "汁物", note: "鹿児島の郷土汁。さつまいもと豚肉を味噌で煮込む、甘みのあるお汁。薩摩は今の鹿児島の昔の名前だよ。", ingredients: [
    { name: "豚肉", match: ["豚肉"], per: 40, unit: "g" },
    { name: "さつまいも", match: ["さつまいも", "薩摩芋"], per: 75, unit: "g" },
    { name: "大根", match: ["大根", "だいこん"], per: 50, unit: "g" },
    { name: "味噌", match: ["味噌", "みそ"], per: 1.5, unit: "大さじ" },
  ], steps: ["豚肉と野菜をだしで煮る", "味噌を溶いて仕上げる"], tip: "さつまいもの甘みが味噌とよく合います" },
  // ---- 沖縄 ----
  { id: "rg-rafute", title: "ラフテー風・豚の角煮", minutes: 40, genre: "和風", method: "煮る", course: "主菜", note: "沖縄の豚の角煮。黒糖でとろとろに煮る、沖縄の長寿の食卓を支えるごちそうだよ。", ingredients: [
    { name: "豚バラ肉", match: ["豚バラ", "豚肉"], per: 100, unit: "g" },
    { name: "生姜", match: ["生姜", "しょうが"], per: 5, unit: "g" },
  ], steps: ["豚バラを下茹でして脂を落とす", "黒糖（砂糖で代用）と醤油で弱火でとろとろに煮る"], tip: "一度冷ますと味がしみてさらに柔らかくなります" },
  { id: "rg-okinawa-soba", title: "沖縄そば風", minutes: 20, genre: "和風", method: "ゆでる", course: "主食", note: "沖縄の日常麺。『そば』と言っても小麦の麺で、かつおと豚のだしに三枚肉やかまぼこをのせるよ。", ingredients: [
    { name: "中華麺", match: ["中華麺", "沖縄そば"], per: 1, unit: "玉" },
    { name: "豚肉", match: ["豚肉"], per: 40, unit: "g" },
    { name: "かまぼこ", match: ["かまぼこ"], per: 2, unit: "切れ" },
    { name: "ねぎ", match: ["ねぎ", "ネギ", "長ねぎ"], per: 0.2, unit: "本" },
  ], steps: ["麺をゆでてかつおだしのスープに入れる", "甘辛く煮た豚肉とかまぼこ、ねぎをのせる"], tip: "紅生姜を添えるのが沖縄流です" },
  { id: "rg-sata-andagi", title: "サーターアンダギー風", minutes: 20, genre: "和風", method: "揚げる", course: "デザート", note: "沖縄の、ドーナツみたいなお菓子。揚げると口がパカッと割れて、花が咲いたみたいになる笑顔のおやつだよ。", ingredients: [
    { name: "小麦粉", match: ["小麦粉"], per: 3, unit: "大さじ" },
    { name: "卵", match: ["卵", "たまご"], per: 0.5, unit: "個" },
    { name: "砂糖", match: ["砂糖"], per: 1.5, unit: "大さじ" },
  ], steps: ["材料を混ぜて丸める（ベーキングパウダー小さじ1/2を加える）", "低めの油でじっくり揚げる"], tip: "低温でじっくり揚げるときれいに割れます" },
];

// ============================================================
// 郷土料理の大幅拡充（2026-11-10「できるだけ多く追加して」）
// 全47都道府県の名物をカバーするため、材料は
// [名前, マッチ, 1人分, 単位] のタプルで書くコンパクト記法 RG を使う。
// pref は都道府県名。note は子ども向けの由来メモ（県名から書き出す）。
// ============================================================
const RG = (id, title, minutes, genre, method, course, pref, note, ingredients, steps, tip) => ({
  id, title, minutes, genre, method, course, pref, note,
  ingredients: ingredients.map(([name, match, per, unit]) => ({ name, match, per, unit })),
  steps, tip,
});
export const REGIONAL_RECIPES_MORE = [
  // ---- 北海道（追加6品） ----
  RG("rg2-soupcurry", "札幌スープカレー風", 35, "洋風", "煮る", "主菜", "北海道", "北海道・札幌生まれの、さらさらカレーのスープに大きな野菜がごろごろ入った名物。ごはんをスープにつけて食べるよ。", [["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 75, "g"], ["じゃがいも", ["じゃがいも", "ジャガイモ"], 1, "個"], ["にんじん", ["にんじん", "人参"], 0.5, "本"], ["かぼちゃ", ["かぼちゃ", "南瓜"], 50, "g"], ["ピーマン", ["ピーマン"], 1, "個"], ["カレー粉", ["カレー粉", "カレールー"], 1, "大さじ"]], ["鶏肉と野菜を大きめに切って炒める", "水とカレー粉で煮て、塩で味を調える"], "野菜は素揚げすると本場っぽくなります"),
  RG("rg2-zangi", "ザンギ（北海道の鶏唐揚げ）", 25, "和風", "揚げる", "主菜", "北海道", "北海道の唐揚げは『ザンギ』と呼ばれるよ。下味をしっかりつけるのが北海道流。名前は中国の鶏の揚げ物から来たと言われるよ。", [["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 100, "g"], ["生姜", ["生姜", "しょうが"], 5, "g"], ["片栗粉", ["片栗粉"], 1, "大さじ"]], ["鶏肉を生姜・醤油に30分漬ける", "片栗粉をまぶしてカラッと揚げる"], "漬け時間を長くすると味が濃くなります"),
  RG("rg2-ikameshi", "函館いかめし風", 40, "和風", "煮る", "主食", "北海道", "北海道・森町で生まれた駅弁の王様。イカの中にお米を詰めて、甘辛く煮るよ。戦時中の食糧不足のときに考えられた工夫の味だよ。", [["いか", ["いか", "イカ"], 1, "杯"], ["米", ["米", "ごはん"], 75, "g"]], ["イカの胴に洗った米を7分目まで詰める", "醤油・砂糖・みりんの汁で落し蓋をして煮る"], "米は詰めすぎると破裂するので7分目までに"),
  RG("rg2-butadon", "帯広豚丼風", 20, "和風", "焼く", "主食", "北海道", "北海道・帯広の名物丼。厚い豚肉を炭火のような香ばしさで焼いて、甘辛タレでごはんにのせるよ。", [["豚ロース", ["豚ロース", "豚肉"], 100, "g"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.25, "個"]], ["豚肉を両面こんがり焼く", "砂糖・醤油・みりんのタレを絡めてごはんにのせる（ごはんは別に用意）"], "タレを焦がし気味にすると香ばしくなります"),
  RG("rg2-ramensalad", "ラーメンサラダ", 15, "洋風", "サラダ", "副菜", "北海道", "北海道・札幌の居酒屋で生まれた、冷たい中華麺のサラダ。麺なのにサラダ、サラダなのに麺という楽しい名物だよ。", [["中華麺", ["中華麺"], 1, "玉"], ["レタス", ["レタス"], 40, "g"], ["トマト", ["トマト"], 0.5, "個"], ["ハム", ["ハム"], 20, "g"], ["マヨネーズ", ["マヨネーズ"], 1, "大さじ"]], ["麺をゆでて冷水でしめる", "野菜とハムをのせ、ごまドレッシング風にマヨネーズと醤油で和える"], "きゅうりを足すとさっぱりします"),
  RG("rg2-sanpeijiru", "三平汁", 25, "和風", "スープ", "汁物", "北海道", "北海道の漁師のお汁。塩漬けの鮭と根菜を煮た、体が温まる汁物だよ。名前は昔の漁師さんの名前から来たと言われるよ。", [["鮭", ["鮭", "さけ"], 1, "切れ"], ["大根", ["大根", "だいこん"], 50, "g"], ["じゃがいも", ["じゃがいも", "ジャガイモ"], 0.5, "個"], ["にんじん", ["にんじん", "人参"], 0.3, "本"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.3, "本"]], ["根菜をだしで煮る", "鮭を入れて塩味で仕上げる"], "鮭が塩味の場合は味付けを控えめに"),
  // ---- 東北（追加8品） ----
  RG("rg2-barayaki", "十和田バラ焼き風", 20, "和風", "焼く", "主菜", "青森県", "青森県・十和田市の名物。牛バラ肉と山盛りの玉ねぎを、甘辛タレで鉄板で焼くよ。ごはんがどんどん進む味だよ。", [["牛肉", ["牛肉"], 75, "g"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 1, "個"]], ["玉ねぎを山盛りに敷いて牛肉をのせて焼く", "甘辛タレを回しかけて炒め合わせる"], "玉ねぎは多めがバラ焼きの決まりです"),
  RG("rg2-jajamen", "盛岡じゃじゃ麺風", 20, "中華", "ゆでる", "主食", "岩手県", "岩手県・盛岡の名物麺。うどんに肉味噌ときゅうりをのせて混ぜて食べ、最後は卵スープ『チータンタン』で締めるよ。", [["うどん", ["うどん"], 1, "玉"], ["ひき肉", ["ひき肉"], 50, "g"], ["きゅうり", ["きゅうり"], 0.5, "本"], ["味噌", ["味噌", "みそ"], 1, "大さじ"], ["生姜", ["生姜", "しょうが"], 3, "g"]], ["ひき肉と味噌で肉味噌を作る", "ゆでたうどんに肉味噌と千切りきゅうりをのせ、よく混ぜて食べる"], "食べ終わりの麺に卵とゆで汁を足すとチータンタンになります"),
  RG("rg2-gyutan", "仙台牛タン焼き風", 20, "和風", "焼く", "主菜", "宮城県", "宮城県・仙台の名物。厚切りの牛タンを焼いて、麦めしとテールスープと一緒に食べるのが仙台流だよ。", [["牛タン", ["牛タン", "牛肉"], 75, "g"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.3, "本"], ["キャベツ", ["キャベツ"], 30, "g"]], ["牛タンに塩を振って強火で両面焼く", "浅漬け風キャベツとねぎを添える（ごはんは別に用意）"], "厚切りは中を少しピンクに残すとやわらかいです"),
  RG("rg2-harakomeshi", "はらこ飯風", 25, "和風", "煮る", "主食", "宮城県", "宮城県・亘理（わたり）の郷土ごはん。鮭の煮汁で炊いたごはんに鮭といくらをのせる、親と子のごちそうだよ（はらこはいくらのこと）。", [["鮭", ["鮭", "さけ"], 1, "切れ"], ["いくら", ["いくら"], 20, "g"], ["米", ["米", "ごはん"], 75, "g"]], ["鮭を醤油で煮て、煮汁でごはんを炊く", "ごはんに鮭の身といくらをのせる"], "いくらは食べる直前にのせるとつやつやです"),
  RG("rg2-yokoteyakisoba", "横手やきそば風", 20, "和風", "焼く", "主食", "秋田県", "秋田県・横手市の名物。太めのゆで麺にひき肉と目玉焼きをのせるのが特徴で、福神漬けを添えるよ。", [["中華麺", ["焼きそば麺", "中華麺"], 1, "玉"], ["ひき肉", ["ひき肉"], 50, "g"], ["キャベツ", ["キャベツ"], 40, "g"], ["卵", ["卵", "たまご"], 1, "個"]], ["麺とひき肉・キャベツをソースで炒める", "目玉焼きをのせて完成"], "半熟の目玉焼きを崩して混ぜるのが横手流です"),
  RG("rg2-tsumetainikusoba", "河北の冷たい肉そば風", 20, "和風", "ゆでる", "主食", "山形県", "山形県・河北町の名物。冷たいそばに、甘くない鶏だしの冷たいおつゆをかける、夏に人気のそばだよ。", [["そば", ["そば"], 1, "束"], ["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 50, "g"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.3, "本"]], ["鶏肉をだしで煮て、その汁を冷やしてつゆにする", "冷たくしめたそばに鶏肉とねぎをのせ、冷たいつゆをかける"], "つゆは鶏の脂が固まらないよう一度冷ますのがコツ"),
  RG("rg2-kitakata", "喜多方ラーメン風", 20, "中華", "ゆでる", "主食", "福島県", "福島県・喜多方の名物。平たくて縮れた麺と、すっきり醤油スープ。喜多方では朝からラーメンを食べる『朝ラー』の文化があるよ。", [["ラーメン", ["ラーメン", "中華麺"], 1, "玉"], ["豚肉", ["豚肉"], 40, "g"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.3, "本"]], ["醤油味のスープ（市販の素でOK）で麺をゆでる", "焼いた豚肉とねぎをのせる"], "麺は平打ち縮れ麺が本場です"),
  RG("rg2-enbangyoza", "福島円盤餃子風", 25, "中華", "焼く", "主菜", "福島県", "福島県・福島市の名物。餃子をフライパンに円盤のように丸く並べて焼くから、この名前だよ。野菜たっぷりで軽く食べられるよ。", [["ひき肉", ["ひき肉"], 50, "g"], ["キャベツ", ["キャベツ"], 60, "g"], ["餃子の皮", ["餃子の皮"], 8, "枚"]], ["キャベツ多めの餡を皮で包む", "フライパンに丸く並べて水を入れて蒸し焼きにする"], "円盤の真ん中まで火が通るよう蓋をして蒸らします"),
  // ---- 関東（追加9品） ----
  RG("rg2-ankonabe", "あんこう鍋風", 30, "和風", "煮る", "主菜", "茨城県", "茨城県の冬の名物。『西のふぐ、東のあんこう』と言われる深海魚を、あん肝（きも）を溶いた味噌で煮る豪快な鍋だよ。", [["あんこう", ["あんこう"], 100, "g"], ["白菜", ["白菜"], 0.125, "玉"], ["にんじん", ["にんじん", "人参"], 0.3, "本"], ["豆腐", ["豆腐"], 0.5, "丁"], ["味噌", ["味噌", "みそ"], 1.5, "大さじ"]], ["野菜とあんこうをだしで煮る", "あん肝（なければ味噌だけ）を溶いて仕上げる"], "あんこうは専門のお店や切り身で買うのが安心です"),
  RG("rg2-sanoramen", "佐野ラーメン風", 20, "中華", "ゆでる", "主食", "栃木県", "栃木県・佐野市の名物。青竹で打った平たい麺と、あっさり醤油スープが特徴だよ。", [["ラーメン", ["ラーメン", "中華麺"], 1, "玉"], ["豚肉", ["豚肉"], 40, "g"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.3, "本"]], ["あっさり醤油スープで麺をゆでる", "焼いた豚肉とねぎをのせる"], "麺は平たくてつるつるしたものが佐野流です"),
  RG("rg2-utsunomiyagyoza", "宇都宮餃子風", 25, "中華", "焼く", "主菜", "栃木県", "栃木県・宇都宮市は餃子の街として有名。野菜多めの餡で、たくさん食べられるヘルシーな餃子だよ。", [["ひき肉", ["ひき肉"], 50, "g"], ["キャベツ", ["キャベツ"], 60, "g"], ["にら", ["にら"], 0.25, "束"], ["餃子の皮", ["餃子の皮"], 8, "枚"]], ["野菜多めの餡を皮で包む", "フライパンで蒸し焼きにして底をカリッとさせる"], "酢とこしょうだけで食べる宇都宮流も人気です"),
  RG("rg2-yakimanju", "焼きまんじゅう風", 20, "和風", "焼く", "デザート", "群馬県", "群馬県のソウルフード。ふかふかのおまんじゅうを竹串に刺して、甘い味噌ダレを塗って炭火で焼くおやつだよ。", [["小麦粉", ["小麦粉"], 3, "大さじ"], ["味噌", ["味噌", "みそ"], 1, "大さじ"], ["砂糖", ["砂糖"], 1.5, "大さじ"]], ["小麦粉の生地を蒸して（または蒸しパンで代用）まんじゅう状にする", "味噌と砂糖のタレを塗ってフライパンで焼き色をつける"], "タレは塗っては焼くを2回繰り返すとおいしくなります"),
  RG("rg2-mizusawaudon", "水沢うどん風", 15, "和風", "ゆでる", "主食", "群馬県", "群馬県・渋川市の名物で、日本三大うどんのひとつと言われるよ。つるつるの麺を、冷たいごまつゆで食べるのが水沢流だよ。", [["うどん", ["うどん"], 1, "玉"], ["ごま", ["ごま"], 1, "大さじ"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.2, "本"]], ["うどんをゆでて冷水でしめる", "すりごまとつゆを合わせた冷たいごまつゆで食べる"], "舞茸の天ぷらを添えるのが本場の定番です"),
  RG("rg2-katsuura-tantan", "勝浦タンタンメン風", 20, "中華", "煮る", "主食", "千葉県", "千葉県・勝浦市の名物。ラー油の辛いスープに、ひき肉と玉ねぎがたっぷり。寒い海で働く漁師さんが体を温めるために生まれた味だよ（おうち版は辛さ控えめで）。", [["中華麺", ["中華麺"], 1, "玉"], ["ひき肉", ["ひき肉"], 50, "g"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.3, "本"]], ["玉ねぎとひき肉を炒めてスープで煮る", "麺を入れて、ラー油は大人の分だけ後がけにする"], "玉ねぎの甘さが勝浦式のポイントです"),
  RG("rg2-namero", "なめろう風", 15, "和風", "和える", "副菜", "千葉県", "千葉県の漁師ごはん。あじを細かくたたいて味噌と薬味と混ぜるよ。『皿をなめるほどおいしい』が名前の由来と言われるよ。", [["あじ", ["あじ", "アジ"], 1, "尾"], ["大葉", ["大葉", "しそ"], 2, "枚"], ["味噌", ["味噌", "みそ"], 0.5, "大さじ"], ["生姜", ["生姜", "しょうが"], 3, "g"]], ["あじの身を包丁で細かくたたく", "味噌・大葉・生姜と混ぜ合わせる"], "新鮮なあじで作るのが漁師流。焼くとさんが焼きになります"),
  RG("rg2-sanmamen", "横浜サンマーメン風", 20, "中華", "煮る", "主食", "神奈川県", "神奈川県・横浜の名物麺。細麺の上に、とろみのある熱い野菜あんをたっぷりかけるよ。名前の『サンマー』は『生（なま）の馬』という中国語から来たと言われるよ。", [["中華麺", ["中華麺"], 1, "玉"], ["豚肉", ["豚肉"], 40, "g"], ["もやし", ["もやし"], 0.5, "袋"], ["キャベツ", ["キャベツ"], 40, "g"], ["片栗粉", ["片栗粉"], 1, "大さじ"]], ["豚肉と野菜を炒めてスープで煮て、片栗粉でとろみをつける", "ゆでた麺に熱いあんをかける"], "あんは冷めにくいので、猫舌さんは気をつけて"),
  RG("rg2-zeryfry", "行田ゼリーフライ風", 25, "和風", "揚げる", "副菜", "埼玉県", "埼玉県・行田市の名物。じゃがいもとおからのコロッケのような揚げ物で、形が小判に似ていて『銭（ぜに）フライ』から名前がついたと言われるよ。", [["じゃがいも", ["じゃがいも", "ジャガイモ"], 1, "個"], ["おから", ["おから"], 25, "g"], ["にんじん", ["にんじん", "人参"], 0.3, "本"], ["ソース", ["ソース"], 1, "大さじ"]], ["茹でたじゃがいもとおからを混ぜて小判型に丸める", "油で揚げてソースをかける（衣はつけないのが本場流）"], "衣なしで揚げるのがゼリーフライの特徴です"),
  // ---- 中部（追加12品） ----
  RG("rg2-tarekatsu", "新潟タレカツ丼風", 25, "和風", "揚げる", "主食", "新潟県", "新潟市の名物。うすめのとんかつを甘辛い醤油ダレにくぐらせてごはんにのせるだけ、というシンプルな丼だよ。", [["豚肉", ["豚ロース", "豚肉"], 100, "g"], ["パン粉", ["パン粉"], 2, "大さじ"]], ["豚肉をうすく伸ばしてカツに揚げる", "醤油・砂糖・みりんの熱いタレにくぐらせ、ごはんにのせる（ごはんは別に用意）"], "キャベツはのせないのがタレカツ流です"),
  RG("rg2-hegisoba", "へぎそば風", 15, "和風", "ゆでる", "主食", "新潟県", "新潟県・魚沼地方の名物。つなぎに海藻の布海苔（ふのり）を使ったそばを、『へぎ』という木の器に一口ずつ盛るよ。", [["そば", ["そば"], 1, "束"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.2, "本"]], ["そばをゆでて冷水でしめる", "一口大に丸めて器に盛り、薬味を添える"], "からしで食べるのも魚沼の習慣です"),
  RG("rg2-blackramen", "富山ブラックラーメン風", 20, "中華", "ゆでる", "主食", "富山県", "富山県の名物。真っ黒な醤油スープが特徴で、もともとは肉体労働の人の塩分補給のために生まれた味だよ（おうち版はほどほどの濃さで）。", [["ラーメン", ["ラーメン", "中華麺"], 1, "玉"], ["豚肉", ["豚肉"], 40, "g"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.5, "本"]], ["濃い醤油色のスープで麺をゆでる", "焼いた豚肉と山盛りのねぎをのせる"], "黒こしょうを効かせるのがブラック流です"),
  RG("rg2-masuzushi", "ます寿司風", 20, "和風", "和える", "主食", "富山県", "富山県の駅弁の名物。ます（鱒）の切り身を酢飯にのせて、笹の葉で包んで押したお寿司だよ。丸い形が特徴だよ。", [["ます", ["ます", "鱒", "鮭"], 1, "切れ"], ["米", ["米", "ごはん"], 75, "g"], ["酢", ["酢"], 1, "大さじ"]], ["ごはんに酢と砂糖を混ぜて酢飯にする", "ますの切り身をのせて押し寿司の形に整える"], "笹やラップに包んで少し置くと形がなじみます"),
  RG("rg2-jibuni", "金沢治部煮風", 30, "和風", "煮る", "主菜", "石川県", "石川県・金沢の郷土料理。鶏肉（本来は鴨）に小麦粉をまぶしてとろみのある汁で煮るよ。名前の『治部』は昔の人の名前から来たと言われるよ。", [["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 75, "g"], ["しいたけ", ["しいたけ"], 1, "個"], ["にんじん", ["にんじん", "人参"], 0.3, "本"], ["小麦粉", ["小麦粉"], 1, "大さじ"]], ["鶏肉に小麦粉をまぶす", "野菜と一緒に甘辛いだしで煮て、自然なとろみをつける"], "わさびを添えるのが金沢流です"),
  RG("rg2-kanazawacurry", "金沢カレー風", 30, "洋風", "煮る", "主食", "石川県", "石川県・金沢の名物カレー。どろっと濃いルーにとんかつとキャベツ、ステンレスの器が本場のスタイルだよ。", [["豚肉", ["豚ロース", "豚肉"], 75, "g"], ["パン粉", ["パン粉"], 1.5, "大さじ"], ["カレールー", ["カレールー", "ルー"], 1, "かけ"], ["キャベツ", ["キャベツ"], 40, "g"]], ["豚肉をカツに揚げる", "濃いカレーをごはんにかけ、カツと千切りキャベツをのせる（ごはんは別に用意）"], "ソースをカツに少し回しかけるのも金沢流です"),
  RG("rg2-saucekatsu", "福井ソースカツ丼風", 25, "洋風", "揚げる", "主食", "福井県", "福井県の名物。うすく大きなとんかつを特製のウスター系ソースにくぐらせて、白いごはんにのせるシンプルな丼だよ。", [["豚肉", ["豚ロース", "豚肉"], 100, "g"], ["パン粉", ["パン粉"], 2, "大さじ"], ["ソース", ["ソース"], 1.5, "大さじ"]], ["豚肉をうすく伸ばして細かいパン粉でカツに揚げる", "温めたソースにくぐらせてごはんにのせる（ごはんは別に用意）"], "細かいパン粉でサクサクにするのが福井流です"),
  RG("rg2-oroshisoba", "越前おろしそば風", 15, "和風", "ゆでる", "主食", "福井県", "福井県の名物そば。冷たいそばに大根おろしと鰹節をのせて、濃いめのおつゆをかけるよ。大根の辛みがポイントだよ。", [["そば", ["そば"], 1, "束"], ["大根", ["大根", "だいこん"], 75, "g"], ["かつお節", ["かつお節"], 2, "g"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.2, "本"]], ["そばをゆでて冷水でしめる", "大根おろしと鰹節・ねぎをのせ、冷たいつゆをかける"], "大根おろしの汁も一緒にかけるのが越前流です"),
  RG("rg2-oyaki", "信州おやき風", 30, "和風", "焼く", "副菜", "長野県", "長野県の郷土おやつ。小麦粉の皮で野沢菜やあんこを包んで焼くよ。寒い山国で生まれた、保存の知恵のおやきだよ。", [["小麦粉", ["小麦粉"], 3, "大さじ"], ["野沢菜", ["野沢菜", "高菜"], 25, "g"], ["味噌", ["味噌", "みそ"], 0.5, "大さじ"]], ["小麦粉の生地を練って休ませ、野沢菜を包む", "フライパンで両面をこんがり焼く（蒸し焼きに）"], "具は野沢菜・あんこ・かぼちゃなど家々で違います"),
  RG("rg2-keichan", "岐阜けいちゃん風", 20, "和風", "焼く", "主菜", "岐阜県", "岐阜県・奥美濃の郷土料理。味噌ダレに漬けた鶏肉（けいちゃん）をキャベツと一緒に焼くよ。名前は『鶏ちゃん』から来ているよ。", [["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 75, "g"], ["キャベツ", ["キャベツ"], 60, "g"], ["味噌", ["味噌", "みそ"], 1, "大さじ"]], ["鶏肉を味噌ダレに漬ける", "キャベツと一緒にフライパンで焼く"], "うどんを一緒に焼くのも人気の食べ方です"),
  RG("rg2-iseudon", "伊勢うどん風", 15, "和風", "ゆでる", "主食", "三重県", "三重県・伊勢の名物。太くてやわらかい麺に、真っ黒なたまり醤油のタレをかけるよ。伊勢神宮への旅人のために早く出せるよう、麺を茹で置いたのが始まりと言われるよ。", [["うどん", ["うどん"], 1, "玉"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.2, "本"]], ["太いうどんをやわらかくゆでる", "たまり醤油風の濃いタレをかけ、ねぎをのせてよく混ぜる"], "卵の黄身をのせるとまろやかになります"),
  RG("rg2-misonikomi", "味噌煮込みうどん風", 25, "和風", "煮る", "主食", "愛知県", "愛知県・名古屋の名物。赤味噌の汁で生のうどんを土鍋で煮込むよ。麺に芯が残るくらいが本場の食感だよ。", [["うどん", ["うどん"], 1, "玉"], ["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 50, "g"], ["卵", ["卵", "たまご"], 1, "個"], ["味噌", ["味噌", "みそ"], 1.5, "大さじ"]], ["土鍋（鍋）に赤味噌の汁を作り鶏肉を煮る", "うどんをそのまま入れて煮込み、最後に卵を落とす"], "蓋を食器代わりにして食べるのが名古屋流です"),
  RG("rg2-hitsumabushi", "ひつまぶし風", 25, "和風", "焼く", "主食", "愛知県", "愛知県・名古屋の名物。刻んだうなぎの蒲焼をごはんにのせて、①そのまま②薬味③だし茶漬け、と3回楽しむ食べ方だよ。", [["うなぎ", ["うなぎ"], 0.5, "尾"], ["米", ["米", "ごはん"], 75, "g"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.2, "本"], ["大葉", ["大葉", "しそ"], 1, "枚"]], ["うなぎを温めて細かく刻む", "ごはんにのせ、最後はだしをかけてお茶漬け風に"], "わさびと海苔の薬味を用意すると本格的です"),
  // ---- 関西（追加8品） ----
  RG("rg2-nishinsoba", "京都にしんそば風", 20, "和風", "ゆでる", "主食", "京都府", "京都府の名物そば。甘く煮たにしんをそばにのせるよ。海から遠い京都で、保存のきく干物のにしんがごちそうだったんだ。", [["そば", ["そば"], 1, "束"], ["にしん", ["にしん"], 1, "切れ"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.2, "本"]], ["にしんを甘辛く煮る（ソフト身欠きにしんで代用可）", "温かいそばにのせる"], "九条ねぎを散らすのが京都流です"),
  RG("rg2-yubagohan", "湯葉あんかけごはん風", 20, "和風", "煮る", "主食", "京都府", "京都府の精進（しょうじん）の味。豆乳を温めるとできる薄い膜『湯葉』を、とろとろのあんにしてごはんにかけるよ。", [["湯葉", ["湯葉"], 25, "g"], ["しいたけ", ["しいたけ"], 1, "個"], ["米", ["米", "ごはん"], 75, "g"], ["片栗粉", ["片栗粉"], 1, "大さじ"]], ["だしでしいたけを煮て片栗粉でとろみをつける", "湯葉を入れて、炊きたてごはんにかける"], "生姜のすりおろしを添えると料亭の味になります"),
  RG("rg2-akashiyaki", "明石焼き風", 20, "和風", "焼く", "主食", "兵庫県", "兵庫県・明石市の名物。たこ焼きの先祖と言われ、卵たっぷりのふわふわ生地を、だしにつけて食べるよ。地元では『玉子焼』と呼ぶよ。", [["卵", ["卵", "たまご"], 1, "個"], ["小麦粉", ["小麦粉"], 2, "大さじ"], ["たこ", ["たこ"], 30, "g"]], ["卵と小麦粉のゆるい生地にたこを入れて丸く焼く", "温かいだしにつけて食べる"], "だしは熱々を用意するとおいしくいただけます"),
  RG("rg2-sobameshi", "神戸そばめし風", 20, "洋風", "焼く", "主食", "兵庫県", "兵庫県・神戸市長田区の名物。焼きそばとごはんを一緒に炒めるよ。お好み焼き屋さんで生まれた、子どもに人気の味だよ。", [["中華麺", ["焼きそば麺", "中華麺"], 0.5, "玉"], ["米", ["米", "ごはん"], 75, "g"], ["豚肉", ["豚肉"], 40, "g"], ["キャベツ", ["キャベツ"], 40, "g"], ["ソース", ["ソース"], 1.5, "大さじ"]], ["麺を細かく刻む", "ごはんと豚肉・キャベツと一緒にソースで炒める"], "目玉焼きをのせると長田流です"),
  RG("rg2-kakinohazushi", "柿の葉寿司風", 20, "和風", "和える", "主食", "奈良県", "奈良県の郷土寿司。一口の酢飯と鮭を柿の葉で包むよ。柿の葉には食べ物を守る力があり、山里の保存の知恵なんだ。", [["鮭", ["鮭", "さけ"], 1, "切れ"], ["米", ["米", "ごはん"], 75, "g"], ["酢", ["酢"], 1, "大さじ"]], ["酢飯を作り、焼いた鮭をほぐす", "一口大ににぎって鮭をのせ、ラップ（あれば柿の葉）で包んでなじませる"], "さばでも作るのが本場です"),
  RG("rg2-meharizushi", "めはり寿司風", 15, "和風", "和える", "主食", "和歌山県", "和歌山県・熊野地方の郷土ごはん。高菜の葉でごはんを包んだ大きなおにぎり。あまりのおいしさに『目を見張る』ことが名前の由来と言われるよ。", [["高菜", ["高菜"], 25, "g"], ["米", ["米", "ごはん"], 100, "g"]], ["高菜の葉を塩抜きして広げる", "ごはんを包んで大きなおにぎりにする"], "高菜の茎を刻んでごはんに混ぜてもおいしいです"),
  RG("rg2-wakayamaramen", "和歌山ラーメン風", 20, "中華", "ゆでる", "主食", "和歌山県", "和歌山県の名物。醤油豚骨の濃いスープと細麺。ラーメン屋さんのテーブルに早ずし（鯖寿司）が置いてあるのが和歌山の不思議な習慣だよ。", [["ラーメン", ["ラーメン", "中華麺"], 1, "玉"], ["豚肉", ["豚肉"], 40, "g"], ["かまぼこ", ["かまぼこ"], 2, "切れ"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.3, "本"]], ["豚骨醤油スープ（市販の素でOK）で細麺をゆでる", "豚肉とかまぼこ、ねぎをのせる"], "ゆで卵を半分に切ってのせると本場っぽくなります"),
  RG("rg2-omigyusukiyaki", "近江牛すき焼き風", 25, "和風", "煮る", "主菜", "滋賀県", "滋賀県のごちそう。『近江牛』は日本で古くから続くブランド牛のひとつ。そのお肉のすき焼きは特別な日の味だよ。", [["牛肉", ["牛肉"], 75, "g"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.5, "本"], ["豆腐", ["豆腐"], 0.5, "丁"], ["しらたき", ["しらたき"], 50, "g"], ["卵", ["卵", "たまご"], 1, "個"]], ["割り下（醤油・砂糖・みりん）で牛肉と野菜を煮る", "溶き卵につけて食べる"], "最初に牛肉だけを焼いて食べるのが関西流です"),
  // ---- 中国（追加6品） ----
  RG("rg2-gyukotsuramen", "鳥取牛骨ラーメン風", 20, "中華", "ゆでる", "主食", "鳥取県", "鳥取県の名物。牛の骨でだしを取る、甘みとコクのあるスープが特徴だよ。戦後から続く東・中部の鳥取の味だよ。", [["ラーメン", ["ラーメン", "中華麺"], 1, "玉"], ["牛肉", ["牛肉"], 40, "g"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.3, "本"]], ["牛骨風スープ（牛だしの素で代用）で麺をゆでる", "焼いた牛肉とねぎをのせる"], "もやしとメンマをのせると本場っぽくなります"),
  RG("rg2-izumosoba", "出雲そば風", 15, "和風", "ゆでる", "主食", "島根県", "島根県・出雲の名物。殻ごと挽いた黒っぽいそばを、三段の丸い器（割子）に盛って、つゆをかけて食べるよ。", [["そば", ["そば"], 1, "束"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.2, "本"], ["大根", ["大根", "だいこん"], 30, "g"]], ["そばをゆでて冷水でしめる", "小分けの器に盛り、大根おろしとねぎをのせてつゆをかける"], "残ったそば湯に最後の段のつゆを入れて飲むのが出雲流です"),
  RG("rg2-ebimeshi", "岡山えびめし風", 20, "洋風", "焼く", "主食", "岡山県", "岡山県の名物。えびとごはんをカラメル色のソースで炒めた、真っ黒い見た目が楽しい炒めごはんだよ。", [["えび", ["えび", "海老"], 3, "尾"], ["米", ["米", "ごはん"], 100, "g"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.25, "個"]], ["玉ねぎとえびを炒める", "ごはんを加え、デミグラス風ソースとカラメルで黒く炒める"], "錦糸卵をのせると岡山の食堂風になります"),
  RG("rg2-hiroshimatsukemen", "広島つけ麺風", 20, "中華", "ゆでる", "主食", "広島県", "広島県の名物。冷たい麺を、ラー油のきいた辛いつけダレで食べるよ（おうち版は辛さなし〜控えめで）。茹でキャベツが名脇役だよ。", [["中華麺", ["中華麺"], 1, "玉"], ["キャベツ", ["キャベツ"], 50, "g"], ["きゅうり", ["きゅうり"], 0.5, "本"], ["卵", ["卵", "たまご"], 1, "個"]], ["麺をゆでて冷水でしめ、野菜を茹でる", "醤油ダレ（ラー油は大人の分だけ）に麺をつけて食べる"], "ゆで卵を添えるのが広島流です"),
  RG("rg2-hiruzenyakisoba", "ひるぜん焼そば風", 20, "和風", "焼く", "主食", "岡山県", "岡山県・蒜山（ひるぜん）高原の名物。味噌味に近い特製ダレと鶏肉で焼く焼きそばだよ。高原のご当地グルメ大会で有名になったよ。", [["中華麺", ["焼きそば麺", "中華麺"], 1, "玉"], ["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 50, "g"], ["キャベツ", ["キャベツ"], 50, "g"]], ["鶏肉とキャベツを炒める", "麺を加え、味噌風味の甘辛ダレで炒める"], "高原キャベツの甘さが主役です"),
  RG("rg2-fukuzosui", "山口ふく雑炊風", 25, "和風", "煮る", "主食", "山口県", "山口県ではふぐのことを『ふく（福）』と呼ぶよ。ふぐのお鍋の締めに作る雑炊が、だしのうま味たっぷりのごちそうだよ（ふぐは資格のある人のものを）。", [["ふぐ", ["ふぐ"], 50, "g"], ["米", ["米", "ごはん"], 50, "g"], ["卵", ["卵", "たまご"], 1, "個"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.3, "本"]], ["ふぐと野菜を煮ただしにごはんを入れる（ふぐは専門の切り身を使う）", "溶き卵を回し入れ、ねぎを散らす"], "ふぐは必ず専門店の処理済みのものを使ってください"),
  // ---- 四国（追加6品） ----
  RG("rg2-tokushimaramen", "徳島ラーメン風", 20, "中華", "ゆでる", "主食", "徳島県", "徳島県の名物。濃い茶色の豚骨醤油スープに、甘辛く煮た豚バラと生卵をのせるよ。ごはんのおかずになるラーメンだよ。", [["ラーメン", ["ラーメン", "中華麺"], 1, "玉"], ["豚肉", ["豚バラ", "豚肉"], 50, "g"], ["卵", ["卵", "たまご"], 1, "個"], ["もやし", ["もやし"], 0.5, "袋"]], ["豚肉を甘辛く煮る", "濃いスープで麺をゆで、豚肉・もやし・生卵（月見）をのせる"], "すき焼きのような甘辛さが徳島流です"),
  RG("rg2-taraiudon", "徳島たらいうどん風", 20, "和風", "ゆでる", "主食", "徳島県", "徳島県・阿波市の名物。大きな『たらい』に熱いうどんを入れて、みんなで温かい生姜のつゆにつけて食べるよ。", [["うどん", ["うどん"], 1, "玉"], ["生姜", ["生姜", "しょうが"], 5, "g"]], ["太いうどんを熱々でゆでる", "生姜を入れた温かいだしつゆで、みんなでつついて食べる"], "たらいがなければ大きな鍋やボウルでOKです"),
  RG("rg2-honebutsudori", "香川骨付鳥風", 30, "和風", "焼く", "主菜", "香川県", "香川県・丸亀の名物。骨のついた鶏もも肉を、にんにくとスパイスを効かせてこんがり焼くよ。豪快にかぶりつくのが本場流だよ。", [["鶏もも肉", ["鶏もも", "鶏肉", "骨付き鶏"], 150, "g"], ["キャベツ", ["キャベツ"], 40, "g"]], ["鶏肉に塩こしょうとにんにくをすり込む", "オーブンやフライパンで皮をパリッと焼く"], "肉汁にキャベツをつけて食べるのが丸亀流です"),
  RG("rg2-yakibutatamago", "今治焼豚玉子飯風", 20, "中華", "焼く", "主食", "愛媛県", "愛媛県・今治市の名物。甘いタレの焼豚と目玉焼きをごはんにのせた、元中華料理屋さんのまかない丼だよ。", [["豚肉", ["豚肉"], 75, "g"], ["卵", ["卵", "たまご"], 1, "個"], ["米", ["米", "ごはん"], 100, "g"]], ["豚肉を甘辛く焼豚風に焼く", "ごはんに焼豚と半熟目玉焼きをのせ、タレを回しかける"], "目玉焼きは2つが今治の定番スタイルです"),
  RG("rg2-jakoten", "宇和島じゃこ天風", 20, "和風", "揚げる", "副菜", "愛媛県", "愛媛県・宇和島の名物。小魚を骨ごとすり身にして揚げた天ぷらで、カルシウムたっぷりだよ。そのまま焼いて食べてもおいしいよ。", [["じゃこ", ["じゃこ", "しらす"], 30, "g"], ["豆腐", ["豆腐"], 0.25, "丁"], ["片栗粉", ["片栗粉"], 1, "大さじ"]], ["じゃこと豆腐・片栗粉を混ぜて平たくまとめる", "油で両面をこんがり揚げ焼きする"], "大根おろしと生姜を添えるのが宇和島流です"),
  RG("rg2-nabeyakiramen", "須崎鍋焼きラーメン風", 20, "中華", "煮る", "主食", "高知県", "高知県・須崎市の名物。土鍋でぐつぐつ煮た熱いラーメンで、鶏だしと細麺、ちくわと生卵が特徴だよ。", [["ラーメン", ["ラーメン", "中華麺"], 1, "玉"], ["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 40, "g"], ["ちくわ", ["ちくわ"], 1, "本"], ["卵", ["卵", "たまご"], 1, "個"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.3, "本"]], ["土鍋で鶏だしのスープを沸かし、麺と鶏肉・ちくわを煮る", "生卵を落として半熟で食べる"], "最後まで熱々なので、取り皿に移して食べてね"),
  // ---- 九州（追加9品） ----
  RG("rg2-motsunabe", "博多もつ鍋風", 30, "和風", "煮る", "主菜", "福岡県", "福岡県・博多の名物鍋。牛もつと山盛りのキャベツ・にらを、醤油や味噌の汁で煮るよ。締めのちゃんぽん麺までが本場の楽しみだよ。", [["もつ", ["牛もつ", "もつ"], 75, "g"], ["キャベツ", ["キャベツ"], 75, "g"], ["にら", ["にら"], 0.5, "束"], ["豆腐", ["豆腐"], 0.5, "丁"]], ["キャベツともつをだしで煮る", "にらと豆腐を入れて、醤油（または味噌）で仕上げる"], "にんにくと唐辛子は大人の分だけ後がけに"),
  RG("rg2-mizutaki", "博多水炊き風", 35, "和風", "煮る", "主菜", "福岡県", "福岡県・博多の鶏鍋。鶏を水から煮て白いスープを取り、肉と野菜をポン酢で食べるよ。最初にスープを塩で飲むのが博多の作法だよ。", [["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 100, "g"], ["白菜", ["白菜"], 0.125, "玉"], ["豆腐", ["豆腐"], 0.5, "丁"], ["ポン酢", ["ポン酢"], 1.5, "大さじ"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.3, "本"]], ["鶏肉を水から煮て白いスープを取る", "野菜と豆腐を煮て、ポン酢で食べる"], "つくねを入れると子どもも大喜びです"),
  RG("rg2-shishirian", "佐賀シシリアンライス風", 20, "洋風", "焼く", "主食", "佐賀県", "佐賀市の名物洋食。温かいごはんに甘辛い牛肉と生野菜をのせて、マヨネーズをかけたワンプレートだよ。名前の由来は諸説ある不思議なご当地グルメだよ。", [["牛肉", ["牛肉"], 75, "g"], ["玉ねぎ", ["玉ねぎ", "たまねぎ"], 0.5, "個"], ["米", ["米", "ごはん"], 100, "g"], ["レタス", ["レタス"], 30, "g"], ["トマト", ["トマト"], 0.5, "個"], ["マヨネーズ", ["マヨネーズ"], 1, "大さじ"]], ["牛肉と玉ねぎを甘辛く炒める", "ごはんに生野菜と牛肉をのせ、マヨネーズをかける"], "温泉卵をのせるアレンジも人気です"),
  RG("rg2-saraudon", "長崎皿うどん", 25, "中華", "煮る", "主食", "長崎県", "長崎県の名物。パリパリの細い揚げ麺に、とろみのある具だくさんのあんをかけるよ。ちゃんぽんの兄弟分だよ。", [["中華麺", ["中華麺"], 1, "玉"], ["豚肉", ["豚肉"], 40, "g"], ["えび", ["えび", "海老"], 2, "尾"], ["キャベツ", ["キャベツ"], 40, "g"], ["片栗粉", ["片栗粉"], 1, "大さじ"]], ["麺を油でパリッと揚げる（揚げ麺を使ってもOK）", "豚肉と具材を炒めてあんを作り、麺にかける"], "ウスターソースやお酢をかけて味変するのが長崎流です"),
  RG("rg2-taiyoyen", "熊太平燕風", 20, "中華", "スープ", "主食", "熊本県", "熊本県の名物麺。中国生まれの『太平燕（タイピーエン）』は、春雨の麺が特徴。熊本の学校給食でもおなじみの味だよ。", [["春雨", ["春雨"], 25, "g"], ["豚肉", ["豚肉"], 40, "g"], ["えび", ["えび", "海老"], 2, "尾"], ["キャベツ", ["キャベツ"], 40, "g"], ["卵", ["卵", "たまご"], 1, "個"]], ["豚肉と野菜・えびをスープで煮る", "春雨を入れて、揚げ卵（またはゆで卵）をのせる"], "ヘルシーな春雨麺が熊本流のポイントです"),
  RG("rg2-toriten", "大分とり天風", 25, "和風", "揚げる", "主菜", "大分県", "大分県の名物。鶏肉の天ぷらで、ポン酢や酢醤油とかぼすでさっぱり食べるよ。大分では唐揚げよりとり天が定番なんだ。", [["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 100, "g"], ["小麦粉", ["天ぷら粉", "小麦粉"], 2, "大さじ"], ["ポン酢", ["ポン酢"], 1, "大さじ"], ["生姜", ["生姜", "しょうが"], 3, "g"]], ["鶏肉を生姜醤油に漬ける", "天ぷら衣をつけてカラッと揚げ、ポン酢で食べる"], "かぼちゃの天ぷらを添えるのが大分らしいです"),
  RG("rg2-hiyajiru", "宮崎冷や汁風", 15, "和風", "和える", "汁物", "宮崎県", "宮崎県の夏の郷土汁。焼いた魚と味噌を冷たいだしで伸ばして、冷たいごはんにかけるよ。暑い日の農作業のごはんだったんだ。", [["あじ", ["あじ", "アジ"], 1, "尾"], ["豆腐", ["豆腐"], 0.5, "丁"], ["きゅうり", ["きゅうり"], 0.5, "本"], ["味噌", ["味噌", "みそ"], 1.5, "大さじ"], ["大葉", ["大葉", "しそ"], 2, "枚"]], ["あじを焼いてほぐし、味噌とすり合わせる", "冷たいだしで伸ばして豆腐ときゅうりを入れ、ごはんにかける（ごはんは別に用意）"], "ごまをすって入れると本格的になります"),
  RG("rg2-kurobutashabu", "鹿児島黒豚しゃぶ風", 20, "和風", "ゆでる", "主菜", "鹿児島県", "鹿児島県の名物『黒豚』のしゃぶしゃぶ。甘みのある豚肉を、そばつゆのような和風だしで食べるのが鹿児島流だよ。", [["豚肉", ["豚肉"], 100, "g"], ["レタス", ["レタス"], 40, "g"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.5, "本"], ["ポン酢", ["ポン酢"], 1.5, "大さじ"]], ["鍋にだしを沸かし、野菜を煮る", "豚肉をさっと湯にくぐらせてポン酢（またはそばつゆ）で食べる"], "肉はピンク色が消える程度に、くぐらせすぎないのがコツ"),
  RG("rg2-keihan", "奄美の鶏飯風", 25, "和風", "スープ", "主食", "鹿児島県", "鹿児島県・奄美大島の郷土ごはん。ごはんに裂いた鶏肉や錦糸卵をのせて、熱い鶏スープをかけて食べるよ。もともとは大切なお客さまへのごちそうだったんだ。", [["鶏もも肉", ["鶏もも", "鶏肉", "とり肉"], 50, "g"], ["米", ["米", "ごはん"], 100, "g"], ["卵", ["卵", "たまご"], 1, "個"], ["しいたけ", ["しいたけ"], 1, "個"], ["ねぎ", ["ねぎ", "ネギ", "長ねぎ"], 0.2, "本"]], ["鶏肉を茹でてスープを取り、身を細かく裂く", "ごはんに鶏肉・錦糸卵・しいたけをのせ、熱いスープをかける"], "パパイヤ漬けの代わりにたくあんを添えても合います"),
  // ---- 沖縄（追加5品） ----
  RG("rg2-tacorice", "沖縄タコライス", 20, "洋風", "焼く", "主食", "沖縄県", "沖縄県の名物。メキシコのタコスの具をごはんにのせた、沖縄生まれの洋食だよ。レタスとトマトとチーズが山盛りだよ。", [["ひき肉", ["ひき肉"], 75, "g"], ["米", ["米", "ごはん"], 100, "g"], ["レタス", ["レタス"], 30, "g"], ["トマト", ["トマト"], 0.5, "個"], ["チーズ", ["チーズ"], 15, "g"]], ["ひき肉をケチャップとスパイスでタコミート風に炒める", "ごはんにレタスとタコミート、トマトとチーズをのせる"], "辛いサルサは大人の分だけ後がけに"),
  RG("rg2-ninjinshirishiri", "にんじんしりしり", 10, "和風", "焼く", "副菜", "沖縄県", "沖縄県の家庭料理。にんじんを千切りにして卵と炒めるよ。『しりしり』は、にんじんをおろし器ですりすりする音・様子から来た言葉だよ。", [["にんじん", ["にんじん", "人参"], 1, "本"], ["卵", ["卵", "たまご"], 1, "個"], ["ツナ缶", ["ツナ缶", "ツナ"], 0.25, "缶"]], ["にんじんを千切りにして炒める", "ツナと溶き卵を加えて炒め合わせる"], "専用の『しりしり器』でにんじんを削るのが沖縄流です"),
  RG("rg2-porktamago", "ポーク玉子おにぎり風", 15, "和風", "焼く", "主食", "沖縄県", "沖縄県の定番おにぎり。焼いたランチョンミート（ポーク）と卵焼きを、ごはんと海苔でサンドするよ。コンビニでも大人気だよ。", [["ハム", ["ハム", "ランチョンミート"], 30, "g"], ["卵", ["卵", "たまご"], 1, "個"], ["米", ["米", "ごはん"], 75, "g"]], ["ハム（厚切り）を焼き、卵焼きを作る", "ごはんと一緒に海苔でサンドして包む"], "中身はツナマヨやゴーヤの天ぷらも人気です"),
  RG("rg2-soki", "ソーキ煮風", 40, "和風", "煮る", "主菜", "沖縄県", "沖縄県の名物。豚のあばら肉（ソーキ）を、黒糖と泡盛（お酒）でとろとろに煮るよ。沖縄そばにのせるのも定番だよ。", [["豚バラ肉", ["豚バラ", "豚肉"], 100, "g"], ["生姜", ["生姜", "しょうが"], 5, "g"], ["大根", ["大根", "だいこん"], 50, "g"]], ["豚肉を下茹でして脂を落とす", "黒糖（砂糖で代用）と醤油で大根と一緒に弱火で煮る"], "圧力鍋を使うと短時間でとろとろになります"),
  RG("rg2-mozukuten", "もずくの天ぷら風", 15, "和風", "揚げる", "副菜", "沖縄県", "沖縄県の名物天ぷら。海藻のもずくを衣と一緒に揚げると、もちもちカリッの楽しい食感になるよ。沖縄の食堂の定番だよ。", [["もずく", ["もずく"], 50, "g"], ["小麦粉", ["小麦粉"], 2, "大さじ"], ["にんじん", ["にんじん", "人参"], 0.3, "本"]], ["もずくの水気を切って衣とにんじんと混ぜる", "スプーンですくって油で揚げる"], "塩を少しかけるだけでおいしいです"),
];
REGIONAL_RECIPES.push(...REGIONAL_RECIPES_MORE);

/** 既存の郷土料理・再利用レシピの都道府県（新規 RG 品は pref を直接持つ） */
export const REGIONAL_PREF = {
  "rg-jingisukan": "北海道", "chanchan": "北海道", "rg-ishikari": "北海道", "rg-buttercorn": "北海道",
  "rg-kiritanpo": "秋田県", "rg-imoni": "山形県", "rg-senbeijiru": "青森県", "rg-zunda": "宮城県",
  "rg-fukagawa": "東京都", "rg-monja": "東京都", "rg-shumai": "神奈川県", "rg-chanko": "東京都",
  "rg-misokatsu": "愛知県", "rg-tebasaki": "愛知県", "rg-hoto": "山梨県", "rg-hamamatsu-gyoza": "静岡県",
  "rg-takoyaki": "大阪府", "rg-okonomiyaki": "大阪府", "rg-kitsune-udon": "大阪府", "rg-kushikatsu": "大阪府",
  "rg-hiroshima-okonomi": "広島県", "rg-kawara-soba": "山口県", "rg-demikatsu": "岡山県", "ev-shijimi-jiru": "島根県",
  "rg-sanuki-udon": "香川県", "rg-katsuo-tataki": "高知県", "rg-taimeshi": "愛媛県", "rg-imotaki": "愛媛県",
  "rg-chicken-nanban": "宮崎県", "rg-champon": "長崎県", "rg-tonkotsu": "福岡県", "rg-satsumajiru": "鹿児島県",
  "ev-goya-champuru": "沖縄県", "rg-rafute": "沖縄県", "rg-okinawa-soba": "沖縄県", "rg-sata-andagi": "沖縄県",
};

// ---- 地域セット（北から南の順） ----
// intro はその土地の食の特徴を子ども向けに1行で。
// dishes は REGIONAL_RECIPES と既存レシピ（ALL/EVENT）の id を混ぜて参照する。
export const REGIONS = [
  { id: "hokkaido", name: "北海道", emoji: "❄️", dishes: ["rg-jingisukan", "chanchan", "rg-ishikari", "rg-buttercorn", "rg2-soupcurry", "rg2-zangi", "rg2-ikameshi", "rg2-butadon", "rg2-ramensalad", "rg2-sanpeijiru"],
    intro: "海の幸と大地の恵み。鮭・じゃがいも・とうもろこしと、寒い土地ならではの温かい鍋が自慢だよ。" },
  { id: "tohoku", name: "東北", emoji: "🍎", dishes: ["rg-kiritanpo", "rg-imoni", "rg-senbeijiru", "rg-zunda", "rg2-barayaki", "rg2-jajamen", "rg2-gyutan", "rg2-harakomeshi", "rg2-yokoteyakisoba", "rg2-tsumetainikusoba", "rg2-kitakata", "rg2-enbangyoza"],
    intro: "山と里の恵み。きりたんぽや芋煮など、体が温まる鍋ものと、枝豆のずんだが有名だよ。" },
  { id: "kanto", name: "関東", emoji: "🗼", dishes: ["rg-monja", "rg-fukagawa", "rg-shumai", "rg-chanko", "rg2-ankonabe", "rg2-sanoramen", "rg2-utsunomiyagyoza", "rg2-yakimanju", "rg2-mizusawaudon", "rg2-katsuura-tantan", "rg2-namero", "rg2-sanmamen", "rg2-zeryfry"],
    intro: "江戸・東京の下町ごはんと港町の味。もんじゃ焼きに深川めし、横浜のシュウマイだよ。" },
  { id: "chubu", name: "中部", emoji: "🏯", dishes: ["rg-misokatsu", "rg-tebasaki", "rg-hoto", "rg-hamamatsu-gyoza", "rg2-tarekatsu", "rg2-hegisoba", "rg2-blackramen", "rg2-masuzushi", "rg2-jibuni", "rg2-kanazawacurry", "rg2-saucekatsu", "rg2-oroshisoba", "rg2-oyaki", "rg2-keichan", "rg2-iseudon", "rg2-misonikomi", "rg2-hitsumabushi"],
    intro: "名古屋めしの甘い赤味噌、山梨のほうとう、浜松の餃子。真ん中の日本の味だよ。" },
  { id: "kansai", name: "関西", emoji: "🐙", dishes: ["rg-takoyaki", "rg-okonomiyaki", "rg-kitsune-udon", "rg-kushikatsu", "rg2-nishinsoba", "rg2-yubagohan", "rg2-akashiyaki", "rg2-sobameshi", "rg2-kakinohazushi", "rg2-meharizushi", "rg2-wakayamaramen", "rg2-omigyusukiyaki"],
    intro: "粉ものの本場。たこ焼き・お好み焼き・うどんと、大阪の楽しい食卓だよ。" },
  { id: "chugoku", name: "中国", emoji: "🍋", dishes: ["rg-hiroshima-okonomi", "rg-kawara-soba", "rg-demikatsu", "ev-shijimi-jiru", "rg2-gyukotsuramen", "rg2-izumosoba", "rg2-ebimeshi", "rg2-hiroshimatsukemen", "rg2-hiruzenyakisoba", "rg2-fukuzosui"],
    intro: "瀬戸内の恵み。広島のお好み焼き、山口の瓦そば、宍道湖のしじみ汁だよ。" },
  { id: "shikoku", name: "四国", emoji: "🍊", dishes: ["rg-sanuki-udon", "rg-katsuo-tataki", "rg-taimeshi", "rg-imotaki", "rg2-tokushimaramen", "rg2-taraiudon", "rg2-honebutsudori", "rg2-yakibutatamago", "rg2-jakoten", "rg2-nabeyakiramen"],
    intro: "讃岐うどんに高知のかつお、愛媛の鯛めしと芋炊き。四つの県の名物がそろうよ。" },
  { id: "kyushu", name: "九州", emoji: "🍜", dishes: ["rg-champon", "rg-tonkotsu", "rg-chicken-nanban", "rg-satsumajiru", "rg2-motsunabe", "rg2-mizutaki", "rg2-shishirian", "rg2-saraudon", "rg2-taiyoyen", "rg2-toriten", "rg2-hiyajiru", "rg2-kurobutashabu", "rg2-keihan"],
    intro: "長崎ちゃんぽん、博多ラーメン、宮崎チキン南蛮。南の元気な麺と鶏の国だよ。" },
  { id: "okinawa", name: "沖縄", emoji: "🌺", dishes: ["ev-goya-champuru", "rg-rafute", "rg-okinawa-soba", "rg-sata-andagi", "rg2-tacorice", "rg2-ninjinshirishiri", "rg2-porktamago", "rg2-soki", "rg2-mozukuten"],
    intro: "長寿の島の食卓。ゴーヤや豚肉を上手に食べて、暑さに負けない知恵が詰まっているよ。" },
];

const REGIONAL_DISH_BY_ID = new Map([...ALL_RECIPES, ...EVENT_RECIPES, ...REGIONAL_RECIPES].map((r) => [r.id, r]));

/** id から地域を引く */
export function regionById(regionId) {
  return REGIONS.find((r) => r.id === regionId) || null;
}

/**
 * 地域の献立を組み立てる（イベント献立と同じ評価系）。
 * 戻り値: { region, dishes, missingAll, totalMinutes, haveCount, missingCount }
 * 地域が無ければ null。
 */
export function suggestRegionalMenu(regionId, stockItems, { servings = 2 } = {}) {
  const region = regionById(regionId);
  if (!region) return null;
  const today = todayLocalISO();
  const dishes = [];
  for (const id of region.dishes) {
    const recipe = REGIONAL_DISH_BY_ID.get(id);
    if (!recipe) continue;
    const { bonus, earliestExpiry, ...evaluated } = evaluateRecipe(recipe, stockItems, servings, today);
    dishes.push({ ...evaluated, pref: recipe.pref || REGIONAL_PREF[id] || null });
  }
  const missingMap = new Map();
  let haveCount = 0;
  for (const d of dishes) {
    haveCount += d.have.length;
    for (const m of d.missing) {
      const key = `${m.name}|${m.unit}`;
      if (missingMap.has(key)) missingMap.get(key).amount = Math.round((missingMap.get(key).amount + m.amount) * 10) / 10;
      else missingMap.set(key, { ...m });
    }
  }
  return {
    region, dishes,
    missingAll: [...missingMap.values()],
    totalMinutes: dishes.reduce((s, d) => s + (d.minutes || 0), 0),
    haveCount, missingCount: missingMap.size,
  };
}
