// SimLab derleyicisi.
//   node build.mjs              → her şeyi dist/ içine derler
//   node build.mjs --only a,b   → yalnız verilen simülasyonları (+ katalog) derler; çekirdek yoksa onu da
//   node build.mjs --dev        → küçültme (minify) yapmaz
// Çıktı sunucusuz çalışır: dist/index.html dosyasına çift tıklamak yeterli (ES module değil, klasik script).
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SIMS, CATEGORIES, AGES } from './src/catalog.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');
const args = process.argv.slice(2);
const dev = args.includes('--dev');
const onlyIdx = args.indexOf('--only');
const only = onlyIdx >= 0 ? (args[onlyIdx + 1] || '').split(',').filter(Boolean) : null;

const catById = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

// Simülasyon paketlerinde '@core' ve 'three' → paylaşılan window.SimCore
const coreGlobal = {
  name: 'simcore-global',
  setup(b) {
    b.onResolve({ filter: /^(@core|three)$/ }, (a) => ({ path: a.path, namespace: 'simcore' }));
    b.onResolve({ filter: /^three\// }, (a) => ({
      errors: [{ text: `"${a.path}" doğrudan import edilemez; ihtiyacın olan eklentiyi src/core/index.js üzerinden '@core' ile al.` }],
    }));
    b.onLoad({ filter: /.*/, namespace: 'simcore' }, (a) => ({
      contents: a.path === 'three' ? 'module.exports = window.SimCore.THREE;' : 'module.exports = window.SimCore;',
      loader: 'js',
    }));
  },
};

async function buildCore() {
  await esbuild.build({
    entryPoints: [path.join(ROOT, 'src/core/index.js')],
    bundle: true, format: 'iife', globalName: 'SimCore', minify: !dev, target: 'es2020',
    outfile: path.join(DIST, 'assets/simcore.js'), legalComments: 'none', logLevel: 'warning',
  });
  fs.mkdirSync(path.join(DIST, 'assets'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'src/site/style.css'), path.join(DIST, 'assets/style.css'));
}

function simPage(s, n) {
  const c = catById[s.cat];
  const meta = { id: s.id, title: s.title, desc: s.desc, emoji: s.emoji, cat: c.name };
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(s.title)} · SimLab</title>
<meta name="description" content="${esc(s.desc)}">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>${s.emoji}</text></svg>">
<link rel="stylesheet" href="../../assets/style.css">
</head>
<body class="sim">
<header class="topbar">
  <a class="back" href="../../index.html" title="Tüm simülasyonlar">← SimLab</a>
  <div class="title">${s.emoji} ${esc(s.title)}</div>
  <span class="cat-chip">${c.emoji} ${esc(c.name)} · #${n}</span>
  <button class="icon-btn" id="info-btn" title="Nasıl çalışır?">ℹ️ Nasıl çalışır?</button>
</header>
<div class="layout">
  <main id="stage"></main>
  <aside id="panel"></aside>
</div>
<dialog class="modal" id="info-modal">
  <div class="modal-head"><span>${s.emoji} ${esc(s.title)}</span><button class="modal-close" aria-label="Kapat">×</button></div>
  <div class="modal-body"></div>
