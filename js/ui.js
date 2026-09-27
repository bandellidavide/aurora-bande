'use strict';
// Aurora Bande · new version — interfaccia: schede, componenti, fogli. Usa le classi del design system (css/app.css).

const VIEWS = [
  { id: 'adesso', label: 'Adesso', icon: 'activity' },
  { id: 'fronti', label: 'Fronti', icon: 'clock' },
  { id: 'webcam', label: 'Webcam', icon: 'camera' },
  { id: 'giorni', label: 'Giorni', icon: 'calendar' },
  { id: 'cielo', label: 'Cielo', icon: 'cloud' },
];
const CAVEAT = 'Sono ipotesi che mettono insieme più fattori, non una previsione: l’aurora dipende da molti elementi e nessuno basta da solo.';
const dayShort = (ms) => new Date(ms).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', timeZone: 'UTC' }).replace('.', '');
const hourLabel = (ms) => { const s = fmtClock(ms); return s.endsWith(':00') ? s.slice(0, 2) : s; };

// ============================ pezzi comuni ============================
function card(title, inner, opts) {
  opts = opts || {};
  return '<section class="ab-card"' + (opts.id ? ' id="' + opts.id + '"' : '') + '><div class="ab-card__head"><h2 class="t-title">' + esc(title) + '</h2>' + (opts.right || '') + '</div>' + inner + '</section>';
}
function checkBox(label, c) {
  const mark = { good: '✓', mid: '–', bad: '✕' }[c.state];
  return '<div class="ab-check" data-state="' + c.state + '"><div class="ab-check__top"><span class="t-label">' + label + '</span><span class="ab-check__mark" aria-hidden="true">' + mark + '</span></div><span class="ab-check__value">' + esc(c.value) + '</span><span class="ab-check__note">' + esc(c.note) + '</span></div>';
}
function metricTile(tone, label, value, unit, iconName, note) {
  return '<div class="ab-metric" data-tone="' + tone + '"><span class="t-label">' + label + '</span><span class="ab-metric__value"><span class="t-num-lg">' + value + '</span>' + (unit ? '<span class="t-body-sm ab-unit">' + unit + '</span>' : '') + '</span><span class="t-body-sm ab-metric__note">' + (iconName ? icon(iconName) : '') + esc(note) + '</span></div>';
}
function situationMarkup(o) {
  const lvl = o.level == null ? 0 : o.level;
  const meter = o.meter ? '<ol class="ab-meter" aria-label="Livello del segnale">' + SIGNAL_STEPS.map((n, i) => '<li data-l="' + i + '"' + (i === lvl ? ' class="on now" aria-current="step"' : i < lvl ? ' class="on"' : '') + '>' + n + '</li>').join('') + '</ol>' : '';
  return '<section class="ab-situation" data-level="' + lvl + '" aria-labelledby="' + o.id + '"><div class="ab-situation__head"><p class="t-label">' + o.eyebrow + '</p>' + o.tag + '</div>' +
    '<h1 id="' + o.id + '" class="t-verdict ab-situation__title">' + esc(o.title) + '</h1><p class="t-body-sm ab-situation__why">' + esc(o.why) + '</p>' + meter + (o.window || '') + (o.body || '') +
    '<p class="t-body-sm ab-situation__caveat">' + esc(o.caveat) + '</p>' + (o.foot ? '<div class="ab-situation__foot">' + o.foot + '</div>' : '') + '</section>';
}
function empty(text) { return '<p class="ab-empty">' + esc(text) + '</p>'; }
function extLink(href, text) { return '<a href="' + esc(href) + '" target="_blank" rel="noopener">' + esc(text) + icon('ext') + '</a>'; }

// ============================ stato e navigazione ============================
function renderNav() {
  const mk = () => VIEWS.map((v) => '<a class="ab-tab" href="#' + v.id + '"' + (S.view === v.id ? ' aria-current="page"' : '') + '>' + icon(v.icon) + '<span>' + v.label + '</span></a>').join('');
  $('navTop').innerHTML = mk(); $('navBottom').innerHTML = mk();
}
function flashToast(text) {
  const t = $('toast'); if (!t) return;
  t.textContent = text; t.hidden = false; clearTimeout(flashToast.timer); flashToast.timer = setTimeout(() => { t.hidden = true; }, 5000);
}
// Geolocalizzazione: con il consenso del browser. msgEl: dove scrivere i messaggi (nel foglio del luogo); altrimenti un avviso in basso.
let geoBusy = false;
function useMyLocation(msgEl) {
  const say = (text) => { if (msgEl) msgEl.innerHTML = '<p class="ab-notice">' + esc(text) + '</p>'; else flashToast(text); };
  if (!navigator.geolocation) { say('Questo browser non supporta la geolocalizzazione: cerca un luogo o scrivi le coordinate.'); return; }
  if (geoBusy) return;
  geoBusy = true; say('Individuazione della posizione…');
  navigator.geolocation.getCurrentPosition((pos) => {
    geoBusy = false;
    const dlg = $('sheetPlace'); if (dlg && dlg.open) dlg.close();
    changePlace(Number(pos.coords.latitude.toFixed(3)), Number(pos.coords.longitude.toFixed(3)), null, true);
    flashToast('Posizione aggiornata.');
  }, (err) => {
    geoBusy = false;
    say(err && err.code === 1 ? 'Permesso negato. Consenti la posizione per questo sito (icona accanto all’indirizzo del browser) e riprova.' : err && err.code === 3 ? 'La posizione non è arrivata in tempo: riprova.' : 'Posizione non disponibile ora: cerca un luogo o scrivi le coordinate.');
  }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 });
}

function renderHeader() {
  $('geoHeaderBtn').innerHTML = icon('locate'); $('geoHeaderBtn').dataset.on = String(!!S.fromDevice);
  $('geoHeaderBtn').setAttribute('aria-label', 'Usa la mia posizione'); $('geoHeaderBtn').title = 'Usa la mia posizione';
  $('placeBtn').innerHTML = icon('pin') + '<span>' + esc(shortPlace()) + '</span>' + icon('chev');
  $('placeBtn').setAttribute('aria-label', 'Luogo: ' + placeLabel() + '. Cambia luogo');
  $('alertBtn').innerHTML = icon('bell'); $('alertBtn').dataset.on = String(!!alertFlags.watch);
  $('alertBtn').setAttribute('aria-label', alertFlags.watch ? 'Avvisi attivi' : 'Avvisi');
  $('refreshBtn').innerHTML = icon('refresh');
}
function renderStatus() {
  let s;
  if (S.view === 'giorni') {
    const n = S.noaa, iss = n && n.fc && n.fc.issued;
    s = !n ? { st: 'stale', t: 'Bollettini NOAA in caricamento…' } : iss ? { st: Date.now() - n.loadedAt < 30 * 60000 ? 'live' : 'stale', t: 'Bollettino NOAA delle ' + fmtClock(iss) } : { st: 'stale', t: 'Bollettino NOAA non leggibile' };
  } else {
    const c = l1Now();
    if (!S.magRaw && !S.sum.mag) s = { st: 'offline', t: S.loadedAt ? 'Dati L1 non raggiungibili · ultimo tentativo ' + fmtClock(S.loadedAt) : 'Connessione ai dati L1…' };
    else if (c.ts && c.age <= 3) s = { st: 'live', t: 'Dati L1 in diretta · ' + (c.age < 1 ? 'meno di 1 min fa' : c.age + ' min fa') };
    else if (c.ts) s = { st: 'stale', t: 'Dato L1 di ' + c.age + ' min fa' };
    else s = { st: 'stale', t: 'Nessun dato L1 recente' };
  }
  const html = '<span class="ab-status" data-state="' + s.st + '"><i></i>' + esc(s.t) + '</span><span class="t-caption" style="color:var(--ink-3);align-self:center">Orari: ' + esc(zone().replace('_', ' ')) + ' (' + esc(tzName()) + ')</span>';
  if ($('statusRow').dataset.html !== html) { $('statusRow').innerHTML = html; $('statusRow').dataset.html = html; } // evita annunci ripetuti agli screen reader
}

// ============================ ADESSO ============================
function viewAdesso() {
  const now = Date.now(), e = pickEvent(now), F = factors(e), H = hypothesis(F), sig = F.sig;
  let win = '';
  if (sig.level != null && e && e.arrStart != null) {
    const st = eventState(e, now), ov = overlapsOf(e);
    win = '<a class="ab-situation__window ab-golink" href="#fronti" data-go="fronti" aria-label="Vai al fronte: arrivo stimato tra le ' + fmtClock(e.arrStart - ARRIVAL_MARGIN_MS) + ' e le ' + fmtClock(e.arrStart + ARRIVAL_MARGIN_MS) + '"><div class="ab-situation__row"><span class="t-label">Un episodio di Bz sud potrebbe arrivare</span>' + tag('estimated', TAGS.estimated) + '</div>' +
      '<span class="t-window">' + fmtClock(e.arrStart - ARRIVAL_MARGIN_MS) + ' – ' + fmtClock(e.arrStart + ARRIVAL_MARGIN_MS) + '</span>' + arrivalBar(e, now) +
      '<span class="t-caption">' + esc(st.label) + ' · stima indicativa: può arrivare prima o dopo.' + (ov ? ' ' + (ov + 1) + ' finestre si sovrappongono.' : '') + '</span>' +
      '<span class="ab-golink__cta">Vedi il fronte' + icon('chev') + '</span></a>';
  }
  const sit = situationMarkup({
    id: 'sit', level: H.level, meter: false, eyebrow: 'Quadro d’insieme', tag: '',
    title: H.title, why: H.why, window: win, body: factorOverview(F), caveat: CAVEAT,
    foot: '<button type="button" class="ab-btn-text" data-open="info">Come è calcolato ' + icon('info') + '</button>' + (sig.c.fallback ? '<span class="t-caption" style="color:var(--ink-3)">Campo da riepilogo NOAA</span>' : ''),
  });
  // colonna principale: grafico e sotto il quadro d'insieme; colonna a lato: le quattro misure e il riscontro a terra (su telefono le misure vanno in cima)
  return '<div class="ab-page" data-cols="two"><div class="ab-stack">' + geoHint() + fieldCard() + sit + '</div><div class="ab-stack">' + metricsBlock(sig.c) + groundCard(e) + '</div><div class="ab-span">' + windCard() + '</div></div>';
}

