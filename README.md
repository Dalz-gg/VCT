# VCT ファンガイド(非公式)

「VCTをもっと気軽に。もっと楽しく。」をコンセプトにした、VALORANT の世界大会 VCT(VALORANT Champions Tour)の非公式ファンサイトです。

- `index.html` … トップページ
- `format.html` … 大会システム紹介(2027年フォーマット。原稿は `content/format.md`)
- `teams/index.html` … チーム一覧(地域タブ。Pacific と 日本(オープン)を公開、ほかは「準備中」)
- `teams/<slug>.html` … チーム詳細(`data/teams/<slug>.json` から自動生成)
- `japan.html` … 日本ページ(旧VCJから2027年の日本オープン予選へ。`data/japan.json` から自動生成)
- `news.html` / `news/<id>.html` … ニュース一覧と詳細(`data/news/*.json` から自動生成)。フィードは `news/feed.xml`(Atom)

HTML / CSS / 少しの JS だけでできた静的サイトです。外部のビルドツールは不要で、`file://` で直接開いても、GitHub Pages のサブパス(`https://<user>.github.io/<repo>/`)でも動きます(リンクはすべて相対パスです)。

本サイトは Riot Games が承認・後援したものではありません。詳しくは各ページのフッターの免責文を見てください。

## ディレクトリ

```
index.html / format.html     手書きのページ(<!-- BUILD:xxx --> の間だけビルドで書き換わります)
japan.html / news.html       ビルドで生成(直接編集しないでください)
teams/ / news/               ビルドで生成(直接編集しないでください)
assets/css/site.css          共通デザイン
assets/js/site.js            共通JS(進捗バー、スクロール表示、地域タブ)
assets/img/site/             会場・都市などの写真
assets/img/teams/<slug>/     チーム・選手の写真
data/teams/<slug>.json       チームデータ
data/japan.json              日本ページのデータ(予選の流れ・日程・枠・招待チーム・VCJの歴史)
data/news/<日付>-<id>.json   ニュース(1件1ファイル)
data/pacific-partners.json   Pacific パートナーの並び順
data/credits.json            サイト共通写真のクレジット
scripts/build.mjs            ビルドスクリプト(Node 標準ライブラリのみ)
scripts/add-photo.mjs        運営者の写真を追加するスクリプト
scripts/fixtures/            テンプレート確認用の架空データ(teams/ news/ japan.json)
content/                     原稿・仕様(SPEC.md)・参考デザイン
```

## ビルド

Node.js 22 以上で次を実行します。

```sh
node scripts/build.mjs
```

これで次のファイルが更新されます。

- `teams/index.html` と `teams/<slug>.html`(`data/teams/*.json` から生成。JSON が無くなったチームの生成ページは自動で削除)
- `japan.html`(`data/japan.json` と、`region` が `Japan` のチーム)
- `news.html`・`news/<id>.html`・`news/feed.xml`(`data/news/*.json`。JSON が無くなったニュースの生成ページは自動で削除)
- `index.html` のメニュー・チームストリップ・チームタイル・最新ニュース(新しい4件)・画像クレジット
- `format.html` のメニュー・画像クレジット

データのファイルが無い、または書きかけで読めないときは、警告(`!` で始まる行)を出して、その部分を「準備中」として生成します。写真のクレジットが無いときも警告が出ます。

テンプレートだけ確認したいときは、`data/` に架空データ(`scripts/fixtures/` の `teams/*.json`・`news/*.json`・`japan.json`)を足してビルドできます。

```sh
node scripts/build.mjs --fixture   # teams/sample-team.html、teams/sample-jp-team.html、news/2099-*.html ができ、japan.html は架空データで作られる
node scripts/build.mjs             # 通常ビルドに戻す(架空データのページは自動で消えます)
```

## 日本ページ

`japan.html` は `data/japan.json` から生成します(スキーマは `content/SPEC.md` の「日本(旧VCJ)」)。表示する内容は次のとおりです。