</dialog>
<script>
window.SIM_META = ${JSON.stringify(meta)};
window.addEventListener('error', function (e) {
  if (document.querySelector('#stage canvas')) return;
  var d = document.createElement('div'); d.className = 'fatal';
  d.innerHTML = '<div><h2>😕 Simülasyon başlatılamadı</h2><p>Tarayıcınız WebGL desteklemiyor olabilir ya da bir hata oluştu.</p><p><small>' + String(e.message).replace(/</g, '&lt;') + '</small></p></div>';
  document.getElementById('stage').appendChild(d);
});
</script>
<script src="../../assets/simcore.js"></script>
<script src="app.js"></script>
</body>
</html>
`;
}

function indexPage(built) {
  const items = SIMS.map((s, i) => ({ ...s, n: i + 1, ready: built.has(s.id) }));
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SimLab · İnteraktif Simülasyonlar</title>
<meta name="description" content="Biyoloji, kimya, fizik, anatomi, afet, iklim ve meslek simülasyonları: ${SIMS.length} interaktif 3B deney.">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🔬</text></svg>">
<link rel="stylesheet" href="assets/style.css">
</head>
<body class="home">
<div class="home-wrap">
  <section class="hero">
    <div class="brand"><span class="logo">🔬</span> SIMLAB</div>
    <h1>Dokun, değiştir, <span>keşfet.</span></h1>
    <p>${SIMS.length} interaktif 3B simülasyon: hücreden depreme, kalpten enerji şebekesine. Kaydırıcıları oynat, sonucu anında gör. İnternet gerekmez.</p>
  </section>
  <div class="filters">
    <input class="search" type="search" placeholder="Ara: deprem, kalp, faiz…" aria-label="Simülasyon ara">
    <div class="chips" id="cats"></div>
    <div class="chips" id="ages"></div>
  </div>
  <div class="count" id="count"></div>
  <div class="grid" id="grid"></div>
  <div class="empty" id="empty" hidden>Eşleşen simülasyon yok. Filtreleri temizlemeyi deneyin.</div>
  <footer class="foot">SimLab · Three.js ile yapıldı · Eğitim amaçlıdır; sonuçlar basitleştirilmiş modellere dayanır.</footer>
</div>
<script>
var SIMS = ${JSON.stringify(items)};
var CATS = ${JSON.stringify(CATEGORIES)};
var AGES = ${JSON.stringify(AGES)};
var state = { cat: 'all', age: 'all', q: '' };
try { var saved = JSON.parse(localStorage.getItem('simlab-filters') || 'null'); if (saved) state = Object.assign(state, saved, { q: '' }); } catch (e) {}
var catBy = {}; CATS.forEach(function (c) { catBy[c.id] = c; });
var ageBy = {}; AGES.forEach(function (a) { ageBy[a.id] = a; });
function norm(s) { return s.toLocaleLowerCase('tr').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/ı/g, 'i'); }
function chips(el, list, key, allLabel) {
  el.innerHTML = '';
  [{ id: 'all', name: allLabel, emoji: '' }].concat(list).forEach(function (it) {
    var b = document.createElement('button');
    b.className = 'chip' + (state[key] === it.id ? ' on' : '');
    b.textContent = (it.emoji ? it.emoji + ' ' : '') + it.name;
    b.onclick = function () { state[key] = it.id; save(); render(); };
    el.appendChild(b);
  });
}
function save() { try { localStorage.setItem('simlab-filters', JSON.stringify({ cat: state.cat, age: state.age })); } catch (e) {} }
function render() {
  chips(document.getElementById('cats'), CATS, 'cat', 'Tüm kategoriler');
  chips(document.getElementById('ages'), AGES, 'age', 'Tüm yaşlar');
  var q = norm(state.q);
  var list = SIMS.filter(function (s) {
    return (state.cat === 'all' || s.cat === state.cat) && (state.age === 'all' || s.ages.indexOf(state.age) >= 0) &&
      (!q || norm(s.title + ' ' + s.desc + ' ' + catBy[s.cat].name).indexOf(q) >= 0);
  });
  var g = document.getElementById('grid');
  g.innerHTML = list.map(function (s) {
    var c = catBy[s.cat];
    return '<a class="card" style="--c:' + c.color + '" href="' + (s.ready ? 'sims/' + s.id + '/index.html' : '#') + '"' + (s.ready ? '' : ' aria-disabled="true"') + '>' +
      '<div class="card-art"><span class="num">#' + s.n + '</span>' + s.emoji + '</div>' +
      '<div class="card-body"><h3>' + s.title + '</h3><p>' + s.desc + '</p>' +
      '<div class="tags"><span class="tag cat">' + c.emoji + ' ' + c.name + '</span>' +
      s.ages.map(function (a) { return '<span class="tag" title="' + ageBy[a].name + '">' + ageBy[a].emoji + '</span>'; }).join('') +
      (s.ready ? '' : '<span class="tag">Yakında</span>') + '</div></div></a>';
  }).join('');
  document.getElementById('count').textContent = list.length + ' / ' + SIMS.length + ' simülasyon';
  document.getElementById('empty').hidden = list.length > 0;
}
document.querySelector('.search').addEventListener('input', function (e) { state.q = e.target.value; render(); });
render();
</script>
</body>
</html>
`;
}

const t0 = Date.now();
const coreExists = fs.existsSync(path.join(DIST, 'assets/simcore.js'));
// Çekirdek kaynağı (src/core/**) derlenmiş paketten yeniyse --only ile de yeniden derle
const newest = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((m, e) => Math.max(m, e.isDirectory() ? newest(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).mtimeMs), 0);
const coreStale = coreExists && newest(path.join(ROOT, 'src/core')) > fs.statSync(path.join(DIST, 'assets/simcore.js')).mtimeMs;
if (!only || !coreExists || coreStale) await buildCore();
else fs.copyFileSync(path.join(ROOT, 'src/site/style.css'), path.join(DIST, 'assets/style.css'));

const targets = SIMS.filter((s) => !only || only.includes(s.id));
if (only) {
  const unknown = only.filter((id) => !SIMS.some((s) => s.id === id));
  if (unknown.length) { console.error('Katalogda yok:', unknown.join(', ')); process.exit(1); }
}
let failed = 0;
for (const s of targets) {
  const entry = path.join(ROOT, 'src/sims', s.id, 'main.js');
  if (!fs.existsSync(entry)) continue;
  const n = SIMS.indexOf(s) + 1;
  try {
    await esbuild.build({
      entryPoints: [entry], bundle: true, format: 'iife', minify: !dev, target: 'es2020',
      outfile: path.join(DIST, 'sims', s.id, 'app.js'), plugins: [coreGlobal], logLevel: 'silent',
      legalComments: 'none', loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.svg': 'dataurl', '.json': 'json' },
    });
    writeAtomic(path.join(DIST, 'sims', s.id, 'index.html'), simPage(s, n));
  } catch (e) {
    failed++;
    console.error(`✗ ${s.id}\n` + (e.errors || []).map((x) => `  ${x.location?.file}:${x.location?.line} ${x.text}`).join('\n'));
  }
}

const built = new Set(SIMS.filter((s) => fs.existsSync(path.join(DIST, 'sims', s.id, 'app.js')) && fs.existsSync(path.join(ROOT, 'src/sims', s.id, 'main.js'))).map((s) => s.id));
writeAtomic(path.join(DIST, 'index.html'), indexPage(built));
console.log(`✓ ${built.size}/${SIMS.length} simülasyon hazır · ${targets.filter((s) => fs.existsSync(path.join(ROOT, "src/sims", s.id, "main.js"))).length} derlendi${failed ? ` · ${failed} HATA` : ''} · ${Date.now() - t0} ms`);
if (failed) process.exit(1);
