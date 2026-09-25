// Sağdaki kontrol paneli (mobilde alttan açılan sayfa). Tüm kontroller DOM ile kurulur.
import { fmt } from './util.js';

let uid = 0;
const h = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

export function createPanel(root) {
  root.innerHTML = '';
  const head = h('button', 'panel-toggle', '<span>⚙️ Kontroller</span><span class="chev">▾</span>');
  head.onclick = () => root.classList.toggle('collapsed');
  const body = h('div', 'panel-body');
  root.append(head, body);
  let parent = body;

  const ui = {
    root, body,
    /** Başlıklı bölüm açar; sonraki kontroller bu bölüme eklenir. */
    section(title, { open = true } = {}) {
      const d = h('details', 'sec');
      d.open = open;
      d.append(h('summary', null, title));
      const inner = h('div', 'sec-body');
      d.append(inner);
      body.append(d);
      parent = inner;
      return inner;
    },

    slider({ label, min = 0, max = 1, step = 0.01, value = min, unit = '', format, onChange, onInput }) {
      const id = 's' + ++uid;
      const row = h('div', 'ctl slider');
      const top = h('label', 'ctl-top');
      top.htmlFor = id;
      const name = h('span', null, label);
      const val = h('output', 'val');
      top.append(name, val);
      const inp = h('input');
      Object.assign(inp, { type: 'range', id, min, max, step, value });
      row.append(top, inp);
      parent.append(row);
      const show = () => { val.textContent = format ? format(+inp.value) : `${fmt(+inp.value, decimals(step))}${unit ? ' ' + unit : ''}`; };
      show();
      inp.addEventListener('input', () => { show(); (onInput || onChange)?.(+inp.value); });
      if (onInput && onChange) inp.addEventListener('change', () => onChange(+inp.value));
      return {
        el: row, input: inp,
        get value() { return +inp.value; },
        set value(v) { inp.value = v; show(); },
        set(v, fire = false) { inp.value = v; show(); if (fire) (onInput || onChange)?.(+inp.value); },
        disable(v = true) { inp.disabled = v; row.classList.toggle('disabled', v); },
      };
    },

    toggle({ label, value = false, onChange }) {
      const row = h('label', 'ctl toggle');
      const inp = h('input');
      inp.type = 'checkbox';
      inp.checked = value;
      row.append(inp, h('span', 'sw'), h('span', 'tl', label));
      parent.append(row);
      inp.addEventListener('change', () => onChange?.(inp.checked));
      return {
        el: row,
        get value() { return inp.checked; },
        set value(v) { inp.checked = v; },
        set(v, fire = false) { inp.checked = v; if (fire) onChange?.(v); },
      };
    },

    select({ label, options, value, onChange }) {
      const row = h('label', 'ctl select');
      if (label) row.append(h('span', 'ctl-top', label));
      const sel = h('select');
      const norm = options.map((o) => (typeof o === 'object' ? o : { value: o, label: o }));
      sel.innerHTML = norm.map((o) => `<option value="${o.value}">${o.label}</option>`).join('');
      if (value != null) sel.value = value;
      row.append(sel);
      parent.append(row);
      sel.addEventListener('change', () => onChange?.(sel.value));
      return {
        el: row, select: sel,
        get value() { return sel.value; },
        set value(v) { sel.value = v; },
        set(v, fire = false) { sel.value = v; if (fire) onChange?.(v); },
      };
    },

    button({ label, onClick, variant = '', title = '' }) {
      const b = h('button', 'btn ' + variant, label);
      b.title = title;
      b.onclick = () => onClick?.();
      parent.append(b);
      return b;
    },

    /** Yan yana düğmeler: [{label, onClick, variant}] */
    buttons(list) {
      const row = h('div', 'btn-row');
      const els = list.map((it) => {
        const b = h('button', 'btn ' + (it.variant || ''), it.label);
        b.title = it.title || '';
        b.onclick = () => it.onClick?.();
        row.append(b);
        return b;
      });
      parent.append(row);
      return els;
    },

    /** Birden fazla seçenekten biri (segment düğmeleri). */
    segmented({ label, options, value, onChange }) {
      const row = h('div', 'ctl seg');
      if (label) row.append(h('span', 'ctl-top', label));
      const wrap = h('div', 'seg-wrap');
      const norm = options.map((o) => (typeof o === 'object' ? o : { value: o, label: o }));
      let cur = value ?? norm[0].value;
      const btns = norm.map((o) => {
        const b = h('button', 'seg-btn', o.label);
        b.onclick = () => { api.set(o.value, true); };
        wrap.append(b);
        return [o.value, b];
      });
      row.append(wrap);
      parent.append(row);
      const sync = () => btns.forEach(([v, b]) => b.classList.toggle('on', v === cur));
      sync();
      const api = {
        el: row,
        get value() { return cur; },
        set(v, fire = false) { cur = v; sync(); if (fire) onChange?.(v); },
      };
      return api;
    },

    /** Sayısal gösterge. set(value, tone?) — tone: 'good' | 'warn' | 'bad' */
    stat({ label, value = '—', unit = '' }) {
      let grid = parent.lastElementChild;
      if (!grid || !grid.classList.contains('stats')) { grid = h('div', 'stats'); parent.append(grid); }
      const box = h('div', 'stat');
      const v = h('div', 'stat-v', String(value));
      const u = unit ? h('span', 'stat-u', unit) : null;
      const vw = h('div', 'stat-vw');
      vw.append(v);
      if (u) vw.append(u);
      box.append(vw, h('div', 'stat-l', label));
      grid.append(box);
      return {
        el: box,
        set(val, tone) {
          v.textContent = typeof val === 'number' ? fmt(val, Math.abs(val) < 10 && val % 1 ? 1 : 0) : val;
          box.dataset.tone = tone || '';
        },
      };
    },

    /** İlerleme/seviye çubuğu. set(0..1, metin?) */
    meter({ label, color = 'var(--accent)' }) {
      const row = h('div', 'ctl meter');
      const top = h('div', 'ctl-top');
      const name = h('span', null, label);
      const val = h('output', 'val');
      top.append(name, val);
      const track = h('div', 'meter-track');
      const fill = h('div', 'meter-fill');
      fill.style.background = color;
      track.append(fill);
      row.append(top, track);
      parent.append(row);
      return {
        el: row,
        set(t, text) {
          fill.style.width = Math.max(0, Math.min(1, t)) * 100 + '%';
          val.textContent = text ?? Math.round(t * 100) + '%';
        },
        color(c) { fill.style.background = c; },
      };
    },

    /**
     * Zaman serisi grafiği. series: [{name, color}]. push([v1, v2...]) her seri için bir değer ekler.
     * yMin/yMax verilmezse otomatik ölçeklenir.
     */
    chart({ title = '', series, maxPoints = 300, yMin, yMax, height = 120, stacked = false, format = (v) => fmt(v, Math.abs(v) < 10 ? 1 : 0) }) {
      const wrap = h('div', 'chart');
      if (title) wrap.append(h('div', 'chart-title', title));
      const cv = h('canvas');
      wrap.append(cv);
      const legend = h('div', 'legend', series.map((s) => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join(''));
      wrap.append(legend);
      parent.append(wrap);
      const data = series.map(() => []);
      const ctx = cv.getContext('2d');
      let pending = false;
      const draw = () => {
        pending = false;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const W = cv.clientWidth || 260, H = height;
        if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px'; }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        let lo = yMin, hi = yMax;
        if (lo == null || hi == null) {
          let mn = Infinity, mx = -Infinity;
          data.forEach((d) => d.forEach((v) => { if (v < mn) mn = v; if (v > mx) mx = v; }));
          if (!isFinite(mn)) { mn = 0; mx = 1; }
          if (mn === mx) { mx += 1; mn -= stacked ? 0 : 1; }
          lo = lo ?? Math.min(0, mn); hi = hi ?? mx * 1.08;
        }
        const pl = 34, pr = 6, pt = 6, pb = 14;
        const iw = W - pl - pr, ih = H - pt - pb;
        ctx.strokeStyle = 'rgba(148,163,184,.18)';
        ctx.fillStyle = 'rgba(148,163,184,.8)';
        ctx.font = '10px system-ui';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (let i = 0; i <= 3; i++) {
          const y = pt + (ih * i) / 3;
          ctx.beginPath(); ctx.moveTo(pl, y); ctx.lineTo(W - pr, y); ctx.stroke();
          ctx.fillText(format(hi - ((hi - lo) * i) / 3), pl - 4, y);
        }
        const n = Math.max(...data.map((d) => d.length));
        if (n < 2) return;
        const X = (i) => pl + (iw * i) / (maxPoints - 1);
        const Y = (v) => pt + ih * (1 - (v - lo) / (hi - lo || 1));
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        series.forEach((s, k) => {
          const d = data[k];
          ctx.strokeStyle = s.color;
          ctx.beginPath();
          d.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))));
          ctx.stroke();
          if (s.fill) {
            ctx.lineTo(X(d.length - 1), Y(lo)); ctx.lineTo(X(0), Y(lo)); ctx.closePath();
            ctx.globalAlpha = 0.15; ctx.fillStyle = s.color; ctx.fill(); ctx.globalAlpha = 1;
          }
        });
      };
      return {
        el: wrap,
        push(values) {
          values.forEach((v, k) => { data[k].push(v); if (data[k].length > maxPoints) data[k].shift(); });
          if (!pending) { pending = true; requestAnimationFrame(draw); }
        },
        clear() { data.forEach((d) => (d.length = 0)); draw(); },
        data,
      };
    },

    /** Serbest HTML bloğu. set(html) ile güncellenir. */
    text(html = '', cls = '') {
      const e = h('div', 'ctl-text ' + cls, html);
      parent.append(e);
      return { el: e, set(v) { e.innerHTML = v; } };
    },

    /** Özel eleman ekle. */
    append(el) { parent.append(el); return el; },
  };
  return ui;
}

function decimals(step) {
  const s = String(step);
  return s.includes('.') ? s.split('.')[1].length : 0;
}
