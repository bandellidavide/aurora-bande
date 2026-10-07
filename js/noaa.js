'use strict';
// Aurora Bande · new version — pagina «Giorni»: bollettini e immagini NOAA SWPC, riportati senza interpretarli.
// Unica sintesi ammessa: una frase che parafrasa la motivazione del bollettino stesso.

const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

// livello G della scala NOAA a partire dal Kp (G1 = Kp 5 … G5 = Kp 9; i terzi di Kp: 4.67 = 5−)
function gOfKp(k) { return k >= 8.67 ? 5 : k >= 7.67 ? 4 : k >= 6.67 ? 3 : k >= 5.67 ? 2 : k >= 4.67 ? 1 : 0; }

function parseIssued(txt) {
  const m = /:Issued:\s*(\d{4}) (\w{3}) (\d{1,2}) (\d{2})(\d{2}) UTC/.exec(txt || '');
  return m ? Date.UTC(+m[1], MONTHS[m[2]], +m[3], +m[4], +m[5]) : null;
}

// «3-day-forecast.txt»: tabella «NOAA Kp index breakdown» a fasce di 3 ore, in UTC
function parseForecast(txt) {
  if (!txt) return null;
  const issued = parseIssued(txt), year = issued ? new Date(issued).getUTCFullYear() : new Date().getUTCFullYear();
  const lines = txt.split('\n');
  const hi = lines.findIndex((l) => /NOAA Kp index breakdown/i.test(l));
  if (hi === -1) return null;
  const head = lines.slice(hi + 1, hi + 4).find((l) => /[A-Z][a-z]{2} \d{1,2}/.test(l)) || '';
  const labels = head.match(/[A-Z][a-z]{2} \d{1,2}/g) || [];
  const days = labels.map((lb) => { const [mo, d] = lb.split(' '); return { label: lb, ms: Date.UTC(year, MONTHS[mo], +d), kp: [] }; });
  lines.slice(hi + 1).forEach((l) => {
    const m = /^(\d\d)-(\d\d)UT\s+(.+)$/.exec(l.trim());
    if (!m) return;
    const vals = m[3].match(/\d+\.\d+/g) || [];
    days.forEach((d, i) => { if (vals[i] != null) d.kp.push(parseFloat(vals[i])); });
  });
  const exp = /greatest expected 3 hr Kp for (.+?) is ([\d.]+)/.exec(txt.replace(/\s+/g, ' '));
  const obs = /greatest observed 3 hr Kp over the past 24 hours was ([\d.]+)/.exec(txt.replace(/\s+/g, ' '));
  const rat = /A\. NOAA Geomagnetic[\s\S]*?Rationale:\s*([\s\S]*?)(?:\n\s*\n|\nB\. )/.exec(txt);
  return {
    issued, days: days.filter((d) => d.kp.length === 8),
    maxExpected: exp ? parseFloat(exp[2]) : Math.max(0, ...days.flatMap((d) => d.kp)),
    maxObserved: obs ? parseFloat(obs[1]) : null,
    rationale: rat ? rat[1].replace(/\s+/g, ' ').trim() : '',
  };
}

// «discussion.txt»: quattro sezioni, ognuna con «.24 hr Summary» e «.Forecast»
function parseDiscussion(txt) {
  if (!txt) return null;
  const names = ['Solar Activity', 'Energetic Particle', 'Solar Wind', 'Geospace'];
  const out = {}; let sec = null, mode = null;
  txt.split('\n').forEach((raw) => {
    const l = raw.trim();
    if (names.includes(l)) { sec = l; mode = null; out[sec] = { summary: '', forecast: '' }; return; }
    if (!sec) return;
    if (/^\.24 hr Summary/i.test(l)) { mode = 'summary'; return; }
    if (/^\.Forecast/i.test(l)) { mode = 'forecast'; return; }
    if (mode && l) out[sec][mode] += (out[sec][mode] ? ' ' : '') + l;
  });
  return { issued: parseIssued(txt), sections: out };
}

