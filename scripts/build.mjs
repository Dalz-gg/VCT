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
//   format/{index,season,events,rules,glossary}.html   大会システム(PHASE 2 で中身を作る。今は「準備中」)
//   teams/index.html                 チーム入口(Pacific / 日本)
//   teams/pacific.html               Pacific パートナー8チーム
//   teams/japan.html                 日本チーム(ロスター状況で絞り込み)
//   teams/<slug>.html                チーム詳細(タブ：概要 / 選手 / 実績 / ニュース)
//   japan/{index,history}.html       日本予選 / VCJの歴史(PHASE 2。今は「準備中」)
//   news/index.html, news/<id>.html  ニュース一覧・詳細、news/feed.xml
//   format.html / japan.html / news.html   旧URL → 新ページへの案内(meta refresh)
// リンクはすべて相対パス(file:// でも GitHub Pages のサブパスでも動く)。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const FIXTURE = args.has('--fixture');
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

const MENU = [
  { key: 'home', en: 'Home', jp: 'ホーム', href: 'index.html' },
  { key: 'format', en: 'Format', jp: '大会システム', href: 'format/index.html', items: [
    ['format/index.html', '概要'], ['format/season.html', '1年の流れ'], ['format/events.html', '大会の種類'],
    ['format/rules.html', 'ルールと支援金'], ['format/glossary.html', '用語集・FAQ']] },
  { key: 'teams', en: 'Teams', jp: 'チーム', href: 'teams/index.html', items: [
    ['teams/pacific.html', 'Pacific パートナー'], ['teams/japan.html', '日本チーム']] },
  { key: 'japan', en: 'Japan', jp: '日本', href: 'japan/index.html', items: [
    ['japan/index.html', '日本予選'], ['japan/history.html', 'VCJの歴史']] },
  { key: 'news', en: 'News', jp: 'ニュース', href: 'news/index.html' },
];
const HEAD_LINKS = [['format/index.html', '大会', 'format'], ['teams/index.html', 'チーム', 'teams'], ['japan/index.html', '日本', 'japan'], ['news/index.html', 'ニュース', 'news']];

// サイトロゴ：assets/img/site/logo.(svg|png|webp) があれば画像、なければ文字ロゴ
function logoSlot(P) {
  const logo = ['svg', 'png', 'webp'].map((x) => `assets/img/site/logo.${x}`).find((f) => assetPath(f));
  const inner = logo
    ? `<img src="${esc(P + logo)}" alt="${SITE}">`
    : `<span class="logo-mark" aria-hidden="true"></span><span class="logo-text">VCT <b>FAN</b></span>`;
  return `<a class="slot-logo" href="${P}index.html" aria-label="${SITE} ホームへ">${inner}</a>`;
}

