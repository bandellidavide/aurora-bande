'use strict';
// Aurora Bande — nuvole: quanto è probabile un cielo libero nelle ore di buio, quanto sono d'accordo i modelli, com'è il cielo adesso dal satellite.
// Un solo numero di un solo modello dà una falsa sicurezza (il 17 ott 2026 a Tromsø, alle 20, sei modelli andavano dal 31% al 100%):
// qui si usano i 122 scenari di tre modelli (ensemble ECMWF, ICON, GEFS) e si conta in quanti il cielo è libero. È una possibilità, non una certezza.

const CLEAR_MAX = 30; // copertura totale fino al 30%: cielo libero o quasi
const ENS_MODELS = 'ecmwf_ifs025,icon_seamless,gfs025';
const DET_MODELS = [['ecmwf_ifs025', 'ECMWF', 'europeo'], ['icon_seamless', 'ICON', 'tedesco'], ['gfs_seamless', 'GFS', 'americano'], ['ukmo_seamless', 'UK Met Office', 'inglese'], ['meteofrance_seamless', 'Météo-France', 'francese'],
  // modelli locali del nord, molto più fini: MET Nordic (1 km, Norvegia, Svezia, Finlandia; solo copertura totale) e DMI HARMONIE (2 km: Islanda, Faroe, Groenlandia est, Finlandia, Scandinavia del sud).
  // Fuori dalla loro zona non danno dati e spariscono da soli dal confronto.
  ['metno_nordic', 'MET Nordic', 'norvegese, 1 km'], ['dmi_harmonie_arome_europe', 'DMI HARMONIE', 'danese, 2 km']];
const EUM_WMS = 'https://view.eumetsat.int/geoserver/';

async function loadClouds() {
  const lat = S.lat, lon = S.lon;
  const base = 'latitude=' + lat + '&longitude=' + lon + '&forecast_days=3&timezone=auto&timeformat=unixtime';
  const [ens, det] = await Promise.all([
    getJSON('https://ensemble-api.open-meteo.com/v1/ensemble?' + base + '&hourly=cloud_cover&models=' + ENS_MODELS, 'Open-Meteo — scenari delle nuvole (ensemble)'),
    getJSON('https://api.open-meteo.com/v1/forecast?' + base + '&hourly=cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility&models=' + DET_MODELS.map((m) => m[0]).join(','), 'Open-Meteo — confronto fra modelli'),
  ]);
  if (lat !== S.lat || lon !== S.lon) return;
  S.wx = { lat, lon, ens: parseEnsemble(ens), models: parseModels(det), fetchedAt: Date.now() };
}

// per ogni ora: in quanti scenari il cielo è libero (pClear, su 100), la mediana, quanti scenari ci sono
function parseEnsemble(d) {
  if (!d || !d.hourly || !Array.isArray(d.hourly.time)) return null;
  const keys = Object.keys(d.hourly).filter((k) => k.startsWith('cloud_cover'));
  if (!keys.length) return null;
  const rows = d.hourly.time.map((t, i) => {
    const v = keys.map((k) => d.hourly[k][i]).filter((x) => typeof x === 'number').sort((a, b) => a - b);
    return { t: t * 1000, n: v.length, pClear: v.length ? Math.round(100 * v.filter((x) => x <= CLEAR_MAX).length / v.length) : null, median: v.length ? v[Math.floor(v.length / 2)] : null };
  });
  return { rows, members: keys.length };
}
function parseModels(d) {
  if (!d || !d.hourly || !Array.isArray(d.hourly.time)) return null;
  const h = d.hourly, col = (k, m) => h[k + '_' + m] || [];
  const list = DET_MODELS.map(([id, name, from]) => ({ id, name, from, total: col('cloud_cover', id), low: col('cloud_cover_low', id), mid: col('cloud_cover_mid', id), high: col('cloud_cover_high', id), vis: col('visibility', id) }))
    .filter((m) => m.total.some((x) => typeof x === 'number'));
  return { time: h.time.map((t) => t * 1000), list };
}

