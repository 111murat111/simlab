// Teşhis: her malzeme anahtarını (ve tek tek nesneleri) gizleyerek siyah ekranın kaynağını bulur. node dev/probe-key.mjs <id> [bekleme]
import { createRequire } from 'node:module';
const require = createRequire('/root/vcabin/marka-v2/package.json');
const { chromium } = require('playwright-core');
const [id, wait = '12000'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/root/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 200, height: 120 } });
p.on('pageerror', (e) => console.log('pageerror ' + e.message));
await p.goto(`file:///root/simlab/dist/sims/${id}/index.html?low`, { waitUntil: 'commit', timeout: 180000 });
await p.waitForTimeout(+wait);
await p.evaluate(() => {
  window.__lum = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
    const c = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
    const t = document.createElement('canvas'); t.width = 16; t.height = 10; const x = t.getContext('2d'); x.drawImage(c, 0, 0, 16, 10);
    const d = x.getImageData(0, 0, 16, 10).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
    res(+(s / (d.length / 4) / 3).toFixed(1));
  })));
  const key = (o) => (o.material?.customProgramCacheKey?.() || o.material?.type || '?') + (o.material?.type === 'MeshPhysicalMaterial' ? '(phys)' : '');
  window.__groups = () => { const g = {}; window.__sim.scene.traverse((o) => { if (o.isMesh || o.isPoints || o.isLine) (g[key(o)] ||= []).push(o); }); return g; };
});
console.log('base', await p.evaluate(() => window.__lum()));
const keys = await p.evaluate(() => Object.entries(window.__groups()).map(([k, v]) => k + ' #' + v.length));
for (const k of keys) {
  const kk = k.replace(/ #\d+$/, '');
  const l = await p.evaluate(async (kk) => { const g = window.__groups()[kk]; g.forEach((o) => { o.userData._v = o.visible; o.visible = false; });
    const l = await window.__lum(); g.forEach((o) => { o.visible = o.userData._v; }); return l; }, kk);
  console.log('hide', k, '→', l);
}
await b.close();