function menuHtml(ctx) {
  const cur = (href) => (href === ctx.rel ? ' aria-current="page"' : '');
  const groups = MENU.map((g, i) => `<div class="menu-group menu-group--${g.key}" style="--i:${i}">
        <a class="menu-head" href="${ctx.P}${g.href}"${cur(g.href)}><span class="en">${esc(g.en)}</span><span class="jp">${esc(g.jp)}</span></a>
        ${g.items ? `<ul class="menu-items">${g.items.map(([h, l]) => `<li><a href="${ctx.P}${h}"${cur(h)}>${esc(l)}</a></li>`).join('')}</ul>` : ''}
      </div>`).join('\n      ');
  return `<details class="menu">
    <summary class="menu-btn" aria-label="メニュー"><span class="menu-open">MENU</span><span class="menu-close">CLOSE</span><span class="menu-ic" aria-hidden="true"><i></i><i></i><i></i></span></summary>
    <nav class="menu-panel" aria-label="サイトメニュー">
      <div class="wrap">
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

function layout(ctx, { title, desc, current, body, bodyStyle = '', source = 'data/', solidHead = false }) {
  const P = ctx.P;
  const fullTitle = title ? `${title}｜${SITE}` : `${SITE}｜VCTをもっと気軽に。もっと楽しく。`;
  return `<!doctype html>
<html lang="ja">
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
    <nav class="head-links" aria-label="主なページ">${HEAD_LINKS.map(([h, l, k]) => `<a href="${P}${h}"${current === k ? ' aria-current="true"' : ''}>${l}</a>`).join('')}</nav>
    ${menuHtml(ctx)}
  </div>
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

const crumbsHtml = (ctx, items) => `<nav class="crumbs ld" style="--i:0" aria-label="パンくずリスト">${items.map(([h, l], i) => (h ? `<a href="${ctx.P}${h}">${esc(l)}</a>` : `<span>${esc(l)}</span>`) + (i < items.length - 1 ? '<span aria-hidden="true">/</span>' : '')).join('')}</nav>`;

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

  const top = hero(ctx, {
    variant: 'home', img: heroImg, kicker: 'Unofficial Fan Guide — 2027 Season',
    titleHtml: '<span class="ld-rise" style="--i:1">VCT</span> <span class="ld-rise r" style="--i:2">FAN</span>', titleLabel: 'VCT FAN',
    catchHtml: 'VCTをもっと気軽に。<br>もっと楽しく。',
    lead: 'VALORANTの世界大会を、はじめての人にもひと目で。',
    btns: `<a class="btn btn--solid" href="${P}format/index.html">大会のしくみ ${ARROW}</a><a class="btn" href="${P}teams/index.html">チームを見る</a>`,
    extra: `<div class="stats ld" style="--i:5">
      <div class="stat"><span class="stat-num" data-count="${pac.length || 8}">${pac.length || 8}</span><span class="stat-label">Pacific<br>パートナー</span></div>
      <div class="stat"><span class="stat-num" data-count="3">3</span><span class="stat-label">シーズンの<br>サイクル</span></div>
      <div class="stat"><span class="stat-num" data-count="12">12</span><span class="stat-label">Kickoff<br>出場チーム</span></div>
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
  ctx.checks.push({ label: 'Cup 2 東京の日程(8月)', status: 'reported' }, { label: 'Cup 2 の会場・チケット', status: 'unverified' });
  ctx.src([{ title: 'ゲームウィズ:VCT 2027 日程', url: 'https://gamewith.jp/valorant/article/show/583037' }, { title: 'Sheep Esports:VCT Pacific 2027 dates', url: 'https://www.sheepesports.com/de/articles/masters-seoul-final-rescheduled-as-vct-pacific-confirms-2027-dates/en' }]);
  const band = `<section class="band" id="tokyo" aria-labelledby="tokyo-h">
  ${tokyo ? `<div class="hero-media"><img src="${esc(tokyo.src)}" alt="" loading="lazy"></div>` : ''}
  <div class="wrap hero-inner">
    <span class="kicker rv">Pacific Cup 2 — 2027.08</span>
    <h2 class="band-title rv" style="--d:1" id="tokyo-h" aria-label="東京でCup 2">Tokyo</h2>
    <p class="band-line rv" style="--d:2">2027年8月、Pacificの決戦が東京へ。 ${status('reported')}</p>
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

// ---------------------------------------------------------------- placeholders (PHASE 2 で中身を作る)
function placeholderPage(rel, { title, kicker, en, catchText, current, img = null, crumbs, related = [] }) {
  const ctx = newPage(rel);
  const im = img ? ctx.siteImg(img) : null;
  const top = hero(ctx, {
    variant: im ? 'page' : 'plain', img: im, kicker,
    titleHtml: en, catchHtml: esc(catchText),
    crumbs: crumbsHtml(ctx, crumbs),
  });
  const body = section({ id: 'soon', tone: 'cream', inner: soonPanel(ctx, 'このページは準備中です。', related) });
  return layout(ctx, { title, current, desc: `${title}(準備中)`, body: [top, body].join('\n'), solidHead: !im });
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

const PH = [
  ['format/index.html', { title: '大会システム', kicker: 'Format — 2027', en: 'How VCT <span class="r">Works</span>', catchText: '2027年、VCTはトーナメント中心に。', current: 'format', img: 'champions-la-2023', crumbs: [['index.html', 'HOME'], [null, '大会システム']], related: [['format/season.html', '1年の流れ'], ['format/events.html', '大会の種類']] }],
  ['format/season.html', { title: '1年の流れ', kicker: 'Format — Season', en: 'The <span class="r">Season</span>', catchText: '予選 → 地域大会 → 世界大会を、3回。', current: 'format', crumbs: [['index.html', 'HOME'], ['format/index.html', '大会システム'], [null, '1年の流れ']], related: [['format/index.html', '大会システム概要']] }],
  ['format/events.html', { title: '大会の種類', kicker: 'Format — Events', en: 'The <span class="r">Events</span>', catchText: 'Kickoff・Cup・Masters・Champions。', current: 'format', crumbs: [['index.html', 'HOME'], ['format/index.html', '大会システム'], [null, '大会の種類']], related: [['format/index.html', '大会システム概要']] }],
  ['format/rules.html', { title: 'ルールと支援金', kicker: 'Format — Rules', en: 'Rules &amp; <span class="r">Support</span>', catchText: 'オープン形式と、パートナーのルール。', current: 'format', crumbs: [['index.html', 'HOME'], ['format/index.html', '大会システム'], [null, 'ルールと支援金']], related: [['format/index.html', '大会システム概要']] }],
  ['format/glossary.html', { title: '用語集・FAQ', kicker: 'Format — Glossary', en: 'Glossary &amp; <span class="r">FAQ</span>', catchText: 'わからない言葉は、ここで。', current: 'format', crumbs: [['index.html', 'HOME'], ['format/index.html', '大会システム'], [null, '用語集・FAQ']], related: [['format/index.html', '大会システム概要']] }],
  ['japan/index.html', { title: '日本予選', kicker: 'Japan — Road to Kickoff', en: 'Japan <span class="r">Qualifier</span>', catchText: '日本から、VCTへ。', current: 'japan', img: 'city-tokyo', crumbs: [['index.html', 'HOME'], [null, '日本予選']], related: [['teams/japan.html', '日本チーム'], ['japan/history.html', 'VCJの歴史']] }],
  ['japan/history.html', { title: 'VCJの歴史', kicker: 'Japan — History', en: 'VCJ <span class="r">History</span>', catchText: '2021〜2026、日本のリーグのあゆみ。', current: 'japan', crumbs: [['index.html', 'HOME'], ['japan/index.html', '日本予選'], [null, 'VCJの歴史']], related: [['japan/index.html', '日本予選']] }],
];
for (const [rel, o] of PH) writeFile(rel, placeholderPage(rel, o));

writeFile('format.html', redirectPage('format/index.html', '大会システム'));
writeFile('japan.html', redirectPage('japan/index.html', '日本予選'));
writeFile('news.html', redirectPage('news/index.html', 'ニュース'));

for (const d of ['teams', 'news', 'format', 'japan']) cleanup(d);
console.log('done.');
