#!/usr/bin/env node
// VCT FAN ビルドスクリプト v2(Node 22 / 標準ライブラリのみ)
//
//   node scripts/build.mjs            data/ と content/ からサイト全体を生成
//   node scripts/build.mjs --fixture  data/ に scripts/fixtures/(テスト用の架空データ)を足して生成
//
// すべてのページは layout() を通して作ります(head / ヘッダー+メニュー / 出典・画像クレジットの折りたたみ / フッター)。
// 手書きの HTML はありません。ページを足すときは PAGES に関数を足し、layout() に body を渡してください。
//
// 生成するもの(content/DESIGN.md のページ構成)
//   index.html                       HOME
//   format/{index,season,events,rules,glossary}.html   大会システム(data/format.json。原稿は content/format.md)
//   teams/index.html                 チーム入口(Pacific / 日本)
//   teams/pacific.html               Pacific パートナー8チーム
//   teams/japan.html                 日本チーム(ロスター状況で絞り込み)
//   teams/<slug>.html                チーム詳細(タブ：概要 / 選手 / 実績 / ニュース)
//   japan/{index,history}.html       日本予選(data/japan.json) / 日本シーンの歴史(data/japan-history.json)
//   news/index.html, news/<id>.html  ニュース一覧・詳細、news/feed.xml
//   format.html / japan.html / news.html   旧URL → 新ページへの案内(meta refresh)
// リンクはすべて相対パス(file:// でも GitHub Pages のサブパスでも動く)。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const FIXTURE = args.has('--fixture');
const TABBAR = !args.has('--no-tabbar'); // スマホ下部のタブバー(すりガラスの浮いたピル型)。--no-tabbar で外せます
const pad2 = (n) => String(n).padStart(2, '0');
const DATA = path.join(ROOT, 'data');
const FIX = path.join(ROOT, 'scripts', 'fixtures');
const GENERATOR = 'vct-fan-build';
const SITE = 'VCT FAN';
const SITE_JP = 'VCT ファンガイド(非公式)';

const DISCLAIMER = '本サイトは非公式のファンサイトです。Riot Games が承認・後援したものではなく、Riot Games または VALORANT の制作・運営に関わる方の見解を反映するものではありません。VALORANT および Riot Games は Riot Games, Inc. の商標または登録商標です。';

// 本文に出すのは「報道」「未定」だけ(確定は標準なので何も付けない)
const STATUS = {
  reported: { cls: 'rep', text: '報道', title: 'メディアの報道をもとにした情報です(公式発表ではありません)' },
  unverified: { cls: 'tbd', text: '未定', title: '未確定、またはまだ確認できていない情報です' },
};
const STATUS_LONG = { confirmed: '確定(公式・チーム発表)', reported: '報道ベース', unverified: '未確定・未確認' };
const ROSTER_STATUS = {
  announced: { text: '発表済み', key: 'announced' },
  partial: { text: '一部発表', key: 'partial' },
  unannounced: { text: '未発表', key: 'unannounced' },
  disbanded: { text: '活動終了', key: 'disbanded' },
};
const NEWS_CATS = ['公式発表', '移籍・ロスター', '大会・日程', '結果', '日本', 'その他'];
const LINK_LABELS = {
  official: '公式サイト', x: 'X', twitter: 'X', youtube: 'YouTube', twitch: 'Twitch',
  instagram: 'Instagram', tiktok: 'TikTok', facebook: 'Facebook', liquipedia: 'Liquipedia', vlr: 'VLR.gg', discord: 'Discord',
};

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
  try {
    const url = new URL(u.trim());
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
  } catch { /* ignore */ }
  return null;
}
const srcUrl = (x) => safeUrl(typeof x === 'string' ? x : x?.url);

// assets/ 以下で実在する画像だけを通す
function assetPath(p) {
  if (typeof p !== 'string') return null;
  const s = p.trim().replace(/^\.\//, '').replace(/^\//, '');
  if (!/^assets\/[A-Za-z0-9_\-./]+\.(jpe?g|png|webp|gif|avif|svg)$/i.test(s) || s.includes('..')) return null;
  if (!fs.existsSync(path.join(ROOT, s))) return null;
  return s;
}
const assetSrc = (p, P) => { const s = assetPath(p); return s ? P + s.split('/').map(encodeURIComponent).join('/') : null; };

const asField = (x) => {
  if (x == null) return null;
  if (typeof x === 'string') return x.trim() ? { text: x } : null;
  if (typeof x === 'object' && !Array.isArray(x)) return (x.text ?? '').toString().trim() ? x : null;
  return null;
};
const arr = (x) => (Array.isArray(x) ? x : []);
const str = (x) => (typeof x === 'string' ? x.trim() : (typeof x === 'number' ? String(x) : ''));
const draftNote = (o) => (o && o.draft ? '<!-- draft: 運営者が確認する前の下書きです -->' : '');

// 小さな点＋「報道」「未定」(confirmed や不明な値では何も出さない)
function status(s) {
  const d = STATUS[s];
  return d ? `<span class="status status--${d.cls}" title="${esc(d.title)}">${d.text}</span>` : '';
}

function hexColor(c) { return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c.trim()) ? c.trim() : '#FF4655'; }
function luminance(hex) {
  const n = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * n[0] + 0.7152 * n[1] + 0.0722 * n[2];
}
function mixWhite(hex, t) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return '#' + c.map((v) => Math.round(v + (255 - v) * t).toString(16).padStart(2, '0')).join('');
}
// --tc：チームカラー、--tca：暗い背景の上でも読めるアクセント
function teamVars(color) {
  const tc = hexColor(color);
  const tca = luminance(tc) < 0.12 ? mixWhite(tc, 0.45) : tc;
  return `--tc:${tc};--tca:${tca}`;
}
function shortOf(t) {
  if (t.short) return String(t.short);
  const name = String(t.name || '');
  const m = name.match(/\(([^)]+)\)/);
  if (m) return m[1];
  const words = name.split(/[\s.]+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  return words.map((w) => w[0]).join('').slice(0, 4).toUpperCase();
}
const validDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.trim()) && !Number.isNaN(Date.parse(d.trim()));
const dotDate = (d) => (validDate(d) ? d.trim().replace(/-/g, '.') : '日付未定');
const jpDate = (d) => {
  if (!validDate(d)) return '日付未定';
  const [y, m, dd] = d.trim().split('-').map(Number);
  return `${y}年${m}月${dd}日`;
};
const yearOf = (s) => { const m = String(s).match(/(20\d\d)/); return m ? Number(m[1]) : 0; };

const written = new Set();
function writeFile(rel, content) {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  written.add(rel);
  console.log(`  wrote ${rel}`);
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
      if (!/^[a-z0-9][a-z0-9-]*$/.test(slug) || ['index', 'pacific', 'japan'].includes(slug)) { console.warn(`! slug が不正です: ${path.relative(ROOT, file)}`); continue; }
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
  const file = FIXTURE && fs.existsSync(fix) ? fix : path.join(DATA, 'japan.json');
  if (!fs.existsSync(file)) { console.warn('! data/japan.json がまだありません'); return null; }
  const j = readJSON(file);
  return j && typeof j === 'object' && !Array.isArray(j) ? j : null;
}
const japan = loadJapan();

// 大会システム(format/*.html と HOME の数字)。原稿は content/format.md
const fmt = fs.existsSync(path.join(DATA, 'format.json')) ? readJSON(path.join(DATA, 'format.json')) : (console.warn('! data/format.json がまだありません'), null);

function loadNews() {
  const map = new Map();
  const dirs = [path.join(DATA, 'news')];
  if (FIXTURE) dirs.push(path.join(FIX, 'news'));
  for (const dir of dirs) {
    for (const file of jsonFiles(dir)) {
      const n = readJSON(file);
      if (!n || typeof n !== 'object' || Array.isArray(n)) continue;
      const id = String(n.id || path.basename(file, '.json')).toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]*$/.test(id) || id === 'index') { console.warn(`! ニュースの id が不正です: ${path.relative(ROOT, file)}`); continue; }
      if (!str(n.title)) { console.warn(`! ニュースに title がありません: ${path.relative(ROOT, file)}`); continue; }
      const date = validDate(n.date) ? n.date.trim() : (id.match(/^\d{4}-\d{2}-\d{2}/)?.[0] || '');
      const category = NEWS_CATS.includes(str(n.category)) ? str(n.category) : 'その他';
      const body = Array.isArray(n.body) ? n.body.map(str).filter(Boolean) : (str(n.body) ? [str(n.body)] : []);
      map.set(id, {
        ...n, id, date, category, body,
        title: str(n.title), summary: str(n.summary),
        teams: arr(n.teams).map((s) => String(s).toLowerCase()).filter((s) => /^[a-z0-9][a-z0-9-]*$/.test(s)),
        regions: arr(n.regions).map(str).filter(Boolean),
      });
    }
  }
  return [...map.values()].sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id.localeCompare(a.id));
}
const news = loadNews();

