// Panel için küçük X–Y grafiği (ui.chart zaman serisi; bu ise eğri + işaretçi çizer).
import { fmt } from '@core';

export function xyPlot(ui, { title = '', height = 140, legend = [], xFmt = (v) => fmt(v, 0), yFmt = (v) => fmt(v, Math.abs(v) < 10 ? 1 : 0), y2Fmt } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'chart';
  if (title) {
    const t = document.createElement('div');
    t.className = 'chart-title';
    t.innerHTML = title;
    wrap.append(t);
  }
  const cv = document.createElement('canvas');
  wrap.append(cv);
  const lg = document.createElement('div');
  lg.className = 'legend';
  lg.innerHTML = legend.map((s) => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join('');
  wrap.append(lg);
  ui.append(wrap);
  const ctx = cv.getContext('2d');
  let last = null, pending = false;

  function draw() {
    pending = false;
    const o = last;
    if (!o) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = cv.clientWidth || 260, H = height;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px';
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const pl = 36, pr = o.y2 ? 30 : 8, pt = 6, pb = 16;
    const iw = W - pl - pr, ih = H - pt - pb;
    const X = (x) => pl + (iw * (x - o.xMin)) / (o.xMax - o.xMin);
    const Y = (y, ax = 1) => {
      const [lo, hi] = ax === 2 ? [o.y2.min, o.y2.max] : [o.yMin, o.yMax];
      return pt + ih * (1 - (y - lo) / (hi - lo || 1));
    };
    ctx.font = '10px system-ui';
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(148,163,184,.18)';
    ctx.fillStyle = 'rgba(148,163,184,.85)';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 3; i++) {
      const v = o.yMin + ((o.yMax - o.yMin) * i) / 3, y = Y(v);
      ctx.beginPath(); ctx.moveTo(pl, y); ctx.lineTo(W - pr, y); ctx.stroke();
      ctx.textAlign = 'right'; ctx.fillText(yFmt(v), pl - 4, y);
      if (o.y2) {
        const v2 = o.y2.min + ((o.y2.max - o.y2.min) * i) / 3;
        ctx.textAlign = 'left'; ctx.fillText((y2Fmt || yFmt)(v2), W - pr + 3, y);
      }
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const nx = o.xTicks ?? 5;
    for (let i = 0; i <= nx; i++) {
      const v = o.xMin + ((o.xMax - o.xMin) * i) / nx;
      ctx.fillText(xFmt(v), Math.min(W - pr - 8, Math.max(pl + 6, X(v))), H - pb + 3);
    }
    for (const h of o.hlines || []) {
      ctx.save(); ctx.setLineDash([4, 3]); ctx.strokeStyle = h.color; ctx.lineWidth = 1.2;
      const y = Y(h.y, h.axis);
      ctx.beginPath(); ctx.moveTo(pl, y); ctx.lineTo(W - pr, y); ctx.stroke();
      if (h.label) { const below = y - pt < 12; ctx.fillStyle = h.color; ctx.textAlign = 'right'; ctx.textBaseline = below ? 'top' : 'bottom'; ctx.fillText(h.label, W - pr - 2, below ? y + 2 : y - 1); }
      ctx.restore();
    }
    for (const v of o.vlines || []) {
      ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = v.color; ctx.lineWidth = 1;
      const x = X(v.x);
      ctx.beginPath(); ctx.moveTo(x, pt); ctx.lineTo(x, pt + ih); ctx.stroke();
      if (v.label) { ctx.fillStyle = v.color; ctx.textAlign = x > W - 60 ? 'right' : 'left'; ctx.textBaseline = v.bottom ? 'bottom' : 'top'; ctx.fillText(v.label, x + (x > W - 60 ? -3 : 3), v.bottom ? pt + ih - 2 : pt + 1); }
      ctx.restore();
    }
    ctx.lineJoin = 'round';
    for (const s of o.series) {
      if (!s.pts.length) continue;
      ctx.save();
      ctx.strokeStyle = s.color; ctx.lineWidth = s.width ?? 2;
      if (s.dash) ctx.setLineDash(s.dash);
      ctx.beginPath();
      s.pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y, s.axis)) : ctx.moveTo(X(x), Y(y, s.axis))));
      ctx.stroke();
      if (s.fill) {
        const base = s.axis === 2 ? o.y2.min : o.yMin;
        ctx.lineTo(X(s.pts[s.pts.length - 1][0]), Y(base, s.axis)); ctx.lineTo(X(s.pts[0][0]), Y(base, s.axis)); ctx.closePath();
        ctx.globalAlpha = s.fill; ctx.fillStyle = s.color; ctx.fill();
      }
      ctx.restore();
    }
    for (const m of o.marks || []) {
      ctx.beginPath(); ctx.arc(X(m.x), Y(m.y, m.axis), m.r ?? 4.5, 0, Math.PI * 2);
      ctx.fillStyle = m.color; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#0b1020'; ctx.stroke();
    }
  }

  return {
    el: wrap,
    /** o: { xMin, xMax, yMin, yMax, y2?:{min,max}, series:[{pts:[[x,y]], color, width, dash, fill, axis}], marks, vlines, hlines } */
    draw(o) { last = o; if (!pending) { pending = true; requestAnimationFrame(draw); } },
    legend(list) { lg.innerHTML = list.map((s) => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join(''); },
  };
}
