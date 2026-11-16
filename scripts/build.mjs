#!/usr/bin/env node
// VCT ファンガイド ビルドスクリプト(Node 22 / 標準ライブラリのみ)
//
//   node scripts/build.mjs            data/ のデータからページを生成
//   node scripts/build.mjs --fixture  data/ に scripts/fixtures/(テスト用の架空データ)を足して生成
//
// 生成・更新するもの
//   teams/index.html           チーム一覧(地域タブ)
//   teams/<slug>.html          チーム詳細(data/teams/*.json)
//   japan.html                 日本ページ(data/japan.json + region が Japan のチーム)
//   news.html                  ニュース一覧(data/news/*.json)
//   news/<id>.html             ニュース詳細
//   news/feed.xml              ニュースの Atom フィード
//   index.html / format.html   <!-- BUILD:xxx --> ～ <!-- /BUILD:xxx --> の間だけを書き換え
//                              (メニュー、チームストリップ、最新ニュース、画像クレジット)
// すべてのリンクは相対パスなので、file:// でも GitHub Pages のサブパスでも動きます。
// データのファイルが無い・途中まで書かれている場合も、警告を出してその部分を「準備中」として生成します。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const FIXTURE = args.has('--fixture');
const DATA = path.join(ROOT, 'data');
const FIX = path.join(ROOT, 'scripts', 'fixtures');
const OUT_TEAMS = path.join(ROOT, 'teams');
const OUT_NEWS = path.join(ROOT, 'news');
const GENERATOR = 'vct-fan-build';

const REGIONS = [
  { id: 'pacific', key: 'Pacific', label: 'Pacific', jp: 'アジア太平洋' },
  { id: 'japan', key: 'Japan', label: '日本', jp: '日本・オープン', small: 'オープン' },
  { id: 'americas', key: 'Americas', label: 'Americas', jp: '南北アメリカ' },
  { id: 'emea', key: 'EMEA', label: 'EMEA', jp: 'ヨーロッパ・中東・アフリカ' },
  { id: 'china', key: 'China', label: 'China', jp: '中国' },
];
const ACTIVE_REGION = 'pacific';

const DISCLAIMER = '本サイトは非公式のファンサイトです。Riot Games が承認・後援したものではなく、Riot Games または VALORANT の制作・運営に関わる方の見解を反映するものではありません。VALORANT および Riot Games は Riot Games, Inc. の商標または登録商標です。';

const STATUS = {
  confirmed: { cls: 'ok', text: '確定', title: '公式・チームの発表で確認した情報です' },
  reported: { cls: 'rep', text: '報道ベース', title: 'メディアの報道などで確認した情報です(公式発表ではありません)' },
  unverified: { cls: 'unk', text: '未確認', title: 'まだ確認できていない情報です' },
};
// 図解用の短い表示
const STATUS_SHORT = {
  confirmed: { cls: 'ok', text: '確定', title: '公式発表で確定しています' },
  reported: { cls: 'rep', text: '報道', title: 'メディアの報道ベースの情報です' },
  unverified: { cls: 'unk', text: '未確定', title: 'まだ正式に決まっていない、または確認できていません' },
};
const ROSTER_STATUS = {
  announced: { cls: 'ok', text: '発表済み' },
  partial: { cls: 'rep', text: '一部発表' },
  unannounced: { cls: 'unk', text: '未発表' },
  disbanded: { cls: 'end', text: '活動終了' },
};
const NEWS_CATS = ['公式発表', '移籍・ロスター', '大会・日程', '結果', '日本', 'その他'];

const LINK_LABELS = {
  official: '公式サイト', x: 'X(旧Twitter)', twitter: 'X(旧Twitter)', youtube: 'YouTube', twitch: 'Twitch',
  instagram: 'Instagram', tiktok: 'TikTok', facebook: 'Facebook', liquipedia: 'Liquipedia', vlr: 'VLR.gg', discord: 'Discord',
};

const ARROW = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// ---------------------------------------------------------------- utils
const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { console.warn(`! ${path.relative(ROOT, file)} を読めませんでした: ${e.message}`); return null; }
}
const jsonFiles = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort().map((n) => path.join(dir, n)) : []);

function safeUrl(u) {
  if (typeof u !== 'string') return null;
  const s = u.trim();
  try {
    const url = new URL(s);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
  } catch { /* ignore */ }
  return null;
}
// 出典は "https://..." でも {title, url} でもよい
const srcUrl = (x) => safeUrl(typeof x === 'string' ? x : x?.url);

// サイト内の画像パス(assets/ 以下で実在するもののみ)を正規化する
function assetPath(p) {
  if (typeof p !== 'string') return null;
  const s = p.trim().replace(/^\.\//, '').replace(/^\//, '');
  if (!/^assets\/[A-Za-z0-9_\-./]+\.(jpe?g|png|webp|gif|avif|svg)$/i.test(s) || s.includes('..')) return null;
  if (!fs.existsSync(path.join(ROOT, s))) return null;
  return s;
}
// …をページ位置からの相対パスにする
function assetSrc(p, prefix) {
  const s = assetPath(p);
  return s ? prefix + s.split('/').map(encodeURIComponent).join('/') : null;
}

const asField = (x) => {
  if (x == null) return null;
  if (typeof x === 'string') return x.trim() ? { text: x } : null;
  if (typeof x === 'object' && !Array.isArray(x)) return (x.text ?? '').toString().trim() ? x : null;
  return null;
};
const arr = (x) => (Array.isArray(x) ? x : []);
const str = (x) => (typeof x === 'string' ? x.trim() : (typeof x === 'number' ? String(x) : ''));

function badge(status, table = STATUS) {
  const s = table[status];
  if (!s) return '';
  return `<span class="badge ${s.cls}"${s.title ? ` title="${esc(s.title)}"` : ''}>${esc(s.text)}</span>`;
}
// 図解用：status が無いときも「未確定」を出す
const badgeShort = (status) => badge(STATUS_SHORT[status] ? status : 'unverified', STATUS_SHORT);

const draftNote = (o) => (o && o.draft ? '<!-- draft: 運営者が確認する前の下書きです -->' : '');

function hexColor(c) {
  return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c.trim()) ? c.trim() : '#FF4D5E';
}
function luminance(hex) {
  const n = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * n[0] + 0.7152 * n[1] + 0.0722 * n[2];
}
function mixWhite(hex, t) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return '#' + c.map((v) => Math.round(v + (255 - v) * t).toString(16).padStart(2, '0')).join('');
}
// チームカラーの CSS 変数(暗い色でも見えるようにアクセント色と文字色を調整)
function teamVars(color) {
  const tc = hexColor(color);
  const L = luminance(tc);
  const tca = L < 0.12 ? mixWhite(tc, 0.5) : tc;
  const tcfg = L > 0.3 ? 'rgba(13,17,23,.78)' : 'rgba(242,244,246,.88)';
  return `--tc:${tc};--tca:${tca};--tcfg:${tcfg}`;
}

// 略称が無いときの表示用(「Rex Regum Qeon (RRQ)」→ RRQ、「Crazy Raccoon」→ CR)
function shortOf(t) {
  if (t.short) return String(t.short);
  const name = String(t.name || '');
  const m = name.match(/\(([^)]+)\)/);
  if (m) return m[1];
  const words = name.split(/[\s.]+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  return words.map((w) => w[0]).join('').slice(0, 4).toUpperCase();
}

function initials(ign) {
  const s = String(ign ?? '?').replace(/[^\p{L}\p{N}]/gu, '');
  return (s.slice(0, 2) || '?').toUpperCase();
}

const validDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.trim()) && !Number.isNaN(Date.parse(d.trim()));
const dotDate = (d) => (validDate(d) ? d.trim().replace(/-/g, '.') : '日付未定');
const jpDate = (d) => {
  if (!validDate(d)) return '日付未定';
  const [y, m, dd] = d.trim().split('-').map(Number);
  return `${y}年${m}月${dd}日`;
};

function replaceBlock(html, name, content) {
  const re = new RegExp(`(<!-- BUILD:${name} -->)[\\s\\S]*?(<!-- /BUILD:${name} -->)`);
  if (!re.test(html)) { console.warn(`! マーカー BUILD:${name} が見つかりません`); return html; }
  return html.replace(re, () => `<!-- BUILD:${name} -->\n${content}\n<!-- /BUILD:${name} -->`);
}

