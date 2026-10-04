'use strict';
// Aurora Bande · new version — motore L1: dati RTSW, episodi di Bz sud, stima dell'arrivo, livello del segnale.
// Le regole sono quelle della pagina originale (vedi prospetto-tecnico-nowcast-aurora-bande.md).

const BZ_CFG = {
  threshold: -1,        // nT: sotto questo valore è «Bz sud»
  gapTolMin: 4,         // minuti di risalita tollerati senza chiudere l'episodio
  minDurMin: 4,         // episodi più brevi non sono rilevanti
  windowHours: 12,      // finestra di ricerca
  maxGapMin: 2,         // oltre questo buco la continuità si interrompe
  speedToleranceMin: 2, // la velocità si associa al Bz solo entro ±2 minuti
};
const ARRIVAL_MARGIN_MS = 15 * 60000; // margine grafico prudenziale, NON un intervallo di confidenza calibrato

// Livello del segnale: la logica «Attività» della pagina originale (debole / moderata / elevata).
// Modifica qui le soglie: la scheda «Situazione» le legge da questo oggetto.
// «Bz a sud» = Bz ≤ BZ_CFG.threshold (−1 nT), la stessa soglia degli episodi: tra −1 e 0 nT è rumore e non conta come segnale.
const isSouth = (bz) => bz != null && bz <= BZ_CFG.threshold;
// campo elettrico di separazione (merging electric field, Kan & Lee 1979): v × (Bt⊥ − Bz) / 2, con Bt⊥ = √(By²+Bz²)
// il campo trasverso nel piano Y-Z. Include anche By, non solo Bz: a parità di Bz un By marcato aumenta l'accoppiamento.
// Se By non è disponibile equivale esattamente alla vecchia formula v×max(0,−Bz): con by=0, Bt⊥=|Bz| e il risultato collima.
function emSouth(bz, by) { return bz == null ? null : Math.max(0, Math.sqrt((by || 0) ** 2 + bz * bz) - bz) / 2; }
// Nota: OVATION (SWPC) è già derivato da una funzione di accoppiamento che include Bz (e By, che qui non usiamo):
// richiedere «OVATION alto» e «Bz a sud» insieme non è una doppia conferma indipendente, Bz ne fa già parte.
// Qui «Bz a sud» funziona da controllo di freschezza: OVATION riassume alcune ore di storia e può restare alto
// per un po' anche se il vento è appena tornato a nord; richiederlo filtra quel ritardo, non rafforza il segnale.
const SIGNAL_RULES = {
  elevated: (bz, v, ov) => (bz <= -5 && v >= 450) || (bz <= -3 && v >= 550) || (ov != null && ov >= 60 && isSouth(bz)),
  moderate: (bz, v, ov) => (isSouth(bz) && v >= 350) || (ov != null && ov >= 30 && isSouth(bz)),
};
const SIGNAL_TITLES = ['Nessun segnale favorevole', 'Segnale debole', 'Segnale moderato', 'Segnale elevato'];
const SIGNAL_STEPS = ['Nessuno', 'Debole', 'Moderato', 'Elevato'];

// ---------- caricamento ----------
async function loadL1() {
  const unwrap = (x) => (Array.isArray(x) ? (x.length ? x[x.length - 1] : null) : x);
  const [mag, wind, sm, ss, kp] = await Promise.all([
    getJSON(SWPC + '/json/rtsw/rtsw_mag_1m.json', 'NOAA — RTSW campo magnetico'),
    getJSON(SWPC + '/json/rtsw/rtsw_wind_1m.json', 'NOAA — RTSW vento solare'),
    getJSON(SWPC + '/products/summary/solar-wind-mag-field.json', 'NOAA — campo magnetico (sintesi)'),
    getJSON(SWPC + '/products/summary/solar-wind-speed.json', 'NOAA — velocità (sintesi)'),
    getJSON(SWPC + '/json/planetary_k_index_1m.json', 'NOAA — indice Kp'),
  ]);
  if (mag) S.magRaw = mag;
  if (wind) S.windRaw = wind;
  S.sum = { mag: unwrap(sm), speed: unwrap(ss) };
  S.kp = kp && kp.length ? num(kp[kp.length - 1].estimated_kp ?? kp[kp.length - 1].kp_index) : null;
  const set = new Set();
  [S.magRaw, S.windRaw].forEach((raw) => Array.isArray(raw) && raw.forEach((r) => r && r.source && set.add(r.source)));
  S.sources = Array.from(set).sort();
  S.loadedAt = Date.now();
  recomputeL1();
  const age = l1LastKnownAge();
  diagSet('Dati L1 (NOAA) — età', age == null ? 'err' : age <= 10 ? 'ok' : 'err', age == null ? 'nessun dato' : fmtDur(age) + ' fa' + (age > 60 ? ' — probabile ritardo della fonte NOAA, non della pagina' : ''));
}

