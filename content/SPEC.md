# VCT ファンサイト 制作仕様(エージェント共通)

非公式のファンサイト。コンセプト「VCTをもっと気軽に。もっと楽しく。」
掲載内容：①大会システム紹介(2027フォーマット) ②チーム紹介(まずPacific 8チーム)。
静的サイト(HTML/CSS/最小限のJS)。GitHub Pages でそのまま公開できること。外部ビルドツール不要(Node標準のみのビルドスクリプトは可)。

## ディレクトリ
```
index.html            トップ
format.html           大会システム紹介
teams/index.html      チーム一覧(地域タブ。Pacific以外は「準備中」)
teams/<slug>.html     チーム詳細(scripts/build.mjs が data/teams/*.json から生成)
assets/css/site.css   共通デザイン
assets/js/site.js     共通JS(ナビ、スクロール演出など)
assets/img/teams/<slug>/   チーム・選手の画像
assets/img/site/      会場・大会などの画像
data/teams/<slug>.json チームデータ(下のスキーマ)
data/credits.json     サイト共通画像のクレジット
scripts/build.mjs     JSON→HTML生成(Node標準ライブラリのみ)
content/              原稿
```

## デザイン(VCT風、全ページ統一)
- 配色：背景 #0D1117、赤 #FF4D5E、シアン #45D4E0、文字 #F2F4F6(既存の図解ページと同じ)
- 雰囲気：eスポーツ大会の公式放送のような、暗い背景＋鋭角(斜めカット)＋大きな英字見出し＋細い罫線・グリッド
- フォント：Google Fonts。見出しの英字は詰まった太字(例 Anton / Bebas Neue / Barlow Condensed)、本文は Noto Sans JP
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
- 画像はダウンロードして `assets/img/...` に保存する(ホットリンクしない)。長辺1200px以下、JPEG/WebPで軽くする
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
`content/format.md` を参照(運営者が確認済みのDocから転記)。日程・数字の「確定/未確定」の表示を必ず残す。
