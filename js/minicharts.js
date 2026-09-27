'use strict';
// Aurora Bande · new version — due grafici piccoli, con linee sottili:
//  · il magnetometro IMAGE più vicino (componente X, variazione rispetto al riferimento) nella scheda «Riscontro a terra»
//  · il Bz del fronte scelto (quanto è andato a sud) nella scheda «Dettagli dell’episodio»
// Usano le stesse classi SVG del grafico del campo (css/app.css) e niceStep/tickText di field.js.

S.flareSel = null;
const GROUND_HOURS = [2, 6, 24];
S.groundHours = GROUND_HOURS.includes(store.get('aurora_ground_h', 6)) ? store.get('aurora_ground_h', 6) : 6;
function saveGroundHours() { store.set('aurora_ground_h', S.groundHours); }

function timeTicks(xmin, xmax, X, L, R, B, W, grid) {
  const tstep = [10, 15, 30, 60, 120, 240, 360, 720].map((m) => m * 60000).find((s) => (xmax - xmin) / s <= (W < 340 ? 5 : 7)) || 720 * 60000;
  for (let t = Math.ceil(xmin / tstep) * tstep; t <= xmax; t += tstep) {
    const x = X(t);
    if (x > L + 16 && x < R - 16) grid.push('<line class="grid" x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="12" y2="' + B + '"/><text class="tick" x="' + x.toFixed(1) + '" y="' + (B + 20) + '" text-anchor="middle">' + fmtClock(t) + '</text>');
  }
}
function pathOf(pts, X, Y) {
  let p = '', prev = null;
  pts.forEach((q) => { p += (!prev || q.x - prev.x > 3 * 60000 ? 'M' : 'L') + X(q.x).toFixed(1) + ',' + Y(q.v).toFixed(1); prev = q; });
  return p;
}
function attachReadout(svg, cursor, out, hint, L, R, at) {
  const move = (ev) => {
    const r = svg.getBoundingClientRect(), x = ev.clientX - r.left;
    if (x < L || x > R) return;
    cursor.setAttribute('x1', x.toFixed(1)); cursor.setAttribute('x2', x.toFixed(1));
    out.innerHTML = at(x);
  };
  svg.addEventListener('pointermove', move); svg.addEventListener('pointerdown', move);
  svg.addEventListener('pointerleave', () => { cursor.setAttribute('x1', -10); cursor.setAttribute('x2', -10); out.innerHTML = hint; });
}

// ============================ magnetometro a terra ============================
function groundChartBlock() {
  const seg = '<div class="ab-seg" role="group" aria-label="Intervallo del grafico">' + GROUND_HOURS.map((h) => '<button type="button" data-ghours="' + h + '" aria-pressed="' + (S.groundHours === h) + '">' + h + ' h</button>').join('') + '</div>';
  return '<div class="ab-ctl" style="margin-top:var(--space-4)"><span class="ab-label">Componente X, ultime ore</span>' + seg + '</div>' +
    '<div class="ab-chart" id="groundChart"></div><div class="ab-ro" id="groundReadout" aria-live="off" style="min-height:24px"></div>';
}