// quanto è vecchio l'ultimo dato disponibile (anche se troppo vecchio per essere usato): aiuta a distinguere
// «NOAA è in ritardo» da un guasto di questa pagina, quando bz/v risultano non recenti.
function l1LastKnownAge() {
  let latest = -Infinity;
  (S.magRaw || []).forEach((r) => { const t = toMs(r && r.time_tag); if (isFinite(t) && t > latest) latest = t; });
  if (S.sum && S.sum.mag && S.sum.mag.time_tag) { const t = toMs(S.sum.mag.time_tag); if (isFinite(t) && t > latest) latest = t; }
  return isFinite(latest) ? (Date.now() - latest) / 60000 : null;
}

function recomputeL1() {
  try {
    computeEpisodes();
    diagSet('Episodi di Bz sud', 'ok', S.episodes.length + ' episodi nelle ultime ' + BZ_CFG.windowHours + ' ore');
  } catch (e) {
    diagSet('Episodi di Bz sud', 'err', e.message || String(e));
  }
}

// ---------- selezione della sonda e valori attuali ----------
function activeSourceOf(raw) {
  if (!raw || !Array.isArray(raw)) return null;
  const r = raw.filter((x) => x && x.active === true && x.source && isFinite(toMs(x.time_tag))).sort((a, b) => toMs(b.time_tag) - toMs(a.time_tag))[0];
  return r ? r.source : null;
}
function selectedSource() { return S.source !== 'AUTO' ? S.source : activeSourceOf(S.magRaw); }

function latestValid(raw, keys) {
  if (!raw || !Array.isArray(raw) || !raw.length) return null;
  const ok = (r) => r && r.time_tag && keys.every((k) => num(r[k]) !== null);
  const desc = (a, b) => toMs(b.time_tag) - toMs(a.time_tag);
  const active = raw.filter((r) => r && r.active === true && ok(r)).sort(desc);
  if (active.length) return active[0];
  const any = raw.filter(ok).sort(desc);
  return any.length ? any[0] : null;
}

// ultima riga valida della sonda scelta, purché recente (−2…10 minuti)
function freshRow(raw, keys) {
  const src = selectedSource();
  if (!src || !raw) return null;
  const r = latestValid(raw.filter((x) => x && x.source === src), keys);
  if (!r) return null;
  const age = (Date.now() - toMs(r.time_tag)) / 60000;
  if (!isFinite(age) || age < -2 || age > 10) return null;
  if (keys.includes('proton_speed') && !(num(r.proton_speed) > 0)) return null;
  return r;
}

function l1Now() {
  const m = freshRow(S.magRaw, ['bt', 'bz_gsm']);
  const w = freshRow(S.windRaw, ['proton_speed']);
  let bz = m ? num(m.bz_gsm) : null, by = m ? num(m.by_gsm) : null, bt = m ? num(m.bt) : null, v = w ? num(w.proton_speed) : null;
  let src = m ? m.source : null, ts = m ? toMs(m.time_tag) : null, fallback = false;
  const recent = (o) => o && isFinite(toMs(o.time_tag)) && (Date.now() - toMs(o.time_tag)) / 60000 <= 10;
  if (bz == null && recent(S.sum.mag) && num(S.sum.mag.bz_gsm) != null) { bz = num(S.sum.mag.bz_gsm); by = num(S.sum.mag.by_gsm); bt = num(S.sum.mag.bt); src = 'sintesi NOAA'; ts = toMs(S.sum.mag.time_tag); fallback = true; }
  if (v == null && recent(S.sum.speed) && num(S.sum.speed.proton_speed) > 0) { v = num(S.sum.speed.proton_speed); fallback = true; }
  const dt = m && w ? Math.abs(toMs(m.time_tag) - toMs(w.time_tag)) : Infinity;
  const ey = bz != null && v != null && (dt <= 120000 || fallback) ? v * emSouth(bz, by) * 1e-3 : null;
  return { bz, by, bt, v, ey, src, ts, age: ts ? Math.max(0, Math.round((Date.now() - ts) / 60000)) : null, fresh: bz != null && v != null, fallback };
}

