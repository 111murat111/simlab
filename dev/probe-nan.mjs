// Teşhis (geçici): nesne gruplarını gizleyerek kararma kaynağını bulur. node dev/probe-nan.mjs <id>
import { createRequire } from 'node:module';
const require = createRequire('/root/vcabin/marka-v2/package.json');
const { chromium } = require('playwright-core');
const [id, wait = '20000'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/root/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 320, height: 200 } });
p.on('pageerror', (e) => console.log('pageerror ' + e.message));
p.on('console', (m) => { if (m.type() === 'error' || /context|NaN/i.test(m.text())) console.log(m.type(), m.text().slice(0, 300)); });
await p.goto(`file:///root/simlab/dist/sims/${id}/index.html?low`, { waitUntil: 'commit', timeout: 180000 });
await p.waitForTimeout(+wait);
const lum = () => p.evaluate(() => new Promise((res) => requestAnimationFrame(() => {
  const c = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const t = document.createElement('canvas'); t.width = 64; t.height = 40; const x = t.getContext('2d'); x.drawImage(c, 0, 0, 64, 40);
  const d = x.getImageData(0, 0, 64, 40).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
  res((s / (d.length / 4) / 3).toFixed(1) + ' frame=' + window.__sim.frame);
})));
const names = await p.evaluate(() => { const s = window.__sim, n = []; s.scene.traverse((o) => { if (o.isMesh || o.isPoints || o.isLine) n.push((o.name || o.type) + ':' + o.material?.type + ':' + (o.material?.customProgramCacheKey?.() || '')); }); return [...new Set(n)].slice(0, 80); });
console.log(names.join('\n'));
console.log('base', await lum());
const tries = [['ocean', (o) => /ocean/i.test(o.name) || /ocean/i.test(o.material?.customProgramCacheKey?.() || '') || o.material?.type === 'ShaderMaterial'],
  ['foliage', (o) => /foliage/.test(o.material?.customProgramCacheKey?.() || '')],
  ['terrain', (o) => /terrain/.test(o.material?.customProgramCacheKey?.() || '')],
  ['proc', (o) => /simlab-proc/.test(o.material?.customProgramCacheKey?.() || '')],
  ['physical', (o) => o.material?.type === 'MeshPhysicalMaterial']];
for (const [nm] of tries) {
  const r = await p.evaluate((nm) => {
    const T = { ocean: (o) => /ocean/i.test(o.name) || o.material?.type === 'ShaderMaterial', foliage: (o) => /foliage/.test(o.material?.customProgramCacheKey?.() || ''),
      terrain: (o) => /terrain/.test(o.material?.customProgramCacheKey?.() || ''), proc: (o) => /simlab-proc/.test(o.material?.customProgramCacheKey?.() || ''),
      physical: (o) => o.material?.type === 'MeshPhysicalMaterial' };
    let n = 0; window.__sim.scene.traverse((o) => { if ((o.isMesh || o.isPoints) && T[nm](o)) { o.userData._v = o.visible; o.visible = false; n++; } }); return n;
  }, nm);
  await p.waitForTimeout(100);
  await lum();
  console.log('hide', nm, r, await lum());
  await p.evaluate(() => window.__sim.scene.traverse((o) => { if (o.userData._v !== undefined) { o.visible = o.userData._v; delete o.userData._v; } }));
}
await b.close();