// Le notti, dal momento in cui il sole scende sotto −12° (abbastanza buio per vedere un'aurora) a quando risale.
// Senza −12° (estate alle alte latitudini) si usa −6°; se il sole resta sotto −12° tutto il giorno (notte polare) vale l'intera giornata.
function nightWindows(n) {
  if (!window.SunCalc) return [];
  const now = Date.now(), DAY = 864e5, out = [];
  const noon = SunCalc.getTimes(new Date(now), S.lat, S.lon).solarNoon;
  if (validDate(noon) && SunCalc.getPosition(noon, S.lat, S.lon).altitude * 180 / Math.PI < -12) return [{ a: now, b: now + DAY, polar: true, ongoing: true }];
  for (let i = -1; i <= 3 && out.length < n; i++) {
    const t = SunCalc.getTimes(new Date(now + i * DAY), S.lat, S.lon), tn = SunCalc.getTimes(new Date(now + (i + 1) * DAY), S.lat, S.lon);
    let a = t.nauticalDusk, b = tn.nauticalDawn, deep = true;
    if (!validDate(a) || !validDate(b)) { a = t.dusk; b = tn.dawn; deep = false; }
    if (!validDate(a) || !validDate(b)) continue;
    a = a.getTime(); b = b.getTime();
    if (b <= now || b <= a || out.some((w) => Math.abs(w.a - a) < 6 * 3600e3)) continue;
    out.push({ a, b, deep, ongoing: a <= now });
  }
  return out;
}
function nightName(w) {
  if (w.polar) return 'Prossime 24 ore';
  if (w.ongoing) return 'Questa notte';
  const d = fmtDay(w.a), today = fmtDay(Date.now()), tom = fmtDay(Date.now() + 864e5);
  return d === today ? 'Stanotte' : d === tom ? 'Domani notte' : 'Notte di ' + d;
}

// le ore della notte con la loro probabilità; dalla notte in corso si tolgono le ore già passate
function nightHours(w) {
  const E = S.wx && S.wx.ens; if (!E) return null;
  const from = Math.max(w.a, Date.now() - 1800e3); // un'ora conta se la sua metà cade nel buio (e non è già passata)
  const cells = E.rows.filter((r) => r.pClear != null && r.t + 1800e3 >= from && r.t + 1800e3 < w.b);
  const covered = cells.length ? (Math.min(w.b, cells[cells.length - 1].t + 3600e3) - Math.max(from, cells[0].t)) / (w.b - from) : 0;
  return { cells, partial: covered < 0.8 };
}
// la finestra migliore: almeno due ore di fila con la probabilità media più alta (a parità, la prima)
function bestWindow(cells) {
  let best = null;
  for (let i = 0; i < cells.length; i++) {
    let sum = 0;
    for (let j = i; j < cells.length; j++) {
      sum += cells[j].pClear;
      const len = j - i + 1, p = sum / len;
      if (len >= 2 && (!best || p > best.p + 0.5)) best = { a: cells[i].t, b: cells[j].t + 3600e3, p: Math.round(p) };
    }
  }
  return best;
}
const pWord = (p) => (p < 10 ? 'molto improbabile' : p < 30 ? 'poco probabile' : p < 60 ? 'possibile' : p < 85 ? 'probabile' : 'molto probabile');
const pClass = (p) => (p >= 50 ? 'good' : p >= 20 ? 'mid' : 'bad');

