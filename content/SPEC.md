# VCT ファンサイト 制作仕様(エージェント共通)

非公式のファンサイト。コンセプト「VCTをもっと気軽に。もっと楽しく。」
掲載内容：①大会システム紹介(2027フォーマット) ②チーム紹介(まずPacific 8チーム)。
静的サイト(HTML/CSS/最小限のJS)。GitHub Pages でそのまま公開できること。外部ビルドツール不要(Node標準のみのビルドスクリプトは可)。

## ページ構成とディレクトリ
ページ構成は `content/DESIGN.md` の「ページ構成」、ディレクトリとビルド方法は `README.md` を参照。すべてのページを `scripts/build.mjs` が `data/` から生成する(手書きのHTMLはない)。

## デザイン
**`content/DESIGN.md`(v2)に従う。** 文字は少なく、見せる。1セクション＝見出し＋2行までのリード＋ビジュアル、詳細は MORE か下層ページへ。確定マークは出さず、報道・未定だけ小さな点。出典・画像クレジットはページ最下部の折りたたみ。部品(CSSクラス・ビルド関数)の一覧は `README.md` と `assets/css/site.css` 先頭のコメント。
- スマホ幅(375px)で崩れないこと。左右16pxの余白、横スクロールなし
- Riot Games / VALORANT / VCT の**ロゴは使わない**。公式サイトと誤解される見た目(公式ロゴ、公式と名乗る文言)は避ける
- フッターに必ず次の免責文を入れる：
  「本サイトは非公式のファンサイトです。Riot Games が承認・後援したものではなく、Riot Games または VALORANT の制作・運営に関わる方の見解を反映するものではありません。VALORANT および Riot Games は Riot Games, Inc. の商標または登録商標です。」

## 画像のルール(重要)
写真は必ず入れる。ただし**再利用が許可されたものだけ**を使い、クレジットを表示する。
1. 第一候補：Wikimedia Commons(CC BY / CC BY-SA / CC0 / パブリックドメイン)。VCTや選手の写真はRiotのFlickrからCommonsに転載されたものが多い
2. Flickr の写真で、ライセンスが CC BY / CC BY-SA / CC0 と明記されているもの
3. Riot の「Legal Jibber Jabber」(ファンコンテンツ方針)で使える、ゲーム内の素材(エージェント・マップの画像など)
4. 上のどれでもない画像(Liquipedia・VLR・ニュースサイト・チームSNSの写真で、ライセンスが不明なもの)は**使わない**。その選手は「写真なし」とし、プレースホルダー(イニシャルとチームカラー)で表示する
- 画像はダウンロードして `assets/img/...` に保存する(ホットリンクしない)。例外：ニュースの X の投稿の画像(下の「ニュース」の `x_image`)長辺1200px以下、JPEG/WebPで軽くする
- 画像ごとに次を記録する：file、source_url(画像のページ)、author、license、license_url。ページ内の画像の近くか、ページ下の「画像クレジット」に表示する
- 必ず `curl` 等で画像ページを開き、ライセンス表記を自分で確認する。確認できなければ使わない

## チームデータのスキーマ(data/teams/<slug>.json)
各事実には確度 status を付ける：`"confirmed"`(公式・チーム発表) / `"reported"`(大手メディアのみ) / `"unverified"`
意見の欄(注目選手の理由、プレースタイル、見どころ、ひと言)は `"draft": true` とし、運営者が手直しする前提の下書きにする。勝敗の予想や他チームとの優劣は書かない。

```json
{
  "slug": "paper-rex",
  "name": "Paper Rex",
  "name_kana": "ペーパーレックス",
  "short": "PRX",
  "region": "Pacific",
  "country": "シンガポール",
  "base": {"text": "シンガポール", "status": "confirmed", "sources": ["https://..."]},
  "team_color": "#FF4D5E",
  "partner": {"text": "2027〜2028年 VCT Pacific パートナー", "status": "confirmed", "sources": ["https://..."]},
  "history": {"text": "2〜3文。VALORANT部門の開始年、親組織など", "status": "confirmed", "sources": ["https://..."]},
  "achievements": [
    {"text": "Masters Copenhagen 2022 準優勝", "status": "confirmed", "sources": ["https://..."]}
  ],
  "roster": {
    "as_of": "2026-11-16",
    "status": "reported",
    "sources": ["https://..."],
    "players": [
      {"ign": "f0rsakeN", "name": "本名(任意)", "country": "インドネシア", "role": "デュエリスト等(日本語)", "photo": "assets/img/teams/paper-rex/f0rsaken.jpg または null", "note": "移籍・未発表などのメモ(任意)"}
    ],
    "staff": [{"ign": "alecks", "role": "ヘッドコーチ"}]
  },
  "featured_players": [{"ign": "...", "why": "1文", "draft": true}],
  "playstyle": {"text": "2文", "draft": true},
  "highlights_2027": {"text": "1〜2文", "draft": true},
  "beginner_tip": {"text": "40字前後", "draft": true},
  "links": {"official": "https://...", "x": "https://x.com/...", "youtube": "https://..."},
  "images": {
    "hero": "assets/img/teams/paper-rex/hero.jpg または null",
    "logo": null
  },
  "image_credits": [
    {"file": "assets/img/teams/paper-rex/f0rsaken.jpg", "source_url": "https://commons.wikimedia.org/wiki/File:...", "author": "...", "license": "CC BY 2.0", "license_url": "https://creativecommons.org/licenses/by/2.0/"}
  ],
  "open_questions": ["確認できなかった点、情報源の食い違い"],
  "researched_at": "2026-11-16"
}
```
- `team_color`：チームの代表色(HEX)。ロゴは原則 null(商標のため)。Commonsでパブリックドメイン扱いのロゴのみ可
- 文章はすべて日本語。です・ます調。初心者にもわかる言葉で、専門用語には短い補足を付ける
- 情報源の優先順位：Riot公式(valorantesports.com, playvalorant.com) > チーム公式(サイト・X) > Liquipedia・VLR.gg > 大手メディア
- 検索結果の抜粋だけを出典にしない。開いて読んだページのURLを付ける

