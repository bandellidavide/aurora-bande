'use strict';
// Aurora Bande · new version — luogo, meteo, buio e luna, OVATION, potenza emisferica, webcam.

const PLACES = [
  { name: 'Tromsø', sub: 'Norvegia', lat: 69.65, lon: 18.96 },
  { name: 'Abisko', sub: 'Svezia', lat: 68.35, lon: 18.79 },
  { name: 'Rovaniemi', sub: 'Finlandia', lat: 66.50, lon: 25.73 },
  { name: 'Reykjavík', sub: 'Islanda', lat: 64.13, lon: -21.90 },
  { name: 'Isole Fær Øer', sub: 'Danimarca', lat: 62.00, lon: -6.79 },
  { name: 'Fairbanks', sub: 'Alaska', lat: 64.84, lon: -147.72 },
  { name: 'Milano', sub: 'Italia', lat: 45.46, lon: 9.19 },
];

// ---------- luogo ----------
function loadSavedPlace() {
  const s = store.get('aurora_loc', null);
  if (s && isFinite(Number(s.lat)) && isFinite(Number(s.lon))) { S.lat = Number(s.lat); S.lon = Number(s.lon); S.label = s.label || null; S.fromDevice = !!s.dev; }
}
function placeLabel() { return S.label || (S.lat.toFixed(2) + '°, ' + S.lon.toFixed(2) + '°'); }
function shortPlace() { return (S.label || S.lat.toFixed(1) + '°, ' + S.lon.toFixed(1) + '°').split(',')[0]; }

async function reverseGeocode() {
  const lat = S.lat, lon = S.lon;
  const d = await getJSON('https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' + lat + '&longitude=' + lon + '&localityLanguage=it', 'Nome del luogo');
  if (lat !== S.lat || lon !== S.lon) return;
  let name = d ? (d.city || d.locality || d.principalSubdivision || null) : null;
  if (name && d.countryName) name += ', ' + d.countryName;
  if (name) { S.label = name; store.set('aurora_loc', { lat: S.lat, lon: S.lon, label: name, dev: true }); if (typeof renderAll === 'function') renderAll(); }
}
async function searchPlaces(q) {
  const d = await getJSON('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(q) + '&count=8&language=it&format=json', 'Ricerca località');
  if (d === null) return null;
  return (d.results || []).filter((r) => r && r.latitude != null && r.longitude != null);
}

// ---------- meteo (Open-Meteo, senza chiave) ----------
async function loadWeather() {
  const lat = S.lat, lon = S.lon;
  if (S.sky.lat !== lat || S.sky.lon !== lon) { S.sky = { data: null, lat, lon, fetchedAt: 0 }; }
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
    '&hourly=cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,temperature_2m,precipitation_probability' +
    '&current=cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,temperature_2m,wind_speed_10m' +
    '&forecast_days=2&past_hours=1&timezone=auto&timeformat=unixtime';
  const d = await getJSON(url, 'Open-Meteo — nuvole e temperatura');
  if (lat !== S.lat || lon !== S.lon) return;
  S.sky.data = d && d.hourly && d.current ? d : null;
  S.sky.fetchedAt = Date.now();
  if (S.sky.data && S.sky.data.timezone) S.tz = S.sky.data.timezone;
}

function skyWindow(e) {
  const d = S.sky.data;
  if (!e || e.arrStart == null || !d) return null;
  const h = d.hourly, early = e.arrStart - ARRIVAL_MARGIN_MS, late = e.arrStart + ARRIVAL_MARGIN_MS;
  const vals = h.time.map((t, i) => ({ t: t * 1000, v: h.cloud_cover[i] })).filter((p) => p.t < late && p.t + 3600000 > early && isFinite(p.v));
  const covered = vals.length && vals[0].t <= early && vals[vals.length - 1].t + 3600000 >= late;
  return covered ? [Math.min(...vals.map((p) => p.v)), Math.max(...vals.map((p) => p.v))] : null;
}
// media della copertura fra le 21:00 e le 05:00 locali nelle prossime 24 ore
function nightCloud() {
  const d = S.sky.data; if (!d) return null;
  const vals = [];
  const fmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: d.timezone });
  d.hourly.time.forEach((t, i) => {
    const hr = Number(fmt.format(new Date(t * 1000)));
    if ((hr >= 21 || hr <= 5) && t * 1000 >= Date.now() && t * 1000 < Date.now() + 24 * 3600000 && isFinite(d.hourly.cloud_cover[i])) vals.push(d.hourly.cloud_cover[i]);
  });
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
}
function cloudClass(c) { return c <= 30 ? 'good' : c <= 70 ? 'mid' : 'bad'; }
function cloudWord(c) { return c <= 30 ? 'Sereno' : c <= 70 ? 'Variabile' : 'Coperto'; }