// carico recente: quanto Bz è stato a sud nella finestra, anche se spezzato in più episodi brevi da una risalita
// passeggera. Serve perché la magnetosfera «carica» energia nel tempo e non si azzera a ogni breve risalita di Bz:
// un tratto ballerino ma per lo più a sud può aver caricato quanto un fronte lungo unico, anche se qui non appare
// come un solo episodio. Stessa formula di carica (∫Ey+ dt) usata per i singoli episodi in computeEpisodes().
function l1RecentLoad(hours) {
  const src = selectedSource();
  if (!src) return null;
  const cutoff = Date.now() - hours * 3600000;
  const bz = seriesFor(S.magRaw, src, 'bz_gsm', cutoff), sp = seriesFor(S.windRaw, src, 'proton_speed', cutoff), by = seriesFor(S.magRaw, src, 'by_gsm', cutoff);
  if (bz.length < 2) return null;
  let charge = 0, southMin = 0, totalMin = 0;
  for (let i = 1; i < bz.length; i++) {
    const a = bz[i - 1], b = bz[i], dt = (b.t - a.t) / 60000;
    if (dt <= 0 || dt > 5) continue; // buco nei dati: non si integra su quel tratto
    totalMin += dt;
    if (b.v <= BZ_CFG.threshold) southMin += dt;
    const va = valueNear(sp, a.t), vb = valueNear(sp, b.t);
    if (va > 0 && vb > 0) charge += dt * (va * emSouth(a.v, valueNear(by, a.t)) + vb * emSouth(b.v, valueNear(by, b.t))) * 0.0005;
  }
  if (totalMin < hours * 60 * 0.5) return null; // troppi buchi nella finestra per fidarsi del totale
  return { hours, chargeMvmin: charge, southShare: southMin / totalMin };
}

// ---------- livello del segnale ----------
function signal() {
  const c = l1Now();
  if (c.bz == null || c.v == null) {
    const age = l1LastKnownAge();
    const why = age != null && age >= 20 ? 'L’ultimo dato NOAA disponibile risale a ' + fmtDur(age) + ' fa: è un ritardo della fonte, non un guasto di questa pagina.' : 'Mancano dati recenti a L1.';
    return { level: null, title: 'Dati non disponibili', why, c };
  }
  const ov = S.ovation && S.ovation.val != null ? S.ovation.val : null;
  const level = SIGNAL_RULES.elevated(c.bz, c.v, ov) ? 3 : SIGNAL_RULES.moderate(c.bz, c.v, ov) ? 2 : isSouth(c.bz) ? 1 : 0;
  const ong = ongoingEpisode();
  const wind = 'vento a ' + Math.round(c.v) + ' km/s';
  let why;
  if (isSouth(c.bz)) why = 'Bz a sud' + (ong ? ' da ' + fmtDur(ong.durMin) : ' (' + signed(c.bz, 1) + ' nT)') + ', ' + wind + '.';
  else why = (c.bz > 0 ? 'Bz a nord' : 'Bz vicino allo zero') + ' (' + signed(c.bz, 1) + ' nT), ' + wind + '.';
  return { level, title: SIGNAL_TITLES[level], why, c, ov };
}