// «srs.txt»: regioni con macchie e plaghe (colonne: Nmbr Location Lo Area Z LL NN Mag Type)
function parseSRS(txt) {
  if (!txt) return null;
  const lines = txt.split('\n');
  const start = lines.findIndex((l) => /^Nmbr\s+Location\s+Lo\s+Area/i.test(l.trim()));
  const regions = [];
  if (start !== -1) {
    for (let i = start + 1; i < lines.length; i++) {
      const l = lines[i].trim();
      if (!l || /^IA\./.test(l) || /^I[.\s]/.test(l) || /^None/i.test(l)) break;
      const c = l.split(/\s+/);
      if (c.length < 8) break;
      regions.push({ num: c[0], loc: c[1], area: c[3], spots: c[6], mag: c[7] });
    }
  }
  const plages = [];
  const pi = lines.findIndex((l) => /^IA\./.test(l.trim()));
  if (pi !== -1) {
    for (let i = pi + 2; i < lines.length; i++) {
      const l = lines[i].trim();
      if (!l || /^II\./.test(l)) break;
      const c = l.split(/\s+/);
      if (/^\d{4}$/.test(c[0])) plages.push({ num: c[0], loc: c[1] });
    }
  }
  return { issued: parseIssued(txt), regions, plages };
}

const FLARE_ORDER = { A: 0, B: 1, C: 2, M: 3, X: 4 };
function flaresByDay(flares) {
  const by = {};
  (flares || []).forEach((f) => {
    const c = f.max_class || ''; if (!(c[0] in FLARE_ORDER)) return;
    const d = String(f.max_time).slice(0, 10), v = [FLARE_ORDER[c[0]], parseFloat(c.slice(1)) || 0];
    if (!by[d] || v[0] > by[d].v[0] || (v[0] === by[d].v[0] && v[1] > by[d].v[1])) by[d] = { cls: c, v };
  });
  return by;
}

// fine validità dell'allerta: NOAA la chiama «Valid To» su un'allerta fresca, «Now Valid Until» quando la estende
function parseAlertUntil(msg) {
  const m = /(?:Now Valid Until|Valid To):\s*(\d{4}) (\w{3}) (\d{1,2}) (\d{2})(\d{2}) UTC/.exec(msg);
  return m ? Date.UTC(+m[1], MONTHS[m[2]], +m[3], +m[4], +m[5]) : null;
}
function parseAlert(a) {
  const msg = (a.message || '').replace(/\r/g, '');
  const title = msg.split('\n').map((s) => s.trim()).find((s) => /^(EXTENDED )?(ALERT|WARNING|WATCH|SUMMARY|CONTINUED ALERT)\b/i.test(s)) || (msg.split('\n').find((s) => s.trim() && !/^Space Weather|^Serial|^Issue/i.test(s.trim())) || '').trim();
  const kp = /K-index of (\d)/i.exec(title);
  const isAlert = /^ALERT|^CONTINUED ALERT/i.test(title), isSummary = /^SUMMARY/i.test(title);
  // NOAA manda anche allerte per protoni/elettroni/radio (utili per satelliti, non per l'aurora): si tengono solo quelle geomagnetiche.
  const geo = /Geomagnetic|K-index/i.test(title);
  return { id: a.product_id, ms: toMs(a.issue_datetime), title, kp: kp ? +kp[1] : null, until: parseAlertUntil(msg), kind: isAlert || isSummary ? 'measured' : 'forecast', word: isAlert ? 'Raggiunto' : isSummary ? 'Riepilogo' : 'Previsto', geo, watch: geo ? parseWatch(title, msg, toMs(a.issue_datetime)) : null };
}
// WATCH = avviso con giorni di anticipo («Highest Storm Level Predicted by Day: Oct 09: G2 (Moderate)»); nessun Kp né scadenza,
// per questo il banner a soglia di Kp non lo vede. «THIS SUPERSEDES ANY/ALL PRIOR WATCHES»: vale l'ultimo emesso; CANCEL WATCH lo annulla.
function parseWatch(title, msg, issuedMs) {
  if (/^CANCEL WATCH/i.test(title)) return { cancel: true, days: [] };
  if (!/^WATCH/i.test(title)) return null;
  const iss = new Date(issuedMs), days = [], re = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2}):\s+(None|G(\d))/g;
  let m;
  while ((m = re.exec(msg))) {
    const mo = MONTHS[m[1]], y = iss.getUTCFullYear() + (mo < iss.getUTCMonth() - 6 ? 1 : 0);
    days.push({ ms: Date.UTC(y, mo, +m[2]), g: m[4] ? +m[4] : 0 });
  }
  return { cancel: false, days };
}