// i sei modelli nelle ore della notte: media della copertura totale, delle nubi basse o medie (quelle che coprono davvero) e del velo alto
function modelsOverNight(w) {
  const M = S.wx && S.wx.models; if (!M) return null;
  const from = Math.max(w.a, Date.now() - 1800e3); // un'ora conta se la sua metà cade nel buio (e non è già passata)
  const idx = M.time.map((t, i) => (t + 1800e3 >= from && t + 1800e3 < w.b ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return null;
  const avg = (arr) => { const v = idx.map((i) => arr[i]).filter((x) => typeof x === 'number'); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };
  const rows = M.list.map((m) => ({ name: m.name, from: m.from, total: avg(m.total), block: avg(idx.map((i) => (typeof m.low[i] === 'number' || typeof m.mid[i] === 'number' ? Math.max(m.low[i] || 0, m.mid[i] || 0) : null)).reduce((o, v, k) => { o[idx[k]] = v; return o; }, [])), high: avg(m.high) }))
    .filter((r) => r.total != null);
  if (!rows.length) return null;
  const tot = rows.map((r) => r.total), spread = Math.max(...tot) - Math.min(...tot);
  // nebbia: ore in cui la visibilità (dove il modello la dà) scende sotto 1 km
  const fog = idx.filter((i) => { const v = M.list.map((m) => m.vis[i]).filter((x) => typeof x === 'number'); return v.length && v.sort((a, b) => a - b)[Math.floor(v.length / 2)] < 1000; }).map((i) => M.time[i]);
  return { rows, min: Math.min(...tot), max: Math.max(...tot), spread, agree: spread <= 30 ? 'd’accordo' : spread <= 60 ? 'abbastanza diversi' : 'in disaccordo', fog };
}

// riassunto di una notte, usato dal Cielo e dal quadro d'insieme
function nightCloudSummary(w) {
  const h = nightHours(w); if (!h || !h.cells.length) return null;
  const ps = h.cells.map((c) => c.pClear), avg = Math.round(ps.reduce((a, b) => a + b, 0) / ps.length);
  return { w, cells: h.cells, partial: h.partial, avg, max: Math.max(...ps), best: bestWindow(h.cells), models: modelsOverNight(w) };
}

// ---------- satellite: immagine infrarossa Meteosat (EUMETSAT), di giorno e di notte ----------
// Le nuvole fredde sono chiare, la terra e il mare scuri. Copre l'Europa e l'Atlantico; oltre ~70°N è sempre più schiacciata (il satellite è sull'equatore).
function satView(lat, lon) {
  if (Math.abs(lon) > 55 || Math.abs(lat) > 78) return null;
  const W = 600, H = 400, dLat = 8, dLon = Math.min(70, dLat * W / H / Math.max(0.2, Math.cos(lat * Math.PI / 180)));
  const bb = [lat - dLat / 2, lon - dLon / 2, lat + dLat / 2, lon + dLon / 2].map((v) => v.toFixed(3)).join(',');
  const q = (layers, extra) => EUM_WMS + 'wms?service=WMS&version=1.3.0&request=GetMap&styles=&crs=EPSG:4326&format=image/png&width=' + W + '&height=' + H + '&bbox=' + bb + '&layers=' + layers + (extra || '');
  const t = S.satTime ? '&time=' + new Date(S.satTime).toISOString().replace('.000', '') : '';
  return { ir: q('msg_fes:ir108', t), lines: q('backgrounds:ne_10m_coastline,backgrounds:ne_boundary_lines_land', '&transparent=true'), skewed: Math.abs(lat) > 68, kmW: Math.round(dLon * 111.2 * Math.cos(lat * Math.PI / 180) / 50) * 50 };
}
// coste e confini (Natural Earth, dal server EUMETSAT) per qualsiasi riquadro: servono sia al satellite sia alla mappa delle nuvole
function linesUrl(bb, W, H) { return EUM_WMS + 'wms?service=WMS&version=1.3.0&request=GetMap&styles=&crs=EPSG:4326&format=image/png&transparent=true&width=' + W + '&height=' + H + '&bbox=' + bb.s.toFixed(3) + ',' + bb.w.toFixed(3) + ',' + bb.n.toFixed(3) + ',' + bb.e.toFixed(3) + '&layers=backgrounds:ne_10m_coastline,backgrounds:ne_boundary_lines_land'; }

// ---------- mappa delle nubi basse e medie attorno a te, ora per ora ----------
// Idea di Davide (17 ott 2026): «io sono qua, ci sono le nuvole, di là ce ne sono di meno, mi sposto». La mappa è centrata sul luogo scelto
// (o sulla posizione del dispositivo): 11 × 11 punti, circa ±220 km, nubi basse o medie (quelle che coprono davvero), più l'indicazione del cielo libero più vicino.
// In Islanda si aggiunge la mappa ufficiale dell'istituto meteo islandese (modello HARMONIE a 2,5 km, CC BY 4.0), più fine ma senza il tuo punto.
const IS_BOX = { s: 62.8, n: 67.0, w: -25.5, e: -12.5 };
const inIceland = (lat, lon) => lat >= IS_BOX.s && lat <= IS_BOX.n && lon >= IS_BOX.w && lon <= IS_BOX.e;
const IMO_IMG = 'https://en.vedur.is/photos/isl_skyjahula2/';
const pad2 = (n) => String(n).padStart(2, '0');
const imoStamp = (ms) => { const d = new Date(ms); return pad2(d.getUTCFullYear() % 100) + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate()) + '_' + pad2(d.getUTCHours()) + '00'; };
function imoUrl(run, hourMs) { const step = Math.round((hourMs - run) / 3600e3); return step >= 1 && step <= 72 ? IMO_IMG + imoStamp(run) + '_' + step + '.png' : null; }
// le corse partono ogni 3 ore e le immagini arrivano 2-4 ore dopo: si prova dalla più recente, all'indietro
async function loadImoRun() {
  const H3 = 3 * 3600e3, start = Math.floor((Date.now() - 2 * 3600e3) / H3) * H3;
  for (let k = 0; k < 5; k++) {
    const run = start - k * H3;
    const ok = await new Promise((res) => { const im = new Image(); im.onload = () => res(true); im.onerror = () => res(false); im.src = IMO_IMG + imoStamp(run) + '_1.png'; setTimeout(() => res(false), 12000); });
    if (ok) { S.imoRun = run; diagSet('Istituto meteo islandese — mappa nuvole', 'ok', 'corsa delle ' + new Date(run).toISOString().slice(11, 16) + ' UTC'); return; }
  }
  S.imoRun = null; diagSet('Istituto meteo islandese — mappa nuvole', 'err', 'nessuna corsa recente trovata');
}

const MAP_N = 11, MAP_W = 600, MAP_H = 400;
// in ordine di preferenza: DMI HARMONIE 2 km (Islanda, Faroe, Groenlandia est, Finlandia), ICON-EU 7 km (resto della Scandinavia), ECMWF 25 km (ovunque, anche Groenlandia ovest e Svalbard)
const MAP_MODELS = [['dmi_harmonie_arome_europe', 'DMI HARMONIE 2 km'], ['icon_eu', 'ICON-EU 7 km'], ['ecmwf_ifs025', 'ECMWF 25 km']];
// il nord dove ha senso guardare l'aurora: Groenlandia, Islanda, Faroe, Scozia del nord, Scandinavia, Finlandia, Svalbard, Kola
const isNorth = (lat, lon) => lat >= 58 && lon >= -75 && lon <= 45;
function mapBox(lat, lon) {
  const dLat = 4, dLon = Math.min(40, dLat * MAP_W / MAP_H / Math.max(0.2, Math.cos(lat * Math.PI / 180)));
  return { s: lat - dLat / 2, n: lat + dLat / 2, w: lon - dLon / 2, e: lon + dLon / 2 };
}
async function loadCloudMap() {
  const lat = S.lat, lon = S.lon;
  if (S.wxMap && S.wxMap.lat === lat && S.wxMap.lon === lon && Date.now() - S.wxMap.fetchedAt < 30 * 60000) return;
  // ogni punto della griglia conta come una richiesta per Open-Meteo (limite gratuito ~600 al minuto, 10.000 al giorno): se fallisce, si riprova dopo 10 minuti
  if (S.wxMapFail && S.wxMapFail.key === lat + ',' + lon && Date.now() - S.wxMapFail.t < 10 * 60000) return;
  const key = lat + ',' + lon; if (S.wxMapBusy === key) return; S.wxMapBusy = key; // un caricamento per luogo; cambiando luogo si riparte subito
  try {
    if (inIceland(lat, lon)) loadImoRun().then(() => { if (S.view === 'cielo') renderSoon(); });
    const bb = mapBox(lat, lon), la = [], lo = [];
    for (let r = 0; r < MAP_N; r++) for (let c = 0; c < MAP_N; c++) { la.push((bb.n - r * (bb.n - bb.s) / (MAP_N - 1)).toFixed(2)); lo.push((bb.w + c * (bb.e - bb.w) / (MAP_N - 1)).toFixed(2)); }
    const d = await getJSON('https://api.open-meteo.com/v1/forecast?latitude=' + la.join(',') + '&longitude=' + lo.join(',') + '&hourly=cloud_cover_low,cloud_cover_mid&forecast_days=2&timezone=auto&timeformat=unixtime&models=' + MAP_MODELS.map((m) => m[0]).join(','), 'Open-Meteo — mappa delle nuvole', 25000);
    if (lat !== S.lat || lon !== S.lon) return;
    if (!Array.isArray(d) || d.length !== MAP_N * MAP_N || !d[0].hourly) { S.wxMapFail = { key, t: Date.now() }; return; }
    const time = d[0].hourly.time.map((t) => t * 1000);
    // per ogni punto e ogni ora, il primo modello della lista che ha il dato (il più fine disponibile lì)
    const used = {};
    const grid = time.map((_, h) => d.map((p) => {
      // se in tutto il riquadro ha dati un solo modello (Groenlandia ovest, Svalbard: solo ECMWF), Open-Meteo toglie il suffisso dai nomi
      for (const [m] of MAP_MODELS) {
        const sfx = p.hourly['cloud_cover_low_' + m] ? '_' + m : m === 'ecmwf_ifs025' && p.hourly.cloud_cover_low ? '' : null;
        if (sfx == null) continue;
        const a = p.hourly['cloud_cover_low' + sfx][h], b = p.hourly['cloud_cover_mid' + sfx][h];
        if (typeof a === 'number' || typeof b === 'number') { used[m] = (used[m] || 0) + 1; return Math.max(a || 0, b || 0); }
      }
      return null;
    }));
    const pts = d.map((p) => ({ lat: p.latitude, lon: p.longitude }));
    const main = Object.keys(used).sort((x, y) => used[y] - used[x])[0], tot = Object.values(used).reduce((x, y) => x + y, 0);
    S.wxMap = { lat, lon, bb, time, grid, pts, fetchedAt: Date.now(), models: MAP_MODELS.filter(([m]) => used[m] / tot > 0.05).map(([m, n]) => n), main: (MAP_MODELS.find(([m]) => m === main) || [])[1] };
  } finally { if (S.wxMapBusy === key) S.wxMapBusy = null; }
}
const kmBetween = (a, b, c, d) => { const R = 6371, r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const DIRS = ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ovest', 'ovest', 'nord-ovest'];
function dirWord(a, b, c, d) { const r = Math.PI / 180, y = Math.sin((d - b) * r) * Math.cos(c * r), x = Math.cos(a * r) * Math.sin(c * r) - Math.sin(a * r) * Math.cos(c * r) * Math.cos((d - b) * r); return DIRS[Math.round(((Math.atan2(y, x) / r + 360) % 360) / 45) % 8]; }
// nell'ora scelta: quanto è coperto da te e dov'è il cielo libero più vicino (entro ~200 km, in linea d'aria)
function clearSpot(t) {
  const M = S.wxMap; if (!M) return null;
  const h = M.time.indexOf(t); if (h < 0) return null;
  const g = M.grid[h], mid = Math.floor(MAP_N * MAP_N / 2), here = g[mid];
  if (here == null) return null;
  if (here <= 30) return { here, clearHere: true };
  let best = null;
  g.forEach((v, k) => {
    if (v == null || v > 25 || k === mid) return;
    const km = kmBetween(S.lat, S.lon, M.pts[k].lat, M.pts[k].lon);
    if (km <= 200 && (!best || km < best.km)) best = { k, km, v };
  });
  if (!best) return { here, none: true };
  return { here, k: best.k, km: Math.max(10, Math.round(best.km / 10) * 10), dir: dirWord(S.lat, S.lon, M.pts[best.k].lat, M.pts[best.k].lon) };
}
function spotText(t) {
  const c = clearSpot(t); if (!c) return '';
  if (c.clearHere) return 'Da te, a quell’ora, poche nubi basse o medie (' + c.here + '%).';
  if (c.none) return 'Da te ' + c.here + '% di nubi basse o medie, e nessuna zona libera entro ~200 km.';
  return 'Da te ' + c.here + '% di nubi basse o medie. Cielo più libero a circa ' + c.km + ' km verso ' + c.dir + ' (in linea d’aria, cerchio verde sulla mappa).';
}
// le ore che si possono scegliere sulla mappa: dall'ora in corso a +48 ore
function mapHours() {
  const M = S.wxMap; if (!M) return [];
  const h0 = Math.floor(Date.now() / 3600e3) * 3600e3, out = [];
  for (let t = h0; t <= h0 + 48 * 3600e3; t += 3600e3) {
    if (M.time.includes(t)) out.push(t);
  }
  return out;
}
function mapDefaultHour(hours) {
  if (S.mapHour && hours.includes(S.mapHour)) return S.mapHour;
  const w = nightWindows(1)[0], s = w && nightCloudSummary(w);
  const pick = s && s.best ? s.best.a : w ? Math.max(w.a, Date.now()) : Date.now();
  const t = Math.floor(pick / 3600e3) * 3600e3;
  return hours.includes(t) ? t : hours[0];
}
function mapHourLabel(t) {
  const inNight = nightWindows(3).some((w) => t + 1800e3 >= w.a && t + 1800e3 < w.b);
  return fmtDay(t) + ' ' + fmtClock(t) + (inNight ? ' · buio' : ' · ancora chiaro');
}
// disegna la griglia sul canvas: nuvole chiare e opache dove coprono, trasparenti dove il cielo è libero (sotto c'è il fondo scuro)
function drawCloudMap() {
  const cv = document.getElementById('wxMapCv'), M = S.wxMap;
  if (!cv || !M) return;
  const h = M.time.indexOf(S.mapHour); if (h < 0) return;
  const g = M.grid[h], small = document.createElement('canvas'); small.width = MAP_N; small.height = MAP_N;
  const sx = small.getContext('2d'), img = sx.createImageData(MAP_N, MAP_N);
  g.forEach((v, k) => { const o = k * 4; img.data[o] = 226; img.data[o + 1] = 232; img.data[o + 2] = 240; img.data[o + 3] = v == null ? 0 : Math.round(Math.min(1, Math.max(0, (v - 10) / 80)) * 235); });
  sx.putImageData(img, 0, 0);
  const ctx = cv.getContext('2d'), cw = MAP_W / (MAP_N - 1), ch = MAP_H / (MAP_N - 1);
  ctx.clearRect(0, 0, MAP_W, MAP_H); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  // i punti stanno sui bordi del riquadro: ogni pixel della griglia piccola è largo una maglia, centrato sul suo punto
  ctx.drawImage(small, -cw / 2, -ch / 2, MAP_W + cw, MAP_H + ch);
  // cerchi a 50, 100 e 200 km attorno a te (la scala orizzontale è diversa da quella verticale: ellissi)
  const bb = M.bb, pxLat = MAP_H / (bb.n - bb.s), pxLon = MAP_W / (bb.e - bb.w), kmLat = 111.2, kmLon = 111.2 * Math.cos(S.lat * Math.PI / 180);
  ctx.strokeStyle = 'rgba(94,234,168,.35)'; ctx.lineWidth = 1; ctx.setLineDash([4, 5]); ctx.font = '12px "IBM Plex Mono", monospace'; ctx.fillStyle = 'rgba(94,234,168,.75)';
  [50, 100, 200].forEach((km) => { const rx = km / kmLon * pxLon, ry = km / kmLat * pxLat; ctx.beginPath(); ctx.ellipse(MAP_W / 2, MAP_H / 2, rx, ry, 0, 0, 2 * Math.PI); ctx.stroke(); if (MAP_H / 2 - ry > 10) ctx.fillText(km + ' km', MAP_W / 2 + 4, MAP_H / 2 - ry - 3); });
  ctx.setLineDash([]);
  const c = clearSpot(S.mapHour);
  if (c && c.k != null) { const p = M.pts[c.k], x = (p.lon - bb.w) * pxLon, y = (bb.n - p.lat) * pxLat; ctx.beginPath(); ctx.arc(x, y, 14, 0, 2 * Math.PI); ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.lineWidth = 7; ctx.stroke(); ctx.strokeStyle = '#5eeaa8'; ctx.lineWidth = 3.5; ctx.stroke(); }
}
function setMapHour(t) {
  S.mapHour = t;
  const lb = document.getElementById('wxMapLbl'); if (lb) lb.textContent = mapHourLabel(t);
  const sp = document.getElementById('wxMapSpot'); if (sp) sp.textContent = spotText(t);
  const im = document.getElementById('wxMapImg'); if (im && S.imoRun != null) { const u = imoUrl(S.imoRun, t); if (u) { im.src = u; im.hidden = false; } else im.hidden = true; }
  drawCloudMap();
}

async function loadSatTime() {
  const x = await getTEXT(EUM_WMS + 'msg_fes/ir108/ows?service=WMS&version=1.3.0&request=GetCapabilities', 'EUMETSAT — satellite infrarosso', 15000);
  const m = x && /<Dimension name="time" default="([^"]+)"/.exec(x);
  if (m && isFinite(Date.parse(m[1]))) S.satTime = Date.parse(m[1]);
}