// ---------- serie e episodi ----------
function seriesFor(raw, src, key, cutoff) {
  const out = [];
  if (!raw || !Array.isArray(raw)) return out;
  raw.forEach((r) => {
    if (!r || !r.time_tag) return;
    if (src && r.source !== src) return;
    const v = num(r[key]); if (v === null) return;
    const t = toMs(r.time_tag);
    if (isNaN(t) || t > Date.now() + 120000 || (cutoff && t < cutoff)) return;
    if (key === 'proton_speed' && v <= 0) return;
    if (key === 'proton_density' && v < 0) return;
    out.push({ t, v });
  });
  out.sort((a, b) => a.t - b.t);
  return out.filter((p, i) => !i || p.t !== out[i - 1].t);
}

function valueNear(series, t, tolMin) {
  if (!series.length) return null;
  const tol = (tolMin == null ? BZ_CFG.speedToleranceMin : tolMin) * 60000;
  const valid = (p) => (Math.abs(p.t - t) <= tol ? p.v : null);
  if (t <= series[0].t) return valid(series[0]);
  const last = series.length - 1;
  if (t >= series[last].t) return valid(series[last]);
  let lo = 0, hi = last;
  while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (series[mid].t <= t) lo = mid; else hi = mid; }
  return valid(t - series[lo].t <= series[hi].t - t ? series[lo] : series[hi]);
}

function lagMin(v) { return v && v > 0 ? L1_KM / v / 60 : null; }

function computeEpisodes() {
  S.episodes = [];
  const magRaw = S.magRaw, windRaw = S.windRaw;
  if (!magRaw || !Array.isArray(magRaw) || !magRaw.length) return;
  const src = selectedSource();
  if (!src) return;
  const cutoff = Date.now() - BZ_CFG.windowHours * 3600 * 1000;
  const bz = seriesFor(magRaw, src, 'bz_gsm', cutoff);
  if (!bz.length) return;
  const sp = seriesFor(windRaw, src, 'proton_speed', cutoff);
  const by = seriesFor(magRaw, src, 'by_gsm', cutoff);

  const raw = [];
  let cur = null, lastIn = null, previous = null;
  const close = (reason) => { if (cur) { cur.end = lastIn; cur.reason = reason; raw.push(cur); cur = null; } };
  bz.forEach((p) => {
    if (previous && p.t - previous.t > BZ_CFG.maxGapMin * 60000) close('gap');
    if (cur && p.t - lastIn > BZ_CFG.gapTolMin * 60000) close('north');
    if (p.v <= BZ_CFG.threshold) {
      if (!cur) cur = { start: p.t, samples: [], south: [] };
      cur.south.push(p);
      lastIn = p.t;
    }
    if (cur) cur.samples.push(p);
    previous = p;
  });
  if (cur) { cur.end = lastIn; cur.reason = Date.now() - previous.t > 120000 ? 'gap' : 'open'; raw.push(cur); }

  const now = Date.now();
  raw.forEach((e) => {
    const durMin = (e.end - e.start) / 60000;
    if (durMin < BZ_CFG.minDurMin) return;
    const samples = e.samples.filter((p) => p.t <= e.end);
    const bzMin = Math.min(...e.south.map((p) => p.v));
    const bzMean = e.south.reduce((s, p) => s + p.v, 0) / e.south.length;
    let charge = 0, coveredMin = 0;
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1], b = samples[i], dt = (b.t - a.t) / 60000;
      const va = valueNear(sp, a.t), vb = valueNear(sp, b.t);
      // integra solo campioni adiacenti osservati: i valori a nord tollerati contano zero
      if (dt > 0 && dt <= 1.5 && va > 0 && vb > 0) {
        charge += dt * (va * emSouth(a.v, valueNear(by, a.t)) + vb * emSouth(b.v, valueNear(by, b.t))) * 0.0005;
        coveredMin += dt;
      }
    }
    const vStart = valueNear(sp, e.start), vEnd = valueNear(sp, e.end);
    const lagStart = lagMin(vStart), lagEnd = lagMin(vEnd);
    const arrStart = lagStart != null ? e.start + lagStart * 60000 : null;
    const candidateEnd = lagEnd != null ? e.end + lagEnd * 60000 : null;
    const propagationUnresolved = candidateEnd != null && arrStart != null && candidateEnd < arrStart;
    const ongoing = e === cur && e.reason === 'open' && now - e.end <= BZ_CFG.gapTolMin * 60000;
    const continuityUnknown = e.reason === 'gap';
    const arrEnd = !ongoing && !continuityUnknown && !propagationUnresolved ? candidateEnd : null;
    S.episodes.push({
      start: e.start, end: e.end, durMin, bzMin, bzMean, charge: coveredMin ? charge : null,
      coverage: durMin ? coveredMin / durMin : 0, source: src, continuityUnknown, propagationUnresolved,
      speedQuality: vStart != null && vEnd != null ? 'stessa sorgente · ±' + BZ_CFG.speedToleranceMin + ' min' : 'non disponibile',
      vStart, arrStart, arrEnd, ongoing,
    });
  });
  S.episodes.sort((a, b) => a.start - b.start);
}

