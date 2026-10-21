'use strict';
// Aurora Bande · Guida: un giro a tappe che evidenzia le parti della pagina Semplice e le spiega.
// Lì le spiegazioni non stanno sempre a schermo (css: .ab-simple .ab-hint è nascosto): si leggono qui, quando servono.
// Esperto e le altre pagine non hanno Guida e mostrano le spiegazioni come prima.
// Ogni tappa: sel = cosa evidenziare (se non c'è in pagina, la tappa si salta), t = titolo, d = spiegazione. Niente promesse: dicono cosa si vede, non cosa succederà.

const TOURS = {
  semplice: [
    { sel: '.ab-modebar', t: 'Semplice o Esperto', d: 'Semplice dice com’è il Sole in parole e mostra stanotte e i prossimi giorni. Esperto ha tutti i numeri in una pagina, in ordine di urgenza. La scelta resta salvata.' },
    { sel: '.ab-sun', t: 'Il Sole adesso', d: 'Una parola sola: com’è il Sole in questo momento. «Calmo» vuol dire che non sta mandando niente di forte. Salendo (Minore, Moderata, Forte) il campo magnetico della Terra è sempre più disturbato. Kp è la misura di quel disturbo, da 0 a 9.' },
    { sel: '.ab-nlines', t: 'Avvisi NOAA e NASA', d: 'Compaiono solo quando c’è qualcosa: una tempesta in corso o attesa, un’onda d’urto, una nube (CME) in viaggio. Se non c’è niente, questa riga non c’è. Toccala per il dettaglio.' },
    { sel: '#fieldChart', t: 'Il campo magnetico a L1', d: 'Le sonde stanno a 1,5 milioni di km dalla Terra, verso il Sole: misurano il vento solare circa un’ora prima che ci arrivi. La linea rossa (Bz) è quella che conta: sotto lo zero il vento solare si aggancia al campo della Terra, ed è la condizione che serve perché lo disturbi. Da sola non garantisce un’aurora. Tocca il grafico per leggere i valori.' },
    { sel: '.ab-days__row', t: 'Prossimi giorni', d: 'La previsione NOAA, una colonna per notte: più è alta, più il campo è agitato (Kp). È una media del mondo intero: dice il «clima» della notte, non se vedrai l’aurora dove sei.' },
    { sel: '.ab-tonight', t: 'Stanotte dove sei', d: 'Quanto è probabile avere il cielo libero, ora per ora. Barra alta e verde = più probabile vedere il cielo. Aurora e nuvole sono due cose separate: servono tutte e due.' },
    { sel: '.ab-linkcard[data-home]', t: 'Tutti i dati', d: 'Per i numeri completi (campo, vento, sonde, magnetometri a terra, Sole, previsioni) passa a Esperto.' },
  ],
};

function guideButton() {
  return '<button type="button" class="ab-guidebtn" data-guide aria-label="Guida: spiega questa pagina">' + icon('info') + 'Guida</button>';
}

const guide = { steps: [], i: 0, el: null, prev: null };

function guideSteps() {
  return (S.view === 'adesso' && homeMode() === 'semplice' ? TOURS.semplice : []).filter((s) => document.querySelector('#v-' + S.view + ' ' + s.sel) || document.querySelector(s.sel));
}

function guideTarget(sel) { return document.querySelector('#v-' + S.view + ' ' + sel) || document.querySelector(sel); }

function guideShow() {
  const st = guide.steps[guide.i], el = guideTarget(st.sel), o = guide.el;
  // l'elemento va in alto, sotto l'intestazione: il testo della tappa sta in basso e non lo copre
  const head = document.querySelector('.ab-header'), top = (head ? head.getBoundingClientRect().height : 0) + 8;
  window.scrollTo(0, Math.max(0, window.scrollY + el.getBoundingClientRect().top - top));
  const r = el.getBoundingClientRect(), bub = o.querySelector('.ab-tour__bubble'), maxB = window.innerHeight - bub.offsetHeight - 24;
  const hole = o.querySelector('.ab-tour__hole'), y = Math.max(top - 4, r.top), b = Math.min(r.bottom, Math.max(y + 40, maxB));
  hole.style.cssText = 'left:' + Math.max(4, r.left - 4) + 'px;top:' + y + 'px;width:' + Math.min(window.innerWidth - 8, r.width + 8) + 'px;height:' + Math.max(24, b - y) + 'px';
}

function guideRender() {
  const st = guide.steps[guide.i], n = guide.steps.length, last = guide.i === n - 1;
  guide.el.querySelector('.ab-tour__bubble').innerHTML =
    '<span class="ab-tour__step">' + (guide.i + 1) + ' di ' + n + '</span><h2 class="t-title" id="tourTitle">' + esc(st.t) + '</h2><p>' + esc(st.d) + '</p>' +
    '<div class="ab-tour__row"><button type="button" class="ab-btn-text" data-tour="end">Chiudi</button><span class="ab-row">' +
    (guide.i ? '<button type="button" class="ab-btn" data-tour="prev">Indietro</button>' : '') +
    '<button type="button" class="ab-btn" data-tour="next" style="background:var(--focus);color:#04122a;border-color:transparent">' + (last ? 'Fine' : 'Avanti') + '</button></span></div>';
  guideShow();
  const nx = guide.el.querySelector('[data-tour="next"]'); if (nx) nx.focus({ preventScroll: true });
}

function guideStart() {
  guide.steps = guideSteps(); if (!guide.steps.length) return;
  guide.i = 0; guide.prev = document.activeElement;
  const o = document.createElement('div');
  o.className = 'ab-tour'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-labelledby', 'tourTitle');
  o.innerHTML = '<div class="ab-tour__hole"></div><div class="ab-tour__bubble" aria-live="polite"></div>';
  document.body.appendChild(o); guide.el = o;
  o.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-tour]'); if (!b) return;
    if (b.dataset.tour === 'next') { if (guide.i < guide.steps.length - 1) { guide.i++; guideRender(); } else guideEnd(); }
    else if (b.dataset.tour === 'prev') { guide.i = Math.max(0, guide.i - 1); guideRender(); }
    else guideEnd();
  });
  guideRender();
}

function guideEnd() {
  if (!guide.el) return;
  guide.el.remove(); guide.el = null;
  window.scrollTo(0, 0);
  if (guide.prev && guide.prev.focus) guide.prev.focus({ preventScroll: true });
}

document.addEventListener('click', (ev) => { if (ev.target.closest('[data-guide]')) guideStart(); });
document.addEventListener('keydown', (ev) => {
  if (!guide.el) return;
  if (ev.key === 'Escape') guideEnd();
  else if (ev.key === 'ArrowRight') guide.el.querySelector('[data-tour="next"]').click();
  else if (ev.key === 'ArrowLeft') { const p = guide.el.querySelector('[data-tour="prev"]'); if (p) p.click(); }
});
// se la pagina cambia sotto la guida (nuovo disegno, rotazione), la guida si chiude: meglio che restare puntata su un elemento sparito
window.addEventListener('hashchange', guideEnd);
window.addEventListener('resize', () => { if (guide.el) guideShow(); });