// L'arrivo in un colpo d'occhio: misura a L1 → viaggio → finestra d'arrivo (sfumata, perché la stima è indicativa) e «adesso».
function arrivalBar(e, now) {
  const a = e.arrStart - ARRIVAL_MARGIN_MS, b = e.arrStart + ARRIVAL_MARGIN_MS, pe = e.arrEnd != null && !e.ongoing ? e.arrEnd : null;
  const t0 = Math.min(e.start, now) - 4 * 60000, t1 = Math.max(b, pe || 0, now) + 12 * 60000;
  const P = (t) => Math.max(0, Math.min(100, (t - t0) / (t1 - t0) * 100)), f = (v) => v.toFixed(1);
  const pn = P(now);
  const label = 'Misurato a L1 alle ' + fmtClock(e.start) + ', in viaggio, finestra d’arrivo ' + fmtClock(a) + ' – ' + fmtClock(b) + '; adesso sono le ' + fmtClock(now);
  return '<div class="ab-arrbar" role="img" aria-label="' + esc(label) + '"><div class="ab-arrbar__track">' +
    '<i class="ab-arrbar__travel" style="left:' + f(P(e.start)) + '%;width:' + f(Math.max(0, P(a) - P(e.start))) + '%"></i>' +
    (pe ? '<i class="ab-arrbar__pass" style="left:' + f(P(b)) + '%;width:' + f(Math.max(0, P(pe) - P(b))) + '%"></i>' : '') +
    '<i class="ab-arrbar__win" style="left:' + f(P(a)) + '%;width:' + f(Math.max(1, P(b) - P(a))) + '%"></i>' +
    '<i class="ab-arrbar__est" style="left:' + f(P(e.arrStart)) + '%"></i>' +
    '<i class="ab-arrbar__l1" style="left:' + f(P(e.start)) + '%"></i>' +
    '<i class="ab-arrbar__now" style="left:' + f(pn) + '%"><span' + (pn > 80 ? ' data-end' : pn < 12 ? ' data-start' : '') + '>adesso</span></i></div>' +
    '<ul class="ab-arrbar__legend" aria-hidden="true"><li data-k="l1">misurato a L1 ' + fmtClock(e.start) + '</li><li data-k="travel">in viaggio</li><li data-k="win">finestra d’arrivo</li></ul></div>';
}

// Alla prima visita si vede il luogo di partenza: un invito, una volta sola, a usare la propria posizione.
function geoHint() {
  if (store.get('aurora_loc', null) || store.get('aurora_geo_hint', 0) || !navigator.geolocation) return '';
  return '<div class="ab-notice ab-geohint"><b>Stai vedendo ' + esc(shortPlace()) + '.</b> Per cielo, meteo e webcam vicino a te usa la tua posizione.<div class="ab-row" style="margin-top:var(--space-2)"><button type="button" class="ab-btn" data-variant="primary" data-geo>' + icon('locate') + 'Usa la mia posizione</button><button type="button" class="ab-btn-text" data-geo-dismiss>Non ora</button></div></div>';
}

function metricsBlock(c) {
  const ong = ongoingEpisode(), lag = c.v ? Math.round(lagMin(c.v)) : null;
  const bzTone = c.bz == null ? 'neutral' : isSouth(c.bz) ? 'south' : c.bz > 0 ? 'north' : 'neutral';
  const bzNote = c.bz == null ? 'Dato non recente' : isSouth(c.bz) ? 'Sud · favorevole' + (ong ? ' · ' + fmtDur(ong.durMin) : '') : c.bz > 0 ? 'Nord · sfavorevole' : 'Vicino allo zero · neutro';
  return '<div class="ab-metrics">' +
    metricTile(bzTone, 'Bz · direzione', c.bz == null ? '—' : signed(c.bz, 1), 'nT', c.bz == null || !(isSouth(c.bz) || c.bz > 0) ? '' : isSouth(c.bz) ? 'down' : 'up', bzNote) +
    metricTile('neutral', 'Bt · campo totale', c.bt == null ? '—' : itNum(c.bt, 1), 'nT', '', 'Misurato · ' + (c.src || '—')) +
    metricTile('neutral', 'Vento solare', c.v == null ? '—' : String(Math.round(c.v)), 'km/s', '', lag != null ? 'Viaggio stimato · ' + lag + ' min' : 'Velocità non recente') +
    metricTile(c.ey != null && isSouth(c.bz) ? 'south' : 'neutral', 'Forzante sud · Ey+', c.ey == null ? '—' : itNum(c.ey, 2), 'mV/m', '', 'Favorevole se Bz è sud') + '</div>';
}

function groundCard(e) {
  const g = groundView(e), a = g.a, ov = overlapsOf(e);
  const iconName = a.state === 'signal' ? 'zap' : a.state === 'waiting' ? 'clock' : a.state === 'monitoring' ? 'activity' : 'info';
  const tone = a.state === 'signal' ? 'marked' : 'idle';
  const name = GROUND_NAMES[g.st] + ' · ' + GROUND_STATIONS[g.st][0].toFixed(1).replace('.', ',') + '°N';
  const url = 'https://space.fmi.fi/image/realtime/UT/' + g.st + '/XYZlast2.html';
  return '<section class="ab-card ab-ground" id="groundCard"><div class="ab-card__head"><h2 class="t-title">Riscontro a terra</h2>' + tag('measured', TAGS.measured) + '</div>' +
    '<p class="t-label" style="color:var(--ink-3)">' + esc(name) + ' · ' + Math.round(g.dist) + ' km dal luogo</p>' +
    '<div class="ab-ground__value"><span class="t-num-lg">' + (a.delta != null ? signed(a.delta, 0) : '—') + '</span><span class="t-body-sm ab-unit">nT</span></div>' +
    '<span class="t-caption" style="color:var(--ink-3)">Variazione X rispetto al riferimento</span>' +
    groundChartBlock() +
    '<p class="ab-ground__state t-body" data-tone="' + tone + '">' + icon(iconName) + esc(e ? a.label : 'Nessun fronte da confrontare') + '</p>' +
    '<p class="t-body-sm" style="color:var(--ink-2);margin-top:var(--space-2)">' + esc(e ? a.detail : 'Il confronto parte quando un episodio di Bz sud ha un arrivo stimato.') + '</p>' +
    (ov ? '<p class="ab-notice" style="margin-top:var(--space-3)">Finestre sovrapposte: un’eventuale risposta non è attribuibile a un solo fronte.</p>' : '') +
    (g.far ? '<p class="ab-notice" style="margin-top:var(--space-3)">Stazione lontana: confronto regionale, non conferma locale.</p>' : '') +
    '<p class="ab-ground__foot t-caption">' + (g.last ? 'Ultimo campione ' + fmtClock(g.last) + '. ' : '') + 'Regola esplorativa a 100 nT: un segnale è solo compatibile nel tempo con il fronte, non ne prova la causa; un magnetometro tranquillo non esclude un arrivo altrove.</p>' +
    '<p class="t-caption ab-credit">Dati: rete di magnetometri IMAGE, mantenuta da FMI e dagli istituti partner (CC BY 4.0). Tempo reale, provvisori.</p>' +
    '<div class="ab-linkrow">' + extLink(url, 'Magnetogramma FMI') + '</div></section>';
}

// ============================ FRONTI ============================
function fmtCharge(e) { return e.charge == null ? 'non calcolabile' : Math.round(e.charge) + ' <small>mV/m·min · ' + Math.round((e.coverage || 0) * 100) + '% coperto</small>'; }
function viewFronti() {
  const now = Date.now(), all = S.episodes.slice().reverse(), sel = pickEvent(now) || S.episodes[S.episodes.length - 1] || null;
  // in arrivo o in corso: sempre in vista. Fra i passati restano gli ultimi due; gli altri (fino a 15 episodi in tutto) stanno in un menu a tendina.
  const live = (e) => { const k = eventState(e, now).kind; return e.ongoing || k === 'travel' || k === 'window'; };
  const active = all.filter(live), past = all.filter((e) => !live(e));
  const recent = past.slice(0, 2), older = past.slice(2, Math.max(2, 15 - active.length));
  const row = (e) => {
    const st = eventState(e, now), on = sel && sel.start === e.start;
    return '<li><button type="button" class="ab-front" data-front="' + e.start + '" aria-pressed="' + !!on + '"><b>' + esc(st.label) + '</b><span class="when">' + (e.arrStart != null ? '~' + fmtClock(e.arrStart) : '—') + '<small>arrivo stimato</small></span><span>L1 ' + fmtClock(e.start) + ' · ' + fmtDur(e.durMin) + ' · Bz medio ' + signed(e.bzMean, 1) + ' nT</span><span></span></button></li>';
  };
  const group = (label, list) => '<h3 class="t-label ab-fgroup">' + label + '</h3><ul class="ab-fronts">' + list.map(row).join('') + '</ul>';
  let body;
  if (!all.length) body = empty(S.magRaw ? 'Nessun episodio di Bz sud rilevato nelle ultime ' + BZ_CFG.windowHours + ' ore.' : 'In attesa dei dati L1.');
  else {
    body = (active.length ? group('In arrivo o in corso', active) : '<p class="ab-notice">Nessun fronte in arrivo o in corso.</p>') +
      (recent.length ? group(active.length ? 'Ultimi passati' : 'Gli ultimi due', recent) : '') +
      (older.length ? '<details class="ab-details"' + (older.some((e) => sel && sel.start === e.start) ? ' open' : '') + '><summary>Episodi precedenti (' + older.length + ')' + icon('chev') + '</summary><ul class="ab-fronts">' + older.map(row).join('') + '</ul></details>' : '');
  }
  const listCard = card('Episodi di Bz sud', body, { right: tag('estimated', TAGS.estimated) }) +
    '<p class="t-caption" style="color:var(--ink-3)">Dati: NOAA SWPC. Regola: Bz ≤ −1 nT per almeno 4 minuti, con tolleranza di 4 minuti alle risalite. Sonda: ' + esc(selectedSource() || '—') + '.</p>';
  let detail = '';
  if (sel) {
    const st = eventState(sel, now), gs = groundSummary(sel, now), sk = skyWindow(sel), ov = overlapsOf(sel);
    const pass = sel.arrEnd != null ? (sel.arrEnd - sel.arrStart) / 60000 : null;
    detail = card('Dettagli dell’episodio',
      '<p class="t-body" style="margin-bottom:var(--space-3)">Rilevato a L1 alle ' + fmtClock(sel.start) + (sel.ongoing ? ' · ancora aperto.' : ' · terminato alle ' + fmtClock(sel.end) + '.') + '</p>' +
      (sel.arrStart != null ? '<h3 class="t-label" style="color:var(--ink-3)">Quando potrebbe arrivare</h3>' + arrivalBar(sel, now) : '') +
      '<h3 class="t-label" style="color:var(--ink-3)">Quanto è andato a sud (Bz)</h3>' + frontChartBlock() +
      '<dl class="ab-facts" style="margin-top:var(--space-3)">' +
      '<div><dt>Durata Bz sud a L1</dt><dd>' + fmtDur(sel.durMin) + '</dd></div><div><dt>Bz medio</dt><dd>' + signed(sel.bzMean, 1) + ' <small>nT</small></dd></div>' +
      '<div><dt>Bz minimo</dt><dd>' + signed(sel.bzMin, 1) + ' <small>nT</small></dd></div><div><dt>Vento al fronte</dt><dd>' + (sel.vStart != null ? Math.round(sel.vStart) + ' <small>km/s</small>' : '—') + '</dd></div>' +
      '<div><dt>Impulso ∫Ey+ dt</dt><dd>' + fmtCharge(sel) + '</dd></div><div><dt>Passaggio stimato</dt><dd>' + (sel.arrStart != null ? '~' + fmtClock(sel.arrStart) + ' → ' + (sel.ongoing ? 'fine non nota' : sel.arrEnd != null ? '~' + fmtClock(sel.arrEnd) : 'non stimabile') : '—') + '</dd></div>' +
      '<div><dt>Finestra d’arrivo</dt><dd>' + (sel.arrStart != null ? fmtClock(sel.arrStart - ARRIVAL_MARGIN_MS) + ' – ' + fmtClock(sel.arrStart + ARRIVAL_MARGIN_MS) : '—') + '</dd></div><div><dt>Cielo nella finestra</dt><dd>' + (sk ? (sk[0] === sk[1] ? Math.round(sk[0]) : Math.round(sk[0]) + '–' + Math.round(sk[1])) + '% <small>nuvole</small>' : '—') + '</dd></div></dl>' +
      '<p class="t-body-sm" style="margin-top:var(--space-3);color:var(--ink-2)">Stato: ' + esc(st.label) + (pass > 0 ? ' · durata del passaggio prevista ~' + fmtDur(pass) : '') + '. Il margine di ±15 minuti è indicativo, non un intervallo di confidenza.</p>' +
      (ov ? '<p class="ab-notice" style="margin-top:var(--space-3)">' + (ov + 1) + ' finestre si sovrappongono: la risposta a terra non è attribuibile a un solo fronte.</p>' : '') +
      '<div class="ab-linkrow"><a class="ab-link" href="#cielo" data-go="cielo">Meteo del luogo</a><a class="ab-link" href="#webcam" data-go="webcam">Webcam</a></div><h3 class="t-title" style="margin:var(--space-5) 0 var(--space-2)">Riscontro a terra</h3><p class="t-body">' + esc(gs.label) + '</p><p class="t-body-sm" style="color:var(--ink-2)">' + esc(gs.note) + '</p>', { right: tag('estimated', TAGS.estimated) });
  }
  const ag = satAgreement();
  const agCard = card('Accordo fra le sonde',
    ag.level == null ? empty('Servono almeno due sonde con dati recenti.') :
      '<p class="t-body">' + esc(ag.text) + '</p><p class="t-body-sm" style="color:var(--ink-2);margin:var(--space-1) 0 var(--space-3)">Scarto: Bz ' + itNum(ag.dBz, 1) + ' nT · velocità ' + Math.round(ag.dV) + ' km/s' + (ag.level === 2 ? ' — fidati solo della sonda di riferimento' : '') + '.</p><div class="ab-agree">' +
      ag.rows.map((r) => '<div class="ab-agree__row"><span>' + esc(r.s) + (r.s === selectedSource() ? ' · riferimento' : '') + '</span><b>' + (r.bz != null ? signed(r.bz, 1) + ' nT' : '—') + ' · ' + (r.v != null ? Math.round(r.v) + ' km/s' : '—') + '</b></div>').join('') + '</div>',
    { right: tag('measured', TAGS.measured) });
  return '<div class="ab-page"><div class="ab-span"><h1 class="ab-h1">Fronti</h1><p class="ab-lede">Episodi di Bz sud misurati a L1 e stima del loro arrivo sulla Terra.</p></div><div class="ab-stack">' + listCard + '</div><div class="ab-stack">' + detail + '</div><div class="ab-stack">' + agCard + '</div></div>';
}