function teamName(slug) {
  if (bySlug.has(slug)) return bySlug.get(slug).name;
  const jt = arr(japan?.teams).concat(arr(japan?.invited_teams)).find((x) => x && String(x.slug || '').toLowerCase() === slug);
  if (jt?.name) return jt.name;
  return arr(partners?.teams).find((x) => x.slug === slug)?.name || slug;
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

// 日本のチーム(パートナー以外)：japan.json の teams の順 → ほかの region: Japan のチーム
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

// ---------------------------------------------------------------- credits
const isOwnerPhoto = (c) => !!(c && (c.provided_by_owner === true || str(c.license) === '運営提供'));
const ownerCreditText = (c) => (str(c.author) ? `写真：${str(c.author)}(運営提供)` : '写真：運営提供');

function creditLine(c) {
  if (typeof c === 'string') return esc(c);
  const title = c.title || (c.file ? c.file.split('/').pop() : '画像');
  const src = safeUrl(c.source_url);
  const t = src ? `<a href="${esc(src)}" rel="noopener">${esc(title)}</a>` : esc(title);
  if (isOwnerPhoto(c)) return `${t} — ${esc(ownerCreditText(c))}`;
  const lic = safeUrl(c.license_url);
  const l = lic ? `<a href="${esc(lic)}" rel="noopener license">${esc(c.license || 'ライセンス')}</a>` : esc(c.license || '');
  return `${t} — ${esc(c.author || '作者不明')} / ${l}${c.modified ? `(${esc(c.modified)})` : ''}`;
}
function shortCredit(c) {
  if (!c) return '';
  if (typeof c === 'string') return esc(c);
  if (isOwnerPhoto(c)) return esc(ownerCreditText(c));
  return `写真：${esc(c.author || '作者不明')} / ${esc(c.license || '')}`;
}
const creditFor = (t, file) => arr(t.image_credits).find((c) => c && typeof c === 'object' && assetPath(c.file) && assetPath(c.file) === assetPath(file)) || null;

// ---------------------------------------------------------------- page context
// ctx を1ページに1つ作り、本文を組み立てながら出典・画像クレジットを集めます。
function newPage(rel) {
  const depth = rel.split('/').length - 1;
  const ctx = {
    rel,
    P: '../'.repeat(depth),
    sources: [],       // {url, title}
    srcSeen: new Set(),
    checks: [],        // {label, status}  確認状況
    openQ: [],         // 確認できなかった点
    credits: [],
    creditSeen: new Set(),
    asOf: '',
  };
  ctx.src = (list) => {
    for (const s of arr(list)) {
      const u = srcUrl(s);
      if (!u || ctx.srcSeen.has(u)) continue;
      ctx.srcSeen.add(u);
      ctx.sources.push({ url: u, title: typeof s === 'object' && str(s.title) ? str(s.title) : '' });
    }
  };
  // 事実フィールドを登録して、本文用の status 表示を返す
  ctx.fact = (label, f) => {
    if (!f) return '';
    ctx.src(f.sources);
    if (f.status) ctx.checks.push({ label, status: f.status });
    return status(f.status);
  };
  ctx.credit = (c) => {
    if (!c) return;
    const k = typeof c === 'string' ? c : (c.file || c.source_url || JSON.stringify(c));
    if (ctx.creditSeen.has(k)) return;
    ctx.creditSeen.add(k);
    ctx.credits.push(c);
  };
  // サイト共通写真(data/credits.json の id)
  ctx.siteImg = (id) => {
    const c = arr(credits.images).find((x) => x.id === id);
    const src = c ? assetSrc(c.file, ctx.P) : null;
    if (!src) return null;
    ctx.credit(c);
    return { src, alt: c.title || '' };
  };
  return ctx;
}

// ---------------------------------------------------------------- layout
const FONTS = 'https://fonts.googleapis.com/css2?family=Anton&family=Noto+Sans+JP:wght@400;700;900&display=swap';

// サイトの地図。items は [href, メニューでの名前, サブナビでの短い名前, 1行の説明]。
// series:true のセクション(大会システム・日本)は「02 / 05」の進み具合と前後リンクを出します。
const MENU = [
  { key: 'home', en: 'Home', jp: 'ホーム', href: 'index.html', items: [
    ['index.html', 'ホーム', 'ホーム', 'VCTってなに？ から最新ニュースまで']] },
  { key: 'format', en: 'Format', jp: '大会システム', href: 'format/index.html', series: true, items: [
    ['format/index.html', '概要', '概要', '2027年に変わること、全体の流れ'],
    ['format/season.html', '1年の流れ', '1年の流れ', '予選→地域大会→世界大会を3回'],
    ['format/events.html', '大会の種類', '大会の種類', 'Open・Kickoff・Cup・Masters・Champions'],
    ['format/rules.html', 'ルールと支援金', 'ルールと支援金', '2つの出場ルートと、チームへの支援金'],
    ['format/glossary.html', '用語集・FAQ', '用語集・FAQ', 'わからない言葉と、よくある質問']] },
  { key: 'teams', en: 'Teams', jp: 'チーム', href: 'teams/index.html', items: [
    ['teams/index.html', 'チームトップ', 'トップ', 'Pacific と日本、2つの入口'],
    ['teams/pacific.html', 'Pacific パートナー', 'Pacific', 'Pacific リーグで戦う8チーム'],
    ['teams/japan.html', '日本チーム', '日本チーム', '日本のチームと2027年のロスター']] },
  { key: 'japan', en: 'Japan', jp: '日本', href: 'japan/index.html', series: true, items: [
    ['japan/index.html', '日本予選', '日本予選', 'Kickoff までの道、日程、招待チーム'],
    ['japan/history.html', '日本シーンの歴史', '歴史', '2020年から、日本のVALORANTの歩み']] },
  { key: 'news', en: 'News', jp: 'ニュース', href: 'news/index.html', items: [
    ['news/index.html', 'ニュース一覧', '一覧', '公式発表・移籍・大会のニュース']] },
];
const HEAD_LINKS = [['format/index.html', '大会', 'format'], ['teams/index.html', 'チーム', 'teams'], ['japan/index.html', '日本', 'japan'], ['news/index.html', 'ニュース', 'news']];

// 現在地：current(セクション)と、詳細ページなら parent(一覧ページ)と leaf(チーム名・記事名)
function navState(ctx, current, parent, leaf) {
  const g = MENU.find((x) => x.key === current) || null;
  const here = parent || ctx.rel;
  const idx = g ? g.items.findIndex(([h]) => h === here) : -1;
  return { g, here, idx, item: idx >= 0 ? g.items[idx] : null, leaf: leaf || '' };
}

// サイトロゴ：assets/img/site/logo.(svg|png|webp) があれば画像、なければ文字ロゴ
function logoSlot(P) {
  const logo = ['svg', 'png', 'webp'].map((x) => `assets/img/site/logo.${x}`).find((f) => assetPath(f));
  const inner = logo
    ? `<img src="${esc(P + logo)}" alt="${SITE}">`
    : `<span class="logo-mark" aria-hidden="true"></span><span class="logo-text">VCT <b>FAN</b></span>`;
  return `<a class="slot-logo" href="${P}index.html" aria-label="${SITE} ホームへ">${inner}</a>`;
}

// B. ヘッダーの現在地「大会システム › 1年の流れ」(スマホはページ名だけ)
function headLoc(nav) {
  if (!nav.g || nav.g.key === 'home') return '';
  const page = nav.leaf || (nav.item ? nav.item[1] : '');
  if (!page) return '';
  return `<p class="head-loc" aria-label="現在地"><span class="head-loc-sec">${esc(nav.g.jp)}</span><span class="head-loc-sep" aria-hidden="true">›</span><span class="head-loc-page">${esc(page)}</span></p>`;
}

// E. 「02 / 05」＋細い進み具合のバー
function progressHtml(nav, cls = '') {
  if (!nav.g?.series || nav.idx < 0) return '';
  const n = nav.g.items.length;
  return `<div class="prog${cls ? ` ${cls}` : ''}" role="img" aria-label="${esc(nav.g.jp)} ${n}ページ中${nav.idx + 1}ページ目"><span class="prog-num"><b>${pad2(nav.idx + 1)}</b><span class="prog-of"> / ${pad2(n)}</span></span><span class="prog-bar" aria-hidden="true">${nav.g.items.map((_, i) => `<i${i <= nav.idx ? ' class="on"' : ''}></i>`).join('')}</span></div>`;
}

// A. セクションのサブナビ(ヘッダーの下、ヘッダーと一緒に固定)
function subnavHtml(ctx, nav) {
  if (!nav.g || nav.g.key === 'home') return '';
  const items = nav.g.items.map(([h, , short], i) => {
    const on = h === nav.here;
    const attr = on ? (nav.leaf ? ' class="is-cur"' : ' class="is-cur" aria-current="page"') : '';
    const num = nav.g.series ? `<span class="subnav-n" aria-hidden="true">${pad2(i + 1)}</span>` : '';
    return `<li><a href="${ctx.P}${h}"${attr}>${num}${esc(short)}</a></li>`;
  }).join('');
  const leaf = nav.leaf ? `<li class="subnav-leaf"><span class="subnav-sep" aria-hidden="true">›</span><span aria-current="page">${esc(nav.leaf)}</span></li>` : '';
  return `<nav class="subnav" aria-label="${esc(nav.g.jp)}のページ">
    <div class="wrap subnav-bar">
      <span class="subnav-sec en" aria-hidden="true">${esc(nav.g.en)}</span>
      <ul class="subnav-list">${items}${leaf}</ul>
      ${progressHtml(nav)}
    </div>
  </nav>`;
}

// D. スマホ下部のタブバー(html.has-tabbar のときだけ表示。build の --tabbar で付く)
const TAB_ICONS = {
  home: '<path d="M3.5 10.5 12 4l8.5 6.5V20h-5.5v-6h-6v6H3.5z"/>',
  format: '<path d="M8 4h8v5.5a4 4 0 0 1-8 0z"/><path d="M8 6H4.5c0 2.6 1.6 4.3 3.8 4.5M16 6h3.5c0 2.6-1.6 4.3-3.8 4.5"/><path d="M12 13.5V17M8 20.5h8M9.5 17h5v3.5h-5z"/>',
  teams: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3 20c.4-3.4 2.9-5.6 6-5.6s5.6 2.2 6 5.6"/><path d="M15.2 5.6a3 3 0 0 1 0 5.8M17.4 14.6c1.9.8 3.2 2.8 3.5 5.4"/>',
  japan: '<rect x="3" y="5" width="18" height="14"/><circle cx="12" cy="12" r="3.3"/>',
  news: '<path d="M4 5h12.5v15H6.5A2.5 2.5 0 0 1 4 17.5z"/><path d="M16.5 9H20v8.5a2.5 2.5 0 0 1-2.5 2.5"/><path d="M7.5 9h5.5M7.5 12.5h5.5M7.5 16h3.5"/>',
};
const TABS = [['home', 'index.html', 'ホーム'], ['format', 'format/index.html', '大会'], ['teams', 'teams/index.html', 'チーム'], ['japan', 'japan/index.html', '日本'], ['news', 'news/index.html', 'ニュース']];
function tabbarHtml(ctx, current) {
  return `<nav class="tabbar" aria-label="セクション">
  ${TABS.map(([k, h, l]) => `<a class="tabbar-item" href="${ctx.P}${h}"${k === current ? ' aria-current="true"' : ''}><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TAB_ICONS[k]}</svg><span>${l}</span></a>`).join('\n  ')}
</nav>`;
}

// G. メニュー＝サイトマップ(全ページ＋1行の説明、現在地に YOU ARE HERE)
function menuHtml(ctx, nav) {
  const HERE = '<span class="here-tag">You are here</span>';
  const groups = MENU.map((g, i) => {
    const curSec = nav.g && nav.g.key === g.key;
    const items = g.items.map(([h, label, , d], j) => {
      const isHere = h === nav.here;
      const exact = isHere && !nav.leaf;
      const num = g.series ? `<span class="map-n" aria-hidden="true">${pad2(j + 1)}</span>` : '<span class="map-n map-n--dot" aria-hidden="true"></span>';
      const leaf = isHere && nav.leaf ? `<li class="map-item map-item--leaf is-here"><span class="map-link"><span class="map-n" aria-hidden="true">›</span><span class="map-t"><span class="map-name" aria-current="page">${esc(nav.leaf)}</span>${HERE}</span></span></li>` : '';
      return `<li class="map-item${exact ? ' is-here' : ''}${isHere && nav.leaf ? ' is-parent' : ''}"><a class="map-link" href="${ctx.P}${h}"${exact ? ' aria-current="page"' : ''}>${num}<span class="map-t"><span class="map-name">${esc(label)}</span>${exact ? HERE : ''}</span><span class="map-d">${esc(d)}</span></a></li>${leaf}`;
    }).join('');
    return `<div class="menu-group menu-group--${g.key}${curSec ? ' is-cur-sec' : ''}" style="--i:${i}">
        <p class="menu-head"><span class="en">${esc(g.en)}</span><span class="jp">${esc(g.jp)}</span>${g.items.length > 1 ? `<span class="menu-count">${g.items.length} pages</span>` : ''}</p>
        <ul class="map-items">${items}</ul>
      </div>`;
  }).join('\n      ');
  return `<details class="menu">
    <summary class="menu-btn" aria-label="メニュー(サイトマップ)"><span class="menu-open">MENU</span><span class="menu-close">CLOSE</span><span class="menu-ic" aria-hidden="true"><i></i><i></i><i></i></span></summary>
    <nav class="menu-panel" aria-label="サイトマップ">
      <div class="wrap">
      <p class="menu-title"><span class="en">Site Map</span><span class="jp">サイトのページ一覧</span></p>
      <div class="menu-groups">
      ${groups}
      </div>
      <p class="menu-foot">${SITE_JP} — VCTをもっと気軽に。もっと楽しく。</p>
      </div>
    </nav>
  </details>`;
}

function sourcesDrawer(ctx) {
  const checks = ctx.checks.filter((c) => c.status && c.status !== 'confirmed');
  const parts = [];
  parts.push(`<p>本文で何も印がない情報は、公式またはチームの発表で確認したものです。<span class="status status--rep">報道</span> はメディアの報道ベース、<span class="status status--tbd">未定</span> は未確定・未確認の情報です。${ctx.asOf ? `情報は ${esc(ctx.asOf)} 時点のものです。` : ''}</p>`);
  if (checks.length) {
    const grouped = new Map();
    for (const c of checks) {
      const k = `${c.label}\u0000${c.status}`;
      grouped.set(k, (grouped.get(k) || 0) + 1);
    }
    parts.push(`<h3>確認状況</h3><ul>${[...grouped].map(([k, n]) => { const [label, s] = k.split('\u0000'); return `<li>${esc(label)}${n > 1 ? `(${n}件)` : ''}：${esc(STATUS_LONG[s] || s)}</li>`; }).join('')}</ul>`);
  }
  if (ctx.openQ.length) parts.push(`<h3>確認できていない点</h3><ul>${ctx.openQ.map((q) => `<li>${esc(q)}</li>`).join('')}</ul>`);
  parts.push(ctx.sources.length
    ? `<h3>出典</h3><ol>${ctx.sources.map((s) => `<li><a href="${esc(s.url)}" rel="noopener">${esc(s.title || s.url)}</a></li>`).join('')}</ol>`
    : '<h3>出典</h3><p>このページに個別の出典はありません。</p>');
  return parts.join('\n');
}

function creditsDrawer(ctx) {
  return ctx.credits.length
    ? `<ul>${ctx.credits.map((c) => `<li>${creditLine(c)}</li>`).join('')}</ul>`
    : '<p>このページでは写真を使用していません。ロゴ・選手写真の枠は、運営者が用意した画像に順次差し替えます。</p>';
}

function layout(ctx, { title, desc, current, body, bodyStyle = '', source = 'data/', solidHead = false, parent = null, leaf = '' }) {
  const P = ctx.P;
  const nav = navState(ctx, current, parent, leaf);
  const sub = subnavHtml(ctx, nav);
  const htmlCls = [sub ? 'has-subnav' : '', TABBAR ? 'has-tabbar' : ''].filter(Boolean).join(' ');
  const fullTitle = title ? `${title}｜${SITE}` : `${SITE}｜VCTをもっと気軽に。もっと楽しく。`;
  return `<!doctype html>
<html lang="ja"${htmlCls ? ` class="${htmlCls}"` : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="generator" content="${GENERATOR}">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="#0F1923">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${FONTS}" rel="stylesheet">
<link rel="stylesheet" href="${P}assets/css/site.css">
<link rel="alternate" type="application/atom+xml" title="${SITE} ニュース" href="${P}news/feed.xml">
<script>document.documentElement.classList.add('js')</script>
<script src="${P}assets/js/site.js" defer></script>
</head>
<body${bodyStyle ? ` style="${bodyStyle}"` : ''}>
<!-- このファイルは scripts/build.mjs が生成しています。直接編集せず、${esc(source)} を更新して再ビルドしてください。 -->
<a class="skip" href="#main">本文へスキップ</a>
<header class="site-head${solidHead ? ' site-head--solid' : ''}">
  <div class="wrap head-bar">
    ${logoSlot(P)}
    ${headLoc(nav)}
    <nav class="head-links" aria-label="主なページ">${HEAD_LINKS.map(([h, l, k]) => `<a href="${P}${h}"${current === k ? ' aria-current="true"' : ''}>${l}</a>`).join('')}</nav>
    ${menuHtml(ctx, nav)}
  </div>
  ${sub}
</header>

<main id="main">
${body}
</main>

<aside class="drawers" aria-label="出典と画像クレジット">
  <div class="wrap">
    <details class="drawer">
      <summary><span><span class="en">SOURCES</span>出典・確認状況</span></summary>
      <div class="drawer-body">
${sourcesDrawer(ctx)}
      </div>
    </details>
    <details class="drawer">
      <summary><span><span class="en">CREDITS</span>画像クレジット</span></summary>
      <div class="drawer-body">
${creditsDrawer(ctx)}
      </div>
    </details>
  </div>
</aside>

${tabbarHtml(ctx, current)}

<footer class="site-foot">
  <div class="wrap">
    <div class="foot-top">
      <div>${logoSlot(P)}<p class="foot-tag">VCTをもっと気軽に。もっと楽しく。</p></div>
      <nav class="foot-nav" aria-label="フッターメニュー">${MENU.map((g) => `<a href="${P}${g.href}">${esc(g.jp)}</a>`).join('')}</nav>
    </div>
    <p class="disclaimer">${esc(DISCLAIMER)}</p>
  </div>
</footer>
</body>
</html>
`;
}

