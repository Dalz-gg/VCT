# VCT FAN(非公式ファンガイド)

「VCTをもっと気軽に。もっと楽しく。」をコンセプトにした、VALORANT の世界大会 VCT(VALORANT Champions Tour)の非公式ファンサイトです。デザインの方針は `content/DESIGN.md`(v2)、制作仕様は `content/SPEC.md` です。

HTML / CSS / 少しの JS だけの静的サイトです。**すべてのページを `scripts/build.mjs` が `data/` から生成します**(手書きの HTML はありません)。リンクはすべて相対パスなので、`file://` で直接開いても、GitHub Pages のサブパス(`https://<user>.github.io/<repo>/`)でも動きます。

本サイトは Riot Games が承認・後援したものではありません。詳しくは各ページのフッターの免責文を見てください。

## ページ構成

```
index.html                 HOME(ヒーロー、3つの入口、最新ニュース3件、東京 Cup 2)
format/index.html          大会システム概要(3つの変化、流れ、下層への入口、2026との違い)  ┐
format/season.html         1年の流れ(3サイクルのタイムライン、Pacificの開催地)            │ data/format.json
format/events.html         大会の種類(5つの大会カード)                                    │ (原稿は content/format.md)
format/rules.html          ルールと支援金(2つの道の図、3/5ルール、支援金の棒グラフ)        │
format/glossary.html       用語集・FAQ(アコーディオン)                                    ┘
teams/index.html           チーム入口(Pacific / 日本)
teams/pacific.html         Pacific パートナー8チーム
teams/japan.html           日本チーム(ロスター状況で絞り込み)
teams/<slug>.html          チーム詳細(タブ：概要 / 選手 / 実績 / ニュース)
japan/index.html           日本予選(Kickoffまでの道の図、日程、招待チーム、Cupの枠)   ┐ data/japan.json
japan/history.html         日本シーンの歴史(2020〜2027の年表。data/japan-history.json) ┘
news/index.html            ニュース一覧(カテゴリで絞り込み)
news/<id>.html             ニュース詳細、news/feed.xml(Atom)
format.html / japan.html / news.html   旧URL。新ページへ移動する短いページ(meta refresh)
```

## ディレクトリ

```
assets/css/site.css          デザインシステム(先頭のコメントにコンポーネント一覧)
assets/js/site.js            共通JS(メニュー、スクロール表示、カウントアップ、MORE、タブ、絞り込み)
assets/img/site/             会場・都市などの写真(サイトロゴを置くなら logo.svg / logo.png)
assets/img/teams/<slug>/     チームロゴ(logo.png)・チーム写真(hero.jpg)・選手写真(<ign小文字>.jpg)
data/teams/<slug>.json       チームデータ
data/japan.json              日本予選のデータ(VCJの年ごとの記録 vcj_history も)
data/japan-history.json      日本シーンの歴史(年表の出来事 events・年ごとの時代名 eras・数字 stats)
data/format.json             大会システムのデータ(HOME の数字・Cup 2 の日程もここから)
data/news/<日付>-<id>.json   ニュース(1件1ファイル)
data/x-posts.json            X の投稿の抜粋キャッシュ(scripts/fetch-x.mjs が生成。埋め込みの代替テキスト)
data/pacific-partners.json   Pacific パートナーの並び順
data/credits.json            サイト共通写真のクレジット(id で参照)
scripts/build.mjs            ビルドスクリプト(Node 標準ライブラリのみ)
scripts/add-photo.mjs        運営者の写真を追加するスクリプト
scripts/fetch-x.mjs          ニュースの x_posts から x_image と data/x-posts.json を作るスクリプト
scripts/fixtures/            テンプレート確認用の架空データ
content/                     原稿・仕様・デザインブリーフ
```

## ビルド

Node.js 22 以上で次を実行します。

```sh
node scripts/build.mjs             # サイト全体を生成
node scripts/build.mjs --fixture   # 架空データ(scripts/fixtures/)を足して生成。通常ビルドに戻すと自動で消えます
```

データのファイルが無い・書きかけのときは、警告(`!` で始まる行)を出して、その部分を「準備中」にします。JSON が無くなったチーム・ニュースのページは自動で削除します(generator の印がある生成ページだけ)。

## デザインシステム(PHASE 2 の人へ)

### レイアウト(scripts/build.mjs)

ページは必ず次の流れで作ります。`layout()` が head・ヘッダー/メニュー・ページ下の「出典・確認状況」「画像クレジット」の折りたたみ・フッター(免責文)を付けます。

```js
const ctx = newPage('format/season.html');           // 相対パスの接頭辞 ctx.P と、出典・クレジットの収集箱
const img = ctx.siteImg('champions-la-2023');        // data/credits.json の id。クレジットは自動で最下部へ
const st  = ctx.fact('Masters Seoul の日程', field); // field.sources を出典へ、status を確認状況へ。本文用の「● 報道 / ● 未定」を返す
ctx.src([...]); ctx.openQ.push('...'); ctx.asOf = '2026-11-16';
writeFile('format/season.html', layout(ctx, { title, desc, current: 'format', body }));
```