## 大会システムの原稿
`content/format.md` を参照(運営者が確認済みのDocから転記)。ページは `data/format.json`(同じ内容を構造化したもの。HOME の数字・Cup 2 の出典もここから)から生成する。原稿を直したら format.json も直す。日程・数字の確度は各項目の `status`(reported / unverified)で残す。

---
## 追加仕様(2026-11-16 第2弾)

### 運営者が提供する写真
運営者(サイトの持ち主)が写真を送ってくれる。それを入れる仕組みにする。
- 置き場所：`assets/img/teams/<slug>/<ign小文字>.jpg`(選手)、`hero.jpg`(チーム)、`assets/img/news/<id>.jpg`(ニュース)
- `image_credits` の記録：`{"file": "...", "source_url": null, "author": "撮影者やチーム名(わかれば)", "license": "運営提供", "license_url": null, "provided_by_owner": true}`
- 表示：クレジット欄に「写真：<author>(運営提供)」。author が空なら「写真：運営提供」
- 選手の写真がまだない場合は今まで通りイニシャル表示
- エージェントは、ライセンス不明の写真を自分で拾ってこないこと(従来通り)

### 日本(旧VCJ)
- 2026年までの VALORANT Challengers Japan(VCJ)は、2027年からオープン予選(日本)に変わる。日本のオープン予選からPacific Kickoffへの直接枠がある(報道)
- データ：`data/japan.json`(日本の予選の仕組み・日程・枠・招待チーム・VCJの歴史)と、日本チームは `data/teams/<slug>.json`(スキーマは同じ。`"region": "Japan"`、`"tier": "open"` を追加。`partner` 欄の代わりに `"path_2027": {"text": "日本オープン予選から出場/プレーオフ招待 など", "status": ..., "sources": [...]}`)
- `data/japan.json` のスキーマ：
```json
{
  "as_of": "2026-11-16",
  "summary": {"text": "...", "status": "...", "sources": []},
  "path": [{"step": "日本オープン予選", "text": "...", "dates": "...", "status": "...", "sources": []}],
  "slots": {"text": "日本からKickoffへ○枠 など", "status": "...", "sources": []},
  "invited_teams": [{"name": "...", "slug": "...", "reason": "...", "status": "...", "sources": []}],
  "teams": [{"name": "...", "slug": "...", "roster_status": "announced|partial|unannounced|disbanded", "note": "..."}],
  "vcj_history": [{"year": 2026, "text": "...", "winners": "...", "sources": []}],
  "open_questions": []
}
```

### ニュース
- データ：`data/news/<YYYY-MM-DD>-<短い英字id>.json`、1件1ファイル。新しい順に表示
```json
{
  "id": "2026-10-22-vct-2027-partners",
  "date": "2026-10-22",
  "title": "VCT 2027〜2028のパートナー32チームが発表",
  "category": "公式発表|移籍・ロスター|大会・日程|結果|日本|その他",
  "regions": ["Pacific", "Japan"],
  "teams": ["zeta-division"],
  "summary": "2〜3文。です・ます",
  "body": ["段落1", "段落2"],
  "status": "confirmed|reported|unverified",
  "sources": [{"title": "...", "url": "https://..."}],
  "image": null,
  "image_credit": null,
  "x_posts": ["https://x.com/<user>/status/<id>"],
  "x_image": {"src": "https://pbs.twimg.com/media/...?format=jpg&name=medium", "post": "https://x.com/<user>/status/<id>", "account": "@xxx", "alt": "投稿の文(60字以内)"}
}
```
- `x_posts`：ニュースの元になった**公式の X の投稿**(チーム・選手本人・@ValorantEsports・@vctpacific・@valesports_jp・@VALORANTjp・@PlayVALORANT・@RiotGamesJP など)。最大2件。**中身を開いて読み、ニュースと合っている投稿だけ**を入れる(ID を推測で書かない)。確認は `https://cdn.syndication.twimg.com/tweet-result?id=<id>&token=a` などで行う。無ければ `[]`
- `x_image`：`node scripts/fetch-x.mjs` が自動で入れる(x_posts の中で最初に写真・動画サムネイルがある投稿)。無ければ `null`
- **X の画像の扱い(画像ルールの例外)**：X の画像はダウンロード・再配布しない。投稿は X の公式埋め込みで表示し、カードやニュースのヒーロー画像は投稿自身の画像 URL(pbs.twimg.com)を直接表示して、「画像：@account / X」と投稿へのリンクをクレジットに出す。投稿が消えると画像も表示されなくなり、そのときはチームロゴ・カテゴリのデザインに切り替わる
- 噂(関係者筋の報道)は `"status": "reported"` とし、本文で「〜と報じられています」と書く。公式発表で確定したら confirmed に更新
- 開いて読めなかった記事を唯一の出典にしない。読めなかった場合は status を unverified にする