// riquadro «Cielo» per LocalConditions
function skyCheck(e) {
  const d = S.sky.data;
  if (!d) return { state: 'mid', value: 'Non disponibile', note: 'Meteo non raggiungibile' };
  const range = skyWindow(e);
  if (range) {
    const avg = (range[0] + range[1]) / 2;
    return { state: cloudClass(avg), value: cloudWord(avg), note: (range[0] === range[1] ? Math.round(range[0]) : Math.round(range[0]) + '–' + Math.round(range[1])) + '% nuvole nella finestra' };
  }
  const n = nightCloud();
  if (n != null) return { state: cloudClass(n), value: cloudWord(n), note: '~' + n + '% nuvole stanotte' };
  const c = d.current.cloud_cover;
  return { state: cloudClass(c), value: cloudWord(c), note: Math.round(c) + '% nuvole ora' };
}

// ---------- buio e luna (SunCalc) ----------
function moonPhaseInfo(date) {
  const stages = [[0.03, 'Nuova'], [0.22, 'Crescente'], [0.28, 'Primo quarto'], [0.47, 'Gibbosa crescente'], [0.53, 'Piena'], [0.72, 'Gibbosa calante'], [0.78, 'Ultimo quarto'], [0.97, 'Calante'], [1.01, 'Nuova']];
  let phase, illum;
  if (window.SunCalc) { const m = SunCalc.getMoonIllumination(date); phase = m.phase; illum = Math.round(m.fraction * 100); }
  else {
    const syn = 29.53058867, diff = (date.getTime() - Date.UTC(2000, 0, 6, 18, 14, 0)) / 86400000;
    phase = (diff % syn) / syn; if (phase < 0) phase += 1;
    illum = Math.round((1 - Math.cos(2 * Math.PI * phase)) / 2 * 100);
  }
  const st = stages.find((s) => phase <= s[0]) || stages[stages.length - 1];
  return { name: st[1], illum, phase };
}
const validDate = (d) => d instanceof Date && !isNaN(d.getTime());

