// Arazi görünürlüğünü teşhis: sahnedeki arazinin programı derlendi mi?
import { createRequire } from 'node:module';
const require = createRequire('/root/vcabin/marka-v2/package.json');
const { chromium } = require('playwright-core');
const b = await chromium.launch({ executablePath: '/root/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--no-sandbox'] });
for (const v of process.argv.slice(2)) {
  const p = await b.newPage({ viewport: { width: 480, height: 300 } });
  const msgs = [];
  p.on('console', (m) => { if (!/GPU stall/.test(m.text())) msgs.push(m.type() + ': ' + m.text().slice(0, 400)); });
  p.on('pageerror', (e) => msgs.push('pageerror ' + e.message));
  await p.goto('file:///root/simlab/dev/lab.html?scene=terrain&low&' + v, { waitUntil: 'commit' });
  await p.waitForTimeout(12000);
  const info = await p.evaluate(() => {
    const out = [];
    window.__scene.traverse((o) => { if (o.isMesh && /terrain|skirt/.test(o.name)) out.push(o.name + ' vis=' + o.visible + ' y=' + o.geometry.boundingSphere?.center.y.toFixed(0) + ' r=' + o.geometry.boundingSphere?.radius.toFixed(0)); });
    return out.join(' | ');
  });
  const invalid = msgs.filter((m) => /not valid/.test(m)).length;
  console.log(v.padEnd(28), info, '| invalid:', invalid, '|', msgs.filter((m) => !/not valid/.test(m)).slice(0, 3).join(' || '));
  await p.close();
}
await b.close();