function frameTime(url) {
  const m = /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/.exec(url || '');
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null;
}
function pickCurrentFrame(frames, forecastRun) {
  if (!frames || !frames.length) return null;
  if (!forecastRun) return frames[frames.length - 1];
  const now = Date.now();
  const past = frames.filter((f) => { const t = frameTime(f.url); return t == null ? true : t <= now; });
  return past.length ? past[past.length - 1] : frames[frames.length - 1];
}

// dal 30 settembre 2026 NASA ha spostato l'API DONKI qui (stessi parametri e stessi dati); il vecchio indirizzo kauai.ccmc risponde con un redirect senza CORS
const DONKI = 'https://ccmc.gsfc.nasa.gov/DONKI-API/get/';

async function loadNoaa() {
  const [scales, fcTxt, discTxt, srsTxt, flares, alerts, suvi, ccor, enlil] = await Promise.all([
    getJSON(SWPC + '/products/noaa-scales.json', 'NOAA — scale G/S/R'),
    getTEXT(SWPC + '/text/3-day-forecast.txt', 'NOAA — previsione a 3 giorni'),
    getTEXT(SWPC + '/text/discussion.txt', 'NOAA — commento dei previsori'),
    getTEXT(SWPC + '/text/srs.txt', 'NOAA — regioni solari'),
    getJSON(SWPC + '/json/goes/primary/xray-flares-7-day.json', 'NOAA — brillamenti a 7 giorni'),
    getJSON(SWPC + '/products/alerts.json', 'NOAA — allerte ufficiali'),
    getJSON(SWPC + '/products/animations/suvi-primary-195.json', 'NOAA — immagini SUVI'),
    getJSON(SWPC + '/products/ccor1/jpegs.json', 'NOAA — coronografo CCOR1'),
    getJSON(SWPC + '/products/animations/enlil.json', 'NOAA — modello WSA-ENLIL'),
  ]);
  // analisi manuali delle CME di NASA DONKI: senza chiave, ultimi 10 giorni. Se non risponde, il resto della scheda funziona lo stesso.
  const d0 = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10), d1 = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const [cme, flr] = await Promise.all([
    getJSON(DONKI + 'CME?startDate=' + d0 + '&endDate=' + d1, 'NASA DONKI — CME'),
    getJSON(DONKI + 'FLR?startDate=' + d0 + '&endDate=' + d1, 'NASA DONKI — brillamenti'),
  ]);
  S.noaa = {
    scales, fc: parseForecast(fcTxt), disc: parseDiscussion(discTxt), srs: parseSRS(srsTxt), flares,
    alerts: Array.isArray(alerts) ? alerts.map(parseAlert).filter((a) => a.geo).slice(0, 6) : null,
    media: { suvi, ccor, enlil }, donki: Array.isArray(cme) ? { cme, flr: Array.isArray(flr) ? flr : [] } : null, loadedAt: Date.now(),
  };
}

// solo le allerte NOAA, indipendentemente dalla tab Giorni: serve al banner di Adesso, che deve vedere
// se c'è una tempesta confermata da NOAA anche se l'utente non ha mai aperto Giorni in questa sessione.
async function loadAlertsOnly() {
  const d0 = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10), d1 = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const [alerts, cme, flr] = await Promise.all([
    getJSON(SWPC + '/products/alerts.json', 'NOAA — allerte ufficiali (Adesso)'),
    getJSON(DONKI + 'CME?startDate=' + d0 + '&endDate=' + d1, 'NASA DONKI — CME (Adesso)'),
    getJSON(DONKI + 'FLR?startDate=' + d0 + '&endDate=' + d1, 'NASA DONKI — brillamenti (Adesso)'),
  ]);
  S.noaaAlerts = { list: Array.isArray(alerts) ? alerts.map(parseAlert).filter((a) => a.geo) : null, donki: Array.isArray(cme) ? { cme, flr: Array.isArray(flr) ? flr : [] } : null, loadedAt: Date.now() };
}

