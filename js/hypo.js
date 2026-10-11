'use strict';
// Aurora Bande · new version — quadro d'insieme: più fattori raggruppati in un'ipotesi.
// L'aurora dipende da molti elementi e nessuno basta da solo: qui i fattori sono raggruppati (spazio / punto di osservazione)
// e ne esce un'ipotesi in parole caute, mai una previsione. Le soglie del campo a L1 restano in SIGNAL_RULES (l1.js).

const MARK = { good: '✓', mid: '–', bad: '✕', unk: '?' };

// ovale aurorale (modello OVATION) nel luogo scelto: stessi limiti delle etichette della pagina originale
function ovationState(v) { return v == null ? 'unk' : v >= 50 ? 'good' : v >= 20 ? 'mid' : 'bad'; }

function a_moonShort(A) {
  if (!A.ok) return 'n.d.';
  const m = A.moon;
  return m.above === false ? 'non in cielo' : m.illum < 20 ? 'debole' : m.illum < 60 ? 'media' : 'luminosa';
}

// intensità della tempesta geomagnetica adesso: il più alto fra il Kp stimato da NOAA (ultimo minuto) e le allerte NOAA «soglia
// raggiunta» (ALERT) scattate nelle ultime 3 ore — il Kp è a blocchi di 3 ore, un ALERT resta vero per tutto il blocco.
// I WARNING non contano: sono previsioni («atteso»), non misure.
function stormNow() {
  const now = Date.now(), list = (S.noaaAlerts && S.noaaAlerts.list) || [];
  let kp = S.kp != null ? Math.round(S.kp) : 0, src = S.kp != null ? 'Kp stimato NOAA' : '';
  list.forEach((a) => { if (a.kp != null && !a.watch && a.kind === 'measured' && now - a.ms <= 3 * 3600000 && a.kp > kp) { kp = a.kp; src = 'Allerta NOAA delle ' + fmtClock(a.ms); } });
  return { kp, g: Math.max(0, kp - 4), src };
}