function astro() {
  const now = new Date(), lat = S.lat, lon = S.lon;
  const moon = moonPhaseInfo(now);
  const out = { ok: false, moon: { ...moon, above: null, alt: null, rise: null, set: null, alwaysUp: false, alwaysDown: false } };
  if (!window.SunCalc) return out;
  const day = 86400000;
  const t0 = SunCalc.getTimes(new Date(now.getTime() - day), lat, lon), t1 = SunCalc.getTimes(now, lat, lon), t2 = SunCalc.getTimes(new Date(now.getTime() + day), lat, lon);
  const sunAlt = SunCalc.getPosition(now, lat, lon).altitude * 180 / Math.PI;
  const level = sunAlt <= -18 ? 'dark' : sunAlt < 0 ? 'twilight' : 'day';
  const starts = [t0.night, t1.night, t2.night].filter(validDate), ends = [t0.nightEnd, t1.nightEnd, t2.nightEnd].filter(validDate);
  const hasDark = starts.length > 0 && ends.length > 0;
  let darkStart = null, darkEnd = null;
  if (hasDark) {
    if (level === 'dark') darkEnd = ends.filter((d) => d > now).sort((a, b) => a - b)[0] || null;
    else { darkStart = starts.filter((d) => d > now).sort((a, b) => a - b)[0] || null; darkEnd = darkStart ? ends.filter((d) => d > darkStart).sort((a, b) => a - b)[0] || null : null; }
  }
  const mp = SunCalc.getMoonPosition(now, lat, lon), mt = SunCalc.getMoonTimes(now, lat, lon);
  out.ok = true; out.level = level; out.hasDark = hasDark; out.darkStart = darkStart; out.darkEnd = darkEnd;
  out.sunset = validDate(t1.sunset) ? t1.sunset : null; out.dusk = validDate(t1.dusk) ? t1.dusk : null;
  out.sunrise = validDate(t2.sunrise) ? t2.sunrise : null; out.sunAlt = sunAlt;
  out.moon.alt = mp.altitude * 180 / Math.PI; out.moon.above = out.moon.alt > 0; out.moon.rise = mt.rise || null; out.moon.set = mt.set || null;
  out.moon.alwaysUp = !!mt.alwaysUp; out.moon.alwaysDown = !!mt.alwaysDown;
  return out;
}
function darkCheck(a) {
  if (!a.ok) return { state: 'mid', value: 'Non calcolabile', note: 'Libreria SunCalc non caricata' };
  if (!a.hasDark) return { state: 'bad', value: 'Niente buio', note: 'Sole mai sotto −18°' };
  if (a.level === 'dark') return { state: 'good', value: 'Buio', note: a.darkEnd ? 'fino alle ' + fmtClock(a.darkEnd.getTime()) : 'notte astronomica' };
  if (a.level === 'twilight') return { state: 'mid', value: 'Crepuscolo', note: a.darkStart ? 'buio dalle ' + fmtClock(a.darkStart.getTime()) : 'visibilità ridotta' };
  return { state: 'mid', value: 'Giorno', note: a.darkStart ? 'buio dalle ' + fmtClock(a.darkStart.getTime()) : 'controlla dopo il tramonto' };
}
function moonCheck(a) {
  const m = a.moon;
  if (m.above === false) return { state: 'good', value: 'Sotto l’orizzonte', note: m.illum + '% illuminata' };
  const bright = m.illum >= 80 && m.above;
  const word = m.illum < 20 ? 'Debole' : m.illum < 60 ? 'Media' : 'Luminosa';
  return { state: bright ? 'mid' : 'good', value: word, note: m.illum + '% illuminata' + (m.above ? ' · alta ' + Math.round(m.alt) + '°' : '') };
}

// ---------- OVATION e potenza emisferica ----------
async function loadOvation() {
  const d = await getJSON(SWPC + '/json/ovation_aurora_latest.json', 'NOAA — modello OVATION', 40000);
  if (d) S.ovationRaw = d;
  updateOvation();
}
function updateOvation() {
  const d = S.ovationRaw;
  if (!d || !d.coordinates) { S.ovation = null; return; }
  const lon360 = ((S.lon % 360) + 360) % 360;
  let best = null, bd = Infinity;
  for (const [clon, clat, val] of d.coordinates) {
    let dl = Math.abs(clon - lon360); if (dl > 180) dl = 360 - dl;
    const dist = dl * dl + (clat - S.lat) ** 2;
    if (dist < bd) { bd = dist; best = val; }
    if (bd === 0) break;
  }
  S.ovation = { val: best, obsTime: d['Observation Time'], forecastTime: d['Forecast Time'] };
}
function ovationLabel(v) {
  if (v == null) return 'dato non disponibile';
  return v < 20 ? 'attività regionale bassa' : v < 50 ? 'attività regionale moderata' : v < 75 ? 'attività regionale elevata' : 'attività regionale molto elevata';
}
function auroraZoneLabel(lat) {
  const a = Math.abs(lat);
  if (a >= 75) return 'Calotta polare: l’aurora è spesso più debole.';
  if (a >= 60) return 'Zona aurorale.';
  if (a >= 55) return 'Zona subaurorale: serve un vento solare potenziato.';
  return 'Bassa latitudine: solo con tempeste geomagnetiche forti.';
}
async function loadHemi() {
  const txt = await getTEXT(SWPC + '/text/aurora-nowcast-hemi-power.txt', 'NOAA — potenza emisferica');
  if (!txt) return;
  const rows = [];
  txt.split('\n').forEach((line) => {
    const l = line.trim(); if (!l || l.startsWith('#')) return;
    const p = l.split(/\s+/); if (p.length < 4) return;
    const north = num(p[2]); if (north === null) return;
    rows.push({ obs: p[0], fc: p[1], north });
  });
  if (!rows.length) return;
  const last = rows[rows.length - 1], back = rows[Math.max(0, rows.length - 37)];
  S.hemi = { gw: last.north, delta: last.north - back.north, fc: (last.fc || '').replace('_', ' ') + ' UTC' };
}

