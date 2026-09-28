// Duman testi: her simülasyonu headless Chromium'da (SwiftShader WebGL) açar, kontrolleri kurcalar,
// konsol/sayfa hatalarını ve döngünün dönüp dönmediğini raporlar.
//   node smoke.mjs                  → tüm derlenmiş simülasyonlar
//   node smoke.mjs a,b --shots      → yalnız verilenler + ekran görüntüsü (dist/../shots/)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SIMS } from './src/catalog.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
let chromium;
for (const p of ['playwright-core', '/root/vcabin/marka-v2/node_modules/playwright-core']) {
  try { ({ chromium } = require(p)); break; } catch {}
}
if (!chromium) { console.error('playwright-core bulunamadı'); process.exit(2); }

const args = process.argv.slice(2);
const shots = args.includes('--shots');
const ids = (args.find((a) => !a.startsWith('--')) || '').split(',').filter(Boolean);
const list = SIMS.filter((s) => (!ids.length || ids.includes(s.id)) && fs.existsSync(path.join(ROOT, 'dist/sims', s.id, 'app.js')));
const shotDir = process.env.SHOT_DIR || path.join(ROOT, 'shots');
if (shots) fs.mkdirSync(shotDir, { recursive: true });

const exe = ['/root/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell'].find((p) => fs.existsSync(p));
// Aynı anda yalnızca bir tarayıcı (düşük RAM'li makinelerde paralel testler çakışmasın)
const LOCK = path.join(process.env.TMPDIR || '/tmp', 'simlab-smoke.dir.lock');
for (;;) {
  try { fs.mkdirSync(LOCK); break; } catch {
    try { if (Date.now() - fs.statSync(LOCK).mtimeMs > 6 * 60 * 1000) { fs.rmSync(LOCK, { recursive: true, force: true }); continue; } } catch {}
    await new Promise((r) => setTimeout(r, 1500));
  }
}
const unlock = () => { try { fs.rmSync(LOCK, { recursive: true, force: true }); } catch {} };
process.on('exit', unlock);
process.on('SIGINT', () => process.exit(130));
process.on('SIGTERM', () => process.exit(143));
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || exe,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--no-sandbox'],
});
let bad = 0;
for (const s of list) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 560 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const url = pathToFileURL(path.join(ROOT, 'dist/sims', s.id, 'index.html')).href;
  let frames = 0, note = '';
  try {
    await page.goto(url, { waitUntil: 'commit', timeout: 60000 });
    await page.waitForFunction(() => (window.__sim?.frame ?? 0) > 3, null, { timeout: 150000 }).catch(() => {});
    await page.waitForTimeout(1500);
    if (shots) await page.screenshot({ path: path.join(shotDir, `${s.id}.png`) });
    // Sahne kutusunu kurcalamadan ÖNCE al: SwiftShader'da ağır simlerde kare süresi 10-30 sn olabildiğinden
    // kurcalama sonrası locator (RAF bekler) 30 sn'de zaman aşımına düşüyordu; bu bir sim hatası değil.
    const box = await page.locator('#stage').boundingBox({ timeout: 300000 });
    // Kontrolleri kurcala: kaydırıcılar, anahtarlar, seçimler, düğmeler, sahneye tıklama
    await page.evaluate(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const panel = document.getElementById('panel');
      panel.querySelectorAll('details').forEach((d) => (d.open = true));
      for (const r of panel.querySelectorAll('input[type=range]')) {
        for (const f of [0, 1, 0.5]) {
          r.value = +r.min + (r.max - r.min) * f;
          r.dispatchEvent(new Event('input', { bubbles: true }));
          r.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      for (const c of panel.querySelectorAll('input[type=checkbox]')) { c.click(); await wait(30); c.click(); }
      for (const sel of panel.querySelectorAll('select')) {
        for (const o of sel.options) { sel.value = o.value; sel.dispatchEvent(new Event('change', { bubbles: true })); await wait(30); }
      }
      const btns = [...panel.querySelectorAll('button:not(.panel-toggle)')];
      for (const b of btns) { if (!b.disabled && b.isConnected) { b.click(); await wait(60); } }
      document.querySelector('.pb-reset')?.click();
      await wait(100);
      // HUD içindeki düğmeler (oyun tarzı simülasyonlar)
      for (const b of document.querySelectorAll('.hud button')) { b.click(); await wait(50); }
    });
    // Sahneye birkaç tıklama
    for (const [fx, fy] of [[0.5, 0.5], [0.3, 0.6], [0.7, 0.4]]) {
      await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    }
    await page.evaluate(() => { if (window.__sim) window.__sim.setSpeed(8); });
    await page.waitForTimeout(4000);
    frames = await page.evaluate(() => window.__sim?.frame ?? -1);
    if (shots) await page.screenshot({ path: path.join(shotDir, `${s.id}-after.png`) });
    // Mobil görünüm
    await page.setViewportSize({ width: 390, height: 780 });
    await page.waitForTimeout(400);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (overflow) note += ' mobil-yatay-taşma';
  } catch (e) {
    errors.push('test: ' + e.message.split('\n')[0]);
  }
  const ok = !errors.length && frames > 8 && !note;
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'} ${s.id.padEnd(22)} kare=${frames}${note}`);
  for (const e of [...new Set(errors)].slice(0, 6)) console.log('    ' + e.slice(0, 300));
  await ctx.close();
}
await browser.close();
console.log(`\n${list.length - bad}/${list.length} başarılı`);
process.exit(bad ? 1 : 0);
