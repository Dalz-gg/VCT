#!/usr/bin/env node
// VCT ファンガイド ビルドスクリプト(Node 22 / 標準ライブラリのみ)
//
//   node scripts/build.mjs            data/teams/*.json からチームページを生成
//   node scripts/build.mjs --fixture  scripts/fixtures/*.json(テスト用の架空データ)で生成
//
// 生成・更新するもの
//   teams/index.html           チーム一覧(地域タブ)
//   teams/<slug>.html          チーム詳細
//   index.html / format.html   <!-- BUILD:xxx --> ～ <!-- /BUILD:xxx --> の間だけを書き換え
//                              (チームストリップ、画像クレジット)
// すべてのリンクは相対パスなので、file:// でも GitHub Pages のサブパスでも動きます。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const FIXTURE = args.has('--fixture');
const TEAMS_SRC = FIXTURE ? path.join(ROOT, 'scripts', 'fixtures') : path.join(ROOT, 'data', 'teams');
const OUT_TEAMS = path.join(ROOT, 'teams');
const GENERATOR = 'vct-fan-build';

const REGIONS = [
  { id: 'pacific', key: 'Pacific', label: 'Pacific', jp: 'アジア太平洋' },
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

const LINK_LABELS = {
  official: '公式サイト', x: 'X(旧Twitter)', twitter: 'X(旧Twitter)', youtube: 'YouTube', twitch: 'Twitch',
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

function safeUrl(u) {
  if (typeof u !== 'string') return null;
  const s = u.trim();
  try {
    const url = new URL(s);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
  } catch { /* ignore */ }
  return null;
}

// サイト内の画像パス(assets/ 以下で実在するもののみ)を、ページ位置からの相対パスにする
function assetSrc(p, prefix) {
  if (typeof p !== 'string') return null;
  const s = p.trim().replace(/^\.\//, '').replace(/^\//, '');
  if (!/^assets\/[A-Za-z0-9_\-./]+\.(jpe?g|png|webp|gif|avif|svg)$/i.test(s) || s.includes('..')) return null;
  if (!fs.existsSync(path.join(ROOT, s))) return null;
  return prefix + s.split('/').map(encodeURIComponent).join('/');
}

const asField = (x) => {
  if (x == null) return null;
  if (typeof x === 'string') return x.trim() ? { text: x } : null;
  if (typeof x === 'object' && !Array.isArray(x)) return (x.text ?? '').toString().trim() ? x : null;
  return null;
};
const arr = (x) => (Array.isArray(x) ? x : []);

function badge(status) {
  const s = STATUS[status];
  if (!s) return '';
  return `<span class="badge ${s.cls}" title="${esc(s.title)}">${esc(s.text)}</span>`;
}

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

function replaceBlock(html, name, content) {
  const re = new RegExp(`(<!-- BUILD:${name} -->)[\\s\\S]*?(<!-- /BUILD:${name} -->)`);
  if (!re.test(html)) { console.warn(`! マーカー BUILD:${name} が見つかりません`); return html; }
  return html.replace(re, `$1\n${content}\n$2`);
}

function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  console.log(`  wrote ${path.relative(ROOT, file)}`);
}

// ---------------------------------------------------------------- data
const credits = readJSON(path.join(ROOT, 'data', 'credits.json')) || { images: [] };
const partners = readJSON(path.join(ROOT, 'data', 'pacific-partners.json'));

const teams = [];
if (fs.existsSync(TEAMS_SRC)) {
  for (const f of fs.readdirSync(TEAMS_SRC).filter((n) => n.endsWith('.json')).sort()) {
    const t = readJSON(path.join(TEAMS_SRC, f));
    if (!t || typeof t !== 'object') continue;
    const slug = String(t.slug || f.replace(/\.json$/, '')).toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) { console.warn(`! slug が不正です: ${f}`); continue; }
    if (slug === 'index') continue;
    t.slug = slug;
    t.name = t.name || slug;
    teams.push(t);
  }
}
const bySlug = new Map(teams.map((t) => [t.slug, t]));

// ---------------------------------------------------------------- shell
const FONTS = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=JetBrains+Mono:wght@500;700&family=Noto+Sans+JP:wght@400;500;700;900&display=swap';

function creditItems(list, prefix) {
  return list.map((c) => {
    const src = safeUrl(c.source_url);
    const lic = safeUrl(c.license_url);
    const title = c.title || (c.file ? c.file.split('/').pop() : '画像');
    const t = src ? `<a href="${esc(src)}" rel="noopener">${esc(title)}</a>` : esc(title);
    const l = lic ? `<a href="${esc(lic)}" rel="noopener license">${esc(c.license || 'ライセンス')}</a>` : esc(c.license || '');
    return `<li>${t} — 撮影・作者：${esc(c.author || '不明')} / ${l}${c.modified ? `(${esc(c.modified)})` : ''}</li>`;
  }).join('\n');
}

function creditsBlock(list, prefix) {
  if (!list.length) return '<h2>画像クレジット</h2>\n<p>このページでは写真を使用していません。</p>';
  return `<h2>画像クレジット</h2>\n<ul>\n${creditItems(list, prefix)}\n</ul>`;
}

function shell({ title, desc, prefix, current, body, creditsHtml, styleVars = '' }) {
  const nav = (href, label, key, cls = '') => `<a href="${prefix}${href}"${cls ? ` class="${cls}"` : ''}${current === key ? ' aria-current="page"' : ''}>${label}</a>`;
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
<script>document.documentElement.classList.add('js')</script>
<script src="${prefix}assets/js/site.js" defer></script>
</head>
<body${styleVars ? ` style="${styleVars}"` : ''}>
<!-- このファイルは scripts/build.mjs が生成しています。直接編集せず、data/teams/*.json を更新してから再ビルドしてください。 -->
<a class="skip" href="#main">本文へスキップ</a>
<header class="site-head">
  <div class="wrap bar">
    <a class="brand" href="${prefix}index.html" aria-label="VCT ファンガイド トップへ"><span class="brand-mark" aria-hidden="true"></span><span class="brand-name">VCT <b>FAN</b> GUIDE</span><span class="brand-tag">UNOFFICIAL</span></a>
    <nav class="gnav" aria-label="サイト内メニュー">
      ${nav('index.html', 'トップ', 'home', 'nav-home')}
      ${nav('format.html', '大会システム', 'format')}
      ${nav('teams/index.html', 'チーム紹介', 'teams')}
    </nav>
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
        <nav class="foot-nav" aria-label="フッターメニュー"><a href="${prefix}index.html">トップ</a><a href="${prefix}format.html">大会システム</a><a href="${prefix}teams/index.html">チーム紹介</a></nav>
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

// ---------------------------------------------------------------- team detail
function teamPage(t) {
  const prefix = '../';
  const sources = [];
  const srcIndex = new Map();
  const cite = (list) => {
    const refs = arr(list).map(safeUrl).filter(Boolean).map((u) => {
      if (!srcIndex.has(u)) { sources.push(u); srcIndex.set(u, sources.length); }
      const n = srcIndex.get(u);
      return `<a href="#src-${n}" aria-label="出典${n}">[${n}]</a>`;
    });
    return refs.length ? ` <sup class="small">${refs.join('')}</sup>` : '';
  };
  const statusLine = (f) => (f ? `${badge(f.status)}${cite(f.sources)}` : '');

  const short = shortOf(t);
  const heroSrc = assetSrc(t.images?.hero, prefix);
  const base = asField(t.base);
  const partner = asField(t.partner);
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

  const sec = (id, en, jp, inner, extra = '') => `<section class="tsec" id="${id}" aria-labelledby="${id}-h">
  <div class="kick">${esc(en)}</div>
  <h2 class="h2" id="${id}-h">${esc(jp)}</h2>
  ${extra}${inner}
</section>`;

  const parts = [];

  // 基本情報
  const facts = [];
  facts.push(['チーム名', `${esc(t.name)}${t.name_kana ? `(${esc(t.name_kana)})` : ''}`]);
  if (t.short) facts.push(['略称', esc(t.short)]);
  if (t.region) facts.push(['地域', esc(t.region)]);
  if (t.country) facts.push(['国・地域', esc(t.country)]);
  if (base) facts.push(['拠点', `${esc(base.text)} ${statusLine(base)}`]);
  if (partner) facts.push(['パートナー', `${esc(partner.text)} ${statusLine(partner)}`]);
  parts.push(sec('info', 'BASIC INFO', '基本情報', `<dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`));

  // 歩み
  if (history) {
    parts.push(sec('history', 'HISTORY', '歩み', `<div class="card c14"><p>${esc(history.text)}</p><p class="small" style="margin-top:10px">${statusLine(history)}</p></div>`));
  }

  // 実績
  if (achievements.length) {
    parts.push(sec('achievements', 'ACHIEVEMENTS', '実績', `<ul class="ach">${achievements.map((a) => `<li><div>${esc(a.text)} ${statusLine(a)}</div></li>`).join('')}</ul>`));
  }

  // ロスター
  if (roster) {
    const head = `<div class="sublabel"><span>${roster.as_of ? `${esc(roster.as_of)} 時点` : '時点不明'}</span>${badge(roster.status)}${cite(roster.sources)}</div>`;
    const cards = players.map((p) => {
      const ph = assetSrc(p.photo, prefix);
      const photo = ph
        ? `<img src="${esc(ph)}" alt="${esc(p.ign)}選手の写真" loading="lazy">`
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
    const empty = players.length ? '' : '<p class="muted">ロスター情報は準備中です。</p>';
    parts.push(sec('roster', 'ROSTER', '選手・スタッフ', `${empty}<div class="roster">${cards}</div>${staffHtml}`, head));
  }

  // 注目選手
  if (featured.length) {
    parts.push(sec('featured', 'PLAYERS TO WATCH', '注目選手', `<div class="feat">${featured.map((f) => `<div class="c10">${draftNote(f)}<div class="pl-ign">${esc(f.ign)}</div>${f.why ? `<p class="soft" style="margin-top:6px">${esc(f.why)}</p>` : ''}</div>`).join('')}</div>`));
  }
  if (playstyle) {
    parts.push(sec('playstyle', 'PLAYSTYLE', 'プレースタイル', `${draftNote(playstyle)}<div class="card c14"><p>${esc(playstyle.text)}</p></div>`));
  }
  if (highlights) {
    parts.push(sec('highlights', '2027 HIGHLIGHTS', '2027年の見どころ', `${draftNote(highlights)}<div class="card c14"><p>${esc(highlights.text)}</p></div>`));
  }
  if (tip) {
    parts.push(sec('tip', 'FOR BEGINNERS', '初心者向けひと言', `${draftNote(tip)}<p class="quote c14">${esc(tip.text)}</p>`));
  }
  if (links.length) {
    parts.push(sec('links', 'LINKS', 'リンク', `<div class="links">${links.map(([k, u]) => `<a class="c8" href="${esc(u)}" rel="noopener">${esc(LINK_LABELS[k] || k)} <span aria-hidden="true">↗</span></a>`).join('')}</div>`));
  }
  if (openQ.length) {
    parts.push(sec('open', 'TO BE CONFIRMED', '確認できていない点', `<ul class="list">${openQ.map((q) => `<li>${esc(q)}</li>`).join('')}</ul>`));
  }

  // 出典(最後に集計)
  const legend = `<div class="legend" style="margin-bottom:14px"><span class="badge ok">確定</span>公式・チームの発表 <span class="badge rep">報道ベース</span>メディア報道など <span class="badge unk">未確認</span>確認中</div>`;
  const srcHtml = sources.length
    ? `${legend}<ol class="srclist">${sources.map((u, i) => `<li id="src-${i + 1}"><a href="${esc(u)}" rel="noopener">${esc(u)}</a></li>`).join('')}</ol>`
    : `${legend}<p class="muted">出典は準備中です。</p>`;
  const researched = t.researched_at ? `<p class="note" style="margin-top:12px">調査日：${esc(t.researched_at)}</p>` : '';
  parts.push(sec('sources', 'SOURCES', '出典', srcHtml + researched));

  const heroBg = heroSrc
    ? `<div class="thero-bg"><img src="${esc(heroSrc)}" alt="" fetchpriority="high"></div>`
    : '<div class="thero-bg fallback" aria-hidden="true"></div>';
  const tags = [t.region, t.country].filter(Boolean).map((x) => `<span class="tag">${esc(x)}</span>`).join('');
  const partnerTag = partner ? `<span class="tag">${esc(partner.text)}</span>` : '';

  const body = `<section class="thero">
  ${heroBg}
  <div class="wrap thero-inner">
    <nav class="crumbs" aria-label="パンくずリスト"><a href="${prefix}index.html">トップ</a><span aria-hidden="true">/</span><a href="index.html">チーム紹介</a><span aria-hidden="true">/</span><span>${esc(t.name)}</span></nav>
    <div class="short">${esc(short)}</div>
    <h1>${esc(t.name)}</h1>
    ${t.name_kana ? `<div class="kana">${esc(t.name_kana)}</div>` : ''}
    <div class="tags">${tags}${partnerTag}</div>
  </div>
</section>
<div class="wrap">
${parts.join('\n')}
<p style="margin-top:48px"><a class="btn ghost" href="index.html">← チーム一覧へ戻る</a></p>
</div>`;

  const imgCredits = arr(t.image_credits).filter((c) => c && (c.file || c.source_url));
  return shell({
    title: `${t.name}${t.name_kana ? `(${t.name_kana})` : ''}｜チーム紹介｜VCT ファンガイド`,
    desc: `${t.name}のチーム紹介。歩み、実績、選手、見どころを初心者向けにまとめています。`,
    prefix,
    current: 'teams',
    body,
    styleVars: teamVars(t.team_color),
    creditsHtml: creditsBlock(imgCredits, prefix),
  });
}

// ---------------------------------------------------------------- team index
function teamCard(t, prefix, linked) {
  const heroSrc = linked ? assetSrc(t.images?.hero, prefix) : null;
  const short = shortOf(t);
  const hero = heroSrc
    ? `<img src="${esc(heroSrc)}" alt="" loading="lazy">`
    : `<div class="fallback"><span>${esc(short)}</span></div>`;
  const meta = [t.country, linked ? null : '準備中'].filter(Boolean).map((m) => `<span>${esc(m)}</span>`).join('');
  const inner = `<div class="tcard-hero">${hero}</div>
  <div class="tcard-body">
    <div class="tcard-name">${esc(t.name)}</div>
    ${t.name_kana ? `<div class="tcard-kana">${esc(t.name_kana)}</div>` : ''}
    <div class="tcard-meta">${meta}</div>
  </div>`;
  const style = `style="${teamVars(t.team_color)}"`;
  return linked
    ? `<div class="rv"><a class="tcard c14" href="${esc(t.slug)}.html" ${style}>${inner}</a></div>`
    : `<div class="rv"><div class="tcard c14 is-soon" ${style} aria-label="${esc(t.name)}(準備中)">${inner}</div></div>`;
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

function teamsIndex() {
  const prefix = '../';
  const tabs = REGIONS.map((r) => `<button class="tab" role="tab" id="tab-${r.id}" aria-controls="panel-${r.id}" aria-selected="${r.id === ACTIVE_REGION}" tabindex="${r.id === ACTIVE_REGION ? 0 : -1}">${esc(r.label)}${r.id === ACTIVE_REGION ? '' : ' <small>準備中</small>'}</button>`).join('');
  const panels = REGIONS.map((r) => {
    let content;
    if (r.id === 'pacific') {
      const list = pacificOrder();
      const note = partners ? `<p class="lead">2027〜2028年のVCT Pacificパートナー8チームです ${badge(partners.status)}。チーム名をクリックすると、詳しい紹介ページが開きます。</p>` : '';
      content = list.length ? `${note}<div class="tcards">${list.map((x) => teamCard(x.team, prefix, x.linked)).join('\n')}</div>` : '<div class="soon-panel c14"><div class="en">COMING SOON</div><p>チーム紹介は準備中です。</p></div>';
    } else {
      const list = teams.filter((t) => String(t.region || '').toLowerCase() === r.key.toLowerCase());
      content = list.length
        ? `<div class="tcards">${list.map((t) => teamCard(t, prefix, true)).join('\n')}</div>`
        : `<div class="soon-panel c14"><div class="en">COMING SOON</div><p><b>${esc(r.label)}(${esc(r.jp)})</b>のチーム紹介は準備中です。</p><p class="muted small">まずはPacificのチームから順番に紹介しています。</p></div>`;
    }
    return `<div class="panel" role="tabpanel" id="panel-${r.id}" aria-labelledby="tab-${r.id}"${r.id === ACTIVE_REGION ? '' : ' hidden'}>
${content}
</div>`;
  }).join('\n');

  const sitePhotos = arr(credits.images).filter((c) => arr(c.pages).includes('teams/index.html'));
  const heroPhoto = sitePhotos[0] ? assetSrc(sitePhotos[0].file, prefix) : null;
  // 一覧に表示したチームのヒーロー画像のクレジット
  const teamHeroCredits = [];
  for (const x of pacificOrder().concat(teams.filter((t) => String(t.region || '').toLowerCase() !== 'pacific').map((t) => ({ team: t, linked: true })))) {
    if (!x.linked) continue;
    const hero = x.team.images?.hero;
    if (!assetSrc(hero, prefix)) continue;
    const c = arr(x.team.image_credits).find((ic) => ic && ic.file === hero);
    if (c && !teamHeroCredits.includes(c)) teamHeroCredits.push({ ...c, title: c.title || `${x.team.name} のカード画像` });
  }

  const body = `<section class="hero" style="min-height:0;padding:56px 0 48px">
  ${heroPhoto ? `<div class="hero-photo" style="background-image:url('${esc(heroPhoto)}')" role="img" aria-label="${esc(sitePhotos[0].title || '')}"></div>` : ''}
  <div class="gridbg" aria-hidden="true"></div>
  <div class="wrap hero-inner">
    <div class="hero-copy">
      <div class="kick">TEAMS / 2027 SEASON</div>
      <h1 class="hero-title" style="font-size:clamp(64px,16vw,150px)"><span>Meet the</span> <span class="r">Teams</span></h1>
      <p class="hero-catch" style="font-size:clamp(22px,5vw,34px)">推しチームを、見つけよう。</p>
      <p class="hero-lead">まずはPacific(アジア太平洋)のパートナー8チームを紹介します。Americas・EMEA・Chinaは準備中です。情報には「確定」「報道ベース」「未確認」の印を付けています。</p>
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
    desc: 'VCT 2027 Pacificのパートナーチームを、はじめての人向けに紹介します。',
    prefix,
    current: 'teams',
    body,
    creditsHtml: creditsBlock([...sitePhotos, ...teamHeroCredits], prefix),
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
  const list = pacificOrder().filter((x) => arr(partners?.teams).some((p) => p.slug === x.team.slug));
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

const pageCredits = (page) => creditsBlock(arr(credits.images).filter((c) => arr(c.pages).includes(page)), '');

// ---------------------------------------------------------------- run
console.log(`VCT build — ${FIXTURE ? 'fixture mode (scripts/fixtures)' : 'data/teams'} / ${teams.length} team(s)`);
fs.mkdirSync(OUT_TEAMS, { recursive: true });

// 古い生成ページの削除(このビルドで生成しないチームページのみ。手書きのページは消さない)
const keep = new Set(teams.map((t) => `${t.slug}.html`));
for (const f of fs.readdirSync(OUT_TEAMS)) {
  if (!f.endsWith('.html') || f === 'index.html' || keep.has(f)) continue;
  const full = path.join(OUT_TEAMS, f);
  if (fs.readFileSync(full, 'utf8').includes(`content="${GENERATOR}"`)) {
    fs.unlinkSync(full);
    console.log(`  removed ${path.relative(ROOT, full)}`);
  }
}

for (const t of teams) writeFile(path.join(OUT_TEAMS, `${t.slug}.html`), teamPage(t));
writeFile(path.join(OUT_TEAMS, 'index.html'), teamsIndex());
updateStaticPage('index.html', { TEAMTILES: teamTiles(), TEAMSTRIP: teamStrip(), CREDITS: pageCredits('index.html') });
updateStaticPage('format.html', { CREDITS: pageCredits('format.html') });
console.log('done.');