// ============================ CIELO ============================
// Luna, tramonto e alba dei prossimi 5 giorni: in un riquadro chiuso, per chi vuole pianificare.
function skyOutlookBlock() {
  const days = skyOutlook(5); if (!days) return '';
  const clk = (ms) => (ms == null ? '—' : fmtClock(ms));
  const rows = days.map((d) => {
    const label = new Date(d.day).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', timeZone: zone() }).replace('.', '');
    const dark = d.darkStart != null && d.darkEnd != null ? 'buio ' + clk(d.darkStart) + '–' + clk(d.darkEnd) : 'niente buio astronomico';
    const moon = d.moonHours === 0 ? 'luna non in cielo' : 'luna in cielo ' + (Math.round(d.moonHours * 2) / 2).toString().replace('.', ',') + ' h';
    return '<li><span class="d"><b>' + esc(label) + '</b></span><span class="m">' + moonSvg(d.phase, 26) + '<small>' + d.illum + '%</small></span><span class="t">' + icon('sunset') + '<b>' + clk(d.sunset) + '</b></span><span class="t">' + icon('sunrise') + '<b>' + clk(d.sunrise) + '</b></span><small class="n">' + esc(dark + ' · ' + moon) + '</small></li>';
  }).join('');
  return '<details class="ab-details"><summary>Prossimi 5 giorni: luna, tramonto e alba' + icon('chev') + '</summary><ul class="ab-sky5" aria-label="Prossimi 5 giorni"><li class="hd" aria-hidden="true"><span>Notte di</span><span>Luna</span><span>Tramonto</span><span>Alba dopo</span></li>' + rows + '</ul><p class="t-caption ab-card__note">La luna è quella di metà notte. «Luna in cielo» conta le ore, fra tramonto e alba, in cui sta sopra l’orizzonte: con la luna bassa o assente il cielo è più scuro.</p></details>';
}
function viewCielo() {
  const a = S.astro = astro(), d = S.sky.data, now = Date.now();
  // meteo
  let wx;
  if (!d) wx = empty('Meteo non disponibile ora.');
  else {
    const cur = d.current, cc = Math.round(cur.cloud_cover), cls = cloudClass(cc), fz = d.timezone;
    const rows = d.hourly.time.map((t, i) => ({ t: t * 1000, v: d.hourly.cloud_cover[i], rain: d.hourly.precipitation_probability ? d.hourly.precipitation_probability[i] : null })).filter((p) => p.t + 3600000 > now).slice(0, 6);
    const rain = rows.length && isFinite(rows[0].rain) ? Math.round(rows[0].rain) : null, nc = nightCloud();
    const layer = (lb, k) => { const v = isFinite(cur[k]) ? Math.round(cur[k]) : null; return '<div class="ab-layer"><span>' + lb + '</span><i><b style="width:' + (v == null ? 0 : v) + '%;background:' + (v == null ? 'var(--line)' : v <= 30 ? 'var(--aurora-green)' : v > 70 ? 'var(--north)' : 'var(--ink-2)') + '"></b></i><strong>' + (v == null ? '—' : v + '%') + '</strong></div>'; };
    wx = '<div class="ab-bigvalue">' + icon('cloud', 'ab-icon--lg') + '<span class="t-num-lg">' + cc + '%</span><span class="t-body">' + cloudWord(cc) + ' · nuvole ora</span></div>' +
      '<p class="t-body-sm" style="color:var(--ink-2);margin-top:var(--space-1)">' + [Math.round(cur.temperature_2m) + ' °C', rain != null ? 'pioggia ' + rain + '%' : null, isFinite(cur.wind_speed_10m) ? 'vento ' + Math.round(cur.wind_speed_10m) + ' km/h' : null].filter(Boolean).join(' · ') + '</p>' +
      '<div class="ab-layers">' + layer('Totali', 'cloud_cover') + layer('Basse', 'cloud_cover_low') + layer('Medie', 'cloud_cover_mid') + layer('Alte', 'cloud_cover_high') + '</div>' +
      '<h3 class="t-label" style="margin-top:var(--space-4);color:var(--ink-3)">Prossime 6 ore</h3><div class="ab-hbars">' + rows.map((p) => '<div><strong>' + Math.round(p.v) + '%</strong><i data-c="' + cloudClass(p.v) + '" style="height:' + Math.max(4, p.v * 0.6) + 'px"></i><span>' + new Date(p.t).toLocaleTimeString('it-IT', { hour: '2-digit', timeZone: fz }) + '</span></div>').join('') + '</div>' +
      (nc != null ? '<p class="t-body-sm" style="margin-top:var(--space-3);color:var(--ink-2)">Media stanotte (21:00–05:00): ~' + nc + '% di nuvole.</p>' : '') +
      '<div class="ab-linkrow">' + extLink('https://www.windy.com/?clouds,' + S.lat + ',' + S.lon + ',8', 'Windy · nuvole') + extLink('https://view.eumetsat.int/', 'EUMETView · satellite') + extLink('https://www.windy.com/?webcams,' + S.lat + ',' + S.lon + ',8', 'Windy · webcam') + '</div>' +
      '<p class="t-caption ab-card__note">Dati meteo: Open-Meteo.com (CC BY 4.0), stime da modello recuperate alle ' + fmtClock(S.sky.fetchedAt, fz) + '. Gli strati nuvolosi non si sommano e le schiarite locali possono differire.</p>';
  }
  const wxCard = card('Meteo del luogo', wx, { right: tag('forecast', TAGS.forecast) });
  // buio e luna
  let as;
  if (!a.ok) as = empty('Calcolo non disponibile: libreria SunCalc non caricata.');
  else {
    const m = a.moon, moonParts = [];
    if (m.alwaysUp) moonParts.push('sempre sopra l’orizzonte oggi'); else if (m.alwaysDown) moonParts.push('non sorge oggi'); else { if (m.rise) moonParts.push('sorge ' + fmtClock(m.rise.getTime())); if (m.set) moonParts.push('tramonta ' + fmtClock(m.set.getTime())); }
    const head = !a.hasDark ? 'Niente buio astronomico' : a.level === 'dark' ? 'Buio fino alle ' + fmtClock(a.darkEnd && a.darkEnd.getTime()) : 'Buio dalle ' + fmtClock(a.darkStart && a.darkStart.getTime()) + ' alle ' + fmtClock(a.darkEnd && a.darkEnd.getTime());
    const row = (l, d2, ic) => '<li><span>' + icon(ic) + l + '</span><b>' + (d2 ? fmtClock(d2.getTime()) : '—') + '</b></li>';
    as = '<p class="t-body ab-iconline" style="font-weight:600">' + icon('stars') + esc(head) + '</p>' +
      '<ul class="ab-timeline">' + row('Tramonto', a.sunset, 'sunset') + row('Fine del crepuscolo civile', a.dusk, 'sunset') + row('Inizio buio astronomico', a.darkStart, 'stars') + row('Fine buio astronomico', a.darkEnd, 'stars') + row('Alba', a.sunrise, 'sunrise') + '</ul>' +
      '<h3 class="t-label" style="margin-top:var(--space-4);color:var(--ink-3)">Luna</h3><div class="ab-moon">' + moonSvg(m.phase, 56) + '<div><p class="t-body" style="font-weight:600">' + esc(m.name) + ' · ' + m.illum + '% illuminata</p>' +
      '<p class="t-body-sm" style="color:var(--ink-2)">' + esc(moonParts.join(' · ') || 'Eventi lunari non risolti oggi') + (m.alt != null ? ' · ora ' + (m.above ? 'sopra' : 'sotto') + ' l’orizzonte (' + Math.round(m.alt) + '°)' : '') + '</p></div></div>' + skyOutlookBlock() +
      '<p class="t-caption ab-card__note">Calcolo SunCalc per il luogo scelto. Una luna luminosa riduce la visibilità delle aurore deboli ma non ne cambia la fisica. Vicino ai circoli polari alcuni passaggi possono mancare nello stesso giorno.</p>';
  }
  const asCard = card('Buio e luna', as, { right: tag('computed', TAGS.computed) });
  // OVATION
  const ov = S.ovation, hp = S.hemi;
  let ovh;
  if (!ov || ov.val == null) ovh = empty('Modello OVATION non disponibile ora.');
  else ovh = '<div class="ab-bigvalue"><span class="t-num-lg">' + Math.round(ov.val) + '</span><span class="t-body-sm ab-unit">/ 100</span></div><p class="t-body" style="margin-top:var(--space-1)">' + esc(ovationLabel(ov.val)) + '</p><p class="t-body-sm" style="color:var(--ink-2)">' + esc(auroraZoneLabel(S.lat)) + '</p>' +
    (hp ? '<div class="ab-bigvalue" style="margin-top:var(--space-4)"><span class="t-num-lg">' + Math.round(hp.gw) + '</span><span class="t-body-sm ab-unit">GW · emisfero nord</span></div><p class="t-body-sm" style="color:var(--ink-2)">' + (hp.delta > 3 ? 'In aumento' : hp.delta < -3 ? 'In calo' : 'Stabile') + ' (' + signed(hp.delta, 0) + ' GW rispetto a circa 3 ore fa)</p>' : '') +
    '<p class="t-caption ab-card__note">Dati: NOAA SWPC · modello OVATION' + (ov.forecastTime ? ' · previsione delle ' + esc(String(ov.forecastTime).replace('T', ' ').replace(/:\d\d(\.\d+)?Z?$/, '')) + ' UTC' : '') + '. Descrive l’attività regionale del modello e non garantisce la visibilità a occhio nudo nel tuo luogo.</p>';
  const ovCard = card('Ovale aurorale', ovh, { right: tag('forecast', TAGS.forecast) });
  const camLink = '<a class="ab-linkcard" href="#webcam" data-go="webcam">' + icon('camera') + '<span><b>Guarda il cielo dal vivo</b><small>Webcam vicine a te e camere dedicate all’aurora</small></span>' + icon('chev') + '</a>';
  return '<div class="ab-page" data-cols="even"><div class="ab-span"><h1 class="ab-h1">Cielo</h1><p class="ab-lede">Nuvole, buio e luna a ' + esc(placeLabel()) + ': ciò che decide se un segnale diventa un’aurora visibile.</p></div>' + wxCard + asCard + '<div class="ab-stack">' + ovCard + camLink + '</div></div>';
}

