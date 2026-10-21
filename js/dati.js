'use strict';
// Aurora Bande · pagine fuori dalla barra: «Tutti i dati» (una pagina sola, in ordine di urgenza) ed «Esplosioni solari»
// (brillamenti dei 7 giorni e CME). Ricompongono schede che esistono già (ui.js, minicharts.js): niente dati nuovi, solo un altro ordine.

// ---------- collegamenti d'ingresso ----------
function explosionsLink() {
  return '<a class="ab-linkcard" href="#esplosioni" data-go="esplosioni">' + icon('zap') + '<span><b>Esplosioni solari e CME</b><small>Brillamenti dei 7 giorni e nubi lanciate verso la Terra</small></span>' + icon('chev') + '</a>';
}
const skeleton = (title) => '<div class="ab-page"><div class="ab-span"><h1 class="ab-h1">' + title + '</h1></div><div class="ab-skel"></div><div class="ab-skel"></div></div>';

// ---------- Esplosioni solari ----------
// «Cosa hanno fatto i brillamenti questa settimana»: due righe di fatti, senza dare giudizi.
function flareVerdict(n) {
  if (!n.flares) return '';
  const now = Date.now(), from = now - 7 * 86400000;
  const week = flareEvents(n.flares).filter((e) => e.t >= from && e.t <= now);
  const big = week.filter((e) => e.L === 'M' || e.L === 'X'), x = week.filter((e) => e.L === 'X');
  const linked = n.donki ? flaresWithCme().filter((t) => t >= from && t <= now) : null;
  const dl = (t) => new Date(t).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: zone() }).replace('.', '');
  const cls = (e) => e.cls.replace('.', ',');
  const pick = x.length ? x : big;
  const letter = x.length ? 'X' : 'M';
  const title = !week.length ? 'Nessun brillamento registrato' : !pick.length ? 'Settimana tranquilla: nessun brillamento forte'
    : (pick.length === 1 ? 'Un brillamento' : pick.length + ' brillamenti') + ' di classe ' + letter + ' in 7 giorni';
  let body = week.length ? week.length + (week.length === 1 ? ' brillamento' : ' brillamenti') + ' in 7 giorni' : '';
  if (week.length) {
    body += big.length ? ': ' + (big.length === 1 ? 'uno solo di classe M o X' : big.length + ' di classe M o X') + ' (' + big.map((e) => cls(e) + ' di ' + dl(e.t)).join(', ') + ')' + (x.length ? '' : '. Nessuno X') : '. Nessuno di classe M o X';
    body += '. ';
    body += linked === null ? 'Le analisi NASA non sono raggiungibili ora.' : linked.length ? 'NASA ha collegato una CME a ' + linked.length + (linked.length === 1 ? ' brillamento.' : ' brillamenti.') : 'NASA non ne ha collegato nessuno a una CME: il collegamento si fa a mano e può arrivare con ore di ritardo.';
  }
  return '<section class="ab-card ab-flareverdict"><div class="ab-card__head"><h2 class="t-title">' + esc(title) + '</h2>' + tag('measured', 'Osservato · GOES') + '</div>' + (body ? '<p class="t-body-sm">' + esc(body) + '</p>' : '') + '</section>';
}

function viewEsplosioni() {
  const n = S.noaa;
  if (!n) return skeleton('Esplosioni solari');
  return '<div class="ab-page"><div class="ab-span"><h1 class="ab-h1">Esplosioni solari</h1><p class="ab-lede ab-hint">I brillamenti e le nubi (CME) che ne possono nascere. Un brillamento da solo non fa un’aurora: serve una CME diretta verso la Terra.</p></div>' +
    '<div class="ab-span ab-stack">' + flareVerdict(n) + flareCard(n) + '</div>' +
    '<div class="ab-span" id="cmeCard">' + cmeCard(n) + '</div>' +
    '<div class="ab-span"><a class="ab-linkcard" href="#dati" data-go="dati">' + icon('activity') + '<span><b>Tutti i dati</b><small>Vento, magnetometri, avvisi, Sole e previsioni</small></span>' + icon('chev') + '</a></div></div>';
}

