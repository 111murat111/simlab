// Canvas yakalama (yazılımsal WebGL'de page.screenshot takıldığı için): node dev/shot.mjs <url> <çıktı.png> [bekleme ms] [genişlik] [yükseklik]
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('/root/vcabin/marka-v2/package.json');
const { chromium } = require('playwright-core');
const [url, out, wait = '15000', w = '900', h = '560'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/root/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
p.on('pageerror', (e) => console.log('pageerror', e.message));
p.on('console', (m) => { if (process.env.ALL || m.type() === 'error' || (m.type() === 'warning' && !/GPU stall|program not valid/.test(m.text()))) console.log(m.type(), m.text().slice(0, 1500)); });
const t0 = Date.now();
await p.goto(url, { timeout: 180000, waitUntil: 'commit' });
await p.waitForTimeout(+wait);
const frames = await p.evaluate(() => window.__sim?.frame ?? window.__f ?? null).catch(() => null);
// Bir sonraki karenin sonunda (uygulamanın çizimi bittikten sonra) en büyük canvas'ı al
const data = await p.evaluate(() => new Promise((res) => requestAnimationFrame(() => {
  const c = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  res(c ? c.toDataURL('image/png') : null);
})));
if (data) fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
console.log(`kare=${frames} süre=${((Date.now() - t0) / 1000).toFixed(0)}sn → ${data ? out : 'canvas yok'}`);
await b.close();