// ============================ WEBCAM ============================
function viewWebcam() {
  const d = S.sky.data, cc = d ? Math.round(d.current.cloud_cover) : null;
  const skyLink = '<a class="ab-linkcard" href="#cielo" data-go="cielo">' + icon('cloud') + '<span><b>' + (cc != null ? 'Nuvole ora: ' + cc + '% · ' + cloudWord(cc) : 'Meteo del luogo') + '</b><small>Meteo completo, buio e luna a ' + esc(shortPlace()) + '</small></span>' + icon('chev') + '</a>';
  // webcam
  const list = chooseWebcams(), fav = camFavorites(), fallback = S.camFilter === 'near' && !list.length;
  const shown = (fallback ? S.webcams.filter((c) => c.aurora).sort((x, y) => x.dist - y.dist) : list).slice(0, S.camLimit);
  const camRows = shown.map((c) => {
    const k = camKey(c);
    return '<div class="ab-cam"><div class="ab-cam__img">' + (c.image ? '<img src="' + esc(c.provider ? c.image + '&t=' + Math.floor(Date.now() / 60000) : c.image) + '" alt="Ultima immagine: ' + esc(c.name) + '" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.textContent=\'Immagine non disponibile\'">' : 'Nessuna anteprima') + '</div><div><b>' + esc(c.name) + '</b><small>' + Math.round(c.dist) + ' km · ' + esc(c.source) + (c.kind === 'road' ? ' · stradale' : c.aurora ? ' · camera aurora' : '') + (c.down ? ' · non risponde' : c.updated ? (Date.now() - c.updated > 30 * 60000 ? ' · ferma da ' + fmtDur((Date.now() - c.updated) / 60000) : ' · foto delle ' + fmtClock(c.updated)) : '') + (c.note ? ' · ' + esc(c.note) : '') + '</small>' +
      '<div class="ab-cam__act">' + (c.provider === 'ipcamlive' && !c.down ? '<button type="button" class="ab-btn-text" data-live="' + esc(c.alias) + '">' + icon('play') + 'Diretta</button>' : '') + (safeUrl(c.url) ? '<a class="ab-link" href="' + esc(safeUrl(c.url)) + '" target="_blank" rel="noopener">Apri ' + icon('ext') + '</a>' : '') + '<button type="button" class="ab-btn-text" data-fav="' + esc(k) + '" aria-pressed="' + fav.has(k) + '">' + icon('star') + (fav.has(k) ? 'Preferita' : 'Aggiungi') + '</button></div></div></div>';
  }).join('');
  const total = (fallback ? S.webcams.filter((c) => c.aurora) : list).length;
  const camCard = card('Webcam e camere aurora',
    '<div class="ab-seg" role="group" aria-label="Filtro webcam" style="margin-bottom:var(--space-3)">' + [['near', 'Vicino a me'], ['aurora', 'Aurora'], ['road', 'Strade'], ['favorites', 'Preferite']].map(([k, l]) => '<button type="button" data-camfilter="' + k + '" aria-pressed="' + (S.camFilter === k) + '">' + l + '</button>').join('') + '</div>' +
    (S.camFilter === 'near' ? '<div class="ab-field"><label for="camRadius">Raggio di ricerca</label><select class="ab-input" id="camRadius">' + [50, 200, 500, 1000, 2000].map((r) => '<option value="' + r + '"' + (S.camRadius === r ? ' selected' : '') + '>' + r + ' km</option>').join('') + '</select></div>' : '') +
    (fallback ? '<p class="ab-notice" style="margin-bottom:var(--space-2)">Nessuna webcam entro il raggio scelto: mostro le camere dedicate all’aurora.</p>' : '') +
    (camRows ? '<div class="ab-camlist">' + camRows + '</div>' : empty(S.camFilter === 'favorites' ? 'Nessuna preferita: aggiungine una dall’elenco.' : 'Nessuna webcam trovata.')) +
    (total > shown.length ? '<button type="button" class="ab-btn" id="camMore" style="width:100%;margin-top:var(--space-3)">Mostra altre</button>' : '') +
    '<p class="t-caption ab-card__note">Immagini e dirette appartengono ai rispettivi titolari (FMI, IRF, UiT, UNIS, Univ. Calgary / CSA, Landhotel) e sono mostrate dai loro server, con collegamento alla fonte. Webcam stradali: fonte Fintraffic / digitraffic.fi, licenza CC BY 4.0. Ricerca camere: © OpenStreetMap contributors. Copertura parziale. Controlla l’orario impresso nell’immagine; una camera lontana non descrive il cielo sopra di te. Le immagini non vengono analizzate.</p>');
  return '<div class="ab-page"><div class="ab-span"><h1 class="ab-h1">Webcam</h1><p class="ab-lede">Guarda il cielo dal vivo: le webcam più vicine a ' + esc(placeLabel()) + ' e le camere dedicate all’aurora.</p></div><div class="ab-span">' + skyLink + '</div><div class="ab-span">' + camCard + '</div></div>';
}