部品の関数：`hero()`、`section({ id, tone: 'dark'|'cream'|'surface', num, head: secHead({...}), inner })`、`secHead()`、`teamCard()`、`teamLogo()`、`playerCard()`、`newsCard()`、`readmore(text)`、`more(html)`、`status(s)`、`soonPanel()`、`crumbsHtml()`、`flowStrip()`(大会の流れの帯)、`bars()`(カウントアップ付き棒グラフ)、`acc()`(アコーディオン)、`cmpTable()`(比較表)、`pagerSec()`(下層ページの前後リンク)。

### ルール(content/DESIGN.md より)

- 1セクション＝大きな見出し＋1〜2行のリード＋ビジュアル。長い文は `readmore()`(2行＋MORE)か `more()`(`<details>`)に入れる。1ページ3〜5セクション
- セクションは `sec--dark` と `sec--cream` を交互に
- 「確定」は表示しない。報道・未確定だけ `status()` の小さな点(1行に最大1つ)。出典は本文に書かず `ctx.fact()` / `ctx.src()` で最下部へ
- 画像の枠は固定比率(`.slot--16x9` / `.slot-team-logo` 1:1 / `.slot-photo` 3:4)。画像が無ければ空枠

### CSS クラス(詳細は site.css 先頭のコメント)

| 種類 | クラス |
| --- | --- |
| セクション | `.sec.sec--dark / --cream / --surface`、`.wrap`、`.sec-head`(`.kicker` `.sec-title` `.sec-jp` `.sec-lead`)、`.sec-num` |
| ヒーロー | `.hero.hero--home / --page / --plain`、`.hero-title`、`.hero-catch`、`.stats`(`[data-count]` でカウントアップ)、`.band` |
| ボタン | `.btn`、`.btn--solid`、`.btn--sm`、`.link-arrow` |
| グリッド | `.grid.grid--2 / --3 / --4 / --5` |
| カード | `.card` ＋ `.entry-card` / `.team-card` / `.player-card` / `.news-card` / `.info-card` |
| 画像枠 | `.slot`、`.slot--16x9`、`.slot-team-logo`、`.slot-photo`、`.slot-logo`(ヘッダー) |
| 開閉 | `details.more`、`.readmore`、`details.drawer`(最下部) |
| その他 | `.tabs`、`.timeline`、`.chips[data-filter-group]`、`.facts`、`.tip`、`.tags`、`.status--rep / --tbd`、`.soon` |
| 図・PHASE 2 | `.flow`、`.change-card`、`.link-card`、`.vs`/`.cmp`、`.cycles`/`.step-card`、`.venue-card`、`.event-card`、`.paths`/`.lane`、`.keep`、`.bars`、`.segs`、`.acc`、`.road`、`.date-tile`、`.callout`、`.year-track`、`.ynav`/`.tl2`/`.yr`/`.ev`(歴史の年表) |
| 動き | `.ld`(読み込み時、`style="--i:n"`)、`.rv`(スクロール表示、`style="--d:n"`)。`prefers-reduced-motion` では停止、JSなしでも全部表示 |

## ロゴと写真の枠