function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  console.log(`  wrote ${path.relative(ROOT, file)}`);
}

// 出典番号を振るヘルパー(ページごとに1つ)
function makeCiter() {
  const list = [];
  const index = new Map();
  const cite = (sources) => {
    const refs = arr(sources).map(srcUrl).filter(Boolean).map((u) => {
      if (!index.has(u)) { list.push(u); index.set(u, list.length); }
      const n = index.get(u);
      return `<a href="#src-${n}" aria-label="出典${n}">[${n}]</a>`;
    });
    return refs.length ? ` <sup class="small">${refs.join('')}</sup>` : '';
  };
  const block = (extra = '') => {
    const legend = '<div class="legend" style="margin-bottom:14px"><span class="badge ok">確定</span>公式・チームの発表 <span class="badge rep">報道ベース</span>メディア報道など <span class="badge unk">未確認</span>確認中</div>';
    return list.length
      ? `${legend}<ol class="srclist">${list.map((u, i) => `<li id="src-${i + 1}"><a href="${esc(u)}" rel="noopener">${esc(u)}</a></li>`).join('')}</ol>${extra}`
      : `${legend}<p class="muted">出典は準備中です。</p>${extra}`;
  };
  return { cite, block, list };
}

// ---------------------------------------------------------------- data
const credits = readJSON(path.join(DATA, 'credits.json')) || { images: [] };
const partners = fs.existsSync(path.join(DATA, 'pacific-partners.json')) ? readJSON(path.join(DATA, 'pacific-partners.json')) : null;
const partnerSlugs = new Set(arr(partners?.teams).map((p) => String(p.slug || '').toLowerCase()).filter(Boolean));

function loadTeams() {
  const map = new Map();
  const dirs = [path.join(DATA, 'teams')];
  if (FIXTURE) dirs.push(path.join(FIX, 'teams'));
  for (const dir of dirs) {
    for (const file of jsonFiles(dir)) {
      const t = readJSON(file);
      if (!t || typeof t !== 'object' || Array.isArray(t)) continue;
      const slug = String(t.slug || path.basename(file, '.json')).toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) { console.warn(`! slug が不正です: ${path.relative(ROOT, file)}`); continue; }
      if (slug === 'index') continue;
      t.slug = slug;
      t.name = t.name || slug;
      map.set(slug, t);
    }
  }
  return [...map.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}
const teams = loadTeams();
const bySlug = new Map(teams.map((t) => [t.slug, t]));
const isRegion = (t, key) => String(t.region || '').toLowerCase() === key.toLowerCase();

function loadJapan() {
  const fix = path.join(FIX, 'japan.json');
  const real = path.join(DATA, 'japan.json');
  const file = FIXTURE && fs.existsSync(fix) ? fix : real;
  if (!fs.existsSync(file)) { console.warn('! data/japan.json がまだありません(日本ページは「準備中」の表示で生成します)'); return null; }
  const j = readJSON(file);
  return j && typeof j === 'object' && !Array.isArray(j) ? j : null;
}
const japan = loadJapan();

function loadNews() {
  const map = new Map();
  const dirs = [path.join(DATA, 'news')];
  if (FIXTURE) dirs.push(path.join(FIX, 'news'));
  for (const dir of dirs) {
    for (const file of jsonFiles(dir)) {
      const n = readJSON(file);
      if (!n || typeof n !== 'object' || Array.isArray(n)) continue;
      const id = String(n.id || path.basename(file, '.json')).toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) { console.warn(`! ニュースの id が不正です: ${path.relative(ROOT, file)}`); continue; }
      if (!str(n.title)) { console.warn(`! ニュースに title がありません: ${path.relative(ROOT, file)}`); continue; }
      const date = validDate(n.date) ? n.date.trim() : (id.match(/^\d{4}-\d{2}-\d{2}/)?.[0] || '');
      const category = NEWS_CATS.includes(str(n.category)) ? str(n.category) : 'その他';
      const body = Array.isArray(n.body) ? n.body.map(str).filter(Boolean) : (str(n.body) ? [str(n.body)] : []);
      map.set(id, {
        ...n, id, date, category, body,
        title: str(n.title),
        summary: str(n.summary),
        teams: arr(n.teams).map((s) => String(s).toLowerCase()).filter((s) => /^[a-z0-9][a-z0-9-]*$/.test(s)),
        regions: arr(n.regions).map(str).filter(Boolean),
      });
    }
  }
  return [...map.values()].sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id.localeCompare(a.id));
}
const news = loadNews();

// チーム名(チーム JSON → japan.json → slug の順で探す)
function teamName(slug) {
  if (bySlug.has(slug)) return bySlug.get(slug).name;
  const jt = arr(japan?.teams).concat(arr(japan?.invited_teams)).find((x) => x && String(x.slug || '').toLowerCase() === slug);
  if (jt?.name) return jt.name;
  const p = arr(partners?.teams).find((x) => x.slug === slug);
  return p?.name || slug;
}

// ---------------------------------------------------------------- shell
const FONTS = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=JetBrains+Mono:wght@500;700&family=Noto+Sans+JP:wght@400;500;700;900&display=swap';

const NAV = [
  ['index.html', 'トップ', 'home'],
  ['format.html', '大会システム', 'format'],
  ['teams/index.html', 'チーム', 'teams'],
  ['japan.html', '日本', 'japan'],
  ['news.html', 'ニュース', 'news'],
];

