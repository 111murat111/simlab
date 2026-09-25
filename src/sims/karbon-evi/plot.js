// Panel için küçük tuval grafiği: çizgi, bant, çubuk, yatay/dikey işaret çizgileri.
import { fmt } from '@core';

/**
 * spec: { xMin, xMax, yMin, yMax, xFmt, yFmt, xTicks:[x], yTicks:[{y,text}] | sayı,
 *         lines:[{pts:[[x,y]], color, width, dash, fill, step}], bands:[{lo, hi, color}],
 *         hbars:[{y0,y1,x0,x1,color}], vlines:[{x,color,text}], hlines:[{y,color,text,dash}] }
 */
export function makePlot(ui, { title = '', height = 130, legend = [] } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'chart';
  if (title) wrap.innerHTML = `<div class="chart-title">${title}</div>`;
  const cv = document.createElement('canvas');
  wrap.append(cv);
  const lg = document.createElement('div');
  lg.className = 'legend';
  wrap.append(lg);
  ui.append(wrap);
  const setLegend = (items) => { lg.innerHTML = items.map((s) => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join(''); };
  setLegend(legend);
  let spec = null, pending = false;

  function draw() {
    pending = false;
    if (!spec) return;
    const s = spec;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = cv.clientWidth || 260, H = height;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px';
    }
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    const pl = s.padLeft ?? 34, pr = 8, pt = 6, pb = 16;
    const iw = W - pl - pr, ih = H - pt - pb;
    const X = (x) => pl + ((x - s.xMin) / (s.xMax - s.xMin || 1)) * iw;
    const Y = (y) => pt + ih * (1 - (y - s.yMin) / (s.yMax - s.yMin || 1));
    const yFmt = s.yFmt || ((v) => fmt(v, Math.abs(v) < 10 && v % 1 ? 1 : 0));
    c.font = '10px system-ui';
    c.lineWidth = 1;
    // Izgara
    c.strokeStyle = 'rgba(148,163,184,.16)';
    c.fillStyle = 'rgba(148,163,184,.85)';
    c.textAlign = 'right'; c.textBaseline = 'middle';
    const yt = Array.isArray(s.yTicks) ? s.yTicks
      : Array.from({ length: (s.yTicks ?? 3) + 1 }, (_, i) => { const y = s.yMin + ((s.yMax - s.yMin) * i) / (s.yTicks ?? 3); return { y, text: yFmt(y) }; });
    for (const t of yt) {
      const y = Y(t.y);
      c.beginPath(); c.moveTo(pl, y); c.lineTo(W - pr, y); c.stroke();
      c.fillText(t.text, pl - 4, y);
    }
    c.textAlign = 'center'; c.textBaseline = 'bottom';
    for (const x of s.xTicks || []) c.fillText((s.xFmt || ((v) => fmt(v)))(x), X(x), H);
    c.save();
    c.beginPath(); c.rect(pl, pt - 1, iw, ih + 2); c.clip();
    for (const b of s.hbars || []) {
      c.fillStyle = b.color;
      c.fillRect(X(b.x0), Y(b.y1), Math.max(1, X(b.x1) - X(b.x0)), Math.max(1, Y(b.y0) - Y(b.y1)));
    }
    for (const b of s.bands || []) {
      if (!b.lo.length) continue;
      c.beginPath();
      b.hi.forEach(([x, y], i) => (i ? c.lineTo(X(x), Y(y)) : c.moveTo(X(x), Y(y))));
      for (let i = b.lo.length - 1; i >= 0; i--) c.lineTo(X(b.lo[i][0]), Y(b.lo[i][1]));
      c.closePath(); c.fillStyle = b.color; c.fill();
    }
    for (const l of s.lines || []) {
      if (l.pts.length < 2) continue;
      c.strokeStyle = l.color; c.lineWidth = l.width || 2; c.lineJoin = 'round';
      c.setLineDash(l.dash || []);
      c.beginPath();
      let py = 0;
      l.pts.forEach(([x, y], i) => {
        if (!i) c.moveTo(X(x), Y(y));
        else if (l.step) { c.lineTo(X(x), Y(py)); c.lineTo(X(x), Y(y)); } else c.lineTo(X(x), Y(y));
        py = y;
      });
      c.stroke();
      c.setLineDash([]);
      if (l.fill) {
        c.lineTo(X(l.pts[l.pts.length - 1][0]), Y(s.yMin)); c.lineTo(X(l.pts[0][0]), Y(s.yMin)); c.closePath();
        c.globalAlpha = 0.16; c.fillStyle = l.color; c.fill(); c.globalAlpha = 1;
      }
    }
    for (const h of s.hlines || []) {
      c.strokeStyle = h.color; c.lineWidth = 1.2; c.setLineDash(h.dash || [4, 3]);
      c.beginPath(); c.moveTo(pl, Y(h.y)); c.lineTo(W - pr, Y(h.y)); c.stroke(); c.setLineDash([]);
      if (h.text) { c.fillStyle = h.color; c.textAlign = 'left'; c.textBaseline = 'bottom'; c.fillText(h.text, pl + 3, Y(h.y) - 1); }
    }
    for (const v of s.vlines || []) {
      c.strokeStyle = v.color || '#f8fafc'; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(X(v.x), pt); c.lineTo(X(v.x), pt + ih); c.stroke();
      if (v.text) {
        c.fillStyle = v.color || '#f8fafc'; c.textBaseline = 'top';
        c.textAlign = X(v.x) > pl + iw * 0.7 ? 'right' : 'left';
        c.fillText(v.text, X(v.x) + (c.textAlign === 'left' ? 3 : -3), pt + 1);
      }
    }
    c.restore();
  }

  return {
    el: wrap,
    setLegend,
    set(s) { spec = s; if (!pending) { pending = true; requestAnimationFrame(draw); } },
    redraw() { draw(); },
  };
}