// ---------------------------------------------------------------- components
const ARROW = '<span class="arrow" aria-hidden="true">→</span>';

// セクション見出し：kicker(赤い小さな英字)＋大きな英字＋和文 h2＋1〜2行のリード
function secHead({ id, kicker, en, jp, lead = '', center = false, d = 0 }) {
  return `<header class="sec-head${center ? ' sec-head--center' : ''} rv" style="--d:${d}">
      <span class="kicker">${esc(kicker)}</span>
      <span class="sec-title" aria-hidden="true">${esc(en)}</span>
      <h2 class="sec-jp" id="${id}-h">${esc(jp)}</h2>
      ${lead ? `<p class="sec-lead">${lead}</p>` : ''}
    </header>`;
}
// tone: dark | cream | surface
function section({ id, tone = 'dark', num = '', head = '', inner, cls = '' }) {
  return `<section class="sec sec--${tone}${cls ? ` ${cls}` : ''}" id="${id}"${head ? ` aria-labelledby="${id}-h"` : ''}>
  ${num ? `<span class="sec-num" aria-hidden="true">${esc(num)}</span>` : ''}
  <div class="wrap">
    ${head}
    ${inner}
  </div>
</section>`;
}

function hero(ctx, { variant = 'page', img = null, kicker, titleHtml, titleLabel, catchHtml = '', lead = '', btns = '', extra = '', crumbs = '' }) {
  return `<section class="hero hero--${variant}">
  ${img ? `<div class="hero-media"><img src="${esc(img.src)}" alt="" fetchpriority="high"></div>` : ''}
  <div class="hero-deco" aria-hidden="true"></div>
  <div class="wrap hero-inner">
    ${crumbs}
    <span class="kicker ld" style="--i:0">${esc(kicker)}</span>
    <h1 class="hero-title ld" style="--i:1"${titleLabel ? ` aria-label="${esc(titleLabel)}"` : ''}>${titleHtml}</h1>
    ${catchHtml ? `<p class="hero-catch ld" style="--i:2">${catchHtml}</p>` : ''}
    ${lead ? `<p class="hero-lead ld" style="--i:3">${lead}</p>` : ''}
    ${btns ? `<div class="btns ld" style="--i:4">${btns}</div>` : ''}
    ${extra}
  </div>
</section>`;
}

// パンくずはサブナビと重なるため表示しません(呼び出し側はそのまま)
const crumbsHtml = () => '';

function teamLogo(t, P) {
  const logo = assetPath(t.images?.logo) || assetPath(`assets/img/teams/${t.slug}/logo.png`) || assetPath(`assets/img/teams/${t.slug}/logo.svg`);
  return logo
    ? `<div class="slot slot-team-logo"><img src="${esc(assetSrc(logo, P))}" alt="${esc(t.name)} のロゴ" loading="lazy"></div>`
    : `<div class="slot slot-team-logo" aria-hidden="true"><span class="slot-text">${esc(shortOf(t))}</span></div>`;
}

// チームカード：ロゴ枠＋チーム名＋1行
function teamCard(t, ctx, { href = null, sub = '', d = 0, filterKey = '' } = {}) {
  const tag = href ? 'a' : 'div';
  return `<${tag} class="card team-card rv"${href ? ` href="${esc(href)}"` : ''} style="${teamVars(t.team_color)};--d:${d}"${filterKey ? ` data-filter-key="${esc(filterKey)}"` : ''}>
  ${teamLogo(t, ctx.P)}
  <div class="team-body"><div><h3 class="team-name">${esc(t.name)}</h3>${sub ? `<span class="team-sub">${sub}</span>` : ''}</div>${href ? ARROW : ''}</div>
</${tag}>`;
}

const SILHOUETTE = '<svg class="sil" viewBox="0 0 120 130" aria-hidden="true"><path fill="currentColor" d="M60 14c15 0 26 12 26 28s-11 30-26 30-26-14-26-30 11-28 26-28zM10 130c2-30 22-48 50-48s48 18 50 48z"/></svg>';

function playerPhoto(t, p) {
  if (assetPath(p.photo)) {
    if (!creditFor(t, p.photo)) console.warn(`! ${t.slug}: ${p.ign} の写真にクレジット(image_credits)がありません`);
    return assetPath(p.photo);
  }
  if (p.photo) console.warn(`! ${t.slug}: ${p.ign} の写真 ${p.photo} が見つかりません(空枠で表示します)`);
  const conv = `assets/img/teams/${t.slug}/${String(p.ign).toLowerCase()}.jpg`;
  if (assetPath(conv)) {
    if (creditFor(t, conv)) return conv;
    console.warn(`! ${t.slug}: ${conv} がありますが、image_credits に記録が無いため表示しません`);
  }
  return null;
}

// 選手カード：3:4 写真枠＋IGN＋ロール
function playerCard(t, p, ctx, d = 0) {
  if (!p) {
    return `<div class="card player-card is-tba rv" style="--d:${d}"><div class="slot slot-photo">${SILHOUETTE}<span class="slot-tag">TBA</span></div><span class="player-ign">TBA</span><span class="player-role">未発表</span></div>`;
  }
  const ph = playerPhoto(t, p);
  const c = ph ? creditFor(t, ph) : null;
  if (c) ctx.credit({ ...c, title: c.title || `${p.ign}選手の写真` });
  const img = ph ? `<img src="${esc(assetSrc(ph, ctx.P))}" alt="${esc(p.ign)}選手" loading="lazy">` : SILHOUETTE;
  return `<div class="card player-card rv" style="--d:${d}">
  <div class="slot slot-photo">${img}</div>
  <span class="player-ign">${esc(p.ign)}</span>
  ${p.role ? `<span class="player-role">${esc(p.role)}</span>` : ''}
</div>`;
}

// ニュースカード：日付・カテゴリ(・報道/未定)＋見出し＋READ
function newsCard(n, ctx, { d = 0, filter = false } = {}) {
  const href = `${ctx.P}news/${esc(n.id)}.html`;
  const img = assetSrc(n.image, ctx.P);
  if (img && n.image_credit) ctx.credit(typeof n.image_credit === 'string' ? n.image_credit : { ...n.image_credit, file: n.image_credit.file || n.image, title: n.image_credit.title || `ニュース「${n.title}」の画像` });
  return `<a class="card news-card rv" href="${href}" style="--d:${d}"${filter ? ` data-filter-key="${esc(n.category)}"` : ''}>
  ${img ? `<div class="slot slot--16x9"><img src="${esc(img)}" alt="" loading="lazy"></div>` : ''}
  <div class="news-meta"><time class="news-date" datetime="${esc(n.date)}">${esc(dotDate(n.date))}</time><span class="news-cat">${esc(n.category)}</span>${status(n.status)}</div>
  <h3 class="news-title">${esc(n.title)}</h3>
  <span class="news-read">READ ${ARROW}</span>
</a>`;
}

// 2行だけ見せて MORE で全文(JS なしでは全文)
const readmore = (text) => `<div class="readmore"><p class="readmore-text">${esc(text)}</p><button type="button" class="readmore-btn">MORE +</button></div>`;
// <details> の MORE
const more = (inner, { open = 'MORE', close = 'CLOSE' } = {}) => `<details class="more"><summary><span class="more-label-closed">${open}</span><span class="more-label-open">${close}</span></summary><div class="more-body">${inner}</div></details>`;

const soonPanel = (ctx, text, links = []) => `<div class="soon rv"><span class="en">Coming Soon</span><p>${esc(text)}</p>${links.length ? `<div class="btns">${links.map(([h, l]) => `<a class="btn btn--sm" href="${ctx.P}${h}">${esc(l)}</a>`).join('')}</div>` : ''}</div>`;

// ---------------------------------------------------------------- HOME
function homePage() {
  const ctx = newPage('index.html');
  const P = ctx.P;
  const heroImg = ctx.siteImg('champions-istanbul-2022');
  const pac = pacificOrder();
  ctx.src(partners?.sources);
  if (partners?.status) ctx.checks.push({ label: 'Pacific パートナー8チーム', status: partners.status });
  ctx.asOf = partners?.as_of || '';
  const nCycles = Number(fmt?.numbers?.cycles) || arr(fmt?.cycles).length || 3;
  const nKickoff = Number(fmt?.numbers?.kickoff_teams) || 12;

  const top = hero(ctx, {
    variant: 'home', img: heroImg, kicker: 'Unofficial Fan Guide — 2027 Season',
    titleHtml: '<span class="ld-rise" style="--i:1">VCT</span> <span class="ld-rise r" style="--i:2">FAN</span>', titleLabel: 'VCT FAN',
    catchHtml: 'VCTをもっと気軽に。<br>もっと楽しく。',
    lead: 'VALORANTの世界大会を、はじめての人にもひと目で。',
    btns: `<a class="btn btn--solid" href="${P}format/index.html">大会のしくみ ${ARROW}</a><a class="btn" href="${P}teams/index.html">チームを見る</a>`,
    extra: `<div class="stats ld" style="--i:5">
      <div class="stat"><span class="stat-num" data-count="${pac.length || 8}">${pac.length || 8}</span><span class="stat-label">Pacific<br>パートナー</span></div>
      <div class="stat"><span class="stat-num" data-count="${nCycles}">${nCycles}</span><span class="stat-label">シーズンの<br>サイクル</span></div>
      <div class="stat"><span class="stat-num" data-count="${nKickoff}">${nKickoff}</span><span class="stat-label">Kickoff<br>出場チーム</span></div>
    </div>`,
  }) + '\n<span class="scroll-cue" aria-hidden="true">Scroll</span>';

  // 3つの入口
  const fmtImg = ctx.siteImg('champions-la-2023');
  const jpImg = ctx.siteImg('city-tokyo');
  const tiles = pac.slice(0, 8).map(({ team: t }) => `<span style="${teamVars(t.team_color)}">${esc(shortOf(t))}</span>`).join('');
  const entry = (n, href, en, jp, line, media, d) => `<a class="card entry-card rv" href="${P}${href}" style="--d:${d}">
  <div class="slot slot--16x9">${media}</div>
  <div class="entry-body"><span class="entry-num" aria-hidden="true">${n}</span><h3 class="entry-title">${en}</h3><span class="entry-jp">${jp}</span><p class="entry-line">${line}</p>${ARROW}</div>
</a>`;
  const entries = section({
    id: 'start', tone: 'cream', num: '01',
    head: secHead({ id: 'start', kicker: 'Start Here', en: 'Where to Start', jp: 'まずは、ここから。' }),
    inner: `<div class="grid grid--3">
${entry('01', 'format/index.html', 'Format', '大会システム', '2027年、VCTはトーナメント中心に。', fmtImg ? `<img src="${esc(fmtImg.src)}" alt="" loading="lazy">` : '', 0)}
${entry('02', 'teams/index.html', 'Teams', 'チーム', 'Pacific 8チームと日本のチーム。', `<div class="entry-tiles" aria-hidden="true">${tiles}</div>`, 1)}
${entry('03', 'japan/index.html', 'Japan', '日本', 'VCJからオープン予選へ。', jpImg ? `<img src="${esc(jpImg.src)}" alt="" loading="lazy">` : '', 2)}
</div>`,
  });

  // 最新ニュース3件
  const latest = news.slice(0, 3);
  const newsSec = section({
    id: 'news', tone: 'dark', num: '02',
    head: `<div class="sec-head-row">${secHead({ id: 'news', kicker: 'Latest', en: 'News', jp: '最新ニュース' })}<a class="link-arrow rv" href="${P}news/index.html">すべて見る ${ARROW}</a></div>`,
    inner: latest.length ? `<div class="grid grid--3">${latest.map((n, i) => newsCard(n, ctx, { d: i })).join('\n')}</div>` : soonPanel(ctx, 'ニュースは準備中です。'),
  });

  // 東京 Cup 2
  const tokyo = ctx.siteImg('city-tokyo');
  const cup2 = arr(fmt?.pacific_venues).find((v) => v.city === 'Tokyo') || { event: 'Cup 2', month: '2027.08', status: 'reported' };
  const cup2Month = Number(String(cup2.month).split('.')[1]) || 8;
  const cup2St = ctx.fact(`${cup2.event} 東京の日程(${cup2Month}月)`, { status: cup2.status, sources: fmt?.date_sources });
  ctx.checks.push({ label: `${cup2.event} の会場・チケット`, status: 'unverified' });
  const band = `<section class="band" id="tokyo" aria-labelledby="tokyo-h">
  ${tokyo ? `<div class="hero-media"><img src="${esc(tokyo.src)}" alt="" loading="lazy"></div>` : ''}
  <div class="wrap hero-inner">
    <span class="kicker rv">Pacific ${esc(cup2.event)} — ${esc(cup2.month)}</span>
    <h2 class="band-title rv" style="--d:1" id="tokyo-h" aria-label="東京で${esc(cup2.event)}">Tokyo</h2>
    <p class="band-line rv" style="--d:2">2027年${cup2Month}月、Pacificの決戦が東京へ。 ${cup2St}</p>
    <div class="btns rv" style="--d:3"><a class="btn" href="${P}format/season.html">1年の流れを見る ${ARROW}</a></div>
  </div>
</section>`;

  return layout(ctx, {
    title: '', current: 'home', source: 'scripts/build.mjs(homePage)',
    desc: 'VALORANTの世界大会VCTを、はじめての人にもひと目でわかるように紹介する非公式ファンサイトです。',
    body: [top, entries, newsSec, band].join('\n'),
  });
}