// グローバルメニュー(PCは横並び、768px未満は「MENU」ボタンで開く。開閉は <details> なのでJSなしでも動く)
function navHtml(prefix, current) {
  const links = NAV.map(([href, label, key]) => `<a href="${prefix}${href}"${key === 'home' ? ' class="nav-home"' : ''}${current === key ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  const mlinks = NAV.map(([href, label, key]) => `<a href="${prefix}${href}"${current === key ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  return `    <nav class="gnav" aria-label="サイト内メニュー">${links}</nav>
    <details class="mnav">
      <summary><span class="mnav-ic" aria-hidden="true"><i></i><i></i><i></i></span><span>MENU</span><span class="sr-only">(メニューを開く)</span></summary>
      <nav class="mnav-panel" aria-label="サイト内メニュー(スマホ)">${mlinks}</nav>
    </details>`;
}
const footNavHtml = (prefix) => `        <nav class="foot-nav" aria-label="フッターメニュー">${NAV.map(([href, label]) => `<a href="${prefix}${href}">${label}</a>`).join('')}</nav>`;

// 運営者が提供した写真か
const isOwnerPhoto = (c) => !!(c && (c.provided_by_owner === true || str(c.license) === '運営提供'));
function ownerCreditText(c) {
  const a = str(c.author);
  return a ? `写真：${a}(運営提供)` : '写真：運営提供';
}
// 画像の近くに出す短いクレジット
function shortCredit(c) {
  if (!c) return '';
  if (typeof c === 'string') return esc(c);
  if (isOwnerPhoto(c)) return esc(ownerCreditText(c));
  const lic = safeUrl(c.license_url);
  const l = lic ? `<a href="${esc(lic)}" rel="noopener license">${esc(c.license || 'ライセンス')}</a>` : esc(c.license || '');
  const src = safeUrl(c.source_url);
  const a = src ? `<a href="${esc(src)}" rel="noopener">${esc(c.author || '不明')}</a>` : esc(c.author || '不明');
  return `写真：${a}${l ? ` / ${l}` : ''}`;
}

function creditItems(list) {
  return list.map((c) => {
    if (typeof c === 'string') return `<li>${esc(c)}</li>`;
    const title = c.title || (c.file ? c.file.split('/').pop() : '画像');
    const src = safeUrl(c.source_url);
    const t = src ? `<a href="${esc(src)}" rel="noopener">${esc(title)}</a>` : esc(title);
    if (isOwnerPhoto(c)) return `<li>${t} — ${esc(ownerCreditText(c))}</li>`;
    const lic = safeUrl(c.license_url);
    const l = lic ? `<a href="${esc(lic)}" rel="noopener license">${esc(c.license || 'ライセンス')}</a>` : esc(c.license || '');
    return `<li>${t} — 撮影・作者：${esc(c.author || '不明')} / ${l}${c.modified ? `(${esc(c.modified)})` : ''}</li>`;
  }).join('\n');
}

function creditsBlock(list) {
  const seen = new Set();
  const uniq = list.filter((c) => {
    if (!c) return false;
    const k = typeof c === 'string' ? c : (c.file || c.source_url || JSON.stringify(c));
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (!uniq.length) return '<h2>画像クレジット</h2>\n<p>このページでは写真を使用していません。</p>';
  return `<h2>画像クレジット</h2>\n<ul>\n${creditItems(uniq)}\n</ul>`;
}

function shell({ title, desc, prefix, current, body, creditsHtml, styleVars = '', head = '', source = 'data/' }) {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="generator" content="${GENERATOR}">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="#0D1117">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${FONTS}" rel="stylesheet">
<link rel="stylesheet" href="${prefix}assets/css/site.css">
<link rel="alternate" type="application/atom+xml" title="VCT ファンガイド ニュース" href="${prefix}news/feed.xml">
${head}<script>document.documentElement.classList.add('js')</script>
<script src="${prefix}assets/js/site.js" defer></script>
</head>
<body${styleVars ? ` style="${styleVars}"` : ''}>
<!-- このファイルは scripts/build.mjs が生成しています。直接編集せず、${esc(source)} を更新してから再ビルドしてください。 -->
<a class="skip" href="#main">本文へスキップ</a>
<header class="site-head">
  <div class="wrap bar">
    <a class="brand" href="${prefix}index.html" aria-label="VCT ファンガイド トップへ"><span class="brand-mark" aria-hidden="true"></span><span class="brand-name">VCT <b>FAN</b> GUIDE</span><span class="brand-tag">UNOFFICIAL</span></a>
${navHtml(prefix, current)}
  </div>
  <div class="prog" aria-hidden="true"></div>
</header>

<main id="main">
${body}
</main>

<footer class="site-foot">
  <div class="wrap">
    <div class="foot-grid">
      <div class="stack">
        <a class="brand" href="${prefix}index.html"><span class="brand-mark" aria-hidden="true"></span><span class="brand-name">VCT <b>FAN</b> GUIDE</span></a>
        <p>VCTをもっと気軽に。もっと楽しく。<br>はじめての人のための、VCT非公式ファンガイドです。</p>
${footNavHtml(prefix)}
      </div>
      <section class="credits" aria-label="画像クレジット">
${creditsHtml}
      </section>
    </div>
    <p class="disclaimer">${esc(DISCLAIMER)}</p>
  </div>
</footer>
</body>
</html>
`;
}

const secHtml = (id, en, jp, inner, extra = '', cls = 'tsec') => `<section class="${cls}" id="${id}" aria-labelledby="${id}-h">
  <div class="kick">${esc(en)}</div>
  <h2 class="h2" id="${id}-h">${esc(jp)}</h2>
  ${extra}${inner}
</section>`;

// ---------------------------------------------------------------- news parts
function newsTags(n, prefix) {
  return n.teams.map((slug) => {
    const name = teamName(slug);
    return bySlug.has(slug)
      ? `<a class="ntag" href="${prefix}teams/${esc(slug)}.html">${esc(name)}</a>`
      : `<span class="ntag">${esc(name)}</span>`;
  }).join('');
}

function newsCard(n, prefix, { compact = false } = {}) {
  const href = `${prefix}news/${esc(n.id)}.html`;
  const thumb = assetSrc(n.image, prefix);
  const tags = newsTags(n, prefix);
  return `<article class="ncard c14${compact ? ' compact' : ''}" data-cat="${esc(n.category)}">
  ${thumb && !compact ? `<a class="ncard-img" href="${href}" tabindex="-1" aria-hidden="true"><img src="${esc(thumb)}" alt="" loading="lazy"></a>` : ''}
  <div class="ncard-b">
    <div class="nmeta"><time datetime="${esc(n.date)}">${esc(dotDate(n.date))}</time><span class="ncat">${esc(n.category)}</span>${badge(n.status)}</div>
    <h3 class="ntitle"><a href="${href}">${esc(n.title)}</a></h3>
    ${n.summary && !compact ? `<p class="nsum">${esc(n.summary)}</p>` : ''}
    ${tags && !compact ? `<div class="ntags">${tags}</div>` : ''}
    <a class="nmore" href="${href}" aria-label="「${esc(n.title)}」を詳しく読む">詳しく読む ${ARROW}</a>
  </div>
</article>`;
}

function newsIndex() {
  const prefix = '';
  const cats = NEWS_CATS.filter((c) => news.some((n) => n.category === c));
  const chips = news.length
    ? `<div class="fchips" role="group" aria-label="カテゴリで絞り込む"><button type="button" class="fchip" data-cat="" aria-pressed="true">すべて <small>${news.length}</small></button>${cats.map((c) => `<button type="button" class="fchip" data-cat="${esc(c)}" aria-pressed="false">${esc(c)} <small>${news.filter((n) => n.category === c).length}</small></button>`).join('')}</div>
    <p class="fcount muted small" aria-live="polite"></p>`
    : '';
  const list = news.length
    ? `<div class="nlist" data-filter-list>${news.map((n) => newsCard(n, prefix)).join('\n')}</div>`
    : '<div class="soon-panel c14"><div class="en">COMING SOON</div><p>ニュースは準備中です。</p></div>';
  const body = `<section class="hero" style="min-height:0;padding:56px 0 40px">
  <div class="gridbg" aria-hidden="true"></div>
  <div class="wrap hero-inner">
    <div class="hero-copy">
      <div class="kick">NEWS / VCT &amp; JAPAN</div>
      <h1 class="hero-title" style="font-size:clamp(64px,16vw,150px)"><span>Latest</span> <span class="r">News</span></h1>
      <p class="hero-catch" style="font-size:clamp(22px,5vw,34px)">VCTの「いま」を、やさしく。</p>
      <p class="hero-lead">公式発表、移籍・ロスター、日程、日本のシーンの話題を、新しい順にまとめています。各ニュースには「確定」「報道ベース」「未確認」の印と出典を付けています。</p>
    </div>
  </div>
</section>
<section class="sec" style="padding-top:24px">
  <div class="wrap">
    <div class="legend" style="margin-bottom:18px"><span class="badge ok">確定</span>公式発表 <span class="badge rep">報道ベース</span>メディア報道など <span class="badge unk">未確認</span>確認中 <a href="news/feed.xml" class="small" style="margin-left:auto">フィード(Atom)</a></div>
    ${chips}
    ${list}
  </div>
</section>`;
  return shell({
    title: 'ニュース｜VCT ファンガイド',
    desc: 'VCTと日本のVALORANTシーンのニュースを、はじめての人向けにまとめています。',
    prefix,
    current: 'news',
    body,
    source: 'data/news/*.json',
    creditsHtml: creditsBlock(news.map((n) => (assetPath(n.image) ? newsCredit(n) : null)).filter(Boolean)),
  });
}

function newsCredit(n) {
  const c = n.image_credit;
  if (!c) { console.warn(`! ニュース ${n.id} の画像にクレジット(image_credit)がありません`); return null; }
  if (typeof c === 'string') return c;
  return { ...c, file: c.file || n.image, title: c.title || `ニュース「${n.title}」の画像` };
}

function newsPage(n) {
  const prefix = '../';
  const img = assetSrc(n.image, prefix);
  const credit = img ? newsCredit(n) : null;
  const tags = newsTags(n, prefix);
  const sources = arr(n.sources).map((s) => {
    const u = srcUrl(s);
    if (!u) return '';
    const t = typeof s === 'object' && str(s.title) ? str(s.title) : u;
    return `<li><a href="${esc(u)}" rel="noopener">${esc(t)}</a>${t !== u ? `<br><span class="muted">${esc(u)}</span>` : ''}</li>`;
  }).filter(Boolean);
  const idx = news.indexOf(n);
  const newer = news[idx - 1];
  const older = news[idx + 1];
  const pager = (x, label) => (x ? `<a class="npager c10" href="${esc(x.id)}.html"><span class="label mu">${label}</span><span>${esc(x.title)}</span></a>` : '<span></span>');
  const body = `<article class="narticle">
  <header class="nhead">
    <div class="gridbg" aria-hidden="true"></div>
    <div class="wrap nhead-inner">
      <nav class="crumbs" aria-label="パンくずリスト"><a href="${prefix}index.html">トップ</a><span aria-hidden="true">/</span><a href="${prefix}news.html">ニュース</a><span aria-hidden="true">/</span><span>${esc(dotDate(n.date))}</span></nav>
      <div class="nmeta"><time datetime="${esc(n.date)}">${esc(jpDate(n.date))}</time><span class="ncat">${esc(n.category)}</span>${badge(n.status)}</div>
      <h1>${esc(n.title)}</h1>
      ${n.summary ? `<p class="nlead">${esc(n.summary)}</p>` : ''}
      ${tags ? `<div class="ntags">${tags}</div>` : ''}
    </div>
  </header>
  <div class="wrap nbody">
    ${img ? `<figure class="nfig c14"><img src="${esc(img)}" alt="${esc(str(n.image_alt) || n.title)}">${credit ? `<figcaption>${shortCredit(credit)}</figcaption>` : ''}</figure>` : ''}
    ${n.status === 'reported' ? '<p class="nnote">このニュースは、関係者の話などをもとにしたメディアの報道です。公式発表ではありません。</p>' : ''}
    ${n.status === 'unverified' ? '<p class="nnote">このニュースは、まだ出典を十分に確認できていない情報です。</p>' : ''}
    ${n.body.length ? n.body.map((p) => `<p>${esc(p)}</p>`).join('\n    ') : '<p class="muted">本文は準備中です。</p>'}
    <section class="nsrc" aria-labelledby="nsrc-h">
      <h2 class="label" id="nsrc-h">SOURCES / 出典</h2>
      ${sources.length ? `<ol class="srclist">${sources.join('')}</ol>` : '<p class="muted small">出典は準備中です。</p>'}
    </section>
    <nav class="npagers" aria-label="前後のニュース">${pager(newer, '新しいニュース')}${pager(older, '前のニュース')}</nav>
    <p style="margin-top:32px"><a class="btn ghost" href="${prefix}news.html">← ニュース一覧へ戻る</a></p>
  </div>
</article>`;
  return shell({
    title: `${n.title}｜ニュース｜VCT ファンガイド`,
    desc: n.summary || n.title,
    prefix,
    current: 'news',
    body,
    source: `data/news/${n.id}.json`,
    creditsHtml: creditsBlock(credit ? [credit] : []),
  });
}

function newsFeed() {
  const updated = news[0]?.date || '2026-11-16';
  const t = (d) => `${validDate(d) ? d : updated}T00:00:00+09:00`;
  const entries = news.slice(0, 30).map((n) => `  <entry>
    <title>${esc(n.title)}</title>
    <id>tag:vct-fan-guide,2026:news/${esc(n.id)}</id>
    <link rel="alternate" type="text/html" href="${esc(n.id)}.html"/>
    <updated>${t(n.date)}</updated>
    <published>${t(n.date)}</published>
    <category term="${esc(n.category)}"/>
    <summary>${esc(n.summary || n.title)}</summary>
  </entry>`).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="ja">
  <title>VCT ファンガイド(非公式)ニュース</title>
  <subtitle>VCTと日本のVALORANTシーンのニュース(非公式ファンサイト)</subtitle>
  <id>tag:vct-fan-guide,2026:news</id>
  <link rel="alternate" type="text/html" href="../news.html"/>
  <link rel="self" type="application/atom+xml" href="feed.xml"/>
  <updated>${t(updated)}</updated>
  <author><name>VCT ファンガイド</name></author>
  <rights>${esc(DISCLAIMER)}</rights>
${entries}
</feed>
`;
}

function newsStrip() {
  const latest = news.slice(0, 4);
  if (!latest.length) return '    <p class="muted rv">ニュースは準備中です。</p>\n    <p style="margin-top:20px"><a class="btn ghost" href="news.html">ニュースページへ</a></p>';
  return `    <div class="nstrip">
${latest.map((n) => `<div class="rv">${newsCard(n, '', { compact: true })}</div>`).join('\n')}
    </div>
    <p style="margin-top:24px" class="rv"><a class="btn ghost" href="news.html">ニュースをすべて見る ${ARROW}</a></p>`;
}

// ---------------------------------------------------------------- team detail
function creditFor(t, file) {
  return arr(t.image_credits).find((c) => c && typeof c === 'object' && assetPath(c.file) && assetPath(c.file) === assetPath(file)) || null;
}

// 選手の写真：photo のパス → 無ければ決まった置き場所(assets/img/teams/<slug>/<ign小文字>.jpg)にクレジット付きで置かれたもの
function playerPhoto(t, p) {
  if (assetPath(p.photo)) {
    if (!creditFor(t, p.photo)) console.warn(`! ${t.slug}: ${p.ign} の写真にクレジット(image_credits)がありません`);
    return assetPath(p.photo);
  }
  if (p.photo) console.warn(`! ${t.slug}: ${p.ign} の写真 ${p.photo} が見つかりません(イニシャル表示にします)`);
  const conv = `assets/img/teams/${t.slug}/${String(p.ign).toLowerCase()}.jpg`;
  if (assetPath(conv)) {
    if (creditFor(t, conv)) return conv;
    console.warn(`! ${t.slug}: ${conv} がありますが、image_credits に記録が無いため表示しません`);
  }
  return null;
}

function teamPage(t) {
  const prefix = '../';
  const { cite, block } = makeCiter();
  const statusLine = (f) => (f ? `${badge(f.status)}${cite(f.sources)}` : '');

  const short = shortOf(t);
  const heroSrc = assetSrc(t.images?.hero, prefix);
  if (heroSrc && !creditFor(t, t.images.hero)) console.warn(`! ${t.slug}: ヒーロー画像にクレジット(image_credits)がありません`);
  const base = asField(t.base);
  const partner = asField(t.partner);
  const path27 = asField(t.path_2027);
  const isOpen = String(t.tier || '').toLowerCase() === 'open' || isRegion(t, 'Japan');
  const history = asField(t.history);
  const achievements = arr(t.achievements).map(asField).filter(Boolean);
  const roster = t.roster && typeof t.roster === 'object' ? t.roster : null;
  const players = arr(roster?.players).filter((p) => p && p.ign);
  const staff = arr(roster?.staff).filter((s) => s && (s.ign || s.name));
  const featured = arr(t.featured_players).filter((f) => f && f.ign);
  const playstyle = asField(t.playstyle);
  const highlights = asField(t.highlights_2027);
  const tip = asField(t.beginner_tip);
  const links = Object.entries(t.links && typeof t.links === 'object' ? t.links : {})
    .map(([k, v]) => [k, safeUrl(v)]).filter(([, v]) => v);
  const openQ = arr(t.open_questions).filter((q) => typeof q === 'string' && q.trim());
  const related = news.filter((n) => n.teams.includes(t.slug));
  const jpEntry = arr(japan?.teams).find((x) => x && String(x.slug || '').toLowerCase() === t.slug);
  const rosterStatus = jpEntry?.roster_status || t.roster_status;

  const sec = (id, en, jp, inner, extra = '') => secHtml(id, en, jp, inner, extra);
  const parts = [];

  // 基本情報
  const facts = [];
  facts.push(['チーム名', `${esc(t.name)}${t.name_kana ? `(${esc(t.name_kana)})` : ''}`]);
  if (t.short) facts.push(['略称', esc(t.short)]);
  if (t.region) facts.push(['地域', esc(t.region === 'Japan' ? '日本(Pacific)' : t.region)]);
  if (t.country) facts.push(['国・地域', esc(t.country)]);
  if (base) facts.push(['拠点', `${esc(base.text)} ${statusLine(base)}`]);
  if (partner) facts.push(['パートナー', `${esc(partner.text)} ${statusLine(partner)}`]);
  if (path27) facts.push(['2027年の出場ルート', `${esc(path27.text)} ${statusLine(path27)}`]);
  else if (isOpen && !partner) facts.push(['2027年の出場ルート', '日本オープン予選から出場を目指します(詳細は準備中) <span class="badge unk">未確認</span>']);
  if (ROSTER_STATUS[rosterStatus]) facts.push(['2027年のロスター', badge(rosterStatus, ROSTER_STATUS)]);
  parts.push(sec('info', 'BASIC INFO', '基本情報', `<dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`));

  if (history) {
    parts.push(sec('history', 'HISTORY', '歩み', `<div class="card c14"><p>${esc(history.text)}</p><p class="small" style="margin-top:10px">${statusLine(history)}</p></div>`));
  }
  if (achievements.length) {
    parts.push(sec('achievements', 'ACHIEVEMENTS', '実績', `<ul class="ach">${achievements.map((a) => `<li><div>${esc(a.text)} ${statusLine(a)}</div></li>`).join('')}</ul>`));
  }

  // ロスター
  if (roster) {
    const head = `<div class="sublabel"><span>${roster.as_of ? `${esc(roster.as_of)} 時点` : '時点不明'}</span>${badge(roster.status)}${cite(roster.sources)}</div>`;
    const cards = players.map((p) => {
      const ph = playerPhoto(t, p);
      const c = ph ? creditFor(t, ph) : null;
      const photo = ph
        ? `<img src="${esc(assetSrc(ph, prefix))}" alt="${esc(p.ign)}選手の写真" loading="lazy">${c && isOwnerPhoto(c) ? `<span class="phcredit">${esc(ownerCreditText(c))}</span>` : ''}`
        : `<div class="ini" aria-hidden="true">${esc(initials(p.ign))}</div><span class="nophoto">写真なし</span>`;
      const meta = [p.name, p.country].filter(Boolean).map(esc).join(' / ');
      return `<article class="pl c10">
  <div class="pl-ph">${photo}</div>
  <div class="pl-b">
    <div class="pl-ign">${esc(p.ign)}</div>
    ${p.role ? `<div class="pl-role">${esc(p.role)}</div>` : ''}
    ${meta ? `<div class="pl-meta">${meta}</div>` : ''}
    ${p.note ? `<div class="pl-meta">${esc(p.note)}</div>` : ''}
  </div>
</article>`;
    }).join('\n');
    const staffHtml = staff.length
      ? `<h3 class="h3" style="margin:28px 0 12px">スタッフ</h3><div class="staff">${staff.map((s) => `<span><b>${esc(s.ign || s.name)}</b>${esc(s.role || '')}</span>`).join('')}</div>`
      : '';
    const rNote = typeof roster.note === 'string' && roster.note.trim() ? `<p class="soft" style="margin-bottom:12px">${esc(roster.note)}</p>` : '';
    const empty = rNote + (players.length ? '' : '<p class="muted">ロスター情報は準備中です。</p>');
    parts.push(sec('roster', 'ROSTER', '選手・スタッフ', `${empty}<div class="roster">${cards}</div>${staffHtml}`, head));
  }

  if (featured.length) {
    parts.push(sec('featured', 'PLAYERS TO WATCH', '注目選手', `<div class="feat">${featured.map((f) => `<div class="c10">${draftNote(f)}<div class="pl-ign">${esc(f.ign)}</div>${f.why ? `<p class="soft" style="margin-top:6px">${esc(f.why)}</p>` : ''}</div>`).join('')}</div>`));
  }
  if (playstyle) parts.push(sec('playstyle', 'PLAYSTYLE', 'プレースタイル', `${draftNote(playstyle)}<div class="card c14"><p>${esc(playstyle.text)}</p></div>`));
  if (highlights) parts.push(sec('highlights', '2027 HIGHLIGHTS', '2027年の見どころ', `${draftNote(highlights)}<div class="card c14"><p>${esc(highlights.text)}</p></div>`));
  if (tip) parts.push(sec('tip', 'FOR BEGINNERS', '初心者向けひと言', `${draftNote(tip)}<p class="quote c14">${esc(tip.text)}</p>`));

  // 関連ニュース
  if (related.length) {
    parts.push(sec('news', 'RELATED NEWS', '関連ニュース', `<ul class="rnews">${related.slice(0, 10).map((n) => `<li><time datetime="${esc(n.date)}">${esc(dotDate(n.date))}</time><span class="ncat">${esc(n.category)}</span>${badge(n.status)}<a href="${prefix}news/${esc(n.id)}.html">${esc(n.title)}</a></li>`).join('')}</ul>${related.length > 10 ? `<p class="small" style="margin-top:12px"><a href="${prefix}news.html">ほかのニュースを見る</a></p>` : ''}`));
  }

  if (links.length) {
    parts.push(sec('links', 'LINKS', 'リンク', `<div class="links">${links.map(([k, u]) => `<a class="c8" href="${esc(u)}" rel="noopener">${esc(LINK_LABELS[k] || k)} <span aria-hidden="true">↗</span></a>`).join('')}</div>`));
  }
  if (openQ.length) {
    parts.push(sec('open', 'TO BE CONFIRMED', '確認できていない点', `<ul class="list">${openQ.map((q) => `<li>${esc(q)}</li>`).join('')}</ul>`));
  }

  const researched = t.researched_at ? `<p class="note" style="margin-top:12px">調査日：${esc(t.researched_at)}</p>` : '';
  parts.push(sec('sources', 'SOURCES', '出典', block(researched)));

  const heroBg = heroSrc
    ? `<div class="thero-bg"><img src="${esc(heroSrc)}" alt="" fetchpriority="high"></div>`
    : '<div class="thero-bg fallback" aria-hidden="true"></div>';
  const tags = [t.region === 'Japan' ? '日本' : t.region, t.country].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).map((x) => `<span class="tag">${esc(x)}</span>`).join('');
  const routeTag = partner ? `<span class="tag">${esc(partner.text)}</span>` : (path27 ? `<span class="tag tag-open">${esc(path27.text)}</span>` : (isOpen ? '<span class="tag tag-open">日本オープン予選</span>' : ''));
  const backJapan = isRegion(t, 'Japan') || partnerSlugs.has(t.slug) && String(t.country || '').includes('日本');

  const body = `<section class="thero">
  ${heroBg}
  <div class="wrap thero-inner">
    <nav class="crumbs" aria-label="パンくずリスト"><a href="${prefix}index.html">トップ</a><span aria-hidden="true">/</span><a href="index.html${isRegion(t, 'Japan') ? '#japan' : ''}">チーム紹介</a><span aria-hidden="true">/</span><span>${esc(t.name)}</span></nav>
    <div class="short">${esc(short)}</div>
    <h1>${esc(t.name)}</h1>
    ${t.name_kana ? `<div class="kana">${esc(t.name_kana)}</div>` : ''}
    <div class="tags">${tags}${routeTag}</div>
  </div>
</section>
<div class="wrap">
${parts.join('\n')}
<p class="btns" style="margin-top:48px"><a class="btn ghost" href="index.html${isRegion(t, 'Japan') ? '#japan' : ''}">← チーム一覧へ戻る</a>${backJapan ? `<a class="btn ghost" href="${prefix}japan.html">日本ページへ</a>` : ''}</p>
</div>`;

  const imgCredits = arr(t.image_credits).filter((c) => c && (c.file || c.source_url));
  return shell({
    title: `${t.name}${t.name_kana ? `(${t.name_kana})` : ''}｜チーム紹介｜VCT ファンガイド`,
    desc: `${t.name}のチーム紹介。歩み、実績、選手、見どころを初心者向けにまとめています。`,
    prefix,
    current: 'teams',
    body,
    styleVars: teamVars(t.team_color),
    source: `data/teams/${t.slug}.json`,
    creditsHtml: creditsBlock(imgCredits),
  });
}

// ---------------------------------------------------------------- team cards
// linkBase：カードのリンク先の前に付ける(teams/ の外から使うときは 'teams/')
function teamCard(t, prefix, linked, { linkBase = '', meta: extraMeta = [], badgeHtml = '', note = '' } = {}) {
  const heroSrc = linked ? assetSrc(t.images?.hero, prefix) : null;
  const short = shortOf(t);
  const hero = heroSrc
    ? `<img src="${esc(heroSrc)}" alt="" loading="lazy">`
    : `<div class="fallback"><span>${esc(short)}</span></div>`;
  const meta = [t.country, ...extraMeta, linked ? null : '準備中'].filter(Boolean).map((m) => `<span>${esc(m)}</span>`).join('');
  const inner = `<div class="tcard-hero">${hero}</div>
  <div class="tcard-body">
    <div class="tcard-name">${esc(t.name)}</div>
    ${t.name_kana ? `<div class="tcard-kana">${esc(t.name_kana)}</div>` : ''}
    <div class="tcard-meta">${meta}${badgeHtml}</div>
    ${note ? `<p class="tcard-note">${esc(note)}</p>` : ''}
  </div>`;
  const style = `style="${teamVars(t.team_color)}"`;
  return linked
    ? `<div class="rv"><a class="tcard c14" href="${linkBase}${esc(t.slug)}.html" ${style}>${inner}</a></div>`
    : `<div class="rv"><div class="tcard c14 is-soon" ${style} aria-label="${esc(t.name)}(準備中)">${inner}</div></div>`;
}

function heroCredit(t, prefix) {
  const hero = t.images?.hero;
  if (!assetSrc(hero, prefix)) return null;
  const c = creditFor(t, hero);
  return c ? { ...c, title: c.title || `${t.name} のカード画像` } : null;
}

function pacificOrder() {
  const list = [];
  const seen = new Set();
  for (const p of arr(partners?.teams)) {
    const slug = String(p.slug || '').toLowerCase();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const t = bySlug.get(slug);
    list.push(t ? { team: t, linked: true } : { team: { slug, name: p.name || slug, team_color: '#394656' }, linked: false });
  }
  for (const t of teams) {
    if (seen.has(t.slug)) continue;
    if (String(t.region || 'Pacific').toLowerCase() === 'pacific') { list.push({ team: t, linked: true }); seen.add(t.slug); }
  }
  return list;
}

// 日本のチーム(パートナー以外)：japan.json の teams の順 → それ以外の region: Japan のチーム
function japanTeams() {
  const out = [];
  const seen = new Set();
  for (const e of arr(japan?.teams)) {
    if (!e || typeof e !== 'object') continue;
    const slug = String(e.slug || '').toLowerCase();
    const key = slug || String(e.name || '');
    if (!key || seen.has(key) || partnerSlugs.has(slug)) continue;
    seen.add(key);
    const t = slug ? bySlug.get(slug) : null;
    out.push({ entry: e, team: t || { slug, name: e.name || slug, team_color: '#394656' }, linked: !!t });
  }
  for (const t of teams.filter((x) => isRegion(x, 'Japan')).sort((a, b) => String(a.name).localeCompare(String(b.name)))) {
    if (seen.has(t.slug) || partnerSlugs.has(t.slug)) continue;
    seen.add(t.slug);
    out.push({ entry: { roster_status: t.roster_status }, team: t, linked: true });
  }
  return out;
}

// ---------------------------------------------------------------- team index
function teamsIndex() {
  const prefix = '../';
  const jpList = japanTeams().filter((x) => x.linked);
  const regionList = (r) => (r.id === 'pacific' ? pacificOrder() : r.id === 'japan' ? jpList : teams.filter((t) => isRegion(t, r.key)).map((t) => ({ team: t, linked: true })));
  const tabs = REGIONS.map((r) => {
    const soon = r.id !== 'pacific' && !regionList(r).length;
    const small = soon ? ' <small>準備中</small>' : (r.small ? ` <small>${esc(r.small)}</small>` : '');
    return `<button class="tab" role="tab" id="tab-${r.id}" aria-controls="panel-${r.id}" aria-selected="${r.id === ACTIVE_REGION}" tabindex="${r.id === ACTIVE_REGION ? 0 : -1}">${esc(r.label)}${small}</button>`;
  }).join('');
  const panels = REGIONS.map((r) => {
    let content;
    if (r.id === 'pacific') {
      const list = pacificOrder();
      const note = partners ? `<p class="lead">2027〜2028年のVCT Pacificパートナー8チームです ${badge(partners.status)}。チーム名をクリックすると、詳しい紹介ページが開きます。</p>` : '';
      content = list.length ? `${note}<div class="tcards">${list.map((x) => teamCard(x.team, prefix, x.linked)).join('\n')}</div>` : '<div class="soon-panel c14"><div class="en">COMING SOON</div><p>チーム紹介は準備中です。</p></div>';
    } else if (r.id === 'japan') {
      const note = `<p class="lead">日本オープン予選からPacificを目指す、日本のチームです(パートナーのZETA DIVISIONとCrazy RaccoonはPacificタブにあります)。予選のしくみは<a href="${prefix}japan.html">日本ページ</a>で紹介しています。</p>`;
      content = jpList.length
        ? `${note}<div class="tcards">${jpList.map((x) => teamCard(x.team, prefix, true, { meta: ['日本オープン'], badgeHtml: badge(x.entry?.roster_status, ROSTER_STATUS) })).join('\n')}</div>`
        : `<div class="soon-panel c14"><div class="en">COMING SOON</div><p><b>日本(オープン)</b>のチーム紹介は準備中です。</p><p class="small"><a href="${prefix}japan.html">日本ページで予選のしくみを見る</a></p></div>`;
    } else {
      const list = regionList(r);
      content = list.length
        ? `<div class="tcards">${list.map((x) => teamCard(x.team, prefix, true)).join('\n')}</div>`
        : `<div class="soon-panel c14"><div class="en">COMING SOON</div><p><b>${esc(r.label)}(${esc(r.jp)})</b>のチーム紹介は準備中です。</p><p class="muted small">まずはPacificと日本のチームから順番に紹介しています。</p></div>`;
    }
    return `<div class="panel" role="tabpanel" id="panel-${r.id}" aria-labelledby="tab-${r.id}"${r.id === ACTIVE_REGION ? '' : ' hidden'}>
${content}
</div>`;
  }).join('\n');

  const sitePhotos = arr(credits.images).filter((c) => arr(c.pages).includes('teams/index.html'));
  const heroPhoto = sitePhotos[0] ? assetSrc(sitePhotos[0].file, prefix) : null;
  const shown = pacificOrder().filter((x) => x.linked).map((x) => x.team)
    .concat(teams.filter((t) => String(t.region || '').toLowerCase() !== 'pacific' && (!isRegion(t, 'Japan') || !partnerSlugs.has(t.slug))));
  const teamHeroCredits = shown.map((t) => heroCredit(t, prefix)).filter(Boolean);

  const body = `<section class="hero" style="min-height:0;padding:56px 0 48px">
  ${heroPhoto ? `<div class="hero-photo" style="background-image:url('${esc(heroPhoto)}')" role="img" aria-label="${esc(sitePhotos[0].title || '')}"></div>` : ''}
  <div class="gridbg" aria-hidden="true"></div>
  <div class="wrap hero-inner">
    <div class="hero-copy">
      <div class="kick">TEAMS / 2027 SEASON</div>
      <h1 class="hero-title" style="font-size:clamp(64px,16vw,150px)"><span>Meet the</span> <span class="r">Teams</span></h1>
      <p class="hero-catch" style="font-size:clamp(22px,5vw,34px)">推しチームを、見つけよう。</p>
      <p class="hero-lead">Pacific(アジア太平洋)のパートナー8チームと、日本オープン予選に挑む日本のチームを紹介します。Americas・EMEA・Chinaは準備中です。情報には「確定」「報道ベース」「未確認」の印を付けています。</p>
    </div>
  </div>
</section>
<section class="sec" style="padding-top:32px">
  <div class="wrap">
    <div class="tabs" role="tablist" aria-label="地域">${tabs}</div>
${panels}
  </div>
</section>`;

  return shell({
    title: 'チーム紹介｜VCT ファンガイド',
    desc: 'VCT 2027 Pacificのパートナーチームと、日本オープン予選に挑むチームを、はじめての人向けに紹介します。',
    prefix,
    current: 'teams',
    body,
    source: 'data/teams/*.json',
    creditsHtml: creditsBlock([...sitePhotos, ...teamHeroCredits]),
  });
}

// ---------------------------------------------------------------- japan page
const DEFAULT_CHANGES = [
  { label: '大会の名前と形', before: 'VALORANT Challengers Japan(VCJ)。決まった期間に戦う、日本の2部リーグでした。', after: '日本オープン予選。条件を満たせば誰でも参加できる、日本単独のオープン予選になります。', status: 'confirmed' },
  { label: 'Pacificへの道', before: 'VCJの上位チームが、Pacificの昇格戦などを勝ち上がる必要がありました。', after: '日本オープン予選から、Pacific Kickoff(シーズン最初の大会)のオープン枠に直接つながると報じられています。', status: 'reported' },
  { label: 'その先', before: 'パートナーでないチームが世界大会に出る道は、とても狭いものでした。', after: 'Kickoffで勝ち上がれば、パートナーでなくてもMastersやChampionsに進めます。', status: 'confirmed' },
];
const DEFAULT_PATH = [
  { step: '日本オープン予選', text: 'オンラインで行われる日本の予選です。', status: 'unverified' },
  { step: 'プレーオフ', text: '予選の上位チームで、Kickoffへの切符をかけて戦います。', status: 'unverified' },
  { step: 'Pacific Kickoff', text: 'パートナー8チームとオープン予選を勝ち上がったチームが戦う、シーズン最初の大会です。', status: 'unverified' },
];

function japanPage() {
  const prefix = '';
  const { cite, block } = makeCiter();
  const j = japan || {};
  const st = (f) => (f ? `${badge(f.status)}${cite(f.sources)}` : '');
  const parts = [];
  const sec = (id, en, jp, inner, extra = '') => secHtml(id, en, jp, inner, extra);

  // 1. 概要
  const summary = asField(j.summary);
  const asOf = str(j.as_of);

  // 2. 何が変わる
  const changes = arr(j.changes).filter((c) => c && (c.before || c.after));
  const useChanges = changes.length ? changes : DEFAULT_CHANGES;
  parts.push(sec('change', 'VCJ → OPEN QUALIFIER', 'VCJから何が変わる?', `<p class="lead">2026年まで日本のチームが戦っていた「VALORANT Challengers Japan(VCJ)」は、2027年から「日本オープン予選」に変わります。</p>
<div class="cmp">
  <div class="cmp-row cmp-head" aria-hidden="true"><div></div><div class="y26">2026 VCJ</div><div class="y27">2027 OPEN</div></div>
${useChanges.map((c) => `  <div class="cmp-row"><div class="k">${esc(c.label || '')} ${badge(c.status)}${cite(c.sources)}</div><div class="y26">${esc(c.before || '—')}</div><div class="y27">${esc(c.after || '—')}</div></div>`).join('\n')}
</div>
${changes.length ? '' : '<p class="note" style="margin-top:12px">くわしい規定は、Riot Gamesの正式発表を待っている部分があります。</p>'}`));

  // 3. 道のり(図)
  let steps = arr(j.path).filter((s) => s && str(s.step));
  if (!steps.length) steps = DEFAULT_PATH;
  if (!steps.some((s) => /kickoff/i.test(s.step))) steps = steps.concat([{ step: 'Pacific Kickoff', text: 'シーズン最初の大会です。', status: 'unverified' }]);
  const slots = asField(j.slots);
  // Kickoff の段階を「ゴール」として強調し、その手前の矢印に日本からの枠数を表示する
  const goalIdx = Math.max(0, steps.findIndex((s) => /kickoff/i.test(s.step)));
  const nodes = steps.map((s, i) => {
    const last = i === goalIdx;
    const slotLine = str(s.slots) ? `<div class="jp-slot">${esc(s.slots)}</div>` : '';
    return `<li class="jp-node${last ? ' goal' : ''}">
    <div class="jp-h"><div class="jp-num">${String(i + 1).padStart(2, '0')}</div>
    <div class="jp-t">${esc(s.step)}</div>
    ${str(s.dates) ? `<div class="jp-d mono">${esc(s.dates)}</div>` : ''}</div>
    ${str(s.text) ? `<p class="jp-x">${esc(s.text)}</p>` : ''}
    ${slotLine}
    <div class="jp-b">${badgeShort(s.status)}${cite(s.sources)}</div>
  </li>`;
  });
  // 最後の矢印(Kickoff の手前)に枠数を表示
  const slotText = slots ? `${esc(slots.text)}` : '日本からの枠数は未確定です';
  const flow = nodes.map((n, i) => {
    if (i === 0) return n;
    const isLast = i === goalIdx;
    const arrow = `<li class="jp-arrow${isLast ? ' slot' : ''}" aria-hidden="${isLast ? 'false' : 'true'}"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 12h12M12 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="square"/></svg>${isLast ? `<span class="jp-slotlabel">${slotText} ${badgeShort(slots?.status)}${slots ? cite(slots.sources) : ''}</span>` : ''}</li>`;
    return arrow + n;
  });
  parts.push(sec('path', 'ROAD TO PACIFIC', '日本からKickoffへの道', `<p class="lead">日本のチームがPacific Kickoff(2027年シーズン最初の地域大会)に出るまでの流れです。印は <span class="badge ok">確定</span> <span class="badge rep">報道</span> <span class="badge unk">未確定</span> の3種類です。</p>
<ol class="jpath${steps.length > 4 ? ' long' : ''}">
${flow.join('\n')}
</ol>
<p class="note" style="margin-top:14px">Pacific Kickoffは12チーム(パートナー8+オープン4)で行われ、オープン4枠は韓国・日本・東南アジアの各予選と敗者復活戦(LCQ)から決まります(<a href="format.html#pacific">大会システム</a>)。</p>`));

  // 4. 日程
  const dates = arr(j.dates).filter((d) => d && (str(d.label) || str(d.date)));
  const dateRows = dates.length
    ? dates.map((d) => ({ label: str(d.label), when: str(d.date) || str(d.dates), status: d.status, sources: d.sources }))
    : steps.map((s) => ({ label: s.step, when: str(s.dates), status: str(s.dates) ? s.status : null, sources: str(s.dates) ? s.sources : [] }));
  parts.push(sec('dates', 'SCHEDULE', '日程', `<dl class="facts">${dateRows.map((d) => `<div><dt>${esc(d.label)}</dt><dd>${d.when ? `${esc(d.when)} ${badge(d.status)}${cite(d.sources)}` : '<span class="muted">未発表</span> <span class="badge unk">未確認</span>'}</dd></div>`).join('')}</dl>`));

  // 5. 招待チーム
  const invited = arr(j.invited_teams).filter((x) => x && x.name);
  parts.push(sec('invited', 'INVITED TEAMS', '招待チーム', invited.length
    ? `<div class="grid g3">${invited.map((x) => {
      const slug = String(x.slug || '').toLowerCase();
      const t = bySlug.get(slug);
      const nm = t ? `<a href="teams/${esc(slug)}.html">${esc(x.name)}</a>` : esc(x.name);
      return `<div class="inv c10" style="${teamVars(t?.team_color || '#45D4E0')}"><div class="inv-n">${nm}</div>${x.reason ? `<p class="soft small">${esc(x.reason)}</p>` : ''}<div>${badge(x.status)}${cite(x.sources)}</div></div>`;
    }).join('')}</div>`
    : '<p class="muted">招待チームはまだ発表されていません。<span class="badge unk">未確認</span></p>'));

  // 6. 日本のチーム
  const jt = japanTeams();
  const legendRS = `<div class="legend" style="margin-bottom:16px">2027年のロスター：${Object.keys(ROSTER_STATUS).map((k) => badge(k, ROSTER_STATUS)).join(' ')}</div>`;
  parts.push(sec('teams', 'JAPANESE TEAMS', '日本のチーム', jt.length
    ? `${legendRS}<div class="tcards">${jt.map((x) => teamCard(x.team, prefix, x.linked, { linkBase: 'teams/', badgeHtml: badge(x.entry?.roster_status, ROSTER_STATUS), note: str(x.entry?.note) })).join('\n')}</div>`
    : '<div class="soon-panel c14"><div class="en">COMING SOON</div><p>日本のチーム紹介は準備中です。</p></div>'));

  // 7. Pacific パートナー(日本)
  const jpPartners = ['zeta-division', 'crazy-raccoon'].map((slug) => {
    const t = bySlug.get(slug);
    return t ? { team: t, linked: true } : { team: { slug, name: teamName(slug), team_color: '#394656' }, linked: false };
  });
  parts.push(sec('partners', 'PACIFIC PARTNERS FROM JAPAN', 'Pacificパートナー(日本)', `<p class="lead">日本のZETA DIVISIONとCrazy Raccoonは、2027〜2028年のPacificパートナーです <span class="badge ok">確定</span>。オープン予選には出ず、Pacific Kickoffから出場します。</p>
<div class="tcards">${jpPartners.map((x) => teamCard(x.team, prefix, x.linked, { linkBase: 'teams/', meta: ['Pacificパートナー(日本)'] })).join('\n')}</div>`));

  // 8. VCJの歴史
  const hist = arr(j.vcj_history).filter((h) => h && (h.year || h.text)).sort((a, b) => Number(a.year) - Number(b.year));
  parts.push(sec('history', 'VCJ HISTORY 2021–2026', 'VCJのあゆみ', hist.length
    ? `<ol class="tline">${hist.map((h) => `<li><div class="tl-y">${esc(h.year)}</div><div class="tl-b">${h.text ? `<p>${esc(h.text)}</p>` : ''}${h.winners ? `<p class="tl-w"><span class="label red">WINNER</span> ${esc(h.winners)}</p>` : ''}<div class="small">${badge(h.status)}${cite(h.sources)}</div></div></li>`).join('')}</ol>`
    : '<p class="muted">VCJの歴史は準備中です。</p>'));

  // 9. 未確定の点
  const openQ = arr(j.open_questions).map((q) => (typeof q === 'string' ? q : q?.text)).filter((q) => str(q));
  if (openQ.length) parts.push(sec('open', 'TO BE CONFIRMED', 'まだわからないこと', `<ul class="list">${openQ.map((q) => `<li>${esc(q)}</li>`).join('')}</ul>`));

  // 10. 関連ニュース
  const jpNews = news.filter((n) => n.category === '日本' || n.regions.some((r) => r.toLowerCase() === 'japan')).slice(0, 4);
  if (jpNews.length) parts.push(sec('jnews', 'NEWS', '日本の関連ニュース', `<div class="nstrip">${jpNews.map((n) => newsCard(n, prefix, { compact: true })).join('\n')}</div>`));

  parts.push(sec('sources', 'SOURCES', '出典', block(asOf ? `<p class="note" style="margin-top:12px">情報は ${esc(asOf)} 時点のものです。</p>` : '')));

  const sitePhotos = arr(credits.images).filter((c) => arr(c.pages).includes('japan.html'));
  const heroCreditEntry = sitePhotos[0] || arr(credits.images).find((c) => c.id === 'city-tokyo' || /city-tokyo/.test(c.file || ''));
  const heroPhoto = heroCreditEntry ? assetSrc(heroCreditEntry.file, prefix) : null;
  const teamCredits = [...jt.filter((x) => x.linked).map((x) => x.team), ...jpPartners.filter((x) => x.linked).map((x) => x.team)].map((t) => heroCredit(t, prefix)).filter(Boolean);

  const body = `<section class="hero" style="min-height:0;padding:56px 0 48px">
  ${heroPhoto ? `<div class="hero-photo" style="background-image:url('${esc(heroPhoto)}')" role="img" aria-label="${esc(heroCreditEntry.title || '')}"></div>` : ''}
  <div class="gridbg move" aria-hidden="true"></div>
  <div class="sweep" aria-hidden="true"></div>
  <div class="wrap hero-inner">
    <div class="hero-copy">
      <div class="kick">JAPAN / ROAD TO VCT 2027</div>
      <h1 class="hero-title" style="font-size:clamp(64px,16vw,150px)" aria-label="日本からVCTへ"><span aria-hidden="true">Japan</span> <span class="r" aria-hidden="true">to VCT</span></h1>
      <p class="hero-catch" style="font-size:clamp(24px,5.4vw,40px)">日本から<em>VCTへ</em>。</p>
      <p class="hero-lead">${summary ? esc(summary.text) : '2027年から、日本のチームはオープン予選を勝ち上がってPacificを目指します。VCJ(VALORANT Challengers Japan)からの変化、予選の流れ、日本のチームをまとめています。'}</p>
      ${summary ? `<div>${st(summary)}</div>` : '<p class="note">日本ページの詳しい情報は準備中です。</p>'}
      <div class="btns"><a class="btn" href="#path">予選の流れを見る ${ARROW}</a><a class="btn ghost" href="#teams">日本のチーム</a></div>
    </div>
  </div>
</section>
<nav class="subnav" aria-label="ページ内メニュー"><div class="wrap"><a href="#change">変わること</a><a href="#path">道のり</a><a href="#dates">日程</a><a href="#invited">招待チーム</a><a href="#teams">日本のチーム</a><a href="#partners">パートナー</a><a href="#history">VCJのあゆみ</a><a href="#sources">出典</a></div></nav>
<div class="wrap">
${parts.join('\n')}
</div>`;

  return shell({
    title: '日本からVCTへ｜日本オープン予選とVCJ｜VCT ファンガイド',
    desc: '2027年、VCJ(VALORANT Challengers Japan)は日本オープン予選に変わります。Pacific Kickoffへの道、日程、日本のチーム、VCJの歴史をまとめました。',
    prefix,
    current: 'japan',
    body,
    source: 'data/japan.json',
    creditsHtml: creditsBlock([heroCreditEntry, ...teamCredits].filter(Boolean)),
  });
}

// ---------------------------------------------------------------- top page parts
function teamTiles() {
  const list = pacificOrder().slice(0, 8);
  while (list.length < 8) list.push({ team: { name: '', short: ' ', team_color: '#394656' }, linked: false });
  return `          <div class="tiles" aria-hidden="true">${list.map(({ team: t }) => {
    const tc = hexColor(t.team_color);
    const fg = luminance(tc) > 0.3 ? 'rgba(13,17,23,.85)' : 'rgba(242,244,246,.9)';
    return `<div class="tile" style="background:${tc};color:${fg}">${esc(shortOf(t))}</div>`;
  }).join('')}</div>`;
}

function teamStrip() {
  const list = pacificOrder().filter((x) => partnerSlugs.has(x.team.slug));
  if (!list.length) return '    <p class="muted">チーム情報は準備中です。</p>';
  return `    <div class="strip rv">\n${list.map(({ team: t, linked }) => {
    const v = teamVars(t.team_color);
    const shortTxt = esc(shortOf(t));
    const inner = `<span class="short" style="color:var(--tca)">${shortTxt}</span><span class="nm">${esc(t.name)}</span>`;
    return linked
      ? `      <a class="c10" href="teams/${esc(t.slug)}.html" style="${v}">${inner}</a>`
      : `      <div class="c10" style="${v}">${inner}<span class="soon">紹介ページ準備中</span></div>`;
  }).join('\n')}\n    </div>`;
}

function updateStaticPage(file, blocks) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) { console.warn(`! ${file} がありません`); return; }
  let html = fs.readFileSync(p, 'utf8');
  for (const [name, content] of Object.entries(blocks)) html = replaceBlock(html, name, content);
  writeFile(p, html);
}

const pageCredits = (page) => creditsBlock(arr(credits.images).filter((c) => arr(c.pages).includes(page)));

// 生成ページの掃除(このビルドで作らないページのうち、ビルドが作ったものだけ消す。手書きのページは消さない)
function cleanup(dir, keep) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.html') || f === 'index.html' || keep.has(f)) continue;
    const full = path.join(dir, f);
    if (fs.readFileSync(full, 'utf8').includes(`content="${GENERATOR}"`)) {
      fs.unlinkSync(full);
      console.log(`  removed ${path.relative(ROOT, full)}`);
    }
  }
}