// ============================ GIORNI ============================
const more = (title, sub, inner) => '<details class="ab-more"><summary><span><b>' + esc(title) + '</b><small>' + esc(sub) + '</small></span>' + icon('chev') + '</summary><div class="ab-more__body">' + inner + '</div></details>';
const OUT_WORD = { incoming: 'Verso la Terra', glancing: 'Di striscio', arrived: 'Arrivata', passed: 'Da verificare', no: 'Non diretta', unk: 'Da valutare', nocme: 'Senza CME' };
const speedWord = (v) => (v < 500 ? 'lenta' : v < 1000 ? 'media' : 'veloce');
const kpText = (kp) => (kp ? ' · Kp stimato ' + (kp[0] === kp[1] ? kp[0] : kp[0] + '–' + kp[1]) : '');
function cmeRow(r, now) {
  const out = cmeOutcome(r, now), when = fmtDayClock(r.flare ? r.flare.t : r.t);
  const faceTxt = r.loc ? r.loc.txt + ' · ' + (r.loc.face === 'front' ? 'rivolta verso la Terra' : r.loc.face === 'side' ? 'un po’ di lato' : 'sul bordo del Sole, non rivolta alla Terra') : 'non indicata';
  const s1 = { state: !r.loc ? 'unk' : r.loc.face === 'front' ? 'good' : r.loc.face === 'side' ? 'mid' : 'bad', label: 'Posizione sul Sole', text: faceTxt };
  const s2 = r.kind === 'cme' ? { state: 'good', label: 'CME', text: 'Sì' + (r.speed ? ' · ' + Math.round(r.speed) + ' km/s (' + speedWord(r.speed) + ')' : '') } : { state: 'bad', label: 'CME', text: 'Nessuna finora: le analisi arrivano con ore di ritardo' };
  const s3 = {
    incoming: { state: 'good', text: 'Sì · arrivo stimato ' + fmtDayClock(r.arrival) + kpText(r.kp) },
    glancing: { state: 'mid', text: 'Di striscio · arrivo stimato ' + fmtDayClock(r.arrival) + kpText(r.kp) },
    arrived: { state: 'good', text: 'È arrivata: onda d’urto misurata il ' + fmtDayClock(r.shock) },
    passed: { state: 'mid', text: 'Arrivo stimato ' + fmtDayClock(r.arrival) + ', nessuna onda d’urto collegata' },
    no: { state: 'bad', text: 'No: la simulazione non la manda sulla Terra' },
    unk: { state: 'unk', text: 'Nessuna simulazione: di solito sono CME lente o lontane dalla Terra' },
    nocme: { state: 'bad', text: 'Senza CME non arriva nulla' },
  }[out];
  s3.label = 'Verso la Terra';
  const step = (x) => '<li data-state="' + x.state + '"><span class="ab-check__mark" aria-hidden="true">' + MARK[x.state] + '</span><div><b>' + x.label + '</b><span>' + esc(x.text) + '</span></div></li>';
  return '<li class="ab-cme" data-out="' + out + '"><div class="ab-cme__head"><div><b>' + (r.flare ? 'Brillamento ' + esc(r.flare.cls) : 'CME senza brillamento collegato') + '</b><small>' + esc(when) + '</small></div><span class="ab-cme__chip">' + esc(OUT_WORD[out]) + '</span></div><ul class="ab-cme__steps">' + step(s1) + step(s2) + step(s3) + '</ul></li>';
}
function cmeCard(n) {
  const right = tag('estimated', 'Analisi manuale · NASA');
  const title = 'CME dal Sole: vanno verso la Terra?';
  const rows = donkiRows(n.donki, n.flares);
  if (!rows) return card(title, empty('Le analisi NASA DONKI non sono raggiungibili ora.') + '<div class="ab-linkrow">' + extLink('https://kauai.ccmc.gsfc.nasa.gov/DONKI/', 'NASA DONKI') + '</div>', { right });
  const now = Date.now();
  const inc = rows.filter((r) => r.kind === 'cme' && ['incoming', 'glancing'].includes(cmeOutcome(r, now))).sort((a, b) => a.arrival - b.arrival)[0];
  const arr = rows.filter((r) => r.kind === 'cme' && r.shock && r.shock <= now && r.shock > now - 48 * 3600e3).sort((a, b) => b.shock - a.shock)[0];
  let v;
  if (inc) v = { s: 'watch', title: 'Una CME potrebbe arrivare', line: fmtDayClock(inc.arrival), sub: (inc.glancing ? 'Di striscio' : 'Diretta verso la Terra') + (inc.speed ? ' · ' + Math.round(inc.speed) + ' km/s' : '') + kpText(inc.kp) + '. L’errore tipico di queste stime è di molte ore.', go: true };
  else if (arr) v = { s: 'recent', title: 'Una CME è arrivata di recente', line: fmtDayClock(arr.shock), sub: 'Onda d’urto misurata dai satelliti a L1.', go: true };
  else v = { s: 'none', title: 'Nessuna CME diretta verso la Terra', line: '', sub: 'Al momento le analisi NASA non indicano arrivi nei prossimi giorni.' };
  const verdict = '<div class="ab-verdict" data-s="' + v.s + '"><span class="ab-verdict__ic">' + icon(v.s === 'none' ? 'activity' : 'zap') + '</span><div><b>' + esc(v.title) + '</b>' + (v.line ? '<span>' + esc(v.line) + '</span>' : '') + '<small>' + esc(v.sub) + '</small>' + (v.go ? '<a class="ab-link" href="#adesso" data-go="adesso">Vedi il campo magnetico in Adesso</a>' : '') + '</div></div>';
  const shown = rows.slice(0, 4), more = rows.slice(4, 12);
  const list = rows.length
    ? '<h3 class="t-label ab-fgroup">Brillamenti e CME degli ultimi giorni</h3><ul class="ab-cmes">' + shown.map((r) => cmeRow(r, now)).join('') + '</ul>' + (more.length ? '<details class="ab-details"><summary>Altri ' + more.length + icon('chev') + '</summary><ul class="ab-cmes">' + more.map((r) => cmeRow(r, now)).join('') + '</ul></details>' : '')
    : '<p class="t-body-sm ab-flarenone">Nessuna CME rilevante negli ultimi 10 giorni.</p>';
  const manual = '<p class="ab-notice ab-manual">Una <b>CME</b> (espulsione di massa coronale) è una nube di plasma lanciata dal Sole. Sono dati che arrivano da misurazioni e calcoli fatti a mano da ricercatori NASA e NOAA, non da misure automatiche.</p>';
  return card(title, manual + verdict + list +
    '<p class="t-caption ab-card__note">Fonte: NASA CCMC DONKI. NASA avverte che sono informazioni in tempo reale di qualità prototipale, da usare in contesto di ricerca. Un brillamento da solo non basta: serve una CME lanciata verso la Terra, e poi il campo magnetico giusto (Bz a sud) quando arriva. Le analisi possono comparire con ore di ritardo e l’errore tipico dell’ora d’arrivo è di molte ore. «Posizione»: vicino al centro del disco = rivolta verso la Terra; sul bordo = no.</p><div class="ab-linkrow">' + extLink('https://kauai.ccmc.gsfc.nasa.gov/DONKI/', 'NASA DONKI') + '</div>', { right });
}
const FLARE_WORD = { X: 'forte', M: 'medio', C: 'piccolo', B: 'debole', A: 'debole' };
function flareCard(n) {
  const right = tag('measured', 'Osservato · GOES');
  if (!n.flares) return card('Brillamenti solari', empty('Dati sui brillamenti non disponibili ora.'), { right });
  const now = Date.now(), week = flareEvents(n.flares).filter((e) => e.t >= now - 7 * 86400000 && e.t <= now);
  const top = week.slice().sort((a, b) => b.flux - a.flux)[0], day = week.filter((e) => e.t >= now - 86400000).sort((a, b) => b.flux - a.flux)[0];
  const big = week.filter((e) => e.L === 'M' || e.L === 'X'), x = week.filter((e) => e.L === 'X').length;
  const L = top ? top.L : null;
  const title = !top ? 'Nessun brillamento registrato' : L === 'X' ? 'Brillamento forte (classe X)' : L === 'M' ? 'Brillamento medio (classe M)' : L === 'C' ? 'Solo brillamenti piccoli' : 'Sole tranquillo';
  const head = '<div class="ab-flarehead" data-c="' + (L || 'none') + '"><span class="ab-flarehead__cls">' + (top ? esc(top.cls) : '—') + '</span><div><b>' + esc(title) + '</b><span>' + (top ? 'Il più forte in 7 giorni · ' + esc(new Date(top.t).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: zone() }).replace('.', '')) + ', ' + fmtClock(top.t) : 'Il bollettino GOES non riporta eventi.') + '</span><small>Ultime 24 ore: ' + (day ? 'il più forte è ' + esc(day.cls) : 'nessun evento') + '</small></div></div>';
  const banner = big.length ? '<p class="ab-flarealert">' + icon('zap') + '<span><b>' + big.length + (big.length === 1 ? ' brillamento' : ' brillamenti') + ' di classe M o superiore</b> in 7 giorni' + (x ? ', di cui ' + x + ' di classe X' : '') + ': sono segnati sul grafico.</span></p>' : '<p class="t-body-sm ab-flarenone">Nessun brillamento di classe M o X negli ultimi 7 giorni.</p>';
  const legend = '<p class="t-caption ab-flescale">Scala dal più debole al più forte: A, B, C, M, X. Ogni lettera è 10 volte più intensa della precedente.</p><ul class="ab-flegend" aria-label="Classi dei brillamenti">' + [['B', 'A · B deboli'], ['C', 'C piccoli'], ['M', 'M medi'], ['X', 'X forti']].concat(n.donki ? [['cme', 'anello: ha lanciato una CME']] : []).map(([c, l]) => '<li data-c="' + c + '">' + l + '</li>').join('') + '</ul>';
  return card('Brillamenti solari · 7 giorni', head + banner +
    '<div class="ab-chart" id="flareChart" style="margin-top:var(--space-3)"></div><div class="ab-fdetail" id="flareDetail" aria-live="polite"></div>' + legend +
    '<p class="t-caption ab-card__note">Dati: NOAA SWPC (satelliti GOES). Le «esplosioni» del Sole, misurate in raggi X: ogni punto è un brillamento, più in alto è più forte; l’anello segna quelli a cui NASA ha collegato una CME (può comparire con ore di ritardo). Ore locali, picco di ogni brillamento. Un brillamento forte non basta per un’aurora: serve una CME (una nube di plasma) diretta verso la Terra; qui sotto vedi se c’è stata.</p>', { right });
}
const G_WORDS = ['nessuna', 'minore', 'moderata', 'forte', 'severa', 'estrema'];
let MEDIA = { timers: {}, frames: {} };
function viewGiorni() {
  const n = S.noaa;
  if (!n) return '<div class="ab-page"><div class="ab-span"><h1 class="ab-h1">Giorni</h1></div><div class="ab-skel"></div><div class="ab-skel"></div></div>';
  const sum = noaaSummary();
  const summary = sum ? situationMarkup({ id: 'sum', level: sum.level, meter: false, eyebrow: 'NOAA · 3 giorni', tag: tag('forecast', TAGS.forecast), title: sum.title, why: sum.why, caveat: 'Il Kp è una media planetaria: il clima generale, non l’aurora sopra di te.' }).replace('<h1 ', '<h2 ').replace('</h1>', '</h2>') : card('Previsione NOAA', empty('Bollettino non disponibile ora.'));
  // scale
  let scales = empty('Scale non disponibili ora.');
  if (n.scales) {
    const cols = [['0', '24 h', 'measured', 'Osservato'], ['1', null, 'forecast', 'Previsto'], ['2', null, 'forecast', 'Previsto'], ['3', null, 'forecast', 'Previsto']].filter((c) => n.scales[c[0]]);
    const lab = (k, l) => l || dayShort(Date.parse(n.scales[k].DateStamp + 'T12:00:00Z'));
    const g = (k) => { const s = n.scales[k].G && n.scales[k].G.Scale; return s == null || s === '' ? null : Number(s); };
    scales = '<div class="ab-scales" role="group" aria-label="Scala G di NOAA">' + cols.map(([k, l, kind, w]) => { const gv = g(k); return '<div class="ab-scales__col"><span class="t-label">' + esc(lab(k, l)) + '</span>' + (gv == null ? '<span class="ab-gcell"><b>—</b><small>n.d.</small></span>' : '<span class="ab-gcell" data-g="' + gv + '"><b>G' + gv + '</b><small>' + G_WORDS[gv] + '</small></span>') + tag(kind, w) + '</div>'; }).join('') + '</div>';
    const fc = ['1', '2', '3'].filter((k) => n.scales[k]);
    const pct = (v) => (v == null || v === '' ? '—' : v + '%');
    scales += '<details class="ab-details"><summary>Radiazione solare e blackout radio' + icon('chev') + '</summary><div class="ab-mini"><span class="hd"></span>' + fc.map((k) => '<span class="hd">' + esc(dayShort(Date.parse(n.scales[k].DateStamp + 'T12:00:00Z'))) + '</span>').join('') +
      '<span>Radiazione S1+</span>' + fc.map((k) => '<span class="v">' + pct(n.scales[k].S && n.scales[k].S.Prob) + '</span>').join('') +
      '<span>Blackout R1–R2</span>' + fc.map((k) => '<span class="v">' + pct(n.scales[k].R && n.scales[k].R.MinorProb) + '</span>').join('') +
      '<span>Blackout R3+</span>' + fc.map((k) => '<span class="v">' + pct(n.scales[k].R && n.scales[k].R.MajorProb) + '</span>').join('') + '</div></details>';
    scales += '<p class="t-caption ab-card__note">Scala NOAA G: G1 = Kp 5, G2 = Kp 6, G3 = Kp 7, G4 = Kp 8, G5 = Kp 9. I giorni sono in UTC, come nel bollettino. Le date vengono dal bollettino, non da «oggi + 1».</p>';
  }
  const scalesCard = more('Scala NOAA G, S, R', 'tempeste geomagnetiche, radiazione, blackout', scales);
  // le prossime notti nel luogo scelto
  const nights = nightsOutlook(), today = fmtDay(Date.now()), tomorrow = fmtDay(Date.now() + 86400000);
  const nightsCard = card('Le prossime notti a ' + shortPlace(), nights && nights.length ? '<ul class="ab-nights">' + nights.map((x) => {
    const d = fmtDay(x.a), name = x.ongoing ? 'Questa notte' : d === today ? 'Stanotte' : d === tomorrow ? 'Domani notte' : d;
    const moon = x.moon + '% illuminata · ' + (x.moonHours === 0 ? 'non in cielo' : 'in cielo ' + (Math.round(x.moonHours * 2) / 2).toString().replace('.', ',') + ' h');
    return '<li><div><b>' + esc(name) + '</b><span>' + fmtClock(x.a) + ' – ' + fmtClock(x.b) + '</span><small>Luna ' + esc(moon) + (x.partial ? ' · previsione parziale' : '') + '</small></div>' +
      '<div class="ab-nights__kp"' + (x.g ? ' data-g="' + x.g + '"' : '') + '><span class="t-label">Kp massimo</span><b>' + itNum(x.kp, 2) + '</b><small>' + (x.g ? 'G' + x.g + ' · ' + G_WORDS[x.g] : 'sotto G1') + ' · ' + fmtClock(x.kpFrom) + '–' + fmtClock(x.kpTo) + '</small></div></li>';
  }).join('') + '</ul><p class="t-caption ab-card__note">Dal tramonto all’alba del luogo scelto, con i Kp a 3 ore di NOAA. Il Kp è una media planetaria: dice il clima generale della notte, non se vedrai l’aurora dove sei. La luna chiara ne riduce la visibilità.</p>' : empty(nights ? 'Nessuna notte coperta dal bollettino NOAA.' : 'Servono il bollettino NOAA e il calcolo del buio.'), { right: tag('forecast', 'Previsto NOAA') });
  // Kp a 3 ore
  let kp = empty('Tabella Kp non disponibile ora.');
  const f = n.fc;
  if (f && f.days.length) {
    const d0 = f.days[0].ms, hours = Array.from({ length: 8 }, (_, i) => hourLabel(d0 + i * 3 * 3600e3));
    kp = '<div class="ab-kpstrip"><span></span>' + hours.map((h) => '<span class="hd">' + h + '</span>').join('') + f.days.map((d) => '<span class="day">' + esc(dayShort(d.ms)) + '</span>' + d.kp.map((k, i) => { const gg = gOfKp(k), isNow = Date.now() >= d.ms + i * 3 * 3600e3 && Date.now() < d.ms + (i + 1) * 3 * 3600e3; return '<span class="ab-kcell"' + (gg ? ' data-g="' + gg + '"' : '') + (isNow ? ' data-now aria-current="true"' : '') + '>' + itNum(k, 2) + '</span>'; }).join('')).join('') + '</div>' +
      '<p class="t-caption ab-card__note">Ore locali (' + esc(tzName()) + '); le righe sono i giorni NOAA in UTC. Riquadro: la fascia di adesso. Dal Kp 5 (G1) la cella si colora. Il Kp è una media planetaria a 3 ore: descrive il clima generale, non dice se vedrai l’aurora dove sei.</p>';
  }
  const kpCard = more('Kp previsto ogni 3 ore', 'tabella dei 3 giorni', kp);
  // commento dei previsori
  let noteCard = more('Comunicato dei previsori', 'non disponibile ora', empty('Commento non disponibile ora.'));
  if (n.disc && Object.keys(n.disc.sections).length) {
    const tabs = [['Geospace', 'Geospazio'], ['Solar Wind', 'Vento solare'], ['Solar Activity', 'Sole']].filter(([k]) => n.disc.sections[k]);
    noteCard = more('Comunicato dei previsori', n.disc.issued ? 'emesso ' + fmtDayClock(n.disc.issued) + ' · testo NOAA in inglese' : 'testo NOAA in inglese',
      '<div class="ab-seg" role="group" aria-label="Sezione del commento" style="margin-bottom:var(--space-4);max-width:100%;overflow-x:auto">' + tabs.map(([k, l], i) => '<button type="button" data-note="' + k + '" aria-pressed="' + (i === 0) + '">' + l + '</button>').join('') + '</div>' +
      tabs.map(([k], i) => { const s = n.disc.sections[k]; return '<div class="ab-quote" data-notebody="' + k + '"' + (i ? ' hidden' : '') + ' lang="en"><div class="ab-quote__block"><span class="t-label" lang="it">Ultime 24 ore</span><p>' + esc(s.summary) + '</p></div><div class="ab-quote__block"><span class="t-label" lang="it">Previsione</span><p>' + esc(s.forecast) + '</p></div></div>'; }).join('') +
      '<p class="t-caption ab-card__note">Testo originale NOAA in inglese, emesso il ' + (n.disc.issued ? fmtDayClock(n.disc.issued) : '—') + '. Riportato senza interpretazioni.</p>', { right: tag('forecast', 'Previsto NOAA') });
  }
  // immagini
  const suvi = pickCurrentFrame(n.media.suvi), ccor = pickCurrentFrame(n.media.ccor), enl = pickCurrentFrame(n.media.enlil, true);
  const mediaItem = (key, title, sub, fr, wide, tg) => {
    const t = fr ? frameTime(fr.url) : null;
    return '<article class="ab-media"' + (wide ? ' data-aspect="wide"' : '') + '><div class="ab-media__head"><div class="ab-situation__row"><h3 class="t-title">' + title + '</h3>' + tg + '</div><span class="t-caption">' + sub + '</span></div><div class="ab-media__frame">' +
      (fr ? '<img id="img-' + key + '" src="' + SWPC + fr.url + '" alt="' + title + '" style="width:100%;height:100%;object-fit:contain" onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),{className:\'ab-media__ph\',textContent:\'Immagine non disponibile ora\'}))">' : '<span class="ab-media__ph">Immagine non disponibile ora</span>') +
      '</div><div class="ab-media__foot"><span class="t-caption" id="time-' + key + '">' + (t ? 'Immagine delle ' + fmtClock(t) + ' · ' + new Date(t).toISOString().slice(11, 16) + ' UTC' : '—') + '</span>' + (fr ? '<button type="button" class="ab-btn" data-size="icon" data-anim="' + key + '" aria-label="Riproduci l’animazione: ' + title + '">' + icon('play') + '</button>' : '') + '</div></article>';
  };
  const sun = '<h2 class="t-title" style="margin:0 0 var(--space-3)">Il Sole adesso</h2><div class="ab-media-row" data-stack>' + mediaItem('suvi', 'Disco solare', 'SUVI 195 Å · GOES', suvi, false, tag('measured', 'Osservato')) + mediaItem('ccor', 'Corona solare', 'Coronografo CCOR1 · GOES-19', ccor, false, tag('measured', 'Osservato')) + mediaItem('enlil', 'Verso la Terra', 'Modello WSA-ENLIL · vento solare e CME', enl, true, tag('forecast', 'Previsto')) + '</div>' +
    '<p class="t-caption ab-credit" style="margin-top:var(--space-2)">Immagini: NOAA SWPC (satelliti GOES, SUVI e CCOR-1) e modello WSA-ENLIL.</p><div class="ab-linkrow" style="margin-top:var(--space-2)">' + extLink('https://www.swpc.noaa.gov/products/goes-solar-ultraviolet-imager-suvi', 'SUVI su NOAA') + extLink('https://www.swpc.noaa.gov/products/wsa-enlil-solar-wind-prediction', 'WSA-ENLIL su NOAA') + '</div>';
  // regioni
  const sr = n.srs;
  let reg;
  if (!sr) reg = empty('Bollettino delle regioni non disponibile ora.');
  else if (sr.regions.length) reg = '<div>' + sr.regions.map((r) => '<div class="ab-region"><b>' + esc(r.num) + '</b><span>' + esc(r.loc) + ' · area ' + esc(r.area) + '</span><span class="v">' + esc(r.spots) + ' macchie · ' + esc(r.mag) + '</span></div>').join('') + '</div>';
  else reg = '<p class="t-body ab-empty">Nessuna macchia solare numerata nel bollettino di oggi.</p>' + (sr.plages.length ? '<p class="t-body-sm" style="color:var(--ink-3);margin-top:var(--space-2)">NOAA elenca solo ' + (sr.plages.length === 1 ? 'una regione senza macchie (plaga)' : sr.plages.length + ' regioni senza macchie (plaghe)') + ': ' + sr.plages.map((p) => esc(p.num)).join(' e ') + '.</p>' : '');
  const regCard = more('Macchie solari', !sr ? 'non disponibile ora' : sr.regions.length ? sr.regions.length + (sr.regions.length === 1 ? ' regione con macchie' : ' regioni con macchie') : 'nessuna regione con macchie oggi', reg + (sr && sr.issued ? '<p class="t-caption ab-card__note">Bollettino NOAA/USAF del ' + fmtDayClock(sr.issued) + '.</p>' : ''));
  const flCard = flareCard(n), cmCard = cmeCard(n);
  // allerte
  let al = empty('Allerte non disponibili ora.');
  if (n.alerts) al = '<ul class="ab-alerts">' + n.alerts.slice(0, 4).map((a) => '<li class="ab-alert"><b>' + (a.kp != null ? 'Kp ' + a.kp + ' · ' : '') + esc(a.word.toLowerCase()) + '</b>' + tag(a.kind, a.word) + '<span class="when">' + esc(fmtDayClock(a.ms)) + '</span><span class="ab-alert__orig" lang="en">' + esc(a.title) + '</span></li>').join('') + '</ul><p class="t-caption ab-card__note">«Raggiunto» è un ALERT: la soglia è stata superata. Sotto ogni riga il titolo originale NOAA.</p>';
  const alCard = more('Allerte NOAA', n.alerts && n.alerts.length ? 'ultima: ' + (n.alerts[0].kp != null ? 'Kp ' + n.alerts[0].kp + ' · ' : '') + n.alerts[0].word.toLowerCase() + ', ' + fmtDayClock(n.alerts[0].ms) : 'nessuna recente', al);
  const moreCard = '<section class="ab-card ab-morelist"><div class="ab-card__head"><h2 class="t-title">Altri dati NOAA</h2></div>' + regCard + alCard + noteCard + kpCard + scalesCard + '</section>';
  return '<div class="ab-page" data-cols="even"><div class="ab-span"><h1 class="ab-h1">Giorni</h1><p class="ab-lede">Cosa ha fatto il Sole negli ultimi giorni e cosa prevede NOAA.</p></div><div class="ab-span">' + flCard + '</div><div class="ab-span" id="cmeCard">' + cmCard + '</div><div class="ab-stack">' + summary + nightsCard + '</div><div class="ab-stack">' + sun + '</div><div class="ab-stack">' + moreCard + '</div></div>';
}