// ---------- webcam ----------
const IPCAMLIVE = 'https://g0.ipcamlive.com/player/';
const CURATED_WEBCAMS = [
  { name: 'Kevo · Finlandia', lat: 69.76, lon: 27.01, url: 'https://rwc-finland.fmi.fi/index.php/all-sky-camera-images/', image: 'https://space.fmi.fi/MIRACLE/RWC/latest_KEV.jpg', source: 'FMI', aurora: true },
  { name: 'Kilpisjärvi · Finlandia', lat: 69.03, lon: 20.47, url: 'https://rwc-finland.fmi.fi/index.php/all-sky-camera-images/', image: 'https://space.fmi.fi/MIRACLE/RWC/latest_KIL.jpg', source: 'FMI', aurora: true },
  { name: 'Muonio · Finlandia', lat: 68.02, lon: 23.53, url: 'https://rwc-finland.fmi.fi/index.php/all-sky-camera-images/', image: 'https://space.fmi.fi/MIRACLE/RWC/latest_MUO.jpg', source: 'FMI', aurora: true },
  { name: 'Kiruna · Svezia', lat: 67.84, lon: 20.41, url: 'https://www2.irf.se/Observatory/?link=All-sky_sp_camera', image: 'https://www.irf.se/alis/allsky/krn/latest_medium.jpeg', source: 'IRF', aurora: true },
  { name: 'Skibotn · Norvegia', lat: 69.35, lon: 20.36, url: 'https://fox.phys.uit.no/ASC/ASC01.html', image: 'https://fox.phys.uit.no/ASC/Latest_ASC01.png', source: 'TGO / UiT', aurora: true },
  { name: 'Sodankylä · Finlandia', lat: 67.37, lon: 26.63, url: 'https://rwc-finland.fmi.fi/index.php/all-sky-camera-images/', image: 'https://space.fmi.fi/MIRACLE/RWC/latest_SOD.jpg', source: 'FMI', aurora: true },
  { name: 'Hankasalmi · Finlandia', lat: 62.25, lon: 26.60, url: 'https://aurorasnow.fmi.fi/public_service/', image: 'https://aurorasnow.fmi.fi/public_service/images/latest_SIR_AllSky.jpg', source: 'FMI', aurora: true },
  { name: 'Yellowknife · Canada', lat: 62.45, lon: -114.37, url: 'https://auroramax.com/live', image: 'https://auroramax.phys.ucalgary.ca/recent/recent_480p.jpg', source: 'Univ. Calgary / CSA', aurora: true },
  { name: 'Calgary · Canada', lat: 51.08, lon: -114.13, url: 'https://www.ucalgary.ca/', image: 'https://cam01.sci.ucalgary.ca/AllSkyCam/AllSkyCurrentImage.JPG', source: 'Univ. Calgary', aurora: true },
  // camere in diretta ospitate da IPCamLive: fotogramma ufficiale (aggiornato ogni ~2 minuti, con orario leggibile) e player incorporabile
  { name: 'Hella · Islanda (cam 1)', lat: 63.97, lon: -20.25, url: 'https://landhotel.is/index.php/northernlights-live', provider: 'ipcamlive', alias: '6501dd6068492', image: IPCAMLIVE + 'snapshot.php?alias=6501dd6068492', source: 'Landhotel', aurora: true },
  { name: 'Hella · Islanda (cam 2)', lat: 63.97, lon: -20.25, url: 'https://landhotel.is/index.php/northernlights-live', provider: 'ipcamlive', alias: '6565ed34e367a', image: IPCAMLIVE + 'snapshot.php?alias=6565ed34e367a', source: 'Landhotel', aurora: true },
  { name: 'Longyearbyen · Svalbard', lat: 78.15, lon: 16.04, url: 'https://aurora.unis.no/data/SonyA7s.html', image: 'https://aurora.unis.no/Quicklooks/kho_sony.jpg', source: 'UNIS / KHO', aurora: true, note: 'spesso spenta fuori stagione' },
];
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function safeUrl(v) { try { const u = new URL(v); return ['http:', 'https:'].includes(u.protocol) ? u.href : null; } catch (e) { return null; } }
const camKey = (c) => c.image || c.url + '|' + c.lat + '|' + c.lon;
function camFavorites() { return new Set(store.get('aurora_cam_favorites', [])); }
// «Vicino a me»: prima le camere dedicate all'aurora, poi le altre, ciascun gruppo per distanza. «Strade»: le webcam stradali entro il raggio.
function chooseWebcams() {
  const fav = camFavorites(), r = S.camRadius, f = S.camFilter;
  const list = S.webcams.filter((c) => f === 'favorites' ? fav.has(camKey(c)) : f === 'aurora' ? c.aurora : f === 'road' ? c.kind === 'road' && c.dist <= r : c.dist <= r);
  return list.sort((a, b) => (f === 'near' && !!a.aurora !== !!b.aurora ? (a.aurora ? -1 : 1) : a.dist - b.dist));
}
// ---------- webcam stradali della Finlandia (Fintraffic · Digitraffic, licenza CC BY 4.0) ----------
// Un'immagine ogni ~10 minuti. Elenco delle stazioni in cache 30 minuti; il dettaglio (nome, immagini) solo per le 16 più vicine.
const DIGITRAFFIC_CAMS = 'https://tie.digitraffic.fi/api/weathercam/v1/stations';
const ROAD = { list: null, at: 0, detail: new Map() };
async function loadRoadCams(lat, lon, radiusKm) {
  if (!ROAD.list || Date.now() - ROAD.at > 30 * 60000) {
    const d = await getJSON(DIGITRAFFIC_CAMS, 'Webcam stradali (Fintraffic)', 20000);
    if (d && Array.isArray(d.features)) {
      ROAD.list = d.features.filter((f) => f.properties && f.properties.collectionStatus === 'GATHERING' && (f.properties.presets || []).some((p) => p.inCollection) && f.geometry && f.geometry.coordinates)
        .map((f) => ({ id: f.id, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], updated: Date.parse(f.properties.dataUpdatedTime) }));
      ROAD.at = Date.now();
    }
  }
  if (!ROAD.list) return [];
  const near = ROAD.list.map((s) => ({ ...s, dist: haversineKm(lat, lon, s.lat, s.lon) })).filter((s) => s.dist <= Math.max(radiusKm, 100)).sort((a, b) => a.dist - b.dist).slice(0, 16);
  await Promise.all(near.map(async (s) => {
    if (ROAD.detail.has(s.id)) return;
    const d = await getJSON(DIGITRAFFIC_CAMS + '/' + s.id, 'Webcam stradali — dettaglio', 15000);
    if (d && d.properties) ROAD.detail.set(s.id, d.properties);
  }));
  return near.map((s) => {
    const p = ROAD.detail.get(s.id); if (!p) return null;
    const pr = (p.presets || []).filter((x) => x.inCollection && x.imageUrl), pick = pr.find((x) => /maisema/i.test(x.presentationName || '')) || pr[0];
    if (!pick) return null;
    return { name: (p.names && p.names.en) || p.name, lat: s.lat, lon: s.lon, url: pick.imageUrl, image: pick.imageUrl, source: 'Fintraffic', kind: 'road', aurora: false, note: 'foto ogni ~10 min · ' + pick.presentationName };
  }).filter(Boolean);
}