function drawGround() {
  const el = $('groundChart'); if (!el) return;
  const out = $('groundReadout'), now = Date.now(), e = pickEvent(now), st = nearestGroundStation();
  const all = S.ground.errors[st] ? [] : (S.ground.byStation[st] || []);
  const xmin = now - S.groundHours * 3600e3, pts = all.filter((p) => p[0] >= xmin && p[0] <= now + 60000).map((p) => ({ x: p[0], v: p[1] }));
  if (pts.length < 3) { el.innerHTML = empty(S.ground.pending ? 'Caricamento delle misure IMAGE…' : 'Misure numeriche non disponibili ora. Il magnetogramma ufficiale resta consultabile sul sito FMI.'); out.textContent = ''; return; }
  // zero del grafico: la stessa mediana di riferimento usata dal confronto (30–20 min prima dell'arrivo stimato); senza fronte, la mediana dell'intervallo visibile
  let ref = null, hasRef = false;
  if (e && e.arrStart != null) {
    const base = all.filter((p) => p[0] >= e.arrStart - 30 * 60000 && p[0] <= e.arrStart - 20 * 60000);
    if (base.length >= 8) { ref = groundMedian(base.map((p) => p[1])); hasRef = true; }
  }
  if (ref == null) ref = groundMedian(pts.map((p) => p.v));
  pts.forEach((p) => { p.abs = p.v; p.v -= ref; });
  const W = Math.max(280, Math.round(el.clientWidth)), H = W < 420 ? 220 : 260, L = 48, R = W - 8, T = 18, B = H - 30;
  let lo = Math.min.apply(null, pts.map((p) => p.v)), hi = Math.max.apply(null, pts.map((p) => p.v));
  if (hasRef) { lo = Math.min(lo, -110); hi = Math.max(hi, 110); }
  const span = Math.max(hi - lo, 40); lo -= span * 0.08; hi += span * 0.08;
  const stp = niceStep(hi - lo), ylo = Math.floor(lo / stp) * stp, yhi = Math.ceil(hi / stp) * stp;
  const X = (t) => L + (t - xmin) / (now - xmin) * (R - L), Y = (v) => B - (v - ylo) / (yhi - ylo) * (B - T);
  const g = [];
  for (let v = ylo; v <= yhi + stp * 0.01; v += stp) { const vv = Math.round(v * 1e6) / 1e6; g.push('<line class="' + (Math.abs(vv) < 1e-9 ? 'zero' : 'grid') + '" x1="' + L + '" x2="' + R + '" y1="' + Y(vv).toFixed(1) + '" y2="' + Y(vv).toFixed(1) + '"/><text class="tick" x="' + (L - 6) + '" y="' + (Y(vv) + 4).toFixed(1) + '" text-anchor="end">' + tickText(vv) + '</text>'); }
  timeTicks(xmin, now, X, L, R, B, W, g);
  let marks = '';
  if (e && e.arrStart != null) {
    const a = e.arrStart - ARRIVAL_MARGIN_MS, b = e.arrStart + ARRIVAL_MARGIN_MS;
    if (b > xmin && a < now) {
      const x0 = X(Math.max(a, xmin)), x1 = X(Math.min(b, now));
      marks += '<rect class="ep sel" x="' + x0.toFixed(1) + '" y="' + T + '" width="' + Math.max(3, x1 - x0).toFixed(1) + '" height="' + (B - T) + '"/><text class="tag" x="' + Math.min(x0 + 4, R - 96).toFixed(1) + '" y="' + (T + 14) + '">arrivo stimato</text>';
    }
  }
  if (hasRef) [100, -100].forEach((v) => { marks += '<line class="now" x1="' + L + '" x2="' + R + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '"/>'; });
  if (hasRef && Y(100) > T + 12) marks += '<text class="tag zlabel" x="' + (R - 4) + '" y="' + (Y(100) - 6).toFixed(1) + '" text-anchor="end">soglia ±100 nT</text>';
  const line = '<path class="line" d="' + pathOf(pts, X, Y) + '" style="stroke:var(--ink);stroke-width:1.1"/>';
  el.innerHTML = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Magnetometro ' + esc(GROUND_NAMES[st]) + ', componente X, variazione rispetto al riferimento, ultime ' + S.groundHours + ' ore">' +
    g.join('') + marks + line + '<text class="tick" x="4" y="12">ΔX nT</text><line class="ab-cursor" id="groundCursor" y1="' + T + '" y2="' + B + '" x1="-10" x2="-10"/></svg>';
  const hint = '<span class="t-caption" style="color:var(--ink-3)">' + (hasRef ? 'Zero = mediana di riferimento prima dell’arrivo stimato. ' : 'Zero = mediana dell’intervallo mostrato. ') + 'Tocca il grafico per i valori.</span>';
  out.innerHTML = hint;
  const near = (t) => { let best = null, bd = 3 * 60000; for (const p of pts) { const dd = Math.abs(p.x - t); if (dd < bd) { bd = dd; best = p; } } return best; };
  attachReadout(el.firstChild, $('groundCursor'), out, hint, L, R, (x) => {
    const t = xmin + (x - L) / (R - L) * (now - xmin), p = near(t);
    return '<span class="t-caption" style="color:var(--ink-2)">' + fmtClock(t) + ' · ' + esc(GROUND_NAMES[st]) + '</span>' + (p ? '<div><em>ΔX</em><b>' + signed(p.v, 0) + ' nT</b><span>X ' + itNum(p.abs, 0) + ' nT</span></div>' : '<span class="t-caption">Nessuna misura qui</span>');
  });
}