function toggleAnim(key) {
  const list = { suvi: S.noaa.media.suvi, ccor: S.noaa.media.ccor, enlil: S.noaa.media.enlil }[key];
  const img = $('img-' + key), btn = document.querySelector('[data-anim="' + key + '"]');
  if (!list || !list.length || !img) return;
  if (MEDIA.timers[key]) { clearInterval(MEDIA.timers[key]); MEDIA.timers[key] = null; btn.innerHTML = icon('play'); img.src = SWPC + pickCurrentFrame(list, key === 'enlil').url; return; }
  const tail = list.slice(-30); let i = 0;
  btn.innerHTML = icon('pause');
  MEDIA.timers[key] = setInterval(() => { i = (i + 1) % tail.length; img.src = SWPC + tail[i].url; const t = frameTime(tail[i].url); if ($('time-' + key) && t) $('time-' + key).textContent = 'Immagine delle ' + fmtClock(t) + ' · ' + new Date(t).toISOString().slice(11, 16) + ' UTC'; }, 450);
}
function stopAnims() { Object.keys(MEDIA.timers).forEach((k) => { clearInterval(MEDIA.timers[k]); MEDIA.timers[k] = null; }); }

// ============================ fogli ============================
function sheetHead(id, title) { return '<div class="ab-sheet__head"><h2 id="' + id + '">' + title + '</h2><button type="button" class="ab-btn" data-variant="ghost" data-size="icon" data-close aria-label="Chiudi">' + icon('close') + '</button></div>'; }
function openSheet(id) {
  const dlg = $(id); if (!dlg) return;
  if (id === 'sheetPlace') renderPlaceSheet(); else if (id === 'sheetAlerts') renderAlertsSheet(); else if (id === 'sheetCredits') renderCreditsSheet(); else renderInfoSheet();
  if (!dlg.open) dlg.showModal();
}
function renderPlaceSheet() {
  const cur = (p) => Math.abs(p.lat - S.lat) < 0.02 && Math.abs(p.lon - S.lon) < 0.02;
  $('sheetPlace').innerHTML = sheetHead('sheetPlaceTitle', 'Luogo') + '<div class="ab-sheet__body">' +
    '<p style="margin-bottom:var(--space-3)">Ora: <b style="color:var(--ink)">' + esc(placeLabel()) + '</b></p>' +
    '<button type="button" class="ab-btn" data-variant="primary" id="geoBtn" style="width:100%;margin-bottom:var(--space-2)">' + icon('locate') + 'Usa la mia posizione</button><div id="geoMsg" aria-live="polite"></div><p class="t-caption" style="margin:0 0 var(--space-4);color:var(--ink-3)">Il browser chiede il permesso. La posizione resta sul tuo dispositivo: serve solo per meteo, cielo e webcam del luogo.</p>' +
    '<div class="ab-field"><label for="placeQ">Cerca una località</label><div class="ab-row"><input class="ab-input" id="placeQ" type="search" placeholder="Per esempio Tromso" autocomplete="off" enterkeyhint="search"><button type="button" class="ab-btn" data-size="icon" id="placeGo" aria-label="Cerca">' + icon('search') + '</button></div></div>' +
    '<div id="placeResults" aria-live="polite"></div>' +
    '<h3>Preferiti</h3><ul class="ab-list">' + PLACES.map((p, i) => '<li><button type="button" data-place="' + i + '"' + (cur(p) ? ' aria-current="true"' : '') + '>' + esc(p.name) + '<small>' + esc(p.sub) + '</small></button></li>').join('') + '</ul>' +
    '<h3>Coordinate</h3><div class="ab-thresh"><div class="ab-field"><label for="latIn">Latitudine</label><input class="ab-input" id="latIn" type="number" step="0.01" min="-90" max="90" value="' + S.lat + '"></div><div class="ab-field"><label for="lonIn">Longitudine</label><input class="ab-input" id="lonIn" type="number" step="0.01" min="-180" max="180" value="' + S.lon + '"></div></div><button type="button" class="ab-btn" id="coordGo">Applica le coordinate</button></div>';
}
function renderAlertsSheet() {
  const sw = (id, title, sub, on, attr) => '<label class="ab-switchrow"><span>' + title + (sub ? '<small>' + sub + '</small>' : '') + '</span><input type="checkbox" role="switch" class="ab-sw" ' + attr + (on ? ' checked' : '') + '></label>';
  $('sheetAlerts').innerHTML = sheetHead('sheetAlertsTitle', 'Avvisi') + '<div class="ab-sheet__body">' +
    '<p style="margin-bottom:var(--space-3)">Gli avvisi funzionano solo mentre questa pagina resta aperta nel browser. Non sono un servizio in background e non confermano un’aurora.</p>' +
    sw('w', 'Attiva gli avvisi', 'Per questa sessione', alertFlags.watch, 'data-flag="watch"') +
    sw('n', 'Nuovo episodio di Bz sud', 'Con la finestra d’arrivo stimata', alertFlags.watchNew, 'data-flag="watchNew"') +
    sw('f', 'Inizio della finestra d’arrivo', 'Quando la finestra stimata comincia', alertFlags.watchWindow, 'data-flag="watchWindow"') +
    sw('s', 'Suono', 'Un breve segnale acustico', alertFlags.sound, 'data-flag="sound"') +
    '<div style="margin:var(--space-3) 0"><button type="button" class="ab-btn" id="notifBtn">Attiva le notifiche del browser</button><p class="t-caption" id="notifMsg" style="margin-top:var(--space-2);color:var(--ink-3)">' + (window.Notification ? 'Permesso attuale: ' + (Notification.permission === 'granted' ? 'consentite' : Notification.permission === 'denied' ? 'negate' : 'non ancora richieste') + '.' : 'Notifiche non supportate da questo browser.') + '</p></div>' +
    '<h3>Soglie</h3><p class="t-body-sm">Un avviso scatta alla soglia e si ripete a ogni «passo» oltre la soglia; si riarma da solo quando il valore torna indietro.</p>' +
    ALERT_RULES.map((r) => sw(r.key, r.label, r.help + (r.unit ? ' (' + r.unit + ')' : ''), alertSettings[r.key + 'Enabled'], 'data-setting="' + r.key + 'Enabled"') +
      '<div class="ab-thresh"><div class="ab-field"><label for="' + r.key + 'T">Soglia</label><input class="ab-input" id="' + r.key + 'T" type="number" step="any" data-setting="' + r.key + 'Threshold" value="' + alertSettings[r.key + 'Threshold'] + '"></div><div class="ab-field"><label for="' + r.key + 'S">Ripeti ogni</label><input class="ab-input" id="' + r.key + 'S" type="number" step="any" min="0.1" data-setting="' + r.key + 'Step" value="' + alertSettings[r.key + 'Step'] + '"></div></div>').join('') +
    '<h3>Ultimi avvisi</h3><div class="ab-alertlog" id="alertLog"></div></div>';
  renderAlertLog();
}
function renderAlertLog() {
  const el = $('alertLog'); if (!el) return;
  el.innerHTML = alertLog.length ? alertLog.map((a) => '<div><b>' + esc(a.title) + '</b> · ' + esc(a.body) + ' <span style="color:var(--ink-3)">(' + a.t + ')</span></div>').join('') : '<p class="t-body-sm" style="color:var(--ink-3)">Nessun avviso in questa sessione.</p>';
}
function renderInfoSheet() {
  const ag = satAgreement();
  $('sheetInfo').innerHTML = sheetHead('sheetInfoTitle', 'Come è calcolato') + '<div class="ab-sheet__body">' +
    '<h3>Catena delle informazioni</h3><ul class="ab-bullets"><li><b>Misura a L1</b> (circa 1,5 milioni di km dalla Terra): campo magnetico e vento solare, una lettura al minuto.</li><li><b>Stima dell’arrivo</b>: un calcolo nostro sulla velocità misurata.</li><li><b>Risposta a terra</b>: magnetometri IMAGE, dove esistono.</li><li><b>Cielo</b>: nuvole, buio, luna.</li></ul>' +
    '<h3>Quadro d’insieme</h3><p>L’aurora dipende da molti elementi e nessuno basta da solo. La scheda li raggruppa in due parti: <b>nello spazio</b> (campo a L1, ovale aurorale, risposta a terra) e <b>dal tuo punto di osservazione</b> (cielo, buio, luna). Il titolo dice solo quanti indizi si allineano; non prevede l’aurora.</p>' +
    '<ul class="ab-bullets"><li><b>Campo a L1</b>: a favore con Bz a sud e andamento moderato o marcato; incerto con Bz a sud e vento lento; non aiuta con Bz a nord o neutro.</li><li><b>Ovale aurorale</b> (modello OVATION nel tuo luogo): a favore da 50 su 100; incerto da 20; non aiuta sotto 20.</li><li><b>Risposta a terra</b>: compare solo se c’è un episodio da confrontare.</li><li><b>Cielo, buio, luna</b>: se cielo o buio non aiutano, le parole dell’ipotesi lo dicono anche quando lo spazio è attivo.</li></ul>' +
    '<h3>Andamento del campo a L1</h3><ul class="ab-bullets"><li>«Bz a sud» qui significa Bz ≤ −1 nT, la stessa soglia degli episodi: tra −1 e 0 nT è rumore e non conta.</li><li><b>Marcato</b>: Bz ≤ −5 nT con vento ≥ 450 km/s, oppure Bz ≤ −3 nT con vento ≥ 550 km/s, oppure OVATION ≥ 60 con Bz a sud.</li><li><b>Moderato</b>: Bz a sud con vento ≥ 350 km/s, oppure OVATION ≥ 30 con Bz a sud.</li><li><b>Debole</b>: Bz a sud con vento più lento.</li><li><b>Nessuno</b>: Bz a nord o neutro.</li></ul>' +
    '<h3>Episodi di Bz sud e arrivo</h3><ul class="ab-bullets"><li>Un episodio comincia con Bz ≤ −1 nT, dura almeno 4 minuti e tollera risalite fino a 4 minuti.</li><li>L’arrivo è 1.500.000 km ÷ velocità misurata al fronte. Il margine di ±15 minuti è prudenziale, non un intervallo di confidenza calibrato.</li><li>La stima non tiene conto della posizione reale della sonda né dell’orientamento del fronte.</li><li>Ey+ = velocità × max(0, −Bz). L’impulso ∫Ey+ dt è un indicatore dell’accoppiamento accumulato, non energia depositata.</li></ul>' +
    '<h3>Riscontro a terra</h3><p>Variazione di X dei magnetometri IMAGE rispetto alla mediana di 30–20 minuti prima dell’arrivo stimato; «marcata» da 100 nT. È una regola esplorativa: un segnale è solo compatibile nel tempo, e un magnetometro tranquillo non esclude un arrivo altrove.</p>' +
    '<h3>Cosa non è</h3><p>Non prevede con certezza una substorm né la visibilità dell’aurora nel tuo luogo. L’uscita più difendibile è: una struttura con Bz sud è stata misurata a L1; il suo inizio potrebbe raggiungere la magnetosfera nella finestra indicata; a terra si vede o non si vede una variazione compatibile; meteo e webcam descrivono solo le condizioni di osservazione.</p>' +
    '<h3>Sonda L1</h3><div class="ab-field"><label for="srcSel">Sonda usata per episodi e grafico</label><select class="ab-input" id="srcSel"><option value="AUTO"' + (S.source === 'AUTO' ? ' selected' : '') + '>Riferimento NOAA (automatico)</option>' + S.sources.map((s) => '<option value="' + esc(s) + '"' + (S.source === s ? ' selected' : '') + '>' + esc(s) + '</option>').join('') + '</select></div>' +
    '<p class="t-body-sm">Riferimento attuale: <b style="color:var(--ink)">' + esc(activeSourceOf(S.magRaw) || '—') + '</b>. ' + (ag.level != null ? 'Accordo fra sonde: ' + esc(ag.text.toLowerCase()) + '.' : '') + '</p>' +
    '<h3>Fonti e crediti</h3><p>Ogni dato ha il suo titolare e la sua licenza.</p><button type="button" class="ab-btn" data-open="credits">Apri fonti e crediti</button>' +
    '<h3>Diagnostica</h3><div class="ab-diag" id="diagList"></div><div class="ab-row" style="margin-top:var(--space-3)"><button type="button" class="ab-btn" id="diagCopy">Copia il report</button><span class="t-caption" id="diagMsg" style="color:var(--ink-3)"></span></div>' +
    '<p class="t-caption" style="margin-top:var(--space-5);color:var(--ink-3)">Nessuna previsione di aurora è mai certa. Aurora Bande · foto e progetto di Davide Bandelli.</p></div>';
  renderDiag();
}
function renderDiag() {
  const el = $('diagList'); if (!el) return;
  el.innerHTML = DIAG.order.map((n) => { const i = DIAG.items[n]; return '<div data-s="' + i.status + '"><span>' + esc(n) + '</span><b>' + esc(i.detail || i.status) + '</b></div>'; }).join('') +
    (DIAG.errors.length ? '<div data-s="err"><span>Errori JavaScript</span><b>' + DIAG.errors.map(esc).join('<br>') + '</b></div>' : '');
}

