#!/usr/bin/env node
// 運営者が提供した写真をサイトに追加するスクリプト(Node 22 / 標準ライブラリのみ)
//
//   node scripts/add-photo.mjs <slug> <ign|hero> <写真ファイル> [撮影者・提供元]
//
// 例：
//   node scripts/add-photo.mjs zeta-division Laz ~/Downloads/laz.jpg "ZETA DIVISION"
//   node scripts/add-photo.mjs zeta-division hero ~/Downloads/team.jpg
//
// やること
//   1. 写真を assets/img/teams/<slug>/<ign小文字>.jpg(チーム写真は hero.jpg)にコピーします。
//      ImageMagick(convert)があれば、長辺1200px以下・JPEG(品質82)に縮小・変換します。
//   2. data/teams/<slug>.json の選手の photo(または images.hero)にパスを書きます。
//   3. image_credits に「運営提供」のクレジットを追加(同じファイルがあれば上書き)します。
// 最後に node scripts/build.mjs を実行すると、ページに反映されます。
//
// オプション：--teams-dir <dir>  チーム JSON のフォルダを変える(テスト用。既定は data/teams)

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
let teamsDir = path.join(ROOT, 'data', 'teams');
const ti = argv.indexOf('--teams-dir');
if (ti >= 0) { teamsDir = path.resolve(argv[ti + 1] || ''); argv.splice(ti, 2); }

const [slugArg, who, file, ...authorParts] = argv;
const author = authorParts.join(' ').trim();
const fail = (msg) => { console.error(`エラー：${msg}`); process.exit(1); };

if (!slugArg || !who || !file) {
  console.log('使い方：node scripts/add-photo.mjs <slug> <ign|hero> <写真ファイル> [撮影者・提供元]');
  process.exit(1);
}
const slug = slugArg.toLowerCase();
if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) fail(`slug が不正です：${slugArg}`);
if (!fs.existsSync(file)) fail(`写真ファイルが見つかりません：${file}`);
const jsonPath = path.join(teamsDir, `${slug}.json`);
if (!fs.existsSync(jsonPath)) fail(`${path.relative(ROOT, jsonPath)} がありません。先にチームの JSON を作ってください。`);

let team;
try { team = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); } catch (e) { fail(`JSON を読めませんでした：${e.message}`); }

const isHero = who.toLowerCase() === 'hero';
let player = null;
if (!isHero) {
  player = (team.roster?.players || []).find((p) => p && String(p.ign).toLowerCase() === who.toLowerCase());
  if (!player) fail(`${slug} のロスターに「${who}」という選手がいません(roster.players の ign と同じつづりにしてください)。`);
}
// ファイル名：選手は ign の小文字(記号はハイフンに)、チームは hero
const base = isHero ? 'hero' : String(player.ign).toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, '-');

let hasConvert = false;
try { execFileSync('convert', ['-version'], { stdio: 'ignore' }); hasConvert = true; } catch { /* ImageMagick なし */ }

const srcExt = path.extname(file).toLowerCase();
const ext = hasConvert ? '.jpg' : (['.jpg', '.jpeg'].includes(srcExt) ? '.jpg' : srcExt);
if (!['.jpg', '.png', '.webp'].includes(ext)) fail(`この形式は使えません：${srcExt}(JPEG / PNG / WebP にしてください)`);
const rel = `assets/img/teams/${slug}/${base}${ext}`;
const dest = path.join(ROOT, rel);
fs.mkdirSync(path.dirname(dest), { recursive: true });

if (hasConvert) {
  execFileSync('convert', [file, '-auto-orient', '-strip', '-resize', '1200x1200>', '-quality', '82', dest]);
  console.log(`縮小して保存しました：${rel}`);
} else {
  fs.copyFileSync(file, dest);
  console.log(`コピーしました：${rel}(ImageMagick が無いので縮小していません。長辺1200px以下にしてください)`);
}

if (isHero) {
  team.images = team.images && typeof team.images === 'object' ? team.images : {};
  team.images.hero = rel;
} else {
  player.photo = rel;
}
const credit = {
  file: rel,
  source_url: null,
  author: author || '',
  license: '運営提供',
  license_url: null,
  provided_by_owner: true,
};
team.image_credits = Array.isArray(team.image_credits) ? team.image_credits : [];
const i = team.image_credits.findIndex((c) => c && c.file === rel);
if (i >= 0) team.image_credits[i] = { ...team.image_credits[i], ...credit };
else team.image_credits.push(credit);

fs.writeFileSync(jsonPath, `${JSON.stringify(team, null, 2)}\n`);
console.log(`${path.relative(ROOT, jsonPath)} を更新しました(${isHero ? 'images.hero' : `${player.ign} の photo`} と image_credits)。`);
console.log('次に node scripts/build.mjs を実行してください。');