// ============================ Bz del fronte ============================
function frontChartBlock() { return '<div class="ab-chart" id="frontChart" style="margin-top:var(--space-4)"></div><div class="ab-ro" id="frontReadout" aria-live="off" style="min-height:24px"></div>'; }

function drawFront(sel) {
  const el = $('frontChart'); if (!el) return;
  const out = $('frontReadout'), now = Date.now();
  if (!sel) { el.innerHTML = ''; out.textContent = ''; return; }
  const x0 = sel.start - 30 * 60000, x1 = Math.min(now, (sel.ongoing ? now : sel.end) + 30 * 60000);
  const pts = seriesFor(S.magRaw, selectedSource(), 'bz_gsm', x0 - 60000).filter((p) => p.t >= x0 && p.t <= x1).map((p) => ({ x: p.t, v: p.v }));
  if (pts.length < 3) { el.innerHTML = empty('Nessun dato di Bz per questo intervallo.'); out.textContent = ''; return; }
  const W = Math.max(280, Math.round(el.clientWidth)), H = W < 420 ? 200 : 230, L = 44, R = W - 8, T = 18, B = H - 30;
  let lo = Math.min(0, Math.min.apply(null, pts.map((p) => p.v))), hi = Math.max(0, Math.max.apply(null, pts.map((p) => p.v)));
  const span = Math.max(hi - lo, 4); lo -= span * 0.1; hi += span * 0.1;
  const stp = niceStep(hi - lo), ylo = Math.floor(lo / stp) * stp, yhi = Math.ceil(hi / stp) * stp;
  const X = (t) => L + (t - x0) / (x1 - x0) * (R - L), Y = (v) => B - (v - ylo) / (yhi - ylo) * (B - T), z = Y(0);
  const g = [];
  for (let v = ylo; v <= yhi + stp * 0.01; v += stp) { const vv = Math.round(v * 1e6) / 1e6; g.push('<line class="' + (Math.abs(vv) < 1e-9 ? 'zero' : 'grid') + '" x1="' + L + '" x2="' + R + '" y1="' + Y(vv).toFixed(1) + '" y2="' + Y(vv).toFixed(1) + '"/><text class="tick" x="' + (L - 6) + '" y="' + (Y(vv) + 4).toFixed(1) + '" text-anchor="end">' + tickText(vv) + '</text>'); }
  timeTicks(x0, x1, X, L, R, B, W, g);
  const ea = X(Math.max(sel.start, x0)), eb = X(Math.min(sel.ongoing ? now : sel.end, x1));
  let area = '', open = false, prev = null;
  pts.forEach((p) => {
    const x = X(p.x).toFixed(1), y = Y(p.v).toFixed(1);
    if (!prev || p.x - prev.x > 3 * 60000) { if (open) area += 'L' + X(prev.x).toFixed(1) + ',' + z.toFixed(1) + 'Z'; area += 'M' + x + ',' + z.toFixed(1) + 'L' + x + ',' + y; open = true; } else area += 'L' + x + ',' + y;
    prev = p;
  });
  if (open) area += 'L' + X(prev.x).toFixed(1) + ',' + z.toFixed(1) + 'Z';
  const fill = '<defs><clipPath id="fzn"><rect x="0" y="0" width="' + W + '" height="' + z.toFixed(1) + '"/></clipPath><clipPath id="fzs"><rect x="0" y="' + z.toFixed(1) + '" width="' + W + '" height="' + (H - z).toFixed(1) + '"/></clipPath></defs><path class="northfill ffill" clip-path="url(#fzn)" d="' + area + '"/><path class="south ffill" clip-path="url(#fzs)" d="' + area + '"/>';
  // punto più basso dentro l'episodio
  let minP = null; pts.forEach((p) => { if (p.x >= sel.start && (sel.ongoing || p.x <= sel.end) && (!minP || p.v < minP.v)) minP = p; });
  let mk = '<line class="now" x1="' + L + '" x2="' + R + '" y1="' + Y(BZ_CFG.threshold).toFixed(1) + '" y2="' + Y(BZ_CFG.threshold).toFixed(1) + '"/>';
  if (minP) {
    const mx = X(minP.x), my = Y(minP.v), left = mx > W * 0.6;
    mk += '<circle cx="' + mx.toFixed(1) + '" cy="' + my.toFixed(1) + '" r="4.5" fill="var(--series-bz)" stroke="var(--surface-1)" stroke-width="2"/><text class="tag zlabel" x="' + (left ? mx - 9 : mx + 9).toFixed(1) + '" y="' + (my + 4).toFixed(1) + '" text-anchor="' + (left ? 'end' : 'start') + '">min ' + signed(minP.v, 1) + ' nT</text>';
  }
  const line = '<path class="line" d="' + pathOf(pts, X, Y) + '" style="stroke:var(--series-bz);stroke-width:1.4"/>';
  el.innerHTML = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Bz del fronte scelto, con minimo di ' + (minP ? signed(minP.v, 1) : '—') + ' nT">' +
    '<rect class="ep sel" x="' + ea.toFixed(1) + '" y="' + T + '" width="' + Math.max(2, eb - ea).toFixed(1) + '" height="' + (B - T) + '"/>' + g.join('') + fill + line + mk + '<text class="tick" x="4" y="12">Bz nT</text><line class="ab-cursor" id="frontCursor" y1="' + T + '" y2="' + B + '" x1="-10" x2="-10"/></svg>';
  const hint = '<span class="t-caption" style="color:var(--ink-3)">Bz misurato a L1 (' + esc(selectedSource() || '—') + '). Fascia = durata dell’episodio; tratteggio = soglia −1 nT. Tocca per i valori.</span>';
  out.innerHTML = hint;
  const near = (t) => { let best = null, bd = 3 * 60000; for (const p of pts) { const dd = Math.abs(p.x - t); if (dd < bd) { bd = dd; best = p; } } return best; };
  attachReadout(el.firstChild, $('frontCursor'), out, hint, L, R, (x) => {
    const t = x0 + (x - L) / (R - L) * (x1 - x0), p = near(t);
    return '<span class="t-caption" style="color:var(--ink-2)">' + fmtClock(t) + ' · orario di misura a L1</span>' + (p ? '<div><em>Bz</em><b>' + signed(p.v, 1) + ' nT</b></div>' : '<span class="t-caption">Nessuna misura qui</span>');
  });
}