// Le camere IPCamLive rispondono con l'ora dell'ultimo fotogramma (Last-Modified, CORS aperto): così si vede se sono ferme o spente.
async function checkStreams(list) {
  await Promise.all(list.filter((c) => c.provider === 'ipcamlive').map(async (c) => {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 8000);
    try {
      const r = await fetch(c.image + '&t=' + Math.floor(Date.now() / 60000), { method: 'HEAD', cache: 'no-store', signal: ctl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const lm = Date.parse(r.headers.get('last-modified')); c.updated = isFinite(lm) ? lm : null; c.down = false;
    } catch (e) { c.down = true; c.updated = null; } finally { clearTimeout(timer); }
  }));
  const bad = list.filter((c) => c.provider === 'ipcamlive' && c.down).length, tot = list.filter((c) => c.provider === 'ipcamlive').length;
  if (tot) diagSet('Camere in diretta (IPCamLive)', bad === tot ? 'err' : 'ok', (tot - bad) + '/' + tot + ' rispondono');
}

async function loadWebcams() {
  const lat = S.lat, lon = S.lon;
  S.webcams = CURATED_WEBCAMS.map((c) => ({ ...c, dist: haversineKm(lat, lon, c.lat, c.lon) }));
  const radius = Math.max(500, S.camRadius) * 1000;
  const q = '[out:json][timeout:12];node["tourism"="webcam"](around:' + radius + ',' + lat + ',' + lon + ');out body;';
  const [d, road] = await Promise.all([getJSON('https://overpass.kumi.systems/api/interpreter?data=' + encodeURIComponent(q), 'Webcam vicine (OpenStreetMap)', 15000), loadRoadCams(lat, lon, S.camRadius).catch(() => [])]);
  if (lat !== S.lat || lon !== S.lon) return;
  const osm = (Array.isArray(d && d.elements) ? d.elements : []).filter((el) => isFinite(el.lat) && isFinite(el.lon)).map((el) => {
    const t = el.tags || {};
    return { name: t.name || 'Webcam di zona', lat: el.lat, lon: el.lon, url: safeUrl(t.website || t['contact:webcam'] || t.url || t.image), image: t.image && /\.(jpe?g|png|webp)(\?.*)?$/i.test(t.image) ? safeUrl(t.image) : null, source: 'OpenStreetMap', aurora: false };
  }).filter((c) => c.url);
  const seen = new Set();
  S.webcams = [...CURATED_WEBCAMS, ...osm, ...road].filter((c) => { const k = camKey(c); if (seen.has(k)) return false; seen.add(k); return true; }).map((c) => ({ ...c, dist: haversineKm(lat, lon, c.lat, c.lon) }));
  await checkStreams(S.webcams);
}

// Luna disegnata: la parte illuminata cambia con la fase (0 nuova, 0.5 piena). Nell'emisfero nord la luna crescente è illuminata a destra, in quello sud a sinistra.
function moonSvg(phase, size) {
  const r = 10, c = Math.cos(2 * Math.PI * phase), rx = Math.abs(c) * r, south = S.lat < 0, litRight = (phase < 0.5) !== south;
  const d = 'M0,-' + r + ' A' + r + ',' + r + ' 0 0 1 0,' + r + ' A' + rx.toFixed(2) + ',' + r + ' 0 0 ' + (c > 0 ? 0 : 1) + ' 0,-' + r + ' Z';
  const lit = phase < 0.03 || phase > 0.97 ? '' : '<path d="' + d + '" fill="var(--ink)"' + (litRight ? '' : ' transform="scale(-1 1)"') + '/>';
  return '<svg class="ab-moonsvg" viewBox="-12 -12 24 24" width="' + size + '" height="' + size + '" role="img" aria-label="Luna al ' + Math.round((1 - c) / 2 * 100) + '% illuminata"><circle r="10.5" fill="var(--surface-0)" stroke="var(--line-strong)" stroke-width="1"/>' + lit + '</svg>';
}

// Le prossime n notti nel luogo scelto: tramonto, alba del mattino dopo, buio astronomico, luna (a metà notte) e ore con la luna in cielo.
function skyOutlook(n) {
  if (!window.SunCalc) return null;
  const now = Date.now(), DAY = 86400000, out = [];
  for (let i = 0; i < n; i++) {
    const base = new Date(now + i * DAY), t = SunCalc.getTimes(base, S.lat, S.lon), tn = SunCalc.getTimes(new Date(base.getTime() + DAY), S.lat, S.lon);
    const sunset = validDate(t.sunset) ? t.sunset.getTime() : null, sunrise = validDate(tn.sunrise) ? tn.sunrise.getTime() : null;
    const dS = validDate(t.night) ? t.night.getTime() : null, dE = validDate(tn.nightEnd) ? tn.nightEnd.getTime() : null;
    const a = sunset != null ? sunset : base.getTime(), b = sunrise != null ? sunrise : a + 12 * 3600e3, mi = moonPhaseInfo(new Date((a + b) / 2));
    let moonHours = 0;
    for (let m = a; m < b; m += 1800e3) if (SunCalc.getMoonPosition(new Date(m), S.lat, S.lon).altitude > 0) moonHours += 0.5;
    out.push({ day: a, sunset, sunrise, darkStart: dS, darkEnd: dE, illum: mi.illum, phase: mi.phase, moonHours });
  }
  return out;
}