// sintesi: una frase che parafrasa la motivazione del bollettino («No G1 … storms are expected»)
function noaaSummary() {
  const f = S.noaa && S.noaa.fc; if (!f || !f.days.length) return null;
  const g = gOfKp(f.maxExpected), last = f.days[f.days.length - 1];
  const until = fmtDay(last.ms, 'UTC');
  if (g === 0) return { level: 0, title: 'Nessuna tempesta prevista', why: 'NOAA non prevede tempeste geomagnetiche di livello G1 o superiore fino a ' + until + '. Kp massimo atteso: ' + itNum(f.maxExpected, 2) + '.', g };
  return { level: g === 1 ? 1 : g === 2 ? 2 : 3, title: 'Tempesta G' + g + ' prevista', why: 'Nel bollettino NOAA il Kp massimo atteso fino a ' + until + ' è ' + itNum(f.maxExpected, 2) + ', livello G' + g + '.', g };
}

// Le prossime notti nel luogo scelto (dal tramonto all'alba successiva): il Kp più alto previsto nella notte e la luna.
// Il Kp è una media planetaria a 3 ore: qui è solo il «clima» di ogni notte, non dice cosa si vedrà nel luogo.
function nightsOutlook() {
  const f = S.noaa && S.noaa.fc; if (!f || !f.days.length || !window.SunCalc) return null;
  const cells = [];
  f.days.forEach((d) => d.kp.forEach((k, i) => cells.push({ a: d.ms + i * 3 * 3600e3, b: d.ms + (i + 1) * 3 * 3600e3, k })));
  const covA = cells[0].a, covB = cells[cells.length - 1].b, now = Date.now(), DAY = 86400000, out = [];
  for (let i = -1; i <= 3 && out.length < 3; i++) {
    const base = new Date(now + i * DAY), t = SunCalc.getTimes(base, S.lat, S.lon), tn = SunCalc.getTimes(new Date(base.getTime() + DAY), S.lat, S.lon);
    if (!validDate(t.sunset) || !validDate(tn.sunrise)) continue;
    const a = t.sunset.getTime(), b = tn.sunrise.getTime();
    if (b <= now) continue;
    const over = cells.filter((c) => c.b > a && c.a < b);
    if (!over.length) continue;
    const top = over.reduce((m, c) => (c.k > m.k ? c : m), over[0]);
    const cover = (Math.min(b, covB) - Math.max(a, covA)) / (b - a);
    let moonHours = 0, alt0 = null;
    for (let m = a; m < b; m += 1800e3) if (SunCalc.getMoonPosition(new Date(m), S.lat, S.lon).altitude > 0) moonHours += 0.5;
    out.push({ a, b, kp: top.k, kpFrom: top.a, kpTo: top.b, g: gOfKp(top.k), partial: cover < 0.95, ongoing: a <= now,
      moon: Math.round(SunCalc.getMoonIllumination(new Date((a + b) / 2)).fraction * 100), moonHours });
  }
  return out;
}

// Ogni brillamento come punto: ora del picco, classe e flusso (W/m², per l'asse logaritmico del grafico).
function flareEvents(flares) {
  return (flares || []).map((f) => {
    const c = f.max_class || '', L = c[0];
    if (!(L in FLARE_ORDER)) return null;
    let flux = Number(f.max_xrlong);
    if (!(flux > 0)) flux = Math.pow(10, -8 + FLARE_ORDER[L]) * (parseFloat(c.slice(1)) || 1);
    return { t: toMs(f.max_time), cls: c, L, flux, begin: f.begin_time ? toMs(f.begin_time) : null, end: f.end_time ? toMs(f.end_time) : null };
  }).filter((e) => e && isFinite(e.t)).sort((a, b) => a.t - b.t);
}

// ============================ CME: avevano quello che serve e vanno verso la Terra? ============================
// Fonte: NASA DONKI (analisi fatte a mano da ricercatori NASA/NOAA). Per ogni CME: brillamento collegato, posizione sul Sole,
// velocità, e se la simulazione ENLIL la manda verso la Terra (con arrivo e Kp stimati) o se un'onda d'urto è già stata misurata.
function parseSolarLoc(str) {
  const m = /^([NS])(\d{1,2})([EW])(\d{1,3})$/.exec(String(str || '').trim());
  if (!m) return null;
  const lon = +m[4];
  // lat/lonSigned: coordinate con segno per posizionare il punto su un disco (N e W positivi), usate dalla mappa delle regioni.
  return {
    txt: m[1] + m[2] + ' ' + m[3] + m[4], lon, face: lon <= 40 ? 'front' : lon <= 70 ? 'side' : 'limb',
    lat: (m[1] === 'S' ? -1 : 1) * (+m[2]), lonSigned: (m[3] === 'W' ? 1 : -1) * lon,
  };
}
const idTime = (id) => Date.parse(String(id).slice(0, 19) + 'Z');