// ============================ brillamenti degli ultimi 7 giorni ============================
// Asse verticale logaritmico con una fascia per classe (A, B, C, M, X): i brillamenti forti «escono» dal fondo.
function drawFlares() {
  const el = $('flareChart'); if (!el) return;
  const evs = flareEvents(S.noaa && S.noaa.flares), now = Date.now(), xmin = now - 7 * 86400000;
  const W = Math.max(280, Math.round(el.clientWidth)), H = W < 420 ? 230 : 270, L = 44, R = W - 6, T = 10, B = H - 28;
  const LO = -8, HI = -3;
  const Y = (f) => B - (Math.max(LO, Math.min(HI, Math.log10(f))) - LO) / (HI - LO) * (B - T), X = (t) => L + (t - xmin) / (now - xmin) * (R - L);
  let g = '';
  [['A', -8, 'debole'], ['B', -7, 'debole'], ['C', -6, 'piccolo'], ['M', -5, 'medio'], ['X', -4, 'forte']].forEach(([l, e10, word]) => {
    const y0 = Y(Math.pow(10, e10 + 1)), y1 = Y(Math.pow(10, e10));
    if (l === 'M') g += '<rect x="' + L + '" y="' + y0.toFixed(1) + '" width="' + (R - L) + '" height="' + (y1 - y0).toFixed(1) + '" fill="var(--ink)" fill-opacity=".07"/>';
    if (l === 'X') g += '<rect x="' + L + '" y="' + y0.toFixed(1) + '" width="' + (R - L) + '" height="' + (y1 - y0).toFixed(1) + '" fill="var(--aurora-magenta)" fill-opacity=".14"/>';
    g += '<line class="grid" x1="' + L + '" x2="' + R + '" y1="' + y1.toFixed(1) + '" y2="' + y1.toFixed(1) + '"/><text class="tick" x="' + (L - 8) + '" y="' + ((y0 + y1) / 2 + 4).toFixed(1) + '" text-anchor="end" style="' + (l === 'M' || l === 'X' ? 'fill:var(--ink);font-weight:600' : '') + '">' + l + '</text><text class="tick" x="' + (L + 8) + '" y="' + ((y0 + y1) / 2 + 4).toFixed(1) + '" style="paint-order:stroke;stroke:var(--surface-1);stroke-width:3px;' + (l === 'M' || l === 'X' ? 'fill:var(--ink);font-weight:600' : '') + '">' + word + '</text>';
  });
  g += '<text class="tick" transform="translate(11 ' + ((T + B) / 2).toFixed(1) + ') rotate(-90)" text-anchor="middle">più debole → più forte</text><line class="grid" x1="' + L + '" x2="' + R + '" y1="' + Y(1e-3).toFixed(1) + '" y2="' + Y(1e-3).toFixed(1) + '"/>';
  // giorni locali: linee a mezzanotte, etichette al centro di ogni giorno
  const mids = [];
  for (let t = Math.ceil(xmin / 3600e3) * 3600e3; t <= now; t += 3600e3) if (fmtClock(t) === '00:00') mids.push(t);
  const edges = [xmin].concat(mids, [now]);
  mids.forEach((t) => { g += '<line class="grid" x1="' + X(t).toFixed(1) + '" x2="' + X(t).toFixed(1) + '" y1="' + T + '" y2="' + B + '"/>'; });
  for (let i = 0; i < edges.length - 1; i++) {
    const a = edges[i], b = edges[i + 1];
    const wide = X(b) - X(a);
    if (wide < 26) continue;
    const lab = new Date((a + b) / 2).toLocaleDateString('it-IT', { weekday: wide >= 56 ? 'short' : 'narrow', day: 'numeric', timeZone: zone() }).replace('.', '');
    g += '<text class="tick" x="' + ((X(a) + X(b)) / 2).toFixed(1) + '" y="' + (B + 18) + '" text-anchor="middle">' + esc(lab) + '</text>';
  }
  let pts = '', labs = '';
  const withCme = flaresWithCme(), hits = [];
  evs.filter((e) => e.t >= xmin && e.t <= now).sort((a, b) => a.flux - b.flux).forEach((e) => {
    const x = X(e.t), y = Y(e.flux), big = e.L === 'M' || e.L === 'X';
    hits.push({ x, y, e });
    pts += '<line x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="' + y.toFixed(1) + '" y2="' + B + '" stroke="var(--line-strong)" stroke-width="1"/>';
    if (withCme.some((p) => Math.abs(p - e.t) <= 20 * 60000)) pts += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + ((e.L === 'X' ? 7.5 : e.L === 'M' ? 6 : e.L === 'C' ? 4 : 2.6) + 4.5) + '" fill="none" stroke="var(--ink)" stroke-width="1.6"/>';
    if (e.L === 'X') pts += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="7.5" fill="var(--aurora-magenta)" stroke="var(--surface-1)" stroke-width="2"/>';
    else if (e.L === 'M') pts += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="6" fill="var(--ink)" stroke="var(--surface-1)" stroke-width="2"/>';
    else if (e.L === 'C') pts += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="4" fill="var(--ink-2)"/>';
    else pts += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="2.6" fill="var(--surface-1)" stroke="var(--ink-3)" stroke-width="1.4"/>';
    if (e.t === S.flareSel) pts += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + ((e.L === 'X' ? 7.5 : e.L === 'M' ? 6 : e.L === 'C' ? 4 : 2.6) + 9) + '" fill="var(--aurora-green)" fill-opacity=".16" stroke="var(--aurora-green)" stroke-width="2.2"/>';
    // X sopra il punto; M di lato (a destra, o a sinistra vicino al bordo), così due eventi ravvicinati non si coprono
    if (e.L === 'X') labs += '<text class="tag zlabel" x="' + Math.max(L + 14, Math.min(R - 14, x)).toFixed(1) + '" y="' + (y - 12).toFixed(1) + '" text-anchor="middle" style="fill:var(--ink)">' + esc(e.cls) + '</text>';
    else if (big) { const left = x > R - 48; labs += '<text class="tag zlabel" x="' + (left ? x - 10 : x + 10).toFixed(1) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="' + (left ? 'end' : 'start') + '" style="fill:var(--ink)">' + esc(e.cls) + '</text>'; }
  });
  const top = evs.filter((e) => e.t >= xmin).sort((a, b) => b.flux - a.flux)[0];
  el.innerHTML = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Brillamenti solari degli ultimi 7 giorni: ' + evs.filter((e) => e.t >= xmin).length + ' eventi' + (top ? ', il più forte ' + esc(top.cls) : '') + '" style="cursor:pointer">' + g + pts + labs + '</svg>';
  // tocco: seleziona il punto più vicino (raggio 26 px, comodo per il dito)
  el.firstChild.addEventListener('click', (ev) => {
    const r = el.firstChild.getBoundingClientRect(), px = ev.clientX - r.left, py = ev.clientY - r.top;
    let best = null, bd = 26;
    hits.forEach((h) => { const d = Math.hypot(h.x - px, h.y - py); if (d < bd) { bd = d; best = h; } });
    if (best) { S.flareSel = best.e.t; drawFlares(); }
  });
  renderFlareDetail();
}

// ---------- dettaglio del brillamento scelto: valori e foto del Sole a quell'ora ----------
const flareWindowEvents = () => flareEvents(S.noaa && S.noaa.flares).filter((e) => e.t >= Date.now() - 7 * 86400000 && e.t <= Date.now());
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
function fluxText(f) { const [m, e] = f.toExponential(1).split('e'); return String(m).replace('.', ',') + ' × 10' + String(Number(e)).split('').map((c) => SUP[c] || c).join('') + ' W/m²'; }
const heliParams = (e) => 'date=' + new Date(e.t).toISOString().replace(/\.\d+Z$/, '.000Z') + '&imageScale=4.6&layers=[SDO,AIA,131,1,100]';

function flareDetailHTML(e, list) {
  const i = list.findIndex((x) => x.t === e.t), d = S.noaa && S.noaa.donki;
  const near = d ? d.flr.find((f) => Math.abs(Date.parse(f.peakTime) - e.t) <= 20 * 60000) : null, loc = near ? parseSolarLoc(near.sourceLocation) : null;
  const hasCme = !!near && (near.linkedEvents || []).some((x) => /-CME-/.test(x.activityID));
  const dur = e.begin != null && e.end != null ? Math.round((e.end - e.begin) / 60000) : null;
  const hhmm = (ms) => new Date(ms).toISOString().slice(11, 16);
  const faceTxt = loc ? loc.txt + ' · ' + (loc.face === 'front' ? 'rivolto verso la Terra' : loc.face === 'side' ? 'un po’ di lato' : 'sul bordo del Sole, non rivolto alla Terra') : '';
  const lines = [
    '<p class="t-body-sm">Picco di intensità <b>' + fluxText(e.flux) + '</b> nei raggi X (satellite GOES).</p>',
    loc ? '<p class="t-body-sm">Posizione sul Sole: <b>' + esc(faceTxt) + '</b></p>' : '',
    hasCme ? '<p class="t-body-sm">Ha lanciato una CME: <a href="#cmeCard" data-go="#cmeCard">vedi «CME dal Sole»</a>.</p>' : (d && (e.L === 'C' || e.L === 'M' || e.L === 'X') ? '<p class="t-body-sm" style="color:var(--ink-2)">Nessuna CME collegata finora.</p>' : ''),
  ].join('');
  const img = 'https://api.helioviewer.org/v2/takeScreenshot/?' + heliParams(e) + '&x0=0&y0=0&width=480&height=480&display=true&watermark=false';
  const fig = '<figure class="ab-fdetail__fig"><img src="' + img + '" alt="Il Sole a 131 Å alle ' + hhmm(e.t) + ' UTC, ora del picco del brillamento ' + esc(e.cls) + '" width="480" height="480" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),{className:\'ab-media__ph\',textContent:\'Foto non disponibile ora\'}))"><figcaption class="t-caption">Il Sole a 131 Å (SDO/AIA), l’immagine più vicina alle ' + hhmm(e.t) + ' UTC: il canale che mostra meglio i brillamenti, come zone più luminose. Le foto dell’ultimo giorno possono mancare. AIA data courtesy of NASA/SDO and the AIA, EVE, and HMI science teams, tramite Helioviewer.org. <a href="https://helioviewer.org/?' + heliParams(e) + '" target="_blank" rel="noopener">Apri in Helioviewer' + icon('ext') + '</a></figcaption></figure>';
  const nav = '<div class="ab-fnav"><button type="button" class="ab-btn" data-fnav="-1"' + (i <= 0 ? ' disabled' : '') + '>‹ Precedente</button><span class="t-caption">' + (i + 1) + ' di ' + list.length + '</span><button type="button" class="ab-btn" data-fnav="1"' + (i >= list.length - 1 ? ' disabled' : '') + '>Successivo ›</button></div>';
  return '<div class="ab-fdetail__top" data-c="' + e.L + '"><span class="ab-fdetail__cls">' + esc(e.cls) + '</span><div><b>Brillamento ' + esc(FLARE_WORD[e.L]) + '</b><span>' + esc(fmtDayClock(e.t)) + '</span><small>' + (dur != null ? 'inizio ' + fmtClock(e.begin) + ' · fine ' + fmtClock(e.end) + ' · ' + dur + ' min' : 'ora del picco') + '</small></div></div>' + lines + fig + nav;
}

function renderFlareDetail() {
  const box = $('flareDetail'); if (!box) return;
  const list = flareWindowEvents(), e = list.find((x) => x.t === S.flareSel);
  const key = e ? String(e.t) : 'none';
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  box.innerHTML = e ? flareDetailHTML(e, list) : '<p class="t-body-sm ab-fhint">Tocca un punto del grafico per leggere classe e ora e vedere una foto del Sole in quel momento.</p>';
}

// ============================ velocità del vento solare a L1 ============================
// Stesse sonde e stesso intervallo del grafico del campo. La linea con il globo («now») segna il vento che sta raggiungendo la Terra ora.
function windCard() {
  const c = l1Now(), v = c && c.v != null ? Math.round(c.v) : null;
  const word = v == null ? '' : v < 400 ? 'lento' : v < 500 ? 'nella norma' : v < 700 ? 'veloce' : 'molto veloce';
  return card('Vento solare a L1',
    '<div class="ab-bigvalue"><span class="t-num-lg">' + (v == null ? '—' : v) + '</span><span class="t-body-sm ab-unit">km/s</span>' + (word ? '<span class="t-body" style="margin-left:var(--space-3)">' + word + '</span>' : '') + '</div>' +
    '<div class="ab-chart" id="windChart" style="margin-top:var(--space-3)"></div><div class="ab-ro" id="windReadout" aria-live="off" style="min-height:24px"></div>' +
    '<p class="t-caption ab-card__note">Velocità dei protoni misurata dalle sonde a L1. Più è alta, prima arriva sulla Terra (1.500.000 km ÷ velocità). Sonde e intervallo sono quelli scelti nel grafico del campo. Dati: NOAA SWPC.</p>',
    { right: tag('measured', 'Misurato') });
}

function drawWind() {
  const el = $('windChart'); if (!el) return;
  const out = $('windReadout'), c = S.chart, now = Date.now(), xmin = now - c.hours * 3600e3, ref = selectedSource();
  const series = chartSats().filter((s) => !c.hiddenSats[s]).map((s, i) => ({ src: s, isRef: s === ref, dash: s === ref ? '' : satDash(s, i),
    pts: seriesFor(S.windRaw, s, 'proton_speed', xmin - 60000).filter((p) => p.t >= xmin).map((p) => ({ x: p.t, v: p.v })) })).filter((s) => s.pts.length);
  if (!series.length) { el.innerHTML = empty('Nessun dato di velocità in questo intervallo.'); out.textContent = ''; return; }
  const W = Math.max(280, Math.round(el.clientWidth)), H = W < 420 ? 220 : 260, L = 48, R = W - 8, T = 22, B = H - 30;
  let lo = Infinity, hi = -Infinity;
  series.forEach((s) => s.pts.forEach((p) => { if (p.v < lo) lo = p.v; if (p.v > hi) hi = p.v; }));
  const pad = Math.max((hi - lo) * 0.12, 15); lo = Math.max(0, lo - pad); hi += pad;
  const stp = niceStep(hi - lo), ylo = Math.floor(lo / stp) * stp, yhi = Math.ceil(hi / stp) * stp;
  const X = (t) => L + (t - xmin) / (now - xmin) * (R - L), Y = (v) => B - (v - ylo) / (yhi - ylo) * (B - T);
  const g = [];
  for (let v = ylo; v <= yhi + stp * 0.01; v += stp) { const vv = Math.round(v * 1e6) / 1e6; g.push('<line class="grid" x1="' + L + '" x2="' + R + '" y1="' + Y(vv).toFixed(1) + '" y2="' + Y(vv).toFixed(1) + '"/><text class="tick" x="' + (L - 6) + '" y="' + (Y(vv) + 4).toFixed(1) + '" text-anchor="end">' + Math.round(vv) + '</text>'); }
  timeTicks(xmin, now, X, L, R, B, W, g);
  let marks = '';
  [[400, 'lento sotto'], [600, 'veloce sopra']].forEach(([v, lab]) => {
    if (v > ylo + (yhi - ylo) * 0.08 && v < yhi - (yhi - ylo) * 0.08) marks += '<line class="now" x1="' + L + '" x2="' + R + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '"/><text class="tag zlabel" x="' + (R - 4) + '" y="' + (Y(v) - 6).toFixed(1) + '" text-anchor="end">' + v + ' · ' + lab + '</text>';
  });
  // il vento che sta raggiungendo la Terra ora: misurato a L1 «tempo di viaggio» fa
  const cn = l1Now(), lag = cn && cn.v ? lagMin(cn.v) : null, xe = lag != null ? now - lag * 60000 : null;
  let travel = '';
  if (xe != null && xe > xmin + 60000) {
    const ex = X(xe), room = ex - L, gx = ex.toFixed(1), gy = T - 10, left = room >= 52;
    travel = '<rect x="' + gx + '" y="' + T + '" width="' + Math.max(0, R - ex).toFixed(1) + '" height="' + (B - T) + '" fill="var(--surface-2)" fill-opacity=".7"/>';
    marks += '<line class="now" x1="' + gx + '" x2="' + gx + '" y1="' + (gy + 8) + '" y2="' + B + '"/>' +
      '<g transform="translate(' + gx + ' ' + gy + ')"><title>Sulla Terra adesso: il vento misurato a L1 circa ' + Math.round(lag) + ' minuti fa</title><circle r="8" fill="var(--surface-1)" stroke="var(--ink)" stroke-width="1.6"/><ellipse rx="3.4" ry="8" fill="none" stroke="var(--ink)" stroke-width="1.2"/><line x1="-8" x2="8" y1="0" y2="0" stroke="var(--ink)" stroke-width="1.2"/></g>' +
      '<text class="tag" x="' + (left ? (ex - 13).toFixed(1) : (ex + 13).toFixed(1)) + '" y="' + (gy + 4) + '" text-anchor="' + (left ? 'end' : 'start') + '">now</text>' +
      (R - ex >= (left ? 74 : 110) ? '<text class="tag" x="' + (ex + 13).toFixed(1) + '" y="' + (gy + (left ? 4 : 20)) + '">in viaggio</text>' : '');
  }
  const lines = series.slice().sort((a, b) => a.isRef - b.isRef).map((s) => {
    const p = pathOf(s.pts, X, Y);
    return (s.isRef ? '<path class="line" d="' + p + '" style="stroke:var(--surface-1);stroke-width:3;opacity:.85"/>' : '') +
      '<path class="line" d="' + p + '" style="stroke:var(--level-1);stroke-width:' + (s.isRef ? 1.5 : 0.9) + ';opacity:' + (s.isRef ? 1 : 0.75) + '"' + (s.dash ? ' stroke-dasharray="' + s.dash + '"' : '') + '/>';
  }).join('');
  el.innerHTML = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Velocità del vento solare a L1, ultime ' + c.hours + ' ore">' +
    travel + g.join('') + lines + marks + '<text class="tick" x="4" y="12">km/s</text><line class="ab-cursor" id="windCursor" y1="' + T + '" y2="' + B + '" x1="-10" x2="-10"/></svg>';
  const hint = '<span class="t-caption" style="color:var(--ink-3)">Tocca o passa sul grafico per leggere i valori.</span>';
  out.innerHTML = hint;
  const near = (pts, t) => { let best = null, bd = 3 * 60000; for (const p of pts) { const dd = Math.abs(p.x - t); if (dd < bd) { bd = dd; best = p; } } return best; };
  attachReadout(el.firstChild, $('windCursor'), out, hint, L, R, (x) => {
    const t = xmin + (x - L) / (R - L) * (now - xmin);
    const vals = series.map((s) => { const p = near(s.pts, t); return p ? (s.isRef ? '<b>' : '<span>') + esc(s.src) + ' ' + Math.round(p.v) + (s.isRef ? '</b>' : '</span>') : ''; }).filter(Boolean);
    return '<span class="t-caption" style="color:var(--ink-2)">' + fmtClock(t) + ' · orario di misura a L1 · km/s</span>' + (vals.length ? '<div>' + vals.join('') + '</div>' : '');
  });
}
