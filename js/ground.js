'use strict';
// Aurora Bande · new version — riscontro a terra con i magnetometri IMAGE (FMI).
// Regola esplorativa: |ΔX| ≥ 100 nT rispetto alla mediana di riferimento (30–20 min prima dell'arrivo stimato).
// Il risultato è «variazione temporalmente compatibile», mai una conferma dell'arrivo o dell'aurora.

const GROUND_STATIONS = { KEV: [69.76, 27.01], MAS: [69.46, 23.70], KIL: [69.02, 20.79], IVA: [68.56, 27.29], MUO: [68.02, 23.53], PEL: [66.90, 24.08], RAN: [65.54, 26.25], OUJ: [64.52, 27.23], HAN: [62.25, 26.60], NUR: [60.50, 24.65] };
const GROUND_NAMES = { KEV: 'Kevo', MAS: 'Masi', KIL: 'Kilpisjärvi', IVA: 'Ivalo', MUO: 'Muonio', PEL: 'Pello', RAN: 'Ranua', OUJ: 'Oulujärvi', HAN: 'Hankasalmi', NUR: 'Nurmijärvi' };
// Con il server locale (aurora-server.py, porta 8866) i dati sono live; sul sito pubblico si legge il file statico data/ground/<STAZIONE>.json.
const HAS_LOCAL_SERVER = (location.hostname === '127.0.0.1' || location.hostname === 'localhost') && location.port === '8866';