// ---------------------------------------------------------------- TEAMS
function teamsIndexPage() {
  const ctx = newPage('teams/index.html');
  const P = ctx.P;
  const img = ctx.siteImg('champions-la-2023');
  const pac = pacificOrder();
  const jp = japanTeams();
  const top = hero(ctx, {
    variant: 'page', img, kicker: 'Teams — 2027',
    titleHtml: 'Meet the <span class="r">Teams</span>',
    catchHtml: '推しチームを、見つけよう。',
    crumbs: crumbsHtml(ctx, [['index.html', 'HOME'], [null, 'チーム']]),
  });
  const bigCard = (href, en, jp2, line, tilesList, d) => `<a class="card entry-card rv" href="${href}" style="--d:${d}">
  <div class="slot slot--16x9"><div class="entry-tiles" aria-hidden="true">${tilesList.slice(0, 8).map((t) => `<span style="${teamVars(t.team_color)}">${esc(shortOf(t))}</span>`).join('')}</div></div>
  <div class="entry-body"><h3 class="entry-title">${en}</h3><span class="entry-jp">${jp2}</span><p class="entry-line">${line}</p>${ARROW}</div>
</a>`;
  const jpTiles = jp.filter((x) => x.linked).map((x) => x.team);
  const choose = section({
    id: 'choose', tone: 'cream', num: '01',
    head: secHead({ id: 'choose', kicker: 'Choose', en: 'Two Ways In', jp: '地域からえらぶ' }),
    inner: `<div class="grid grid--2">
${bigCard('pacific.html', 'Pacific', 'Pacific パートナー', `${pac.length}チーム。2027〜2028年のパートナー。`, pac.map((x) => x.team), 0)}
${bigCard('japan.html', 'Japan', '日本チーム', `${jp.length}チーム。オープン予選からPacificへ。`, jpTiles, 1)}
</div>`,
  });
  const others = section({
    id: 'others', tone: 'dark',
    head: secHead({ id: 'others', kicker: 'Other Regions', en: 'Coming Soon', jp: 'ほかの地域は準備中' }),
    inner: `<div class="tags rv">${['Americas', 'EMEA', 'China'].map((r) => `<span class="tag">${r}</span>`).join('')}</div>`,
    cls: 'sec--tight',
  });
  return layout(ctx, {
    title: 'チーム', current: 'teams', source: 'data/teams/*.json',
    desc: 'VCT 2027 Pacificのパートナーチームと、日本オープン予選に挑むチームを紹介します。',
    body: [top, choose, others].join('\n'),
  });
}

function teamsPacificPage() {
  const ctx = newPage('teams/pacific.html');
  const img = ctx.siteImg('city-bangkok');
  ctx.src(partners?.sources);
  if (partners?.status) ctx.checks.push({ label: 'Pacific パートナー8チーム', status: partners.status });
  ctx.asOf = partners?.as_of || '';
  const list = pacificOrder();
  const top = hero(ctx, {
    variant: 'page', img, kicker: 'VCT Pacific — Partners 2027–2028',
    titleHtml: 'Pacific <span class="r">8</span>',
    catchHtml: 'アジア太平洋の、8つのパートナー。',
    crumbs: crumbsHtml(ctx, [['index.html', 'HOME'], ['teams/index.html', 'チーム'], [null, 'Pacific']]),
  });
  const grid = section({
    id: 'teams', tone: 'dark',
    head: secHead({ id: 'teams', kicker: 'Partner Teams', en: 'The Eight', jp: 'パートナー8チーム', lead: 'Kickoffに直接出場できるチームです。' }),
    inner: list.length
      ? `<div class="grid grid--4">${list.map((x, i) => teamCard(x.team, ctx, { href: x.linked ? `${x.team.slug}.html` : null, sub: x.linked ? esc(x.team.country || '') : '準備中', d: i % 4 })).join('\n')}</div>`
      : soonPanel(ctx, 'チーム紹介は準備中です。'),
  });
  const next = section({
    id: 'next', tone: 'cream', cls: 'sec--tight',
    head: secHead({ id: 'next', kicker: 'Next', en: 'Japan', jp: '日本のチームも見る' }),
    inner: `<div class="btns rv"><a class="btn btn--solid" href="japan.html">日本チームへ ${ARROW}</a></div>`,
  });
  return layout(ctx, {
    title: 'Pacific パートナー', current: 'teams', source: 'data/pacific-partners.json, data/teams/*.json',
    desc: 'VCT Pacific 2027〜2028年のパートナー8チームの一覧です。',
    body: [top, grid, next].join('\n'),
  });
}

function teamsJapanPage() {
  const ctx = newPage('teams/japan.html');
  const img = ctx.siteImg('city-tokyo');
  const jp = japanTeams();
  ctx.asOf = str(japan?.as_of);
  for (const x of jp) if (x.entry?.status) ctx.fact(`${x.team.name} のロスター状況`, x.entry);
  const top = hero(ctx, {
    variant: 'page', img, kicker: 'Japan — Open Qualifier',
    titleHtml: 'Japan <span class="r">Teams</span>',
    catchHtml: '日本から、Pacificへ。',
    crumbs: crumbsHtml(ctx, [['index.html', 'HOME'], ['teams/index.html', 'チーム'], [null, '日本']]),
  });
  const used = Object.keys(ROSTER_STATUS).filter((k) => jp.some((x) => x.entry?.roster_status === k));
  const chips = `<div class="chips" data-filter-group="jp-grid" role="group" aria-label="2027年のロスター状況で絞り込む" hidden>
    <button type="button" class="chip" data-filter="" aria-pressed="true">すべて <small>${jp.length}</small></button>
    ${used.map((k) => `<button type="button" class="chip" data-filter="${k}" aria-pressed="false">${ROSTER_STATUS[k].text} <small>${jp.filter((x) => x.entry?.roster_status === k).length}</small></button>`).join('')}
  </div>`;
  const grid = section({
    id: 'teams', tone: 'dark',
    head: secHead({ id: 'teams', kicker: 'Open Qualifier Teams', en: 'Road to Kickoff', jp: '日本のチーム', lead: 'カードの下は2027年のロスター状況です。' }),
    inner: jp.length
      ? `${chips}<div class="grid grid--4" id="jp-grid">${jp.map((x, i) => {
        const rs = ROSTER_STATUS[x.entry?.roster_status];
        return teamCard(x.team, ctx, { href: x.linked ? `${x.team.slug}.html` : null, sub: rs ? `ロスター${rs.text}` : (x.linked ? '' : '準備中'), d: i % 4, filterKey: x.entry?.roster_status || 'none' });
      }).join('\n')}</div>`
      : soonPanel(ctx, '日本のチーム紹介は準備中です。'),
  });
  const jpPartners = ['zeta-division', 'crazy-raccoon'].map((slug) => bySlug.get(slug) || { slug, name: teamName(slug), team_color: '#394656' });
  const partnersSec = section({
    id: 'partners', tone: 'cream',
    head: secHead({ id: 'partners', kicker: 'Pacific Partners from Japan', en: 'Partners', jp: '日本のパートナー', lead: '予選なしでKickoffから出場します。' }),
    inner: `<div class="grid grid--4">${jpPartners.map((t, i) => teamCard(t, ctx, { href: bySlug.has(t.slug) ? `${t.slug}.html` : null, sub: 'Pacific パートナー', d: i })).join('\n')}</div>`,
  });
  return layout(ctx, {
    title: '日本チーム', current: 'teams', source: 'data/japan.json, data/teams/*.json',
    desc: '日本オープン予選からVCT Pacificを目指す日本のチームの一覧です。',
    body: [top, grid, partnersSec].join('\n'),
  });
}

function teamPage(t) {
  const ctx = newPage(`teams/${t.slug}.html`);
  const P = ctx.P;
  const isJapan = isRegion(t, 'Japan');
  const base = asField(t.base);
  const partner = asField(t.partner);
  const path27 = asField(t.path_2027);
  const history = asField(t.history);
  const achievements = arr(t.achievements).map(asField).filter(Boolean);
  const roster = t.roster && typeof t.roster === 'object' ? t.roster : null;
  const players = arr(roster?.players).filter((p) => p && p.ign);
  const staff = arr(roster?.staff).filter((s) => s && (s.ign || s.name));
  const playstyle = asField(t.playstyle);
  const highlights = asField(t.highlights_2027);
  const tip = asField(t.beginner_tip);
  const featured = arr(t.featured_players).filter((f) => f && f.ign);
  const links = Object.entries(t.links && typeof t.links === 'object' ? t.links : {}).map(([k, v]) => [k, safeUrl(v)]).filter(([, v]) => v);
  const related = news.filter((n) => n.teams.includes(t.slug));
  const jpEntry = arr(japan?.teams).find((x) => x && String(x.slug || '').toLowerCase() === t.slug);
  const rs = ROSTER_STATUS[jpEntry?.roster_status || t.roster_status];
  ctx.openQ.push(...arr(t.open_questions).filter((q) => typeof q === 'string' && q.trim()));
  ctx.asOf = str(t.researched_at);

  // hero
  const heroPath = assetPath(t.images?.hero);
  const heroC = heroPath ? creditFor(t, heroPath) : null;
  if (heroPath && !heroC) console.warn(`! ${t.slug}: ヒーロー画像にクレジット(image_credits)がありません`);
  if (heroC) ctx.credit({ ...heroC, title: heroC.title || `${t.name} のチーム写真枠の画像` });
  const regionLabel = isJapan ? 'Japan — Open' : `${t.region || 'Pacific'}${partnerSlugs.has(t.slug) ? ' — Partner' : ''}`;
  const tags = [isJapan ? '日本' : t.region, t.country].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i && !regionLabel.startsWith(x));
  const routeStatus = partner ? ctx.fact('パートナー', partner) : (path27 ? ctx.fact('2027年の出場ルート', path27) : '');
  const tipStatus = tip ? draftNote(tip) : '';
  const heroHtml = `<section class="team-hero">
  <div class="wrap team-hero-grid">
    <div>
      ${crumbsHtml(ctx, [['index.html', 'HOME'], [isJapan ? 'teams/japan.html' : 'teams/pacific.html', isJapan ? '日本チーム' : 'Pacific'], [null, t.name]])}
      <div class="ld" style="--i:1;margin-top:28px">${teamLogo(t, P)}</div>
      <h1 class="ld" style="--i:2">${esc(t.name)}</h1>
      ${t.name_kana ? `<p class="kana ld" style="--i:2">${esc(t.name_kana)}</p>` : ''}
      <div class="tags ld" style="--i:3"><span class="tag">${esc(regionLabel)}</span>${tags.map((x) => `<span class="tag">${esc(x)}</span>`).join('')}</div>
      ${tip ? `${tipStatus}<p class="tip ld" style="--i:4">${esc(tip.text)}</p>` : ''}
    </div>
    <div class="ld" style="--i:3">
      <div class="slot slot--16x9 team-photo">${heroPath ? `<img src="${esc(assetSrc(heroPath, P))}" alt="" fetchpriority="high">` : `<div class="slot-empty" aria-hidden="true">${esc(shortOf(t))}</div>`}</div>
      ${heroC ? `<p class="photo-credit">${shortCredit(heroC)}${heroC.description ? '(イメージ)' : ''}</p>` : ''}
    </div>
  </div>
</section>`;

  // --- 概要
  const five = players.slice();
  while (five.length < 5) five.push(null);
  const rosterStatusDot = roster ? ctx.fact('ロスター', roster) : '';
  const overviewPlayers = `<div class="block">
      <div class="block-head"><h3>Players</h3><span class="jp">選手${roster?.as_of ? `(${esc(roster.as_of)} 時点)` : ''}</span>${rosterStatusDot}</div>
      <div class="grid grid--5 grid--players">${five.map((p, i) => playerCard(t, p, ctx, i % 5)).join('\n')}</div>
    </div>`;
  const texts = [
    history && ['History', '歩み', ctx.fact('歩み', history), history],
    playstyle && ['Playstyle', 'プレースタイル', '', playstyle],
    highlights && ['2027', '見どころ', '', highlights],
  ].filter(Boolean);
  const overviewTexts = texts.length ? `<div class="block"><div class="grid grid--3">${texts.map(([en, jp, st, f], i) => `<div class="info-card rv" style="--d:${i}">${draftNote(f)}<h3><span class="en">${en}</span><span>${jp} ${st}</span></h3>${readmore(f.text)}</div>`).join('\n')}</div></div>` : '';
  const facts = [];
  const factText = (txt, st) => (txt.length > 48 ? `${readmore(txt)}${st}` : `${esc(txt)} ${st}`);
  if (base) facts.push(['拠点', factText(base.text, ctx.fact('拠点', base))]);
  if (partner) facts.push(['2027年', factText(partner.text, routeStatus)]);
  else if (path27) facts.push(['2027年', factText(path27.text, routeStatus)]);
  if (rs) facts.push(['ロスター', `2027年のロスター：${esc(rs.text)}`]);
  const factsHtml = facts.length ? `<div class="block rv"><div class="block-head"><h3>Profile</h3><span class="jp">基本情報</span></div><dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl></div>` : '';
  const linksHtml = links.length ? `<div class="block rv"><div class="btns">${links.map(([k, u]) => `<a class="btn btn--sm" href="${esc(u)}" rel="noopener">${esc(LINK_LABELS[k] || k)} <span aria-hidden="true">↗</span></a>`).join('')}</div></div>` : '';

  // --- 選手
  const rosterRows = players.map((p) => `<div class="roster-row"><span class="ign">${esc(p.ign)}</span><span class="role">${esc(p.role || '')}</span><span class="meta">${[p.name, p.country].filter(Boolean).map(esc).join(' / ')}</span></div>`).join('');
  const notes = players.filter((p) => str(p.note));
  const feat = featured.length ? `<div class="block"><div class="block-head"><h3>Watch</h3><span class="jp">注目選手</span></div><div class="grid grid--2">${featured.map((f, i) => `<div class="info-card rv" style="--d:${i}">${draftNote(f)}<h3><span class="en">Player</span>${esc(f.ign)}</h3>${f.why ? readmore(f.why) : ''}</div>`).join('')}</div></div>` : '';
  const rosterPanel = `${players.length ? `<div class="roster-list rv">${rosterRows}</div>` : '<p class="muted">2027年の選手はまだ発表されていません。</p>'}
    ${str(roster?.note) ? `<p class="muted" style="margin-top:16px">${esc(roster.note)}</p>` : ''}
    ${notes.length ? more(`<ul class="list-dots">${notes.map((p) => `<li><b>${esc(p.ign)}</b>：${esc(p.note)}</li>`).join('')}</ul>`, { open: 'PLAYER NOTES', close: 'CLOSE' }) : ''}
    ${staff.length ? `<div class="block"><div class="block-head"><h3>Staff</h3><span class="jp">スタッフ</span></div><div class="staff">${staff.map((s) => `<div><b>${esc(s.ign || s.name)}</b><span>${esc(s.role || '')}</span></div>`).join('')}</div></div>` : ''}
    ${feat}`;

  // --- 実績(新しい順、3件＋MORE)
  achievements.forEach((a) => ctx.fact('実績', a));
  const achSorted = achievements.map((a, i) => ({ a, i, y: yearOf(a.text) })).sort((x, y) => (y.y - x.y) || (y.i - x.i)).map((x) => x.a);
  const tl = (list) => `<ol class="timeline rv">${list.map((a) => {
    const y = yearOf(a.text);
    return `<li class="tl-item"><span class="tl-when">${y || '—'}</span><p class="tl-body">${esc(a.text)}${a.status === 'unverified' ? ` ${status('unverified')}` : ''}</p></li>`;
  }).join('')}</ol>`;
  const achPanel = achSorted.length
    ? `${tl(achSorted.slice(0, 3))}${achSorted.length > 3 ? more(tl(achSorted.slice(3)), { open: `MORE (${achSorted.length - 3})`, close: 'CLOSE' }) : ''}`
    : '<p class="muted">実績は準備中です。</p>';

  // --- ニュース
  const newsPanel = related.length
    ? `<div class="grid grid--3">${related.slice(0, 6).map((n, i) => newsCard(n, ctx, { d: i % 3 })).join('\n')}</div>${related.length > 6 ? `<p style="margin-top:24px"><a class="link-arrow" href="${P}news/index.html">ニュース一覧へ ${ARROW}</a></p>` : ''}`
    : '<p class="muted">関連ニュースはまだありません。</p>';

  // roster sources for the drawer
  const panels = [
    ['overview', 'Overview', '概要', `${overviewPlayers}${overviewTexts}${factsHtml}${linksHtml}`],
    ['roster', 'Roster', '選手', rosterPanel],
    ['results', 'Results', '実績', achPanel],
    ['news', 'News', 'ニュース', newsPanel],
  ];
  const tabsSec = `<section class="sec sec--cream sec--tabs" aria-label="${esc(t.name)} の詳細">
  <div class="wrap tabs">
    <nav class="tab-list" aria-label="ページ内の切り替え">${panels.map(([id, en, jp]) => `<a class="tab" href="#${id}"><span class="en">${en}</span>${jp}</a>`).join('')}</nav>
    ${panels.map(([id, en, jp, inner]) => `<section class="tab-panel" id="${id}" aria-label="${jp}">
      <h2 class="panel-title panel-title--tabbed"><span class="en">${en}</span>${jp}</h2>
      ${inner}
    </section>`).join('\n    ')}
  </div>
</section>`;
  const back = section({
    id: 'more-teams', tone: 'dark', cls: 'sec--tight',
    inner: `<div class="btns"><a class="btn" href="${isJapan ? 'japan.html' : 'pacific.html'}">← ${isJapan ? '日本チーム' : 'Pacific'} 一覧</a><a class="btn" href="index.html">チームトップ</a></div>`,
  });

  return layout(ctx, {
    title: `${t.name}${t.name_kana ? `(${t.name_kana})` : ''}`, current: 'teams', source: `data/teams/${t.slug}.json`,
    parent: isJapan ? 'teams/japan.html' : (pacificOrder().some((x) => x.team.slug === t.slug) ? 'teams/pacific.html' : 'teams/index.html'), leaf: t.name,
    desc: `${t.name}のチーム紹介。選手、歩み、実績、関連ニュースをまとめています。`,
    bodyStyle: teamVars(t.team_color),
    body: [heroHtml, tabsSec, back].join('\n'),
  });
}