- ヒーロー「日本からVCTへ」と概要(`summary`)
- VCJから何が変わるか(`changes` があればその内容、無ければサイト共通の説明。`changes` は `[{"label","before","after","status","sources"}]`)
- 日本からKickoffへの道の図(`path` の各段階。`Kickoff` を含む段階を赤で強調し、その手前の矢印に `slots.text` を表示。印は「確定 / 報道 / 未確定」)。段階が5つ以上のときは、PCでも縦に並びます
- 日程(`dates` があればそれ、無ければ `path` の `dates`)、招待チーム(`invited_teams`)
- 日本のチーム(`teams`。`roster_status` が `announced` / `partial` / `unannounced` / `disbanded` のとき「発表済み / 一部発表 / 未発表 / 活動終了」の印。`data/teams/<slug>.json` があるチームはカードがそのページへのリンクになります)
- Pacificパートナー(日本)：ZETA DIVISION と Crazy Raccoon のカード
- VCJのあゆみ(`vcj_history`、年の順)、まだわからないこと(`open_questions`)、出典(全項目の `sources` に番号を振って一覧)

日本のチームのページは、`data/teams/<slug>.json` に `"region": "Japan"`、`"tier": "open"` を付け、`partner` の代わりに `"path_2027": {"text": "日本オープン予選から出場", "status": "...", "sources": [...]}` を書きます。チーム一覧の「日本(オープン)」タブにも自動で並びます(並び順は `data/japan.json` の `teams` の順)。

## ニュースの追加方法

1. `data/news/<YYYY-MM-DD>-<短い英字id>.json` を1件1ファイルで作ります(`id` はファイル名と同じ。半角英小文字・数字・ハイフン)。

   ```json
   {
     "id": "2026-11-20-example",
     "date": "2026-11-20",
     "title": "見出し",
     "category": "公式発表",
     "regions": ["Pacific", "Japan"],
     "teams": ["zeta-division"],
     "summary": "2〜3文の要約(です・ます)",
     "body": ["段落1", "段落2"],
     "status": "confirmed",
     "sources": [{"title": "記事のタイトル", "url": "https://..."}],
     "image": null,
     "image_credit": null
   }
   ```

   - `category` は `公式発表` / `移籍・ロスター` / `大会・日程` / `結果` / `日本` / `その他` のどれか(それ以外は「その他」になります)。一覧ページのカテゴリの絞り込みボタンは、使われているカテゴリだけ表示されます。
   - `status`：公式発表は `confirmed`、関係者筋の報道は `reported`(本文で「〜と報じられています」と書く)、出典を読めなかったものは `unverified`。公式発表で確定したら `confirmed` に直します。
   - `teams` にチームの slug を書くと、ニュースにチームのタグ(チームページへのリンク)が付き、そのチームページの「関連ニュース」にも載ります。
   - 写真を付けるときは `assets/img/news/<id>.jpg` に置き、`"image": "assets/img/news/<id>.jpg"` と `image_credit`(下の「写真の追加方法」と同じ形)を書きます。
2. `node scripts/build.mjs` を実行します。`news.html`(新しい順)、`news/<id>.html`、`news/feed.xml`、トップページの「最新ニュース」(新しい4件)が更新されます。

## 写真の追加方法

運営者(サイトの持ち主)が用意した写真は、次のように入れます。ライセンスがわからない写真をネットから拾ってこないでください。

置き場所とファイル名：

- 選手：`assets/img/teams/<slug>/<ign の小文字>.jpg`(例 `assets/img/teams/zeta-division/laz.jpg`)
- チーム(ページ上部・カード)：`assets/img/teams/<slug>/hero.jpg`
- ニュース：`assets/img/news/<id>.jpg`
- 長辺1200px以下の JPEG にしてください。

### かんたんな方法(スクリプト)

```sh
node scripts/add-photo.mjs <slug> <ign または hero> <写真ファイル> [撮影者・提供元]
# 例
node scripts/add-photo.mjs zeta-division Laz ~/Downloads/laz.jpg "ZETA DIVISION"
node scripts/add-photo.mjs zeta-division hero ~/Downloads/team.jpg
node scripts/build.mjs
```

写真を決まった場所にコピーし(ImageMagick の `convert` があれば長辺1200px・JPEGに縮小)、`data/teams/<slug>.json` の選手の `photo`(または `images.hero`)と `image_credits` を書き換えます。