// ============================ regia ============================
function footLinks() { return '<div class="ab-span ab-foot"><button type="button" class="ab-btn-text" data-open="credits">Fonti e crediti</button>' + (S.installEvt ? '<button type="button" class="ab-btn-text" data-install>Installa l’app</button>' : '') + '<span>Non è un servizio ufficiale di NOAA, NASA o FMI.</span></div>'; }
const BACK_WORD = { adesso: 'ad Adesso', fronti: 'a Fronti', cielo: 'a Cielo', webcam: 'a Webcam', giorni: 'a Giorni' };
function backChip() { return '<div class="ab-span"><a class="ab-backlink" href="#' + S.back.view + '" data-back>' + icon('chev') + 'Torna ' + BACK_WORD[S.back.view] + '</a></div>'; }
function renderView(name) {
  const el = $('v-' + name); if (!el) return;
  stopAnims();
  el.innerHTML = { adesso: viewAdesso, fronti: viewFronti, cielo: viewCielo, webcam: viewWebcam, giorni: viewGiorni }[name]().replace(/<\/div>\s*$/, footLinks() + '</div>');
  if (S.back && S.back.view !== name) el.innerHTML = el.innerHTML.replace(/(<div class="ab-page"[^>]*>)/, '$1' + backChip());
  if (name === 'adesso') { drawField(); drawGround(); drawWind(); }
  if (name === 'giorni') drawFlares();
  if (name === 'fronti') drawFront(pickEvent(Date.now()) || S.episodes[S.episodes.length - 1] || null);
}
function renderAll() {
  renderHeader(); renderNav(); renderStatus();
  VIEWS.forEach((v) => { $('v-' + v.id).hidden = v.id !== S.view; });
  const y = window.scrollY;
  try { renderView(S.view); } catch (e) { diagError('render ' + S.view + ': ' + (e.message || e)); $('v-' + S.view).innerHTML = '<div class="ab-page"><p class="ab-empty">Errore nel disegno della scheda. Apri «Come è calcolato» → Diagnostica.</p></div>'; }
  window.scrollTo(0, y);
  document.title = { adesso: 'Adesso', fronti: 'Fronti', cielo: 'Cielo', webcam: 'Webcam', giorni: 'Giorni' }[S.view] + ' · Aurora Bande';
}
function goto(view) {
  if (!VIEWS.some((v) => v.id === view)) view = 'adesso';
  // «Torna a…» compare solo se si arriva da un collegamento interno, non dalla barra delle sezioni
  S.back = S.pendingBack && S.pendingBack.view !== view ? S.pendingBack : null; S.pendingBack = null;
  S.view = view;
  renderAll();
  if (view === 'giorni' && (!S.noaa || Date.now() - S.noaa.loadedAt > 15 * 60000)) loadNoaa().then(renderAll);
  window.scrollTo(0, S.restoreY || 0); S.restoreY = 0;
}