// ---------------------------------------------------------------- NEWS
function newsIndexPage() {
  const ctx = newPage('news/index.html');
  const top = hero(ctx, {
    variant: 'plain', kicker: 'News — VCT & Japan',
    titleHtml: 'Latest <span class="r">News</span>',
    catchHtml: 'VCTの「いま」を、やさしく。',
    crumbs: crumbsHtml(ctx, [['index.html', 'HOME'], [null, 'ニュース']]),
  });
  const cats = NEWS_CATS.filter((c) => news.some((n) => n.category === c));
  const chips = `<div class="chips" data-filter-group="news-grid" role="group" aria-label="カテゴリで絞り込む" hidden>
    <button type="button" class="chip" data-filter="" aria-pressed="true">すべて <small>${news.length}</small></button>
    ${cats.map((c) => `<button type="button" class="chip" data-filter="${esc(c)}" aria-pressed="false">${esc(c)} <small>${news.filter((n) => n.category === c).length}</small></button>`).join('')}
  </div>`;
  for (const n of news) if (n.status && n.status !== 'confirmed') ctx.checks.push({ label: 'ニュース', status: n.status });
  const list = section({
    id: 'list', tone: 'dark',
    inner: news.length ? `${chips}<div class="grid grid--3" id="news-grid">${news.map((n, i) => newsCard(n, ctx, { d: i % 3, filter: true })).join('\n')}</div>` : soonPanel(ctx, 'ニュースは準備中です。'),
  });
  return layout(ctx, {
    title: 'ニュース', current: 'news', source: 'data/news/*.json', solidHead: true,
    desc: 'VCTと日本のVALORANTシーンのニュースを、はじめての人向けにまとめています。',
    body: [top, list].join('\n'),
  });
}