// ---------- Tutti i dati ----------
// È la prima pagina in modo «Esperto» (ui.js, viewAdesso).
const DATA_SECTIONS = [['vento', 'Vento'], ['terra', 'A terra'], ['avvisi', 'Avvisi'], ['sole', 'Sole'], ['previsioni', 'Previsioni'], ['fonti', 'Fonti']];
function dataSection(id, title, sub, inner) {
  return '<div class="ab-span ab-datasec" id="sec-' + id + '"><div class="ab-datasec__head"><h2 class="t-title">' + esc(title) + '</h2><p class="t-body-sm">' + esc(sub) + '</p></div><div class="ab-stack">' + inner + '</div></div>';
}
function epamCard() {
  return card('Particelle energetiche (EPAM)',
    '<div class="ab-chart"><img src="' + SWPC + '/images/ace-epam-24-hour.gif" alt="Grafico NOAA delle particelle energetiche misurate dal satellite ACE (EPAM), ultime 24 ore" loading="lazy" style="width:100%;height:auto;background:#fff;border-radius:var(--radius-sm)" onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),{className:\'ab-media__ph\',textContent:\'Grafico non disponibile ora\'}))"></div>' +
    '<p class="t-caption ab-card__note">Grafico ufficiale NOAA SWPC · satellite ACE · ultime 24 ore. <span class="ab-hint">Un aumento brusco e simultaneo delle linee precede spesso l’arrivo di una CME di circa mezz’ora.</span></p>', { right: tag('measured', 'Misurato') });
}
function stackplotCard() {
  return card('Magnetometri a terra: grafici ufficiali',
    '<p class="t-body-sm">Una riga per stazione, dal nord verso sud: onde che si muovono insieme indicano un disturbo geomagnetico. I grafici sono del Tromsø Geophysical Observatory (UiT), in Europa e in Nord America.</p>' +
    '<div class="ab-linkrow">' + extLink('https://flux.phys.uit.no/stackplot/', 'Stackplot Europa e Nord America') + '</div>' +
    '<p class="t-caption ab-card__note">Si aprono sul sito del titolare: non vengono copiati qui (licenza da chiarire, vedi LICENZE-DA-VERIFICARE.md).</p>', { right: tag('measured', 'Misurato') });
}
function sourcesCard() {
  return card('Siti delle fonti',
    '<div class="ab-linkrow">' + extLink('https://www.swpc.noaa.gov/', 'NOAA SWPC · vento solare, Kp, scale, allerte, immagini') + extLink('https://ccmc.gsfc.nasa.gov/tools/DONKI/', 'NASA DONKI · brillamenti e CME') + extLink('https://space.fmi.fi/image/', 'IMAGE / FMI · magnetometri a terra') + '</div>' +
    '<p class="t-caption ab-card__note ab-hint">Ogni numero ha la sua etichetta: <b>Misurato</b> (strumento), <b>Calcolato</b> (formula nostra o di un modello), <b>Stimato</b> o <b>Previsto</b>. Licenze e crediti sono in «Fonti e crediti», in fondo alla pagina.</p>');
}

function viewDati() {
  const now = Date.now(), e = pickEvent(now), F = factors(e), P = giorniParts();
  const wait = '<div class="ab-skel"></div>';
  const nav = '<nav class="ab-secnav ab-span" aria-label="Salta a">' + DATA_SECTIONS.map(([id, l]) => '<a href="#sec-' + id + '" data-go="#sec-' + id + '">' + l + '</a>').join('') + '</nav>';
  const sintesi = card('In sintesi', metricsBlock(F.sig.c), { right: tag('measured', 'Misurato') });
  const previsioni = P ? P.summary + P.nightsCard + '<section class="ab-card ab-morelist"><div class="ab-card__head"><h2 class="t-title">Altre previsioni NOAA</h2></div>' + P.noteCard + P.kpCard + P.scalesCard + '</section>' : wait;
  const sole = P ? P.sun + '<section class="ab-card ab-morelist"><div class="ab-card__head"><h2 class="t-title">Macchie solari</h2></div>' + P.regCard + '</section>' + explosionsLink() : wait;
  return '<div class="ab-page">' + modeSwitch() + '<div class="ab-span"><h1 class="ab-h1">Tutti i dati</h1><p class="ab-lede ab-hint">Una pagina sola, in ordine di urgenza: prima quello che sta per arrivare, poi il Sole, le previsioni in fondo.</p></div>' + nav +
    '<div class="ab-span ab-stack">' + sintesi + '</div>' +
    dataSection('vento', 'Vento solare', 'Misurato a L1, 1,5 milioni di km dalla Terra, verso il Sole', fieldCard() + windCard() + probesCard() + epamCard()) +
    dataSection('terra', 'A terra', 'Cosa succede già sul pianeta', (e ? groundCard(e) : '') + stackplotCard()) +
    dataSection('avvisi', 'Avvisi', 'Solo quelli che riguardano l’aurora', P ? P.nowCard + P.alCard : wait) +
    dataSection('sole', 'Il Sole', 'Da dove parte tutto: immagini e macchie solari', sole) +
    dataSection('previsioni', 'Previsioni', 'Cosa dice NOAA per i prossimi tre giorni', previsioni) +
    dataSection('fonti', 'Da dove vengono', 'Dati grezzi e fonti', sourcesCard()) + '</div>';
}