// ---------------------------------------------------------------- run
console.log(`VCT build — ${FIXTURE ? 'data + fixtures' : 'data'} / ${teams.length} team(s) / ${news.length} news / japan.json: ${japan ? 'yes' : 'no'}`);
fs.mkdirSync(OUT_TEAMS, { recursive: true });
fs.mkdirSync(OUT_NEWS, { recursive: true });

cleanup(OUT_TEAMS, new Set(teams.map((t) => `${t.slug}.html`)));
cleanup(OUT_NEWS, new Set(news.map((n) => `${n.id}.html`)));

for (const t of teams) writeFile(path.join(OUT_TEAMS, `${t.slug}.html`), teamPage(t));
writeFile(path.join(OUT_TEAMS, 'index.html'), teamsIndex());
for (const n of news) writeFile(path.join(OUT_NEWS, `${n.id}.html`), newsPage(n));
writeFile(path.join(OUT_NEWS, 'feed.xml'), newsFeed());
writeFile(path.join(ROOT, 'news.html'), newsIndex());
writeFile(path.join(ROOT, 'japan.html'), japanPage());
updateStaticPage('index.html', {
  NAV: navHtml('', 'home'), FOOTNAV: footNavHtml(''),
  TEAMTILES: teamTiles(), TEAMSTRIP: teamStrip(), NEWS: newsStrip(), CREDITS: pageCredits('index.html'),
});
updateStaticPage('format.html', { NAV: navHtml('', 'format'), FOOTNAV: footNavHtml(''), CREDITS: pageCredits('format.html') });
console.log('done.');