function factors(e) {
  const sig = signal(), c = sig.c, A = S.astro = astro();
  const space = [], obs = [];
  // campo a L1
  // carico delle ultime 3 ore: un tratto a sud ballerino (tanti episodi corti) può aver caricato la magnetosfera
  // quanto uno lungo unico. Si aggiunge solo quando è davvero rilevante, non ad ogni misura.
  const load = l1RecentLoad(3);
  const loadNote = load && load.southShare >= 0.25 ? '. Ultime 3 ore: Bz a sud per il ' + Math.round(load.southShare * 100) + '% del tempo' + (load.southShare < 0.85 ? ', a tratti — la carica però si accumula' : '') + '.' : '';
  if (sig.level == null) { const age = l1LastKnownAge(); space.push({ label: 'Campo a L1', state: 'unk', short: 'non recente', value: 'Dati non recenti', note: (age != null && age >= 20 ? 'Ultimo dato NOAA di ' + fmtDur(age) + ' fa' : 'In attesa di nuove misure') + loadNote, kind: 'measured' }); }
  else space.push({
    label: 'Campo a L1', state: sig.level >= 2 ? 'good' : sig.level === 1 ? 'mid' : 'bad', kind: 'measured',
    short: sig.level === 0 && c.bz > 0 ? 'Bz a nord' : ['calmo', 'debole', 'moderato', 'marcato'][sig.level],
    value: 'Bz ' + signed(c.bz, 1) + ' nT · vento ' + Math.round(c.v) + ' km/s',
    note: [c.bz > 0 ? 'Bz a nord' : 'Bz vicino allo zero', 'Bz a sud, con vento lento', 'Bz a sud, andamento moderato', 'Bz a sud, andamento marcato'][sig.level] + loadNote,
  });
  // ovale aurorale
  const ov = S.ovation && S.ovation.val != null ? S.ovation.val : null, rc = S.ovation && S.ovation.reach;
  const st = stormNow();
  // tempesta geomagnetica in corso (Kp): la dice NOAA, indipendentemente da dove sei e da dove punta Bz in questo minuto
  space.push(st.kp >= 4 ? { label: 'Tempesta geomagnetica', state: st.g >= 1 ? 'good' : 'mid', kind: 'measured', short: st.g >= 1 ? 'G' + st.g : 'Kp ' + st.kp, value: st.g >= 1 ? 'G' + st.g + ' · ' + G_WORDS[st.g] + ' (Kp ' + st.kp + ')' : 'Kp ' + st.kp + ' · sotto la soglia di tempesta', note: st.src + '. Il Kp è una media planetaria: dice che il campo è agitato, non dove si vede.' }
    : { label: 'Tempesta geomagnetica', state: 'bad', kind: 'measured', short: 'calmo', value: 'Kp ' + (st.kp || 0) + ' · campo calmo', note: st.src ? st.src + '.' : '' });
  if (rc) space.push({ label: 'Ovale aurorale', state: rc.state, kind: 'forecast', short: rc.short, value: rc.value, note: rc.note });
  else space.push({ label: 'Ovale aurorale', state: ovationState(ov), kind: 'forecast', short: ov == null ? 'n.d.' : Math.round(ov) + ' su 100', value: ov == null ? 'Modello non disponibile' : Math.round(ov) + ' su 100 nel tuo luogo', note: ov == null ? '' : ovationLabel(ov) });
  // risposta a terra: c'è solo se esiste un fronte da confrontare
  if (e) {
    const a = groundView(e).a;
    space.push({ label: 'Risposta a terra', kind: 'measured', state: a.state === 'signal' ? 'good' : a.state === 'monitoring' ? 'mid' : 'unk', short: { signal: 'variazione', monitoring: 'calma', waiting: 'in attesa' }[a.state] || 'n.d.', value: a.label, note: a.state === 'signal' ? 'Solo compatibile nel tempo' : '' });
  } else space.push({ label: 'Risposta a terra', kind: 'measured', state: 'unk', short: 'nessun fronte', value: 'Nessun fronte da confrontare', note: 'Il confronto parte quando un episodio ha un arrivo stimato' });
  // dal punto di osservazione
  const sky = skyCheck(e), dk = darkCheck(A), mn = moonCheck(A);
  obs.push({ label: 'Cielo', kind: 'forecast', short: sky.value, ...sky }, { label: 'Buio', kind: 'computed', short: dk.value, ...dk }, { label: 'Luna', kind: 'computed', short: a_moonShort(A), ...mn });
  return { space, obs, sig };
}

// ipotesi in parole caute: unisce «lo spazio» (0–3, dal campo a L1) e «il punto di osservazione»
function hypothesis(F) {
  const d = F.sig.level == null ? 0 : F.sig.level;
  const g = F.space.filter((x) => x.state === 'good').length; // quanti fattori nello spazio sono a favore
  const ob = F.obs.find((x) => x.label === 'Cielo'), dk = F.obs.find((x) => x.label === 'Buio');
  const worst = [ob.state, dk.state].includes('bad') ? 'bad' : [ob.state, dk.state, F.obs.find((x) => x.label === 'Luna').state].includes('mid') ? 'mid' : 'good';
  const title = F.sig.level == null ? 'Indizi non valutabili ora' : g === 0 ? 'Per ora pochi indizi' : g === 1 ? 'Qualche indizio a favore' : 'Diversi indizi a favore';
  let why;
  if (F.sig.level == null) { const age = l1LastKnownAge(); why = age != null && age >= 20 ? 'Mancano dati recenti a L1: l’ultimo dato NOAA disponibile risale a ' + fmtDur(age) + ' fa. È un ritardo della fonte, non un problema di questa pagina.' : 'Mancano dati recenti a L1: non si può dire nulla di sensato.'; }
  else if (g >= 1 && worst === 'bad') why = 'Lo spazio dà qualche segnale, ma cielo o buio non aiutano: un’aurora potrebbe esserci senza potersi vedere.';
  else if (g >= 1 && worst === 'good') why = 'Cielo e buio permetterebbero di vederla, se ci fosse. È un’ipotesi, non una previsione.';
  else if (g >= 1) why = 'Lo spazio dà qualche segnale, ma cielo, buio o luna sono incerti.';
  else if (worst === 'good') why = 'Cielo e buio sono buoni, ma lo spazio è calmo.';
  else why = 'Né lo spazio né il punto di osservazione offrono molto, per ora.';
  let level = F.sig.level == null ? 0 : Math.min(3, g === 0 ? 0 : g === 1 ? 1 : 2);
  // con una tempesta G1+ confermata il titolo non può dire «pochi indizi»: dice cos'è, e cosa significa dal tuo luogo
  const st = stormNow();
  if (st.g >= 1) {
    const rc = S.ovation && S.ovation.reach, bz = F.sig.c && F.sig.c.bz;
    const near = rc && (rc.tier === 'overhead' || rc.tier === 'near');
    level = rc ? (near ? 3 : rc.tier === 'horizon' ? 2 : 1) : 2;
    const title2 = 'Tempesta geomagnetica G' + st.g + ' in corso · ' + G_WORDS[st.g];
    let w = gPlain(st.g) + ' NOAA conferma Kp ' + st.kp + ' (' + st.src.charAt(0).toLowerCase() + st.src.slice(1) + '). ' + (rc ? rc.note : '');
    if (bz != null) w += bz > 0 ? ' Ora il campo a L1 è a nord: la fase più intensa potrebbe essere passata, ma può riprendere.' : isSouth(bz) ? ' Il campo a L1 è a sud: l’attività continua.' : '';
    if (worst === 'bad') w += ' Cielo o buio, in questo momento, non aiutano.';
    return { level, title: title2, why: w.trim() };
  }
  return { level, title, why };
}

