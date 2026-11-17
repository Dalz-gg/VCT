#!/usr/bin/env node
// X(Twitter)の投稿情報を取得して、ニュースの x_image と data/x-posts.json(埋め込みの代替テキスト用)を埋めます。
// Node 標準ライブラリ(fetch)のみ。画像はダウンロードせず、投稿自身の画像 URL(pbs.twimg.com)を記録するだけです。
//
//   node scripts/fetch-x.mjs            まだ x_image が無いニュースと、未取得の投稿だけ取得
//   node scripts/fetch-x.mjs --force    すべて取り直す
//   node scripts/fetch-x.mjs <id>...    指定したニュースだけ(例 2026-11-13-t1-tenz-crashies-sacy)
//
// 使う窓口：https://cdn.syndication.twimg.com/tweet-result?id=<id>&token=a(X の公式埋め込みが使う公開エンドポイント)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NEWS_DIR = path.join(ROOT, 'data', 'news');
const CACHE_FILE = path.join(ROOT, 'data', 'x-posts.json');
const argv = process.argv.slice(2);
const FORCE = argv.includes('--force');
const only = new Set(argv.filter((a) => !a.startsWith('--')));
const MIN_POSTER_BYTES = 15000; // これより小さい動画サムネイルは真っ黒な1コマのことが多いので使わない

const POST_RE = /^https:\/\/(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})(?:[/?#].*)?$/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 𝐖𝐞𝐥𝐜𝐨𝐦𝐞 のような装飾文字を普通の文字に、URL を除いて1行に
function cleanText(t) {
  return String(t || '').normalize('NFKC').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
}
const cut = (s, n) => ([...s].length > n ? [...s].slice(0, n - 1).join('') + '…' : s);

// pbs.twimg.com の画像を medium サイズに
function mediumUrl(u) {
  const url = new URL(u);
  if (url.hostname !== 'pbs.twimg.com') return null;
  const m = url.pathname.match(/^\/media\/([A-Za-z0-9_-]+)\.(jpg|jpeg|png|webp)$/);
  if (m) return `https://pbs.twimg.com/media/${m[1]}?format=${m[2] === 'png' ? 'png' : 'jpg'}&name=medium`;
  return `https://pbs.twimg.com${url.pathname}?name=medium`;
}

async function getTweet(id) {
  const res = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=a`, { headers: { accept: 'application/json' } });
  if (res.status === 404) return { deleted: true };
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = JSON.parse(await res.text());
  if (!j || j.__typename === 'TweetTombstone' || !j.user) return { deleted: true };
  return j;
}

async function posterOk(u) {
  try {
    const r = await fetch(u);
    if (!r.ok) return false;
    const b = await r.arrayBuffer();
    return b.byteLength >= MIN_POSTER_BYTES;
  } catch { return false; }
}

const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const cache = readJSON(CACHE_FILE, { _note: '', posts: {} });
cache._note = 'scripts/fetch-x.mjs が生成します。X の埋め込みが読み込めないときに表示する代替テキスト(投稿の抜粋・アカウント・日付)です。手で編集しないでください。';
cache.posts ||= {};

async function postInfo(url, id, user) {
  const key = `https://x.com/${user}/status/${id}`;
  if (!FORCE && cache.posts[key]) return { key, info: cache.posts[key], tweet: null };
  const t = await getTweet(id);
  await sleep(350);
  if (t.deleted) {
    cache.posts[key] = { id, account: `@${user}`, deleted: true, fetched_at: new Date().toISOString().slice(0, 10) };
    return { key, info: cache.posts[key], tweet: null };
  }
  const info = {
    id,
    account: `@${t.user.screen_name}`,
    name: cleanText(t.user.name),
    date: String(t.created_at || '').slice(0, 10),
    text: cut(cleanText(t.text), 140),
    fetched_at: new Date().toISOString().slice(0, 10),
  };
  cache.posts[key] = info;
  return { key, info, tweet: t };
}

let changed = 0;
const files = fs.readdirSync(NEWS_DIR).filter((f) => f.endsWith('.json')).sort();
for (const f of files) {
  const file = path.join(NEWS_DIR, f);
  const raw = fs.readFileSync(file, 'utf8');
  const n = JSON.parse(raw);
  const id = n.id || f.replace(/\.json$/, '');
  if (only.size && !only.has(id)) continue;
  const posts = (Array.isArray(n.x_posts) ? n.x_posts : []).filter((u) => typeof u === 'string');
  if (!posts.length) { console.log(`- ${id}: x_posts なし`); continue; }

  const needImage = FORCE || !n.x_image;
  let picked = null;
  for (const u of posts) {
    const m = u.trim().match(POST_RE);
    if (!m) { console.warn(`! ${id}: X の投稿 URL ではありません: ${u}`); continue; }
    let r;
    try { r = await postInfo(u, m[2], m[1]); } catch (e) { console.warn(`! ${id}: ${u} を取得できませんでした(${e.message})`); continue; }
    if (r.info.deleted) { console.warn(`! ${id}: ${u} は削除されたか非公開です`); continue; }
    if (!needImage || picked) continue;
    // まだ取得していない(キャッシュだけの)投稿は、画像を探すために取り直す
    const t = r.tweet || await getTweet(m[2]).then(async (x) => { await sleep(350); return x; }).catch(() => null);
    if (!t || t.deleted) continue;
    const media = Array.isArray(t.mediaDetails) ? t.mediaDetails : [];
    for (const md of media) {
      const base = md.media_url_https;
      if (!base) continue;
      if (md.type === 'photo') { picked = { src: mediumUrl(base), kind: 'photo' }; }
      else if ((md.type === 'video' || md.type === 'animated_gif') && await posterOk(base)) { picked = { src: mediumUrl(base), kind: 'video' }; }
      if (picked?.src) { picked.post = r.key; picked.account = r.info.account; picked.text = r.info.text; break; }
      picked = null;
    }
  }

  if (!needImage) { console.log(`= ${id}: x_image は設定済み(${n.x_image.account})。--force で取り直します`); continue; }
  const next = picked
    ? { src: picked.src, post: picked.post, account: picked.account, alt: cut(picked.text || `${picked.account} の投稿の画像`, 60) }
    : null;
  if (JSON.stringify(next) !== JSON.stringify(n.x_image ?? null)) {
    n.x_image = next;
    fs.writeFileSync(file, JSON.stringify(n, null, 2) + '\n');
    changed++;
  }
  console.log(next ? `+ ${id}: x_image ← ${next.account}${picked.kind === 'video' ? '(動画のサムネイル)' : ''} ${next.src}` : `- ${id}: 画像付きの投稿がありません(x_image: null)`);
}

const sorted = Object.fromEntries(Object.entries(cache.posts).sort(([a], [b]) => a.localeCompare(b)));
fs.writeFileSync(CACHE_FILE, JSON.stringify({ _note: cache._note, posts: sorted }, null, 2) + '\n');
console.log(`\n完了：x_image を ${changed} 件更新、投稿キャッシュ ${Object.keys(sorted).length} 件(data/x-posts.json)。続けて node scripts/build.mjs を実行してください。`);
