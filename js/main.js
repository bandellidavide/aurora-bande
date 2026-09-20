'use strict';
// Aurora Bande · new version — avvio e aggiornamenti.
// Cadenza: L1 e magnetometri ogni minuto (i dati NOAA sono al minuto), OVATION e potenza ogni 5 minuti,
// meteo ogni 10, bollettini NOAA della scheda «Giorni» ogni 15. La grafica si ricalcola ogni 30 secondi senza nuove richieste.

let raf = null;
function renderSoon() { if (raf) return; raf = requestAnimationFrame(() => { raf = null; renderAll(); }); }

// fromDevice: le coordinate arrivano dalla posizione del dispositivo (con consenso). Solo allora si può chiedere il nome del luogo a BigDataCloud,
// il cui servizio gratuito è ammesso per la posizione del dispositivo e non per coordinate scelte o scritte a mano.
function changePlace(lat, lon, label, fromDevice) {
  S.lat = Number(lat); S.lon = Number(lon); S.label = label || null; S.tz = null; S.fromDevice = !!fromDevice;
  store.set('aurora_loc', { lat: S.lat, lon: S.lon, label: S.label, dev: S.fromDevice });
  S.sky = { data: null, lat: S.lat, lon: S.lon, fetchedAt: 0 };
  S.webcams = []; S.ground = { station: null, byStation: {}, errors: {}, pending: false, requestId: S.ground.requestId };
  updateOvation();
  renderAll();
  Promise.allSettled([loadWeather().then(renderSoon), loadGround().then(renderSoon), loadWebcams().then(renderSoon)]);
  if (!label && fromDevice) reverseGeocode();
}

let busy = false, last = { slow: 0, weather: 0, noaa: 0 };
async function refreshNow(manual) {
  if (busy) return;
  busy = true; $('refreshBtn').disabled = true;
  const now = Date.now(), jobs = [loadL1().then(renderSoon), loadGround().then(renderSoon)];
  if (manual || now - last.slow > 5 * 60000) { last.slow = now; jobs.push(loadOvation().then(renderSoon), loadHemi().then(renderSoon)); }
  if (manual || now - last.weather > 10 * 60000) { last.weather = now; jobs.push(loadWeather().then(renderSoon)); }
  if (manual || (S.view === 'giorni' && now - last.noaa > 15 * 60000)) { last.noaa = now; jobs.push(loadNoaa().then(renderSoon)); }
  try { await Promise.allSettled(jobs); } finally { busy = false; $('refreshBtn').disabled = false; }
  checkAlerts(); checkFrontAlerts(Date.now());
}

// ricalcolo periodico dell'interfaccia (stato dei fronti, età dei dati), evitando di disturbare chi sta usando un campo
function tick() {
  const a = document.activeElement;
  const editing = a && ['SELECT', 'INPUT', 'TEXTAREA'].includes(a.tagName) && $('view').contains(a);
  if (!editing && !document.querySelector('dialog[open]')) renderAll();
  else renderStatus();
  checkAlerts(); checkFrontAlerts(Date.now());
}

function boot() {
  loadSavedPlace();
  bindUI();
  const h = location.hash.replace('#', '');
  S.view = VIEWS.some((v) => v.id === h) ? h : 'adesso';
  renderAll();
  diagSet('Libreria sole/luna (SunCalc)', window.SunCalc ? 'ok' : 'wait', window.SunCalc ? 'ok' : 'in caricamento');
  last = { slow: Date.now(), weather: Date.now(), noaa: S.view === 'giorni' ? Date.now() : 0 };
  Promise.allSettled([
    loadL1().then(renderSoon), loadWeather().then(renderSoon), loadOvation().then(renderSoon), loadHemi().then(renderSoon),
    loadGround().then(renderSoon), loadWebcams().then(renderSoon), (S.view === 'giorni' ? loadNoaa().then(renderSoon) : Promise.resolve()),
  ]).then(renderSoon);
  if (!S.label && S.fromDevice) reverseGeocode();
  setInterval(() => refreshNow(false), 60 * 1000);
  setInterval(tick, 30 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.loadedAt && Date.now() - S.loadedAt > 2 * 60000) refreshNow(false); });
  // SunCalc è caricato con defer: a pagina caricata si sa se c'è o no
  window.addEventListener('load', () => { diagSet('Libreria sole/luna (SunCalc)', window.SunCalc ? 'ok' : 'err', window.SunCalc ? 'ok' : 'NON caricata: cdnjs irraggiungibile'); renderSoon(); });
}
boot();
