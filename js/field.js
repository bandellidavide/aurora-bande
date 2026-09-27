'use strict';
// Aurora Bande · new version — grafico del campo magnetico interplanetario (IMF) a L1.
// Tutte le sonde insieme (riferimento NOAA continuo e spesso, le altre tratteggiate) e le quattro componenti Bt, Bz, Bx, By.
// Asse orario: l'istante della misura a L1. Quando un episodio potrebbe arrivare sulla Terra si vede nella scheda «Fronti» e nel blocco d'arrivo di «Adesso».

const FIELD_COMPS = [
  { key: 'bt', label: 'Bt', name: 'campo totale', color: 'var(--series-bt)' },
  { key: 'bz_gsm', label: 'Bz', name: 'nord / sud', color: 'var(--series-bz)' },
  { key: 'bx_gsm', label: 'Bx', name: 'Sole–Terra', color: 'var(--series-bx)' },
  { key: 'by_gsm', label: 'By', name: 'est / ovest', color: 'var(--series-by)' },
];
const SAT_DASH = { ACE: '10 5', DSCOVR: '5 4', SOLAR1: '12 4 2 4', IMAP: '2 5' };
const DASH_FALLBACK = ['1 3', '5 2 1 2', '9 3', '2 2 6 2'];
const satDash = (src, i) => SAT_DASH[src] || DASH_FALLBACK[i % DASH_FALLBACK.length];
const CHART_HOURS = [2, 4, 6, 12, 24];

// preferenze del grafico (ricordate sul dispositivo). Di default Bt e Bz; Bx e By spente come nella pagina originale.
S.chart = Object.assign({ hours: 2, comps: { bt: true, bz_gsm: true, bx_gsm: false, by_gsm: false }, hiddenSats: {} }, store.get('aurora_chart_v3', {}));
S.chart.comps = Object.assign({ bt: true, bz_gsm: true, bx_gsm: false, by_gsm: false }, S.chart.comps);
function saveChart() { store.set('aurora_chart_v3', S.chart); }

function chartSats() {
  const set = new Set();
  (S.magRaw || []).forEach((r) => { if (r && r.source) set.add(r.source); });
  return Array.from(set).sort();
}

function fieldChartData() {
  const c = S.chart, now = Date.now(), ref = selectedSource();
  const xmin = now - c.hours * 3600e3, cutoff = xmin - 60000;
  const sats = chartSats();
  const series = [];
  sats.forEach((s, si) => {
    if (c.hiddenSats[s]) return;
    FIELD_COMPS.forEach((cp) => {
      if (!c.comps[cp.key]) return;
      const pts = seriesFor(S.magRaw, s, cp.key, cutoff).filter((p) => p.t >= xmin).map((p) => ({ x: p.t, t: p.t, v: p.v }));
      if (pts.length) series.push({ src: s, key: cp.key, comp: cp, pts, isRef: s === ref, dash: s === ref ? '' : satDash(s, si) });
    });
  });
  let xmax = now;
  series.forEach((sr) => { const m = sr.pts[sr.pts.length - 1].x; if (m > xmax) xmax = m; });
  return { series, sats, ref, xmin, xmax, now };
}

function niceStep(range) {
  const step = Math.pow(10, Math.floor(Math.log10(range / 5)));
  return [1, 2, 5, 10].find((v) => v * step >= range / 5) * step;
}
const tickText = (v) => String(Math.round(v * 10) / 10).replace('.', ',').replace('-', '−');

