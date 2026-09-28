// Teşhis: sahnede NaN (geometri, instance matrisi, ışık, kamera) ve konsol hataları. node dev/probe-scene.mjs <id> [bekleme]
import { createRequire } from 'node:module';
const require = createRequire('/root/vcabin/marka-v2/package.json');
const { chromium } = require('playwright-core');
const [id, wait = '12000'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/root/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 320, height: 200 } });
p.on('pageerror', (e) => console.log('pageerror ' + e.message));
p.on('console', (m) => { if (!/PCFSoft|toNonIndexed/.test(m.text())) console.log(m.type(), m.text().slice(0, 400)); });
await p.goto(`file:///root/simlab/dist/sims/${id}/index.html?low`, { waitUntil: 'commit', timeout: 180000 });
await p.waitForTimeout(+wait);
const r = await p.evaluate(() => {
  const s = window.__sim, out = [], bad = (a) => { for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return true; return false; };
  if (!s) return ['no __sim'];
  out.push('frame ' + s.frame + ' cam ' + s.camera.position.toArray().map((v) => v.toFixed(1)));
  if (bad(s.camera.matrixWorld.elements) || bad(s.camera.projectionMatrix.elements)) out.push('CAMERA NaN');
  s.scene.traverse((o) => {
    if (bad(o.matrixWorld.elements)) out.push('matrixWorld NaN: ' + (o.name || o.type));
    const g = o.geometry;
    if (g?.attributes?.position && bad(g.attributes.position.array)) out.push('position NaN: ' + (o.name || o.type));
    if (g?.attributes?.normal && bad(g.attributes.normal.array)) out.push('normal NaN: ' + (o.name || o.type));
    if (o.isInstancedMesh && bad(o.instanceMatrix.array.subarray(0, o.count * 16))) out.push('instance NaN: ' + (o.name || o.type));
    if (o.isLight) { out.push('light ' + o.type + ' ' + (o.name || '') + ' I=' + o.intensity + ' col=' + o.color.getHexString() + (o.castShadow ? ' shadow' : '')); if (o.shadow && bad(o.shadow.camera.projectionMatrix.elements)) out.push('SHADOW CAM NaN ' + o.name); }
    const m = o.material; if (m && !Array.isArray(m)) for (const k of ['opacity', 'emissiveIntensity', 'envMapIntensity', 'roughness']) if (k in m && !Number.isFinite(m[k])) out.push(`material ${k} NaN: ` + (o.name || o.type));
  });
  out.push('exposure ' + s.renderer.toneMappingExposure);
  const c = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const t = document.createElement('canvas'); t.width = 32; t.height = 20; const x = t.getContext('2d'); x.drawImage(c, 0, 0, 32, 20);
  const d = x.getImageData(0, 0, 32, 20).data; let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
  out.push('lum ' + (sum / (d.length / 4) / 3).toFixed(1));
  return [...new Set(out)].slice(0, 60);
});
console.log(r.join('\n'));
await b.close();