function newsPage(n) {
  const ctx = newPage(`news/${n.id}.html`);
  const P = ctx.P;
  const img = assetSrc(n.image, P);
  ctx.src(n.sources);
  if (n.status) ctx.checks.push({ label: 'このニュース', status: n.status });
  if (img && n.image_credit) ctx.credit(typeof n.image_credit === 'string' ? n.image_credit : { ...n.image_credit, file: n.image_credit.file || n.image, title: n.image_credit.title || 'ニュースの画像' });
  else if (img) console.warn(`! ニュース ${n.id} の画像にクレジット(image_credit)がありません`);
  const idx = news.indexOf(n);
  const newer = news[idx - 1];
  const older = news[idx + 1];
  const pager = (x, label) => (x ? `<a class="card" href="${esc(x.id)}.html"><span class="label">${label}</span><span class="t">${esc(x.title)}</span></a>` : '<span></span>');
  const tags = n.teams.map((slug) => (bySlug.has(slug) ? `<a class="tag" href="${P}teams/${esc(slug)}.html">${esc(teamName(slug))}</a>` : `<span class="tag">${esc(teamName(slug))}</span>`)).join('');
  const head = `<section class="hero hero--plain">
  <div class="wrap wrap--narrow hero-inner">
    ${crumbsHtml(ctx, [['index.html', 'HOME'], ['news/index.html', 'ニュース'], [null, dotDate(n.date)]])}
    <div class="news-meta ld" style="--i:1;margin-top:20px"><time class="news-date" datetime="${esc(n.date)}">${esc(dotDate(n.date))}</time><span class="news-cat">${esc(n.category)}</span>${status(n.status)}</div>
    <h1 class="ld" style="--i:2;margin-top:16px;font-size:clamp(26px,4.4vw,40px);line-height:1.45">${esc(n.title)}</h1>
    ${tags ? `<div class="tags ld" style="--i:3;margin-top:20px">${tags}</div>` : ''}
  </div>
</section>`;
  const body = section({
    id: 'article', tone: 'cream',
    inner: `<div class="wrap--narrow" style="padding:0;margin:0 auto">
    ${img ? `<div class="slot slot--16x9" style="margin-bottom:32px"><img src="${esc(img)}" alt="${esc(str(n.image_alt) || n.title)}"></div>` : ''}
    ${n.summary ? `<p class="lead">${esc(n.summary)}</p>` : ''}
    ${n.body.length ? `<div class="prose" style="margin-top:28px">${n.body.map((p) => `<p>${esc(p)}</p>`).join('')}</div>` : ''}
    <nav class="pager" aria-label="前後のニュース">${pager(newer, 'Newer')}${pager(older, 'Older')}</nav>
    <p style="margin-top:32px"><a class="link-arrow" href="index.html">← ニュース一覧</a></p>
  </div>`,
  });
  return layout(ctx, {
    title: `${n.title}｜ニュース`, current: 'news', source: `data/news/${n.id}.json`, solidHead: true,
    parent: 'news/index.html', leaf: n.title,
    desc: n.summary || n.title, body: [head, body].join('\n'),
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
  <title>${SITE_JP} ニュース</title>
  <subtitle>VCTと日本のVALORANTシーンのニュース(非公式ファンサイト)</subtitle>
  <id>tag:vct-fan-guide,2026:news</id>
  <link rel="alternate" type="text/html" href="index.html"/>
  <link rel="self" type="application/atom+xml" href="feed.xml"/>
  <updated>${t(updated)}</updated>
  <author><name>${SITE}</name></author>
  <rights>${esc(DISCLAIMER)}</rights>
${entries}
</feed>
`;
}

// ---------------------------------------------------------------- FORMAT(data/format.json、原稿は content/format.md)
const KIND = { online: { en: 'Online', jp: 'オンライン予選' }, lan: { en: 'LAN', jp: '地域大会(LAN)' }, intl: { en: 'World', jp: '世界大会' } };
const EVENT_KIND = { open: 'online', kickoff: 'lan', cup: 'lan', masters: 'intl', champions: 'intl' };
const FORMAT_NAV = MENU.find((g) => g.key === 'format').items;
const JAPAN_NAV = MENU.find((g) => g.key === 'japan').items;

function fmtCtx(rel) {
  const ctx = newPage(rel);
  ctx.src(fmt?.sources);
  ctx.asOf = str(fmt?.as_of);
  return ctx;
}
const fmtCrumbs = (ctx, label) => crumbsHtml(ctx, label ? [['index.html', 'HOME'], ['format/index.html', '大会システム'], [null, label]] : [['index.html', 'HOME'], [null, '大会システム']]);

// データが無いときの「準備中」
function soonSection(ctx, related = []) {
  return section({ id: 'soon', tone: 'cream', inner: soonPanel(ctx, 'このページは準備中です。', related) });
}

// 前後のページ(大会システム・日本の下層ページ共通)。次のページは大きく、タイトルと1行の説明つき
function pagerSec(ctx, list) {
  const i = list.findIndex(([h]) => h === ctx.rel);
  const n = list.length;
  const isLast = i === n - 1;
  const nextI = isLast ? 0 : i + 1;
  const nx = list[nextI];
  const pv = i > 0 ? list[i - 1] : null;
  const next = n > 1 ? `<a class="pager-next" href="${ctx.P}${nx[0]}">
      <span class="pager-label en">${isLast ? 'Back to start ↺' : 'Next'}<span class="pager-step">${pad2(nextI + 1)} / ${pad2(n)}</span></span>
      <span class="pager-t">${esc(nx[1])}</span>
      <span class="pager-d">${esc(nx[3] || '')}</span>
      <span class="pager-arrow" aria-hidden="true">→</span>
    </a>` : '';
  const prev = pv ? `<a class="pager-prev" href="${ctx.P}${pv[0]}"><span class="pager-label en">← Prev<span class="pager-step">${pad2(i)} / ${pad2(n)}</span></span><span class="pager-t">${esc(pv[1])}</span></a>` : '';
  return section({
    id: 'pager', tone: 'surface', cls: 'sec--pager',
    inner: `<nav class="pager-series${pv ? '' : ' pager-series--first'}" aria-label="前後のページ">${next}${prev}</nav>`,
  });
}

// Open Qualifiers → Kickoff → … → Champions の帯
function flowStrip(list) {
  const items = arr(list).map((s, i) => `<li class="flow-step flow-step--${esc(s.kind)}" style="--d:${i}"><span class="flow-en">${esc(s.en)}</span><span class="flow-jp">${esc(s.jp)}</span></li>`).join('');
  const kinds = [...new Set(arr(list).map((s) => s.kind))].filter((k) => KIND[k]);
  return `<ol class="flow rv" aria-label="2027年の大会の流れ">${items}</ol>
    <div class="flow-legend rv" style="--d:2">${kinds.map((k) => `<span class="flow-key flow-key--${k}">${KIND[k].jp}</span>`).join('')}</div>`;
}

// 2026 / 2027 の比較表(スマホでは縦に積む)
const cmpTable = (rows) => `<div class="cmp" role="table" aria-label="2026年と2027年の比較">
  <div class="cmp-row cmp-row--head" role="row"><span role="columnheader">項目</span><span role="columnheader">2026</span><span role="columnheader">2027</span></div>
  ${arr(rows).map(([k, a, b]) => `<div class="cmp-row" role="row"><span class="cmp-k" role="rowheader">${esc(k)}</span><span class="cmp-a" role="cell" data-y="2026">${esc(a)}</span><span class="cmp-b" role="cell" data-y="2027">${esc(b)}</span></div>`).join('')}
</div>`;

// 横棒グラフ(金額・回数)。--w で長さ、[data-count] でカウントアップ
function bars(items, { pre = '', post = '' } = {}) {
  const max = Math.max(1, ...items.map((x) => x.value));
  return `<ul class="bars">${items.map((x, i) => `<li class="bar rv" style="--d:${i};--w:${(x.value / max * 100).toFixed(1)}%">
    <span class="bar-label">${x.labelHtml}</span>
    <span class="bar-track" aria-hidden="true"><span class="bar-fill"></span></span>
    <span class="bar-num">${pre}<span data-count="${x.value}">${x.value}</span>${/^[A-Za-z]+$/.test(post) ? post : `<small>${post}</small>`}</span>
  </li>`).join('')}</ul>`;
}

// アコーディオン(用語集・FAQ)。開閉は site.js が more と同じアニメーション
const acc = (sumHtml, bodyHtml, i = 0) => `<details class="acc rv" style="--d:${i % 4}"><summary>${sumHtml}<span class="acc-ic" aria-hidden="true"></span></summary><div class="more-body">${bodyHtml}</div></details>`;

function formatIndexPage() {
  const ctx = fmtCtx('format/index.html');
  const img = ctx.siteImg('champions-la-2023');
  const top = hero(ctx, {
    variant: 'page', img, kicker: 'Format — 2027 Season',
    titleHtml: 'How VCT <span class="r">Works</span>',
    catchHtml: '2027年、VCTはトーナメント中心に。',
    crumbs: fmtCrumbs(ctx),
  });
  if (!fmt) return layout(ctx, { title: '大会システム', current: 'format', desc: 'VCT 2027の大会システム(準備中)', body: [top, soonSection(ctx)].join('\n') });
  ctx.openQ.push(...arr(fmt.open_questions).map((q) => `${q}は未確定です。`));
  const n = fmt.numbers || {};

  const changes = section({
    id: 'changes', tone: 'cream', num: '01',
    head: secHead({ id: 'changes', kicker: "What's New", en: '3 Big Changes', jp: '2027年の大きな変化', lead: esc(fmt.headline || '') }),
    inner: `<ol class="grid grid--3 change-grid">${arr(fmt.changes).map((c, i) => `<li class="change-card rv" style="--d:${i}">
      <span class="change-num" aria-hidden="true">${pad2(i + 1)}</span>
      <span class="change-en">${esc(c.en)}</span>
      <h3 class="change-title">${esc(c.title)}</h3>
      <p class="change-line">${esc(c.line)}</p>
    </li>`).join('')}</ol>`,
  });

  const flow = section({
    id: 'flow', tone: 'dark', num: '02',
    head: secHead({ id: 'flow', kicker: 'The Flow', en: 'One Season', jp: '1年の流れ', lead: `予選 → 地域大会 → 世界大会を、1年に${esc(n.cycles || 3)}回。` }),
    inner: `${flowStrip(fmt.flow)}
    <p class="sec-cta rv"><a class="link-arrow" href="season.html">日程と開催地を見る ${ARROW}</a></p>`,
  });

  const SUBS = [
    ['season.html', 'Season', '1年の流れ', '3つのサイクルと開催地。'],
    ['events.html', 'Events', '大会の種類', '5つの大会を1枚ずつ。'],
    ['rules.html', 'Rules', 'ルールと支援金', 'パートナーとオープンの違い。'],
    ['glossary.html', 'Glossary', '用語集・FAQ', 'わからない言葉は、ここで。'],
  ];
  const subs = section({
    id: 'deeper', tone: 'cream', num: '03',
    head: secHead({ id: 'deeper', kicker: 'Dig Deeper', en: 'Learn More', jp: 'くわしく見る' }),
    inner: `<div class="grid grid--4 link-grid">${SUBS.map(([h, en, jp, line], i) => `<a class="card link-card rv" href="${h}" style="--d:${i}">
      <span class="link-num" aria-hidden="true">${pad2(i + 1)}</span>
      <h3 class="link-title">${en}</h3><span class="link-jp">${jp}</span>
      <p class="link-line">${line}</p>${ARROW}
    </a>`).join('\n')}</div>`,
  });

  const vs = (label, a, b, d) => `<div class="vs rv" style="--d:${d}"><span class="vs-label">${label}</span><span class="vs-row"><span class="vs-a">${a}</span><span class="vs-arrow" aria-hidden="true">→</span><span class="vs-b">${b}</span></span></div>`;
  const compare = section({
    id: 'compare', tone: 'dark', num: '04',
    head: secHead({ id: 'compare', kicker: '2026 → 2027', en: 'Then vs Now', jp: '2026年との違い', lead: 'パートナーは減り、地域リーグはトーナメントに。' }),
    inner: `<div class="grid grid--2 vs-grid">
      ${vs('1地域のパートナー', esc(n.partners_2026 ?? 10), esc(n.partners_per_region ?? 8), 0)}
      ${vs('地域の大会', 'Stage', 'Cup', 1)}
    </div>
    ${arr(fmt.compare).length ? more(cmpTable(fmt.compare), { open: 'MORE — 比較表', close: 'CLOSE' }) : ''}`,
  });

  return layout(ctx, {
    title: '大会システム', current: 'format', source: 'data/format.json',
    desc: 'VCT 2027の大会システムを、3つの変化と1年の流れでひと目で紹介します。',
    body: [top, changes, flow, subs, compare, pagerSec(ctx, FORMAT_NAV)].join('\n'),
  });
}

function formatSeasonPage() {
  const ctx = fmtCtx('format/season.html');
  ctx.src(fmt?.date_sources);
  const img = ctx.siteImg('city-seoul');
  const top = hero(ctx, {
    variant: 'page', img, kicker: 'Format — Season',
    titleHtml: 'The <span class="r">Season</span>',
    catchHtml: '予選 → 地域大会 → 世界大会を、3回。',
    crumbs: fmtCrumbs(ctx, '1年の流れ'),
  });
  if (!fmt) return layout(ctx, { title: '1年の流れ', current: 'format', desc: 'VCT 2027の1年の流れ(準備中)', body: [top, soonSection(ctx)].join('\n') });
  ctx.openQ.push(...arr(fmt.open_questions).filter((q) => /日程|終了日/.test(q)).map((q) => `${q}は未確定です。`));

  const stepCard = (s) => {
    const im = s.img ? ctx.siteImg(s.img) : null;
    const st = str(s.dates) === '未発表' ? '' : ctx.fact(`${s.event}(${s.city})の日程`, { status: s.status });
    return `<li class="step-card step-card--${esc(s.kind)}">
      <div class="slot slot--16x9">${im ? `<img src="${esc(im.src)}" alt="" loading="lazy">` : '<span class="step-online" aria-hidden="true"></span>'}
        <span class="step-kind">${esc(KIND[s.kind]?.en || '')}</span>
        <span class="step-cap"><span class="step-event">${esc(s.event)}</span><span class="step-city">${esc(s.city)}</span></span>
      </div>
      <p class="step-date">${esc(s.dates)} ${st}</p>
    </li>`;
  };
  const cycles = section({
    id: 'cycles', tone: 'dark', num: '01',
    head: secHead({ id: 'cycles', kicker: 'Three Cycles', en: 'The Road', jp: '3つのサイクル', lead: 'オンライン予選から地域大会、そして世界大会へ。日程は Pacific のものです。' }),
    inner: `<ol class="cycles">${arr(fmt.cycles).map((c) => `<li class="cycle rv">
      <div class="cycle-head"><span class="cycle-num" aria-hidden="true">${pad2(c.n)}</span><div><h3 class="cycle-en">${esc(c.en)}</h3><span class="cycle-when">${esc(c.line)}</span></div></div>
      <ol class="cycle-steps">${arr(c.steps).map(stepCard).join('')}</ol>
    </li>`).join('\n')}</ol>
    ${arr(fmt.date_notes).length ? more(`<ul class="list-dots">${fmt.date_notes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`, { open: 'MORE — 日程について', close: 'CLOSE' }) : ''}`,
  });

  const venues = section({
    id: 'venues', tone: 'cream', num: '02',
    head: secHead({ id: 'venues', kicker: 'Pacific Venues', en: 'Host Cities', jp: 'Pacificの開催地', lead: 'Kickoffはバンコク、Cup 1はマニラ、Cup 2は東京。' }),
    inner: `<div class="grid grid--3 venue-grid">${arr(fmt.pacific_venues).map((v, i) => {
      const im = ctx.siteImg(v.img);
      const st = ctx.fact(`${v.event}(${v.city_jp})の日程`, { status: v.status });
      const home = v.city === 'Tokyo';
      return `<article class="venue-card${home ? ' venue-card--home' : ''} rv" style="--d:${i}">
        <div class="slot venue-media">${im ? `<img src="${esc(im.src)}" alt="${esc(im.alt)}" loading="lazy">` : ''}${home ? '<span class="venue-flag">日本開催</span>' : ''}</div>
        <div class="venue-cap"><span class="venue-event">${esc(v.event)} — ${esc(v.month)}</span><h3 class="venue-city">${esc(v.city)}</h3><span class="venue-meta">${esc(v.city_jp)}・${esc(v.dates)} ${st}</span></div>
      </article>`;
    }).join('\n')}</div>`,
  });

  return layout(ctx, {
    title: '1年の流れ', current: 'format', source: 'data/format.json',
    desc: 'VCT 2027の1年を、3つのサイクルとPacificの開催地(バンコク・マニラ・東京)で紹介します。',
    body: [top, cycles, venues, pagerSec(ctx, FORMAT_NAV)].join('\n'),
  });
}

function formatEventsPage() {
  const ctx = fmtCtx('format/events.html');
  const img = ctx.siteImg('champions-istanbul-2022');
  const top = hero(ctx, {
    variant: 'page', img, kicker: 'Format — Events',
    titleHtml: 'The <span class="r">Events</span>',
    catchHtml: '入口から、世界一まで。5つの大会。',
    crumbs: fmtCrumbs(ctx, '大会の種類'),
  });
  if (!fmt) return layout(ctx, { title: '大会の種類', current: 'format', desc: 'VCT 2027の大会の種類(準備中)', body: [top, soonSection(ctx)].join('\n') });

  const card = (e, i) => {
    const kind = EVENT_KIND[e.key] || 'lan';
    const whoSt = e.who_status ? ctx.fact(`${e.en}の出場チーム数`, { status: e.who_status }) : '';
    const facts = [['形式', esc(e.format)], ['出場', `${esc(e.who)} ${whoSt}`], ['次へ', esc(e.next)]].filter(([, v]) => v.trim());
    const isNum = /^\d+$/.test(str(e.num));
    return `<article class="event-card event-card--${kind} rv" style="--d:${i % 2}">
      <div class="event-key"><span class="event-num"${isNum ? ` data-count="${esc(e.num)}"` : ''}>${esc(e.num)}</span><span class="event-unit">${esc(e.unit)}</span></div>
      <div class="event-body">
        <span class="event-kind">${pad2(i + 1)} — ${esc(KIND[kind].jp)}</span>
        <h3 class="event-name">${esc(e.en)}</h3>
        <p class="event-line">${esc(e.line)}</p>
        ${more(`<dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`)}
      </div>
    </article>`;
  };
  const list = section({
    id: 'events', tone: 'dark', num: '01',
    head: secHead({ id: 'events', kicker: 'Know the Events', en: 'Five Events', jp: '5つの大会', lead: '大きな数字は、その大会をひと言で表す数です。' }),
    inner: `<div class="event-list">${arr(fmt.events).map(card).join('\n')}</div>`,
  });
  const link = section({
    id: 'connect', tone: 'cream', num: '02',
    head: secHead({ id: 'connect', kicker: 'How They Connect', en: 'Connected', jp: '大会のつながり', lead: 'Cup 1の先はMasters Valencia、Cup 2の先はChampions。' }),
    inner: `${flowStrip(fmt.flow)}
    <div class="btns rv sec-cta"><a class="btn btn--solid" href="season.html">1年の流れ ${ARROW}</a><a class="btn" href="rules.html">ルールと支援金</a></div>`,
  });
  return layout(ctx, {
    title: '大会の種類', current: 'format', source: 'data/format.json',
    desc: 'Open Qualifiers・Kickoff・Cup・Masters・Champions。VCT 2027の5つの大会をカードで紹介します。',
    body: [top, list, link, pagerSec(ctx, FORMAT_NAV)].join('\n'),
  });
}

function formatRulesPage() {
  const ctx = fmtCtx('format/rules.html');
  const top = hero(ctx, {
    variant: 'plain', kicker: 'Format — Rules',
    titleHtml: 'Rules &amp; <span class="r">Support</span>',
    catchHtml: 'パートナーも、オープンも。',
    crumbs: fmtCrumbs(ctx, 'ルールと支援金'),
  });
  const r = fmt?.rules;
  if (!r) return layout(ctx, { title: 'ルールと支援金', current: 'format', solidHead: true, desc: 'VCT 2027のルールと支援金(準備中)', body: [top, soonSection(ctx)].join('\n') });

  const lane = (cls, en, jp, steps, note = '', d = 0) => `<div class="lane lane--${cls} rv" style="--d:${d}">
      <div class="lane-label"><span class="lane-en">${en}</span><span class="lane-jp">${jp}</span></div>
      <ol class="lane-steps">${arr(steps).map((s) => `<li class="lane-step">${esc(s)}</li>`).join('')}</ol>
      ${note ? `<p class="lane-note">${esc(note)}</p>` : ''}
    </div>`;
  const paths = section({
    id: 'paths', tone: 'cream', num: '01',
    head: secHead({ id: 'paths', kicker: 'Two Paths', en: 'Open System', jp: 'パートナーとオープン', lead: 'どちらも最後は成績しだい。パートナーの保証はKickoffだけです。' }),
    inner: `<div class="paths">
      ${lane('partner', 'Partner', 'パートナー', r.partner_path, r.partner_else, 0)}
      ${lane('open', 'Open', 'オープン', r.open_path, '', 1)}
      <div class="paths-goal rv" style="--d:2"><span class="kicker">Goal</span><p class="paths-goal-t">${arr(r.goal).map(esc).join(' <span class="r" aria-hidden="true">→</span> ')}</p><span class="paths-goal-sub">成績しだいで、どちらの道からでも。</span></div>
    </div>`,
  });

  const keep = Number(r.roster_keep) || 3;
  const size = Number(r.roster_size) || 5;
  const roster = section({
    id: 'roster', tone: 'dark', num: '02',
    head: secHead({ id: 'roster', kicker: 'Roster Rule', en: `Keep ${keep} of ${size}`, jp: 'ロスター継続ルール', lead: esc(r.roster_line || '') }),
    inner: `<div class="keep rv">
      <div class="keep-ratio" aria-hidden="true"><span class="keep-big">${keep}</span><span class="keep-of">/${size}</span></div>
      <ol class="keep-slots" aria-label="${size}人中${keep}人が継続">${Array.from({ length: size }, (_, i) => `<li class="keep-slot${i < keep ? ' is-keep' : ''}" style="--d:${i}">${SILHOUETTE}<span>${i < keep ? 'KEEP' : 'NEW'}</span></li>`).join('')}</ol>
    </div>`,
  });

  const stip = arr(r.stipends).filter((s) => Number(s.amount) > 0);
  const support = section({
    id: 'support', tone: 'cream', num: '03',
    head: secHead({ id: 'support', kicker: 'Support', en: 'Stipends', jp: '支援金', lead: esc(r.stipend_line || '') }),
    inner: stip.length ? bars(stip.map((s) => ({ labelHtml: esc(s.label), value: Math.round(Number(s.amount) / 1000) })), { pre: '$', post: 'K' }) : '',
  });

  const regs = arr(r.regions);
  const segRegions = regs.filter((x) => arr(x.segments).length);
  const region = section({
    id: 'regions', tone: 'dark', num: '04',
    head: secHead({ id: 'regions', kicker: 'By Region', en: 'Kickoff 12', jp: '地域ごとの違い', lead: `Kickoffはどの地域も${esc(fmt.numbers?.kickoff_teams ?? 12)}チーム。中身が少しだけ違います。` }),
    inner: `<div class="segs">${segRegions.map((x, i) => `<div class="seg rv" style="--d:${i}">
        <span class="seg-name">${esc(x.region)}</span>
        <div class="seg-bar" role="img" aria-label="${esc(x.segments.map((s) => `${s.label}${s.n}`).join('・'))}">${x.segments.map((s) => Array.from({ length: Number(s.n) || 0 }, () => `<i class="seg-c seg-c--${esc(s.kind)}"></i>`).join('')).join('')}</div>
        <span class="seg-legend">${x.segments.map((s) => `<span class="seg-k seg-k--${esc(s.kind)}">${esc(s.label)} ${esc(s.n)}</span>`).join('')}</span>
      </div>`).join('')}</div>
      ${regs.length ? more(`<dl class="facts">${regs.map((x) => `<div><dt>${esc(x.region)}</dt><dd>${esc(x.text)}</dd></div>`).join('')}</dl>`) : ''}`,
  });

  return layout(ctx, {
    title: 'ルールと支援金', current: 'format', source: 'data/format.json', solidHead: true,
    desc: 'VCT 2027のオープン形式、ロスター継続ルール、非パートナーへの支援金を図で紹介します。',
    body: [top, paths, roster, support, region, pagerSec(ctx, FORMAT_NAV)].join('\n'),
  });
}

function formatGlossaryPage() {
  const ctx = fmtCtx('format/glossary.html');
  const top = hero(ctx, {
    variant: 'plain', kicker: 'Format — Glossary',
    titleHtml: 'Glossary &amp; <span class="r">FAQ</span>',
    catchHtml: 'わからない言葉は、ここで。',
    crumbs: fmtCrumbs(ctx, '用語集・FAQ'),
  });
  if (!fmt) return layout(ctx, { title: '用語集・FAQ', current: 'format', solidHead: true, desc: '用語集・FAQ(準備中)', body: [top, soonSection(ctx)].join('\n') });
  const gl = arr(fmt.glossary).filter((g) => g && g.term);
  const fq = arr(fmt.faq).filter((f) => f && f.q);
  const glossary = section({
    id: 'glossary', tone: 'cream', num: '01',
    head: secHead({ id: 'glossary', kicker: 'Glossary', en: 'Words', jp: '用語集', lead: '言葉をタップすると、説明が開きます。' }),
    inner: `<div class="acc-list">${gl.map((g, i) => acc(`<span class="acc-en">${esc(g.en || '')}</span><span class="acc-t">${esc(g.term)}</span>`, `<p>${esc(g.def)} ${g.status ? ctx.fact(g.term, { status: g.status }) : ''}</p>`, i)).join('\n')}</div>`,
  });
  const faq = section({
    id: 'faq', tone: 'dark', num: '02',
    head: secHead({ id: 'faq', kicker: 'FAQ', en: 'Questions', jp: 'よくある質問' }),
    inner: `<div class="acc-list">${fq.map((f, i) => acc(`<span class="acc-q" aria-hidden="true">Q</span><span class="acc-t">${esc(f.q)}</span>`, `<p>${esc(f.a)} ${f.status ? ctx.fact(f.q, { status: f.status }) : ''}</p>${Array.isArray(f.link) ? `<p class="acc-link"><a class="link-arrow" href="${ctx.P}${esc(f.link[0])}">${esc(f.link[1])} ${ARROW}</a></p>` : ''}`, i)).join('\n')}</div>`,
  });
  return layout(ctx, {
    title: '用語集・FAQ', current: 'format', source: 'data/format.json', solidHead: true,
    desc: 'VCT 2027の用語(パートナー、LCQ、トリプルエリミネーションなど)と、よくある質問。',
    body: [top, glossary, faq, pagerSec(ctx, FORMAT_NAV)].join('\n'),
  });
}

// ---------------------------------------------------------------- JAPAN(data/japan.json)
const numIn = (s, re, dflt) => { const m = str(s).match(re); return m ? Number(m[1]) : dflt; };
// 「2026年11月22日(日)・23日…」から最初と最後の日付を取り出す
function dateRange(s) {
  const t = str(s);
  const y = t.match(/(20\d\d)年/)?.[1] || '';
  const all = [...t.matchAll(/(?:(\d{1,2})月)?(\d{1,2})日/g)];
  if (!all.length || !all[0][1]) return null;
  let m = all[0][1];
  const pts = all.map((x) => { if (x[1]) m = x[1]; return `${pad2(m)}.${pad2(x[2])}`; });
  return { y, start: pts[0], end: pts.length > 1 ? pts[pts.length - 1] : '' };
}

function japanIndexPage() {
  const ctx = newPage('japan/index.html');
  const P = ctx.P;
  const img = ctx.siteImg('city-tokyo');
  const top = hero(ctx, {
    variant: 'page', img, kicker: 'Japan Qualifier — 2027',
    titleHtml: 'Road to <span class="r">Kickoff</span>',
    catchHtml: '日本から、VCTへ。',
    crumbs: crumbsHtml(ctx, [['index.html', 'HOME'], [null, '日本予選']]),
  });
  const J = japan;
  if (!J) return layout(ctx, { title: '日本予選', current: 'japan', desc: '日本予選(準備中)', body: [top, soonSection(ctx, [['teams/japan.html', '日本チーム']])].join('\n') });
  ctx.asOf = str(J.as_of);
  ctx.fact('日本予選の概要', J.summary);
  ctx.openQ.push(...arr(J.open_questions).filter((q) => typeof q === 'string' && q.trim() && !/^2021年|VCJ 2026 Split 1/.test(q)));

  const steps = arr(J.path).filter((s) => s && s.step);
  const find = (re) => steps.find((s) => re.test(s.step));
  const sOQ = find(/Open Qualifiers|オープン予選/);
  const sPO = find(/Playoffs/);
  const sFI = find(/Finals/);
  const sKO = find(/Kickoff$/);
  const sEntry = find(/エントリー/);
  const invited = arr(J.invited_teams).filter((x) => x && x.name);
  const invShort = invited.map((x) => (bySlug.has(String(x.slug)) ? shortOf(bySlug.get(String(x.slug))) : x.name)).join('・');
  // 数字は data/japan.json の文章から読み取る(読めなければ 2026-11 時点の値)
  const nPass = numIn(sOQ?.text, /(\d+)チームがPlayoffs/, 6);
  const nPO = numIn(sPO?.text, /計(\d+)チーム/, nPass + invited.length);
  const nFI = numIn(sPO?.text, /上位(\d+)チームがFinals/, 3);
  const nSlot = numIn(J.slots?.text, /出場枠は(\d+)枠/, 1);
  const ROAD = [
    sOQ && { s: sOQ, en: 'Open Qualifiers', jp: 'オープン予選', big: 'Open', sub: `誰でも参加 → ${nPass}チーム通過`, where: 'Online' },
    sPO && { s: sPO, en: 'Playoffs', jp: 'プレーオフ', big: String(nPO), sub: `${nPass}チーム＋招待${invited.length}`, where: 'Online', invite: invited.length > 0 },
    sFI && { s: sFI, en: 'Finals', jp: 'ファイナル', big: String(nFI), sub: `上位${nFI}チーム`, where: 'Theatre G-Rosso' },
    sKO && { s: sKO, en: 'Pacific Kickoff', jp: 'キックオフ', big: String(nSlot), sub: '優勝チームだけ', where: 'Bangkok', goal: true },
  ].filter(Boolean);
  for (const x of steps) ctx.fact(`日本予選：${x.step}`, x);

  const road = section({
    id: 'road', tone: 'dark', num: '01',
    head: secHead({ id: 'road', kicker: 'Road to Kickoff', en: 'The Road', jp: 'Kickoffまでの道', lead: `日本予選で優勝した${nSlot}チームだけが、1月のPacific Kickoffへ。` }),
    inner: `<ol class="road">${ROAD.map((x, i) => `<li class="road-node${x.goal ? ' road-node--goal' : ''} rv" style="--d:${i}">
        ${x.invite ? `<span class="road-invite"><b>+${invited.length}</b> 招待：${esc(invShort)}</span>` : ''}
        <span class="road-en">${esc(x.en)}</span>
        <span class="road-big${/^\d+$/.test(x.big) ? '' : ' road-big--word'}">${esc(x.big)}</span>
        <span class="road-sub">${esc(x.sub)}</span>
        <span class="road-where">${esc(x.where)}</span>
      </li>`).join('\n')}</ol>
      ${more(`<dl class="facts">${steps.map((x) => `<div><dt>${esc(x.step)}</dt><dd>${esc(x.text)}${x.dates ? `<br><span class="muted">${esc(x.dates)}</span>` : ''} ${status(x.status)}</dd></div>`).join('')}</dl>`, { open: 'MORE — 各段階のくわしい説明', close: 'CLOSE' })}`,
  });

  const tiles = ROAD.map((x) => ({ x, r: dateRange(x.s.dates) })).filter((t) => t.r);
  const deadline = str(sEntry?.dates).split('〜')[1] || '';
  const dates = section({
    id: 'dates', tone: 'cream', num: '02',
    head: secHead({ id: 'dates', kicker: 'Key Dates', en: 'Calendar', jp: '日程', lead: deadline ? `エントリー締切は ${esc(deadline)}。` : '' }),
    inner: `<ol class="grid grid--4 date-grid">${tiles.map(({ x, r }, i) => `<li class="date-tile${x.goal ? ' date-tile--goal' : ''} rv" style="--d:${i}">
        <span class="date-y">${esc(r.y)}</span>
        <span class="date-md">${esc(r.start)}</span>
        <span class="date-label">${esc(x.en)}</span>
        <span class="date-sub">${r.end ? `〜${esc(r.end)}` : ''}${status(x.s.status)}</span>
      </li>`).join('')}</ol>`,
  });

  const partnersJP = ['zeta-division', 'crazy-raccoon'].map((slug) => bySlug.get(slug) || { slug, name: teamName(slug), team_color: '#394656' });
  const cards = [
    ...invited.map((x) => ({ t: bySlug.get(String(x.slug)) || { slug: x.slug, name: x.name, team_color: '#394656' }, sub: 'Playoffs シード' })),
    ...partnersJP.map((t) => ({ t, sub: 'Kickoff 直接出場' })),
  ];
  invited.forEach((x) => ctx.fact(`${x.name} の招待`, x));
  const teamsSec = section({
    id: 'teams', tone: 'dark', num: '03',
    head: secHead({ id: 'teams', kicker: 'Seeded & Partners', en: 'Head Start', jp: '先に待つチーム', lead: `招待の${invited.length}チームはPlayoffsから。パートナーの2チームはKickoffから出場します。` }),
    inner: `<div class="grid grid--4">${cards.map((c, i) => teamCard(c.t, ctx, { href: bySlug.has(c.t.slug) ? `${P}teams/${c.t.slug}.html` : null, sub: c.sub, d: i })).join('\n')}</div>
      ${invited.length ? more(`<ul class="list-dots">${invited.map((x) => `<li><b>${esc(x.name)}</b>：${esc(x.reason)}</li>`).join('')}</ul>`, { open: 'MORE — 招待の理由', close: 'CLOSE' }) : ''}
      <div class="btns rv sec-cta"><a class="btn" href="${P}teams/japan.html">日本チームをすべて見る ${ARROW}</a></div>`,
  });

  const sCup = find(/Cup/);
  const nCup = numIn(J.slots?.text, /日本から毎回(\d+)チーム/, numIn(sCup?.text, /日本から各(\d+)チーム/, 3));
  ctx.fact('Cupへの枠', J.slots);
  const cup = section({
    id: 'cup', tone: 'cream', num: '04',
    head: secHead({ id: 'cup', kicker: 'After Kickoff', en: 'Cup Slots', jp: 'Cupへの枠' }),
    inner: `<div class="callout rv">
        <span class="callout-num" aria-hidden="true">${nCup}</span>
        <div class="callout-body"><p class="callout-t">Cup 1・Cup 2 に、日本から各${nCup}チーム。</p><p class="callout-sub">Cup 2の舞台は東京。日本予選の日程は未発表です。</p>
        <a class="link-arrow" href="${P}format/season.html">1年の流れを見る ${ARROW}</a></div>
      </div>
      ${more(`${J.slots?.text ? `<p>${esc(J.slots.text)}</p>` : ''}${sCup ? `<p style="margin-top:12px">${esc(sCup.text)}</p>` : ''}`)}`,
  });

  return layout(ctx, {
    title: '日本予選', current: 'japan', source: 'data/japan.json',
    desc: '2027 VCT Pacific Kickoff 日本予選の流れ・日程・招待チームを図で紹介します。',
    body: [top, road, dates, teamsSec, cup, pagerSec(ctx, JAPAN_NAV)].join('\n'),
  });
}

// 日本シーンの歴史(data/japan-history.json)
// 年ごとのブロック(大きな年数字＋時代名＋1行)と、縦の線に並ぶ出来事。PCでは 国内=左 / 国際・Pacific=右 の2レーン
const HIST_CATS = {
  '国内リーグ': { key: 'dom', lane: 'l', cls: 'dom' },
  'チーム・移籍': { key: 'org', lane: 'l', cls: 'team' },
  '国際大会': { key: 'intl', lane: 'r', cls: 'intl' },
  'VCT Pacific': { key: 'intl', lane: 'r', cls: 'pac' },
  '開催・イベント': { key: 'host', lane: 'r', cls: 'host' },
  '制度': { key: 'org', lane: 'r', cls: 'sys' },
};
const HIST_FILTERS = [['', 'すべて'], ['dom', '国内'], ['intl', '国際・Pacific'], ['host', '開催']];
function loadHistory() {
  const file = path.join(DATA, 'japan-history.json');
  if (!fs.existsSync(file)) { console.warn('! data/japan-history.json がまだありません'); return null; }
  const h = readJSON(file);
  return h && typeof h === 'object' && Array.isArray(h.events) ? h : null;
}
const MONTHS_EN = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
// 日付が月までのときは「AUG」のように月名だけを出す
const histDate = (d) => { const m = str(d).match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/); return m ? { y: +m[1], dot: m[3] ? `${m[2]}.${m[3]}` : (MONTHS_EN[+m[2] - 1] || m[2]), iso: m[0] } : null; };
const teamLogoFile = (slug) => assetPath(bySlug.get(slug)?.images?.logo) || assetPath(`assets/img/teams/${slug}/logo.png`);

function japanHistoryPage() {
  const ctx = newPage('japan/history.html');
  const P = ctx.P;
  const H = loadHistory();
  const TITLE = '日本シーンの歴史';
  const evs = arr(H?.events).map((e) => ({ ...e, d: histDate(e.date) })).filter((e) => e.d && str(e.title)).sort((a, b) => a.d.iso.localeCompare(b.d.iso));
  const years = [...new Set(evs.map((e) => e.d.y))].sort((a, b) => a - b);
  const span = years.length ? `${years[0]}–${years[years.length - 1]}` : '';
  const stats = arr(H?.stats).filter((s) => s && Number.isFinite(Number(s.value)));
  const top = hero(ctx, {
    variant: 'plain', kicker: `Japan — ${span || 'History'}`,
    titleHtml: 'Japan <span class="r">Story</span>',
    catchHtml: '2020年から、日本のVALORANTの歩み。',
    crumbs: crumbsHtml(ctx, [['index.html', 'HOME'], ['japan/index.html', '日本予選'], [null, TITLE]]),
    extra: stats.length ? `<div class="glance ld" style="--i:4">
      <span class="glance-k en">At a glance</span>
      <div class="stats stats--4">${stats.map((s) => `<div class="stat"><span class="stat-num"><span data-count="${Number(s.value)}">${Number(s.value)}</span>${s.unit ? `<small>${esc(s.unit)}</small>` : ''}</span><span class="stat-label">${esc(s.label)}${s.sub ? `<span class="stat-sub">${esc(s.sub)}</span>` : ''}</span></div>`).join('')}</div>
    </div>` : '',
  });
  if (!evs.length) return layout(ctx, { title: TITLE, current: 'japan', solidHead: true, desc: `${TITLE}(準備中)`, body: [top, soonSection(ctx, [['japan/index.html', '日本予選']])].join('\n') });
  ctx.asOf = str(H.as_of);
  ctx.openQ.push(...arr(H.open_questions).filter((q) => typeof q === 'string' && q.trim()));
  const eras = new Map(arr(H.eras).filter((x) => x && x.year).map((x) => [Number(x.year), x]));

  const teamTags = (e) => {
    const list = arr(e.teams).map((s) => String(s).toLowerCase()).filter((s) => bySlug.has(s));
    return list.length ? `<span class="ev-teams">${list.map((s) => `<a class="tag" href="${P}teams/${s}.html">${esc(bySlug.get(s).name)}</a>`).join('')}</span>` : '';
  };
  const row = (e, n) => {
    const c = HIST_CATS[str(e.category)] || { key: 'org', lane: 'r', cls: 'sys' };
    ctx.src(e.sources);
    if (e.status && e.status !== 'confirmed') ctx.checks.push({ label: `${e.d.y}年：${e.title}`, status: e.status });
    const meta = `<span class="ev-meta"><time class="ev-date" datetime="${esc(e.d.iso)}">${esc(e.d.dot)}</time><span class="ev-cat ev-cat--${c.cls}">${esc(e.category)}</span>${status(e.status)}</span>`;
    const attrs = `class="ev ev--${c.lane}${e.highlight ? ' ev--hl' : ''} rv" style="order:${n}" data-filter-key="${c.key}"`;
    if (e.highlight) {
      const slug = arr(e.teams).map((s) => String(s).toLowerCase()).find((s) => teamLogoFile(s));
      const logo = slug ? `<span class="ev-logo"><img src="${esc(assetSrc(teamLogoFile(slug), P))}" alt="${esc(teamName(slug))} のロゴ" loading="lazy"></span>` : '';
      return `<li ${attrs}>
        <article class="ev-card">
          <span class="ev-key en" aria-hidden="true">Key moment</span>
          ${meta}
          <div class="ev-main"><h4 class="ev-title">${esc(e.title)}</h4>${logo}</div>
          <p class="ev-text">${esc(e.text)}</p>
          ${teamTags(e)}
        </article>
      </li>`;
    }
    return `<li ${attrs}>
        <details class="ev-row">
          <summary>${meta}<span class="ev-title">${esc(e.title)}</span><span class="ev-plus" aria-hidden="true"></span></summary>
          <div class="more-body"><p class="ev-text">${esc(e.text)}</p>${teamTags(e)}</div>
        </details>
      </li>`;
  };
  const blocks = years.map((y) => {
    const era = eras.get(y);
    const list = evs.filter((e) => e.d.y === y);
    return `<section class="yr" id="y${y}" aria-labelledby="y${y}-h" data-filter-scope>
      <header class="yr-head rv">
        <h3 class="yr-num" id="y${y}-h"><span class="sr-only">${y}年 </span><span aria-hidden="true">${y}</span></h3>
        ${era ? `<p class="yr-label">${esc(era.label)}</p>${era.summary ? `<p class="yr-sum">${esc(era.summary)}</p>` : ''}` : ''}
      </header>
      <div class="yr-evs">${['l', 'r'].map((lane) => {
        const items = list.map((e, n) => ({ e, n })).filter(({ e }) => (HIST_CATS[str(e.category)]?.lane || 'r') === lane);
        return items.length ? `<ol class="yr-lane yr-lane--${lane}" aria-label="${lane === 'l' ? '国内' : '国際・Pacific・その他'}">${items.map(({ e, n }) => row(e, n)).join('\n')}</ol>` : `<div class="yr-lane yr-lane--${lane}" aria-hidden="true"></div>`;
      }).join('\n')}</div>
    </section>`;
  }).join('\n');

  const nowY = Number(str(H.as_of).slice(0, 4)) || 0;
  const ynav = `<nav class="ynav" aria-label="年へ移動">
    <div class="wrap ynav-bar">
      <span class="ynav-k en" aria-hidden="true">Jump</span>
      <ol class="ynav-list">${years.map((y) => `<li><a class="ynav-a${y === nowY ? ' is-now' : ''}" href="#y${y}"${y === nowY ? ' title="今年"' : ''}>${y}</a></li>`).join('')}</ol>
    </div>
  </nav>`;
  const chips = `<div class="chips hist-chips" data-filter-group="hist-tl" role="group" aria-label="出来事の種類で絞り込む" hidden>
    ${HIST_FILTERS.map(([k, l]) => `<button type="button" class="chip" data-filter="${k}" aria-pressed="${k ? 'false' : 'true'}">${l}</button>`).join('')}
  </div>`;
  const lanes = `<div class="tl2-lanes" aria-hidden="true"><span>国内</span><span>国際・Pacific</span></div>`;
  const timeline = `<div class="hist">
  ${ynav}
  ${section({
    id: 'timeline', tone: 'dark', cls: 'sec--hist',
    head: secHead({ id: 'timeline', kicker: 'Timeline', en: 'Year by Year', jp: '年ごとのあゆみ', lead: `${evs.length}の出来事でたどる${years.length}年。赤いカードが歴史を動かした瞬間です。` }),
    inner: `${chips}${lanes}<div class="tl2" id="hist-tl">${blocks}</div>`,
  })}
</div>`;

  const next = section({
    id: 'next', tone: 'cream', cls: 'sec--tight',
    head: secHead({ id: 'next', kicker: 'Next Chapter', en: 'Write the Next', jp: '次の1ページは、日本予選から。' }),
    inner: `<div class="btns rv"><a class="btn btn--solid" href="index.html">日本予選を見る ${ARROW}</a><a class="btn" href="${P}teams/japan.html">日本チーム</a></div>`,
  });

  return layout(ctx, {
    title: TITLE, current: 'japan', source: 'data/japan-history.json', solidHead: true,
    desc: '2020年から、日本のVALORANTの歩み。国内リーグ(VCJ)と、世界大会・VCT Pacificでの日本チームの歴史を年表で紹介します。',
    body: [top, timeline, next].join('\n'),
  });
}

// 旧URL → 新ページ
function redirectPage(to, label) {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="generator" content="${GENERATOR}">
<meta http-equiv="refresh" content="0; url=${to}">
<link rel="canonical" href="${to}">
<title>${esc(label)}｜${SITE}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0F1923;color:#ECE8E1;font-family:system-ui,sans-serif}a{color:#FF4655}</style>
</head>
<body>
<p>このページは移動しました。<a href="${to}">${esc(label)}へ移動する</a></p>
</body>
</html>
`;
}

// ---------------------------------------------------------------- cleanup
// このビルドで作らなかった生成ページ(generator の印があるもの)だけを消す
function cleanup(dirRel) {
  const dir = path.join(ROOT, dirRel);
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.html')) continue;
    const rel = dirRel ? `${dirRel}/${f}` : f;
    if (written.has(rel)) continue;
    const full = path.join(dir, f);
    if (fs.readFileSync(full, 'utf8').includes(`content="${GENERATOR}"`)) {
      fs.unlinkSync(full);
      console.log(`  removed ${rel}`);
    }
  }
}

// ---------------------------------------------------------------- run
console.log(`VCT build v2 — ${FIXTURE ? 'data + fixtures' : 'data'} / ${teams.length} team(s) / ${news.length} news / japan.json: ${japan ? 'yes' : 'no'}`);

writeFile('index.html', homePage());

writeFile('teams/index.html', teamsIndexPage());
writeFile('teams/pacific.html', teamsPacificPage());
writeFile('teams/japan.html', teamsJapanPage());
for (const t of teams) writeFile(`teams/${t.slug}.html`, teamPage(t));

writeFile('news/index.html', newsIndexPage());
for (const n of news) writeFile(`news/${n.id}.html`, newsPage(n));
writeFile('news/feed.xml', newsFeed());

writeFile('format/index.html', formatIndexPage());
writeFile('format/season.html', formatSeasonPage());
writeFile('format/events.html', formatEventsPage());
writeFile('format/rules.html', formatRulesPage());
writeFile('format/glossary.html', formatGlossaryPage());
writeFile('japan/index.html', japanIndexPage());
writeFile('japan/history.html', japanHistoryPage());

writeFile('format.html', redirectPage('format/index.html', '大会システム'));
writeFile('japan.html', redirectPage('japan/index.html', '日本予選'));
writeFile('news.html', redirectPage('news/index.html', 'ニュース'));

for (const d of ['teams', 'news', 'format', 'japan']) cleanup(d);
console.log('done.');