function ongoingEpisode() {
  for (let i = S.episodes.length - 1; i >= 0; i--) if (S.episodes[i].ongoing) return S.episodes[i];
  return null;
}

// ---------- fronti in arrivo ----------
function arrivalQueue(now) {
  return S.episodes.filter((e) => e.arrStart != null && (e.ongoing || now <= (e.arrEnd ?? e.arrStart + 90 * 60000) + ARRIVAL_MARGIN_MS)).sort((a, b) => a.arrStart - b.arrStart);
}
function pickEvent(now) {
  const chosen = S.episodes.find((e) => e.start === S.selectedStart);
  if (chosen) return chosen;
  const q = arrivalQueue(now);
  return q.find((e) => e.arrStart - ARRIVAL_MARGIN_MS <= now) || q[0] || null;
}
function eventState(e, now) {
  if (e.continuityUnknown) return { label: 'Continuità non verificata', kind: '' };
  if (e.propagationUnresolved) return { label: 'Durata non risolta', kind: '' };
  if (e.arrStart == null) return { label: 'Arrivo non disponibile', kind: '' };
  if (now < e.arrStart - ARRIVAL_MARGIN_MS) return { label: 'In viaggio', kind: 'travel' };
  if (now <= e.arrStart + ARRIVAL_MARGIN_MS) return { label: 'Finestra di arrivo', kind: 'window' };
  if (e.ongoing || (e.arrEnd != null && now <= e.arrEnd + ARRIVAL_MARGIN_MS)) return { label: 'Passaggio stimato in corso', kind: 'window' };
  return { label: 'Finestra trascorsa', kind: '' };
}
function overlapsOf(e) {
  if (!e || e.arrStart == null) return 0;
  return S.episodes.filter((q) => q !== e && q.arrStart != null && q.arrStart - ARRIVAL_MARGIN_MS <= e.arrStart + ARRIVAL_MARGIN_MS &&
    (q.ongoing || (q.arrEnd ?? q.arrStart) + 30 * 60000 >= e.arrStart - ARRIVAL_MARGIN_MS)).length;
}

// ---------- accordo fra sonde ----------
function satAgreement() {
  const rows = S.sources.map((s) => {
    const m = latestValid((S.magRaw || []).filter((r) => r && r.source === s), ['bz_gsm']);
    const w = latestValid((S.windRaw || []).filter((r) => r && r.source === s), ['proton_speed']);
    const ok = (r) => r && (Date.now() - toMs(r.time_tag)) / 60000 <= 10;
    return { s, bz: ok(m) ? num(m.bz_gsm) : null, v: ok(w) ? num(w.proton_speed) : null };
  }).filter((r) => r.bz != null || r.v != null);
  const bzs = rows.map((r) => r.bz).filter((x) => x != null), vs = rows.map((r) => r.v).filter((x) => x != null);
  if (rows.length < 2 || (bzs.length < 2 && vs.length < 2)) return { rows, level: null };
  const dBz = bzs.length > 1 ? Math.max(...bzs) - Math.min(...bzs) : 0, dV = vs.length > 1 ? Math.max(...vs) - Math.min(...vs) : 0;
  const level = dBz > 5 || dV > 60 ? 2 : dBz > 2 || dV > 30 ? 1 : 0;
  return { rows, level, dBz, dV, text: ['Ottimo accordo', 'Accordo parziale', 'Sonde divergenti'][level] };
}