### 手で入れる方法

1. 写真を上の場所に置きます。
2. `data/teams/<slug>.json` の選手の `"photo"`(チーム写真は `images.hero`)に `"assets/img/teams/<slug>/<ign小文字>.jpg"` と書きます。
3. 同じ JSON の `image_credits` に次を追加します。

   ```json
   {"file": "assets/img/teams/zeta-division/laz.jpg", "source_url": null, "author": "撮影者やチーム名(わかれば)", "license": "運営提供", "license_url": null, "provided_by_owner": true}
   ```
4. `node scripts/build.mjs` を実行します。

クレジットは「写真：<author>(運営提供)」、author が空なら「写真：運営提供」と表示されます(ライセンスへのリンクは出ません)。選手の写真はカードの下にも小さく表示されます。写真が無い選手は、今まで通りチームカラーとイニシャルで表示されます。`photo` が `null` でも、決まった場所にファイルがあり `image_credits` に記録があれば表示します(記録が無いと、警告を出して表示しません)。

## GitHub Pages で公開する

1. このリポジトリを GitHub に push します(ビルド済みの `teams/`・`news/`・`japan.html`・`news.html` も一緒にコミットします)。
2. GitHub のリポジトリで **Settings → Pages** を開きます。
3. **Source** を「Deploy from a branch」、ブランチを `main`、フォルダを `/ (root)` にして保存します。
4. 数分後に `https://<user>.github.io/<repo>/` で公開されます。

チームのデータを更新したら、`node scripts/build.mjs` を実行してから commit・push してください。

## チームを追加する

1. `content/SPEC.md` のスキーマに従って `data/teams/<slug>.json` を作ります(`slug` は半角英小文字・数字・ハイフン)。
   - 事実の項目には `status` を付けます：`confirmed`(公式・チーム発表)/ `reported`(報道)/ `unverified`(未確認)。ページでは「確定」「報道ベース」「未確認」の印として表示されます。
   - 意見の項目(注目選手の理由、プレースタイル、見どころ、ひと言)は `"draft": true` の下書きにします。公開ページに「下書き」とは表示されず、HTML コメントだけが入ります。運営者が手直ししたら `draft` を外してください。
   - 足りない項目があっても、その欄を出さずに表示されます。
2. 画像は `assets/img/teams/<slug>/` に置き、`images.hero` や選手の `photo` に `assets/...` から始まるパスで書きます。ファイルが無い場合や `null` の場合は、チームカラーとイニシャルのプレースホルダーになります。使った画像は必ず `image_credits` に記録します。
3. Pacific の表示順は `data/pacific-partners.json` の順番です。それ以外の地域は `region` を `Japan` / `Americas` / `EMEA` / `China` にすると、その地域のタブに表示されます(日本のチームは上の「日本ページ」も参照)。
4. `node scripts/build.mjs` を実行します。

## 画像のライセンス方針

写真は、再利用が許可されたものだけを使い、必ずクレジットを表示します(詳細は `content/SPEC.md`)。

- 使ってよいもの：Wikimedia Commons または Flickr の **CC BY / CC BY-SA / CC0 / パブリックドメイン** の画像。Riot の「Legal Jibber Jabber」で認められたゲーム内素材。
- 使わないもの：ライセンスが不明な画像(Liquipedia・VLR・ニュースサイト・チームSNSなど)。Riot Games / VALORANT / VCT のロゴ。
- 画像はダウンロードして `assets/img/` に保存します(ホットリンクしない)。長辺1200px以下に縮小します。
- 運営者が提供した写真は例外で、`"license": "運営提供"`、`"provided_by_owner": true` として記録します(「写真の追加方法」)。
- 画像ページを開いてライセンスを自分で確認し、`file`・`source_url`・`author`・`license`・`license_url` を記録します。サイト共通の写真は `data/credits.json`(`pages` に使うページを書く)、チームの写真は各チーム JSON の `image_credits` に書きます。クレジットは各ページのフッターに自動で表示されます。
- CC BY-SA の画像を加工した場合は、加工後の画像も同じライセンスになります(本サイトでは縮小・再圧縮のみ)。