function donkiRows(donki, goesFlares) {
  if (!donki || !Array.isArray(donki.cme)) return null;
  const flrById = {}, usedFlr = new Set(), rows = [];
  donki.flr.forEach((f) => { flrById[f.flrID] = f; });
  donki.cme.forEach((c) => {
    const an = (c.cmeAnalyses || []).find((a) => a.isMostAccurate) || (c.cmeAnalyses || [])[0] || null, linked = c.linkedEvents || [];
    const fid = (linked.find((x) => /-FLR-/.test(x.activityID)) || {}).activityID, fl = fid ? flrById[fid] : null;
    if (fid) usedFlr.add(fid);
    const shocks = linked.filter((x) => /-IPS-/.test(x.activityID)).map((x) => idTime(x.activityID)).filter(isFinite).sort((a, b) => a - b);
    const runs = an ? (an.enlilList || []) : [];
    const hit = runs.filter((e) => e.estimatedShockArrivalTime).sort((a, b) => Date.parse(a.estimatedShockArrivalTime) - Date.parse(b.estimatedShockArrivalTime))[0] || null;
    const kps = hit ? [hit.kp_18, hit.kp_90, hit.kp_135, hit.kp_180].filter((v) => typeof v === 'number') : [];
    const speed = an && an.speed ? Number(an.speed) : null;
    const row = {
      kind: 'cme', t: Date.parse(c.startTime), speed, loc: parseSolarLoc(c.sourceLocation || (fl && fl.sourceLocation)),
      flare: fl ? { cls: fl.classType, t: Date.parse(fl.peakTime) } : null,
      arrival: hit ? Date.parse(hit.estimatedShockArrivalTime) : null, glancing: hit ? !!hit.isEarthGB : false,
      kp: kps.length ? [Math.min.apply(null, kps), Math.max.apply(null, kps)] : null, simulated: runs.length > 0, shock: shocks[0] || null,
    };
    // interessa solo ciò che ha un brillamento, un arrivo stimato o misurato, oppure è veloce
    if (row.flare || row.arrival || row.shock || (speed && speed >= 800)) rows.push(row);
  });
  // brillamenti di classe M o X senza CME associata
  flareEvents(goesFlares).filter((e) => (e.L === 'M' || e.L === 'X') && e.t >= Date.now() - 7 * 86400000).forEach((e) => {
    const near = donki.flr.find((f) => Math.abs(Date.parse(f.peakTime) - e.t) <= 20 * 60000);
    if (near && usedFlr.has(near.flrID)) return;
    rows.push({ kind: 'flare', t: e.t, flare: { cls: e.cls, t: e.t }, loc: parseSolarLoc(near && near.sourceLocation) });
  });
  return rows.sort((a, b) => (b.flare ? b.flare.t : b.t) - (a.flare ? a.flare.t : a.t));
}
// esito verso la Terra: incoming, arrived, glancing, passed, no, unk, nocme
function cmeOutcome(r, now) {
  if (r.kind === 'flare') return 'nocme';
  if (r.shock && r.shock <= now) return 'arrived';
  if (r.arrival && r.arrival > now - 3 * 3600e3) return r.glancing ? 'glancing' : 'incoming';
  if (r.arrival) return 'passed';
  return r.simulated ? 'no' : 'unk';
}

// Ora di picco dei brillamenti a cui DONKI ha collegato una CME (anello nel grafico dei brillamenti).
function flaresWithCme() {
  const d = S.noaa && S.noaa.donki; if (!d) return [];
  return d.flr.filter((f) => (f.linkedEvents || []).some((x) => /-CME-/.test(x.activityID))).map((f) => Date.parse(f.peakTime)).filter(isFinite);
}