function bindUI() {
  document.addEventListener('click', async (ev) => {
    const t = ev.target;
    if (t.closest('[data-install]')) { installApp(); return; }
    const go = t.closest('[data-go]');
    if (go) { ev.preventDefault(); const to = go.dataset.go; if (to.charAt(0) === '#') { const el = document.querySelector(to); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } else { S.pendingBack = { view: S.view, y: window.scrollY }; if (location.hash !== '#' + to) history.pushState(null, '', '#' + to); goto(to); } return; }
    const bk = t.closest('[data-back]');
    if (bk) { ev.preventDefault(); const b = S.back; if (b) { S.restoreY = b.y; if (location.hash !== '#' + b.view) history.pushState(null, '', '#' + b.view); goto(b.view); } return; }
    const open = t.closest('[data-open]'); if (open) { openSheet(open.dataset.open === 'info' ? 'sheetInfo' : open.dataset.open === 'credits' ? 'sheetCredits' : open.dataset.open); return; }
    if (t.closest('#placeBtn')) { openSheet('sheetPlace'); return; }
    if (t.closest('#alertBtn')) { openSheet('sheetAlerts'); return; }
    if (t.closest('[data-close]')) { t.closest('dialog').close(); return; }
    if (t.closest('#refreshBtn')) { refreshNow(true); return; }
    const hrs = t.closest('[data-hours]'); if (hrs) { S.chart.hours = Number(hrs.dataset.hours); saveChart(); renderView('adesso'); return; }
    const cm = t.closest('[data-comp]'); if (cm) { S.chart.comps[cm.dataset.comp] = !S.chart.comps[cm.dataset.comp]; saveChart(); renderView('adesso'); return; }
    const sa = t.closest('[data-sat]'); if (sa) { S.chart.hiddenSats[sa.dataset.sat] = !S.chart.hiddenSats[sa.dataset.sat]; saveChart(); renderView('adesso'); return; }
    const fnv = t.closest('[data-fnav]');
    if (fnv) { const list = flareWindowEvents(); if (list.length) { let i = list.findIndex((x) => x.t === S.flareSel); i = i < 0 ? list.length - 1 : Math.max(0, Math.min(list.length - 1, i + Number(fnv.dataset.fnav))); S.flareSel = list[i].t; drawFlares(); } return; }
    const lv = t.closest('[data-live]');
    if (lv) { const box = lv.closest('.ab-cam'); if (box) { box.dataset.live = 'on'; box.querySelector('.ab-cam__img').innerHTML = '<iframe src="' + IPCAMLIVE + 'player.php?alias=' + encodeURIComponent(lv.dataset.live) + '&autoplay=1&mute=1&disablezoombutton=1&disabledownloadbutton=1&disablenavigation=1" title="Diretta" allow="autoplay; fullscreen" allowfullscreen referrerpolicy="no-referrer" loading="lazy"></iframe>'; lv.remove(); } return; }
    const gh = t.closest('[data-ghours]'); if (gh) { S.groundHours = Number(gh.dataset.ghours); saveGroundHours(); renderView('adesso'); return; }
    const fr = t.closest('[data-front]'); if (fr) { S.selectedStart = Number(fr.dataset.front); renderView('fronti'); return; }
    const an = t.closest('[data-anim]'); if (an) { toggleAnim(an.dataset.anim); return; }
    const nb = t.closest('[data-note]'); if (nb) { document.querySelectorAll('[data-note]').forEach((b) => b.setAttribute('aria-pressed', String(b === nb))); document.querySelectorAll('[data-notebody]').forEach((q) => { q.hidden = q.dataset.notebody !== nb.dataset.note; }); return; }
    const cf = t.closest('[data-camfilter]'); if (cf) { S.camFilter = cf.dataset.camfilter; S.camLimit = 4; renderView('webcam'); return; }
    if (t.closest('#camMore')) { S.camLimit += 4; renderView('webcam'); return; }
    const fav = t.closest('[data-fav]'); if (fav) { const set = camFavorites(), k = fav.dataset.fav; if (set.has(k)) set.delete(k); else set.add(k); store.set('aurora_cam_favorites', [...set]); renderView('webcam'); return; }
    const pl = t.closest('[data-place]'); if (pl) { const p = PLACES[Number(pl.dataset.place)]; $('sheetPlace').close(); changePlace(p.lat, p.lon, p.name + ', ' + p.sub); return; }
    const pr = t.closest('[data-result]'); if (pr) { const r = window.__results[Number(pr.dataset.result)]; $('sheetPlace').close(); changePlace(r.latitude, r.longitude, [r.name, r.admin1, r.country].filter(Boolean).join(', ')); return; }
    if (t.closest('#placeGo')) { runSearch(); return; }
    if (t.closest('#coordGo')) { const la = parseFloat($('latIn').value), lo = parseFloat($('lonIn').value); if (isFinite(la) && isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180) { $('sheetPlace').close(); changePlace(la, lo, null); } else $('latIn').setCustomValidity('Coordinate non valide'); return; }
    if (t.closest('#geoBtn')) { useMyLocation($('geoMsg')); return; }
    if (t.closest('#geoHeaderBtn') || t.closest('[data-geo]')) { useMyLocation(null); return; }
    if (t.closest('[data-geo-dismiss]')) { store.set('aurora_geo_hint', 1); renderView('adesso'); return; }
    if (t.closest('#notifBtn')) { $('notifMsg').textContent = await enableNotifications(); return; }
    if (t.closest('#diagCopy')) { const txt = diagReport(); try { await navigator.clipboard.writeText(txt); $('diagMsg').textContent = 'Copiato.'; } catch (e) { $('diagMsg').textContent = 'Copia non riuscita: seleziona e copia a mano.'; } return; }
    if (t.tagName === 'DIALOG') t.close(); // clic sullo sfondo
  });
  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.dataset && t.dataset.flag) {
      const f = t.dataset.flag;
      if (f === 'sound') { toggleSound(); t.checked = alertFlags.sound; }
      else { alertFlags[f] = t.checked; if (f === 'watch') { armFrontWatch(); renderHeader(); } }
      saveAlerts(); return;
    }
    if (t.dataset && t.dataset.setting) { const v = t.type === 'checkbox' ? t.checked : parseFloat(t.value); if (t.type === 'checkbox' || isFinite(v)) alertSettings[t.dataset.setting] = v; saveAlerts(); return; }
    if (t.id === 'srcSel') { S.source = t.value; S.selectedStart = null; recomputeL1(); renderAll(); return; }
    if (t.id === 'camRadius') { S.camRadius = Number(t.value); S.camLimit = 4; loadWebcams().then(() => renderView('webcam')); return; }
  });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target && ev.target.id === 'placeQ') { ev.preventDefault(); runSearch(); } });
  window.addEventListener('hashchange', () => goto(location.hash.replace('#', '')));
  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (S.view === 'adesso') { drawField(); drawGround(); drawWind(); } if (S.view === 'fronti' || S.view === 'giorni') renderView(S.view); }, 150); });
}

async function runSearch() {
  const q = ($('placeQ').value || '').trim(), box = $('placeResults');
  if (q.length < 2) { box.innerHTML = '<p class="ab-notice">Scrivi almeno due lettere.</p>'; return; }
  box.innerHTML = '<p class="ab-notice">Sto cercando «' + esc(q) + '»…</p>';
  const res = await searchPlaces(q);
  if (res === null) { box.innerHTML = '<p class="ab-notice">Il servizio di ricerca non risponde. Usa le coordinate qui sotto.</p>'; return; }
  window.__results = res;
  box.innerHTML = res.length ? '<ul class="ab-list">' + res.map((r, i) => '<li><button type="button" data-result="' + i + '">' + esc(r.name) + '<small>' + esc([r.admin1, r.country].filter(Boolean).join(', ')) + '</small></button></li>').join('') + '</ul>' : '<p class="ab-notice">Nessun risultato per «' + esc(q) + '». Prova senza accenti (Tromso) o inserisci le coordinate.</p>';
}
