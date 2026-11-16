# VCT ファンガイド(非公式)

「VCTをもっと気軽に。もっと楽しく。」をコンセプトにした、VALORANT の世界大会 VCT(VALORANT Champions Tour)の非公式ファンサイトです。

- `index.html` … トップページ
- `format.html` … 大会システム紹介(2027年フォーマット。原稿は `content/format.md`)
- `teams/index.html` … チーム一覧(地域タブ。いまは Pacific のみ公開、ほかは「準備中」)
- `teams/<slug>.html` … チーム詳細(`data/teams/<slug>.json` から自動生成)

HTML / CSS / 少しの JS だけでできた静的サイトです。外部のビルドツールは不要で、`file://` で直接開いても、GitHub Pages のサブパス(`https://<user>.github.io/<repo>/`)でも動きます(リンクはすべて相対パスです)。

本サイトは Riot Games が承認・後援したものではありません。詳しくは各ページのフッターの免責文を見てください。

## ディレクトリ

```
index.html / format.html     手書きのページ(<!-- BUILD:xxx --> の間だけビルドで書き換わります)
teams/                       ビルドで生成(直接編集しないでください)
assets/css/site.css          共通デザイン
assets/js/site.js            共通JS(進捗バー、スクロール表示、地域タブ)
assets/img/site/             会場・都市などの写真
assets/img/teams/<slug>/     チーム・選手の写真
data/teams/<slug>.json       チームデータ
data/pacific-partners.json   Pacific パートナーの並び順
data/credits.json            サイト共通写真のクレジット
scripts/build.mjs            ビルドスクリプト(Node 標準ライブラリのみ)
scripts/fixtures/            テンプレート確認用の架空データ
content/                     原稿・仕様(SPEC.md)・参考デザイン
```

## ビルド

Node.js 22 以上で次を実行します。

```sh
node scripts/build.mjs
```

これで次のファイルが更新されます。

- `teams/index.html` と `teams/<slug>.html`(`data/teams/*.json` から生成。JSON が無くなったチームの生成ページは自動で削除)
- `index.html` のチームストリップ・チームタイル・画像クレジット
- `format.html` の画像クレジット

テンプレートだけ確認したいときは、架空データ(`scripts/fixtures/sample-team.json`)でビルドできます。

```sh
node scripts/build.mjs --fixture   # teams/sample-team.html ができる
node scripts/build.mjs             # 通常ビルドに戻す(sample-team.html は自動で消えます)
```

## GitHub Pages で公開する

1. このリポジトリを GitHub に push します(ビルド済みの `teams/` も一緒にコミットします)。
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
3. Pacific の表示順は `data/pacific-partners.json` の順番です。それ以外の地域は `region` を `Americas` / `EMEA` / `China` にすると、その地域のタブに表示されます。
4. `node scripts/build.mjs` を実行します。

## 画像のライセンス方針

写真は、再利用が許可されたものだけを使い、必ずクレジットを表示します(詳細は `content/SPEC.md`)。

- 使ってよいもの：Wikimedia Commons または Flickr の **CC BY / CC BY-SA / CC0 / パブリックドメイン** の画像。Riot の「Legal Jibber Jabber」で認められたゲーム内素材。
- 使わないもの：ライセンスが不明な画像(Liquipedia・VLR・ニュースサイト・チームSNSなど)。Riot Games / VALORANT / VCT のロゴ。
- 画像はダウンロードして `assets/img/` に保存します(ホットリンクしない)。長辺1200px以下に縮小します。
- 画像ページを開いてライセンスを自分で確認し、`file`・`source_url`・`author`・`license`・`license_url` を記録します。サイト共通の写真は `data/credits.json`(`pages` に使うページを書く)、チームの写真は各チーム JSON の `image_credits` に書きます。クレジットは各ページのフッターに自動で表示されます。
- CC BY-SA の画像を加工した場合は、加工後の画像も同じライセンスになります(本サイトでは縮小・再圧縮のみ)。