function factorGroup(name, rows) {
  return '<div class="ab-factors"><p class="t-label">' + name + '</p><ul>' + rows.map((r) =>
    '<li data-state="' + r.state + '"><span class="ab-check__mark" aria-hidden="true">' + MARK[r.state] + '</span><div><b>' + esc(r.label) + '</b><span>' + esc(r.value) + '</span>' + (r.note ? '<small>' + esc(r.note) + '</small>' : '') + '</div>' + tag(r.kind, TAGS[r.kind]) + '</li>').join('') + '</ul></div>';
}

// dove porta ogni tessera: il grafico o la scheda che spiega il fattore
const FACTOR_GO = { 'Campo a L1': '#fieldCard', 'Tempesta geomagnetica': '#fieldCard', 'Ovale aurorale': 'cielo', 'Risposta a terra': '#groundCard', Cielo: 'cielo', Buio: 'cielo', Luna: 'cielo' };

// vista d'insieme: sei tessere, una parola ciascuna. Il dettaglio di ogni fattore resta sotto, chiuso.
function factorTiles(name, rows) {
  return '<div class="ab-ftiles"><p class="t-label">' + name + '</p><ul>' + rows.map((r) =>
    '<li data-state="' + r.state + '"><a href="' + (FACTOR_GO[r.label] === 'cielo' ? '#cielo' : FACTOR_GO[r.label]) + '" data-go="' + FACTOR_GO[r.label] + '" aria-label="' + esc(r.label + ': ' + (r.short || r.value)) + '"><span class="ab-check__mark" aria-hidden="true">' + MARK[r.state] + '</span><b>' + esc(r.label.replace('Risposta a terra', 'A terra').replace('Ovale aurorale', 'Ovale').replace('Tempesta geomagnetica', 'Kp').replace('Campo a L1', 'Campo L1')) + '</b><span>' + esc(r.short || r.value) + '</span></a></li>').join('') + '</ul></div>';
}
function factorOverview(F) {
  return factorTiles('Nello spazio', F.space) + factorTiles('Dove sei', F.obs) +
    '<details class="ab-details ab-fdetails"><summary>Dettaglio dei fattori' + icon('chev') + '</summary>' + factorGroup('Nello spazio', F.space) + factorGroup('Dal tuo punto di osservazione', F.obs) + '<p class="t-caption ab-credit">Fonti: NOAA SWPC (campo a L1, ovale), FMI IMAGE (risposta a terra), Open-Meteo (cielo), SunCalc (buio e luna). Dettagli in «Fonti e crediti».</p></details>';
}