// ---------- scheda ----------
function fieldCard() {
  const c = S.chart, sats = chartSats(), ref = selectedSource();
  const satChips = sats.length ? sats.map((s, i) => '<button type="button" class="ab-chip" data-sat="' + esc(s) + '" aria-pressed="' + !c.hiddenSats[s] + '"><svg class="ab-dash" viewBox="0 0 34 10" aria-hidden="true"><path d="M1 5H33" fill="none" stroke="currentColor" stroke-width="' + (s === ref ? 2.4 : 1.4) + '" stroke-dasharray="' + (s === ref ? '' : satDash(s, i)) + '"/></svg>' + esc(s) + (s === ref ? '<small>NOAA</small>' : '') + '</button>').join('') : '<span class="t-body-sm" style="color:var(--ink-3)">In attesa delle sonde…</span>';
  const compChips = FIELD_COMPS.map((cp) => '<button type="button" class="ab-chip" data-comp="' + cp.key + '" aria-pressed="' + !!c.comps[cp.key] + '" title="' + cp.label + ' · ' + cp.name + '" aria-label="' + cp.label + ', ' + cp.name + '"><i class="ab-dot" style="background:' + cp.color + '"></i>' + cp.label + '<small class="ab-name">' + cp.name + '</small></button>').join('');
  const seg = (attr, items, cur) => '<div class="ab-seg" role="group">' + items.map(([v, l]) => '<button type="button" ' + attr + '="' + v + '" aria-pressed="' + (String(cur) === String(v)) + '">' + l + '</button>').join('') + '</div>';
  return card('Campo magnetico a L1',
    '<div class="ab-chart" id="fieldChart"></div><div class="ab-ro" id="fieldReadout" aria-live="off"></div>' +
    '<div class="ab-ctl"><span class="ab-label">Sonde</span><div class="ab-chips" role="group" aria-label="Sonde visibili">' + satChips + '</div></div>' +
    '<div class="ab-ctl"><span class="ab-label">Componenti</span><div class="ab-chips" role="group" aria-label="Componenti visibili">' + compChips + '</div></div>' +
    '<details class="ab-details"><summary>Come leggere il grafico' + icon('chev') + '</summary><ul class="ab-bullets" style="margin:0 0 var(--space-2);padding-left:var(--space-5);color:var(--ink-2)">' +
    '<li>Ogni componente ha un colore: Bt bianco, Bz rosso, Bx azzurro, By sabbia. Ogni sonda ha un tratto.</li>' +
    '<li>La linea continua, un po’ più marcata, è la sonda di riferimento NOAA: è quella su cui si decide. Le tratteggiate sono le altre sonde a L1: se dicono tutte la stessa cosa il dato è solido, se divergono vai cauto.</li>' +
    '<li>Sotto lo zero Bz punta a sud (favorevole). Le fasce chiare sono gli episodi di Bz sud rilevati; quella più scura è il fronte scelto.</li>' +
    '<li>L’orario in basso è quello della misura a L1. La linea tratteggiata con il simbolo della Terra («now») segna il vento che la sonda ha misurato circa un’ora fa (1.500.000 km ÷ velocità): è quello che sta raggiungendo la Terra ora. A destra della linea c’è ciò che è già misurato ma non è ancora arrivato: quando la linea raggiunge una fascia, quell’episodio arriva.</li>' +
    '<li>Scegliere quali curve vedere non cambia la sonda usata per episodi e livello del segnale: si cambia in «Come è calcolato».</li></ul></details>' +
    '<div class="ab-tagrow">' + tag('measured', 'Campo misurato') + tag('estimated', 'Linea «Terra»: stimata') + '</div><p class="t-caption ab-credit">Dati: NOAA Space Weather Prediction Center.</p>',
    { id: 'fieldCard', right: seg('data-hours', CHART_HOURS.map((h) => [h, h + ' h']), c.hours) });
}