function earthDistance(lat, lon, st) {
  const r = Math.PI / 180, [a, b] = GROUND_STATIONS[st];
  const h = Math.sin((a - lat) * r / 2) ** 2 + Math.cos(lat * r) * Math.cos(a * r) * Math.sin((b - lon) * r / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
function nearestGroundStation() {
  return Object.keys(GROUND_STATIONS).sort((a, b) => earthDistance(S.lat, S.lon, a) - earthDistance(S.lat, S.lon, b))[0];
}
// stazione di riferimento più, quando disponibili, una più a nord e una più a sud entro ~8° di longitudine
function comparisonStations(st) {
  const coord = GROUND_STATIONS[st]; if (!coord) return [];
  const cand = Object.keys(GROUND_STATIONS).filter((k) => k !== st && Math.abs(GROUND_STATIONS[k][1] - coord[1]) <= 8);
  const closest = (keys) => keys.sort((a, b) => earthDistance(coord[0], coord[1], a) - earthDistance(coord[0], coord[1], b))[0];
  return [st, closest(cand.filter((k) => GROUND_STATIONS[k][0] > coord[0])), closest(cand.filter((k) => GROUND_STATIONS[k][0] < coord[0]))].filter(Boolean);
}
function groundMedian(values) {
  const s = values.slice().sort((a, b) => a - b), n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

// analisi di una stazione per un fronte: {state, label, detail, delta}
function groundAnalysis(e, samples, now) {
  const res = { state: 'unknown', label: 'Confronto non disponibile', detail: 'Servono misure numeriche recenti del magnetometro.', delta: null };
  if (!e || e.arrStart == null) return { ...res, label: 'Arrivo non disponibile', detail: 'Serve una stima valida per il confronto temporale.' };
  if (now < e.arrStart - ARRIVAL_MARGIN_MS) return { ...res, state: 'waiting', label: 'In attesa dell’arrivo stimato', detail: 'Il confronto inizia dalla prima ora della finestra.' };
  if (!samples.length) return res;
  const last = samples[samples.length - 1];
  if (now - last[0] > 10 * 60000 || last[0] > now + 60000) return { ...res, label: 'Misure non recenti', detail: 'Ultimo campione ' + fmtClock(last[0]) + '. Nessun confronto automatico.' };
  const baseline = samples.filter((p) => p[0] >= e.arrStart - 30 * 60000 && p[0] <= e.arrStart - 20 * 60000);
  if (baseline.length < 8) return { ...res, label: 'Dati insufficienti per il confronto', detail: 'Mancano misure di riferimento prima della finestra.' };
  if (baseline.slice(1).some((p, i) => p[0] - baseline[i][0] > 2 * 60000)) return { ...res, label: 'Misure discontinue', detail: 'Il riferimento prima del fronte contiene interruzioni.' };
  const stop = Math.min(now, e.ongoing ? now : (e.arrEnd ?? e.arrStart) + 30 * 60000, e.arrStart + 90 * 60000);
  const post = samples.filter((p) => p[0] >= e.arrStart - ARRIVAL_MARGIN_MS && p[0] <= stop);
  if (post.length < 5) return { ...res, state: 'waiting', label: 'Raccolta di misure a terra', detail: 'Servono almeno cinque medie al minuto nella finestra.' };
  const ref = groundMedian(baseline.map((p) => p[1]));
  let peak = null, peakTime = null, onset = null;
  for (let i = 4; i < post.length; i++) {
    const block = post.slice(i - 4, i + 1);
    if (block.some((p, j) => j > 0 && p[0] - block[j - 1][0] > 2 * 60000)) continue;
    const change = groundMedian(block.map((p) => p[1])) - ref;
    if (onset === null && Math.abs(change) >= 100) onset = post[i][0];
    if (peak === null || Math.abs(change) > Math.abs(peak)) { peak = change; peakTime = post[i][0]; }
  }
  if (peak === null) return { ...res, label: 'Misure discontinue', detail: 'Non ci sono cinque campioni sufficientemente ravvicinati.' };
  const changed = Math.abs(peak) >= 100;
  return {
    state: changed ? 'signal' : 'monitoring',
    label: changed ? 'Variazione marcata, compatibile nel tempo con il fronte' : 'Nessuna variazione marcata',
    detail: 'Picco filtrato alle ' + fmtClock(peakTime) + (onset !== null ? ' · prima soglia alle ' + fmtClock(onset) : '') + ' · rispetto al riferimento precedente.',
    delta: peak, onset, peakTime,
  };
}

// riepilogo su tutte le stazioni di confronto
function groundSummary(e, now) {
  const st = nearestGroundStation(), stations = comparisonStations(st);
  if (!e || e.arrStart == null) return { label: 'In attesa di riscontro', note: 'Seleziona un fronte con arrivo stimato.', kind: 'unknown' };
  if (now < e.arrStart - ARRIVAL_MARGIN_MS) return { label: 'In attesa dell’arrivo stimato', note: 'Il confronto seguirà questo fronte.', kind: 'waiting' };
  const results = stations.map((s) => groundAnalysis(e, S.ground.errors[s] ? [] : (S.ground.byStation[s] || []), now));
  const usable = results.filter((r) => r.delta != null), signals = usable.filter((r) => r.state === 'signal').length;
  if (!usable.length) return { label: 'Dati insufficienti per il confronto', note: 'Servono misure recenti e un riferimento precedente.', kind: 'unknown' };
  const cov = usable.length + '/' + stations.length + ' stazioni utilizzabili';
  const ov = overlapsOf(e) > 0;
  return {
    label: signals ? 'Variazione marcata su ' + signals + '/' + stations.length + ' stazioni' : 'Nessuna variazione marcata',
    note: cov + ' · ' + (ov ? 'finestre sovrapposte, attribuzione incerta.' : signals ? 'compatibilità temporale, arrivo non confermato.' : 'un segnale assente non esclude l’arrivo.'),
    kind: signals ? 'signal' : 'monitoring',
  };
}

async function loadGround() {
  const station = nearestGroundStation(), stations = comparisonStations(station);
  // i file data/ground/*.json esistono solo sul sito pubblicato o con il server locale: se mancano, si riprova ogni 10 minuti
  if (S.ground.failAt && Date.now() - S.ground.failAt < 10 * 60000 && S.ground.station === station) return;
  const id = ++S.ground.requestId;
  S.ground.station = station; S.ground.pending = true;
  await Promise.allSettled(stations.map(async (st) => {
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 15000);
    try {
      const url = HAS_LOCAL_SERVER ? '/_aurora/ground?station=' + encodeURIComponent(st) : 'data/ground/' + encodeURIComponent(st) + '.json';
      const res = await fetch(url, { cache: 'no-store', signal: abort.signal });
      if (!res.ok) throw new Error('Fonte non disponibile');
      const payload = await res.json();
      if (id !== S.ground.requestId) return;
      if (payload.station !== st || !Array.isArray(payload.samples)) throw new Error('Formato non riconosciuto');
      S.ground.byStation[st] = payload.samples.filter((p) => Array.isArray(p) && p.length >= 2 && isFinite(p[0]) && isFinite(p[1]) && Math.abs(p[1]) < 90000).sort((a, b) => a[0] - b[0]);
      delete S.ground.errors[st];
    } catch (err) { if (id === S.ground.requestId) S.ground.errors[st] = 'Misure non disponibili'; }
    finally { clearTimeout(timer); }
  }));
  if (id === S.ground.requestId) {
    S.ground.pending = false;
    const ok = stations.filter((s) => !S.ground.errors[s]).length;
    S.ground.failAt = ok ? 0 : Date.now();
    diagSet('Magnetometri IMAGE (FMI)', ok ? 'ok' : 'err', ok ? ok + '/' + stations.length + ' stazioni' : 'misure numeriche non raggiungibili da qui');
  }
}

function groundView(e) {
  const st = nearestGroundStation();
  const dist = earthDistance(S.lat, S.lon, st);
  const samples = S.ground.errors[st] ? [] : (S.ground.byStation[st] || []);
  let a = groundAnalysis(e, samples, Date.now());
  if (S.ground.pending && !samples.length) a = { state: 'waiting', label: 'Caricamento delle misure IMAGE…', detail: 'Lettura del campo magnetico terrestre.', delta: null };
  else if (S.ground.errors[st]) a = { state: 'unknown', label: 'Misure numeriche non disponibili da qui', detail: 'Il grafico ufficiale resta consultabile sul sito FMI.', delta: null };
  return { st, dist, a, last: samples.length ? samples[samples.length - 1][0] : null, far: dist > 800 };
}