- サイトロゴ：`assets/img/site/logo.svg`(または .png / .webp)を置くと、ヘッダーとフッターの文字ロゴ「VCT FAN」と入れ替わります。
- チームロゴ：`assets/img/teams/<slug>/logo.png`(または JSON の `images.logo`)を置くと、正方形の枠に表示されます。無いときはチーム略称の文字。
- チーム写真：`images.hero`(16:9 の枠)。選手写真：`players[].photo`(3:4 の枠)。無いときはシルエットの空枠。

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
     "image_credit": null,
     "x_posts": ["https://x.com/T1/status/2120713200475750401"],
     "x_image": null
   }
   ```

   - `category` は `公式発表` / `移籍・ロスター` / `大会・日程` / `結果` / `日本` / `その他` のどれか(それ以外は「その他」になります)。一覧ページのカテゴリの絞り込みボタンは、使われているカテゴリだけ表示されます。
   - `status`：公式発表は `confirmed`、関係者筋の報道は `reported`(本文で「〜と報じられています」と書く)、出典を読めなかったものは `unverified`。公式発表で確定したら `confirmed` に直します。
   - `teams` にチームの slug を書くと、ニュースにチームのタグ(チームページへのリンク)が付き、そのチームページの「関連ニュース」にも載ります。
   - 写真を付けるときは `assets/img/news/<id>.jpg` に置き、`"image": "assets/img/news/<id>.jpg"` と `image_credit`(下の「写真の追加方法」と同じ形)を書きます。
   - `x_posts` に、ニュースの元になった公式の X の投稿 URL を最大2件書きます(チーム・選手本人・Riot の公式アカウント)。中身を読んで確かめた投稿だけにします。ニュース詳細ページの下に X の公式埋め込みで表示されます(埋め込みが読み込めなくても、投稿の抜粋・アカウント・日付が読めます)。無ければ `[]`。
   - **x_posts を書いたら `node scripts/fetch-x.mjs` を実行します。** 投稿の画像の URL を `x_image` に、埋め込みの代替テキストを `data/x-posts.json` に書き込みます(画像はダウンロードしません)。もう一度実行しても、設定済みのものはそのまま。`--force` で取り直し、`node scripts/fetch-x.mjs <id>` で1件だけ。
   - カードとニュースのヒーロー画像は、`image`(運営の写真) > `x_image`(X の投稿の画像。pbs.twimg.com から直接表示し「画像：@account / X」とクレジット) > デザイン(`teams` のチームロゴ＋チームカラー、なければカテゴリの模様)の順に使います。X の投稿が消えて画像が読めなくなったときも、自動でデザインに切り替わります。
2. `node scripts/build.mjs` を実行します。`news/index.html`(新しい順)、`news/<id>.html`、`news/feed.xml`、HOME の「最新ニュース」(新しい3件)が更新されます。

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

クレジットは「写真：<author>(運営提供)」、author が空なら「写真：運営提供」と表示されます(ライセンスへのリンクは出ません)。写真が無い選手は、3:4 の枠にシルエットと選手名で表示されます。`photo` が `null` でも、決まった場所にファイルがあり `image_credits` に記録があれば表示します(記録が無いと、警告を出して表示しません)。

## GitHub Pages で公開する

1. このリポジトリを GitHub に push します(ビルド済みの HTML(`index.html`・`teams/`・`news/`・`format/`・`japan/` など)も一緒にコミットします)。
2. GitHub のリポジトリで **Settings → Pages** を開きます。
3. **Source** を「Deploy from a branch」、ブランチを `main`、フォルダを `/ (root)` にして保存します。
4. 数分後に `https://<user>.github.io/<repo>/` で公開されます。

チームのデータを更新したら、`node scripts/build.mjs` を実行してから commit・push してください。

## チームを追加する

1. `content/SPEC.md` のスキーマに従って `data/teams/<slug>.json` を作ります(`slug` は半角英小文字・数字・ハイフン)。
   - 事実の項目には `status` を付けます：`confirmed`(公式・チーム発表)/ `reported`(報道)/ `unverified`(未確認)。本文では「報道」「未定」の小さな印だけを表示し(確定は無印)、詳細はページ最下部の「出典・確認状況」にまとめます。
   - 意見の項目(注目選手の理由、プレースタイル、見どころ、ひと言)は `"draft": true` の下書きにします。公開ページに「下書き」とは表示されず、HTML コメントだけが入ります。運営者が手直ししたら `draft` を外してください。
   - 足りない項目があっても、その欄を出さずに表示されます。
2. 画像は `assets/img/teams/<slug>/` に置き、`images.hero` や選手の `photo` に `assets/...` から始まるパスで書きます。ファイルが無い場合や `null` の場合は、固定比率の空枠(チームカラー＋略称、選手はシルエット)になります。使った画像は必ず `image_credits` に記録します。
3. Pacific の表示順は `data/pacific-partners.json` の順番です。それ以外の地域は `region` を `Japan` / `Americas` / `EMEA` / `China` にします。日本のチームは `teams/japan.html` に並びます(Americas・EMEA・China の一覧ページは準備中)。
4. `node scripts/build.mjs` を実行します。

## 画像のライセンス方針

写真は、再利用が許可されたものだけを使い、必ずクレジットを表示します(詳細は `content/SPEC.md`)。

- 使ってよいもの：Wikimedia Commons または Flickr の **CC BY / CC BY-SA / CC0 / パブリックドメイン** の画像。Riot の「Legal Jibber Jabber」で認められたゲーム内素材。
- 使わないもの：ライセンスが不明な画像(Liquipedia・VLR・ニュースサイト・チームSNSなど)。Riot Games / VALORANT / VCT のロゴ。
- 画像はダウンロードして `assets/img/` に保存します(ホットリンクしない)。長辺1200px以下に縮小します。
- 例外：ニュースの X の投稿の画像はダウンロードせず、投稿自身の画像(pbs.twimg.com)を直接表示し、「画像：@account / X」と投稿へのリンクを付けます。投稿そのものは X の公式埋め込み(`platform.twitter.com/widgets.js`、埋め込みのあるページだけで読み込み)で表示します。
- 運営者が提供した写真は例外で、`"license": "運営提供"`、`"provided_by_owner": true` として記録します(「写真の追加方法」)。
- 画像ページを開いてライセンスを自分で確認し、`file`・`source_url`・`author`・`license`・`license_url` を記録します。サイト共通の写真は `data/credits.json`(`pages` に使うページを書く)、チームの写真は各チーム JSON の `image_credits` に書きます。クレジットは各ページ最下部の「画像クレジット」に自動で表示されます。
- CC BY-SA の画像を加工した場合は、加工後の画像も同じライセンスになります(本サイトでは縮小・再圧縮のみ)。