// ---------- disegno ----------
function drawField() {
  const el = $('fieldChart'); if (!el) return;
  const d = fieldChartData(), c = S.chart, out = $('fieldReadout');
  const hint = 'Tocca o passa sul grafico per leggere i valori.';
  if (!d.sats.length) { el.innerHTML = empty('In attesa dei dati delle sonde…'); out.textContent = ''; return; }
  if (!d.series.length) { el.innerHTML = empty(Object.values(c.comps).some(Boolean) && d.sats.some((s) => !c.hiddenSats[s]) ? 'Nessun dato in questo intervallo.' : 'Attiva almeno una sonda e una componente.'); out.textContent = ''; return; }
  const W = Math.max(280, Math.round(el.clientWidth)), H = W < 420 ? 310 : W < 700 ? 350 : 420, L = 44, R = W - 8, T = 22, B = H - 30;
  let lo = 0, hi = 0;
  d.series.forEach((s) => s.pts.forEach((p) => { if (p.v < lo) lo = p.v; if (p.v > hi) hi = p.v; }));
  const span = Math.max(hi - lo, 2); lo -= span * 0.08; hi += span * 0.08;
  const stp = niceStep(hi - lo), ylo = Math.floor(lo / stp) * stp, yhi = Math.ceil(hi / stp) * stp;
  const X = (t) => L + (t - d.xmin) / (d.xmax - d.xmin) * (R - L), Y = (v) => B - (v - ylo) / (yhi - ylo) * (B - T), z = Y(0);
  const sel = pickEvent(d.now);
  // griglia
  let grid = '';
  for (let v = ylo; v <= yhi + stp * 0.01; v += stp) { const vv = Math.round(v * 1e6) / 1e6; grid += '<line class="' + (Math.abs(vv) < 1e-9 ? 'zero' : 'grid') + '" x1="' + L + '" x2="' + R + '" y1="' + Y(vv).toFixed(1) + '" y2="' + Y(vv).toFixed(1) + '"/><text class="tick" x="' + (L - 6) + '" y="' + (Y(vv) + 4).toFixed(1) + '" text-anchor="end">' + tickText(vv) + '</text>'; }
  const tstep = [10, 15, 30, 60, 120, 240, 360, 720].map((m) => m * 60000).find((s) => (d.xmax - d.xmin) / s <= (W < 340 ? 5 : 7)) || 720 * 60000;
  for (let t = Math.ceil(d.xmin / tstep) * tstep; t <= d.xmax; t += tstep) { const x = X(t); if (x > L + 16 && x < R - 16) grid += '<line class="grid" x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="' + T + '" y2="' + B + '"/><text class="tick" x="' + x.toFixed(1) + '" y="' + (B + 20) + '" text-anchor="middle">' + fmtClock(t) + '</text>'; }
  // fasce degli episodi
  let bands = '';
  S.episodes.forEach((e) => {
    const a = e.start, b = e.end;
    if (b < d.xmin || a > d.xmax) return;
    const x0 = X(Math.max(a, d.xmin)), x1 = X(Math.min(b, d.xmax));
    bands += '<rect class="ep' + (sel && sel.start === e.start ? ' sel' : '') + '" x="' + x0.toFixed(1) + '" y="' + T + '" width="' + Math.max(2, x1 - x0).toFixed(1) + '" height="' + (B - T) + '"/>';
  });
  // riempimento sotto/sopra lo zero per il Bz della sonda di riferimento
  let fill = '';
  const rb = d.series.find((s) => s.isRef && s.key === 'bz_gsm');
  if (rb) {
    let a = '', open = false, prev = null;
    rb.pts.forEach((p) => {
      const x = X(p.x).toFixed(1), y = Y(p.v).toFixed(1);
      if (!prev || p.x - prev.x > 3 * 60000) { if (open) a += 'L' + X(prev.x).toFixed(1) + ',' + z.toFixed(1) + 'Z'; a += 'M' + x + ',' + z.toFixed(1) + 'L' + x + ',' + y; open = true; } else a += 'L' + x + ',' + y;
      prev = p;
    });
    if (open) a += 'L' + X(prev.x).toFixed(1) + ',' + z.toFixed(1) + 'Z';
    fill = '<defs><clipPath id="fcn"><rect x="0" y="0" width="' + W + '" height="' + z.toFixed(1) + '"/></clipPath><clipPath id="fcs"><rect x="0" y="' + z.toFixed(1) + '" width="' + W + '" height="' + (H - z).toFixed(1) + '"/></clipPath></defs><path class="northfill ffill" clip-path="url(#fcn)" d="' + a + '"/><path class="south ffill" clip-path="url(#fcs)" d="' + a + '"/>';
  }
  // curve: prima le altre sonde, sopra il riferimento
  const lines = d.series.slice().sort((a, b) => a.isRef - b.isRef).map((s) => {
    let p = '', prev = null;
    s.pts.forEach((q) => { const x = X(q.x).toFixed(1), y = Y(q.v).toFixed(1); p += (!prev || q.x - prev.x > 3 * 60000 ? 'M' : 'L') + x + ',' + y; prev = q; });
    const halo = s.isRef ? '<path class="line" d="' + p + '" style="stroke:var(--surface-1);stroke-width:3;opacity:.85"/>' : '';
    return halo + '<path class="line" d="' + p + '" style="stroke:' + s.comp.color + ';stroke-width:' + (s.isRef ? 1.5 : 0.9) + ';opacity:' + (s.isRef ? 1 : 0.75) + '"' + (s.dash ? ' stroke-dasharray="' + s.dash + '"' : '') + '/>';
  }).join('');
  let marks = '', travel = '';
  const cn = l1Now(), lag = cn && cn.v ? lagMin(cn.v) : null, xe = lag != null ? d.now - lag * 60000 : null;
  if (xe != null && xe > d.xmin + 60000) {
    const ex = X(xe), room = ex - L;
    travel = '<rect x="' + ex.toFixed(1) + '" y="' + T + '" width="' + Math.max(0, R - ex).toFixed(1) + '" height="' + (B - T) + '" fill="var(--surface-2)" fill-opacity=".7"/>';
    // simbolo della Terra con «now» in cima alla linea; a destra «in viaggio»
    const gx = ex.toFixed(1), gy = T - 10, left = room >= 52;
    marks += '<line class="now" x1="' + gx + '" x2="' + gx + '" y1="' + (gy + 8) + '" y2="' + B + '"/>' +
      '<g transform="translate(' + gx + ' ' + gy + ')"><title>Sulla Terra adesso: il vento misurato a L1 circa ' + Math.round(lag) + ' minuti fa</title><circle r="8" fill="var(--surface-1)" stroke="var(--ink)" stroke-width="1.6"/><ellipse rx="3.4" ry="8" fill="none" stroke="var(--ink)" stroke-width="1.2"/><line x1="-8" x2="8" y1="0" y2="0" stroke="var(--ink)" stroke-width="1.2"/></g>' +
      '<text class="tag" x="' + (left ? (ex - 13).toFixed(1) : (ex + 13).toFixed(1)) + '" y="' + (gy + 4) + '" text-anchor="' + (left ? 'end' : 'start') + '">now</text>' +
      (R - ex >= (left ? 74 : 110) ? '<text class="tag" x="' + (ex + 13).toFixed(1) + '" y="' + (gy + (left ? 4 : 20)) + '">in viaggio</text>' : '');
  }
  if (c.comps.bz_gsm && z > T + 14 && z < B - 4) marks += '<text class="tag zlabel" x="' + (L + 8) + '" y="' + (z - 7).toFixed(1) + '">' + (W < 520 ? 'Sotto lo zero: Bz a sud (favorevole)' : '0 nT — sotto questa linea Bz punta a sud (favorevole)') + '</text>';
  el.innerHTML = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Campo magnetico interplanetario a L1: ' + esc(d.series.map((s) => s.comp.label + ' ' + s.src).filter((v, i, a) => a.indexOf(v) === i).join(', ')) + ', ultime ' + c.hours + ' ore, orario di misura a L1">' +
    travel + bands + grid + fill + lines + marks + '<text class="tick" x="4" y="12">nT</text><line class="ab-cursor" id="fieldCursor" y1="' + T + '" y2="' + B + '" x1="-10" x2="-10"/></svg>';
  out.innerHTML = '<span class="t-caption" style="color:var(--ink-3)">' + hint + '</span>';
  // valori al passaggio del dito
  const svg = el.firstChild, cur = $('fieldCursor');
  const near = (pts, t) => { let best = null, bd = 3 * 60000; for (let i = 0; i < pts.length; i++) { const dd = Math.abs(pts[i].x - t); if (dd < bd) { bd = dd; best = pts[i]; } } return best; };
  const move = (ev) => {
    const r = svg.getBoundingClientRect(), x = ev.clientX - r.left;
    if (x < L || x > R) return;
    const t = d.xmin + (x - L) / (R - L) * (d.xmax - d.xmin);
    cur.setAttribute('x1', x.toFixed(1)); cur.setAttribute('x2', x.toFixed(1));
    const rows = FIELD_COMPS.filter((cp) => c.comps[cp.key]).map((cp) => {
      const vals = d.series.filter((s) => s.key === cp.key).map((s) => { const p = near(s.pts, t); return p ? (s.isRef ? '<b>' : '<span>') + esc(s.src) + ' ' + signed(p.v, 1) + (s.isRef ? '</b>' : '</span>') : ''; }).filter(Boolean);
      return vals.length ? '<div><i class="ab-dot" style="background:' + cp.color + '"></i><em>' + cp.label + '</em>' + vals.join('') + '</div>' : '';
    }).join('');
    out.innerHTML = '<span class="t-caption" style="color:var(--ink-2)">' + fmtClock(t) + ' · orario di misura a L1' + ' · nT</span>' + (rows || '');
  };
  svg.addEventListener('pointermove', move); svg.addEventListener('pointerdown', move);
  svg.addEventListener('pointerleave', () => { cur.setAttribute('x1', -10); cur.setAttribute('x2', -10); out.innerHTML = '<span class="t-caption" style="color:var(--ink-3)">' + hint + '</span>'; });
}
