'use strict';
// Aurora Bande · new version — nucleo: stato, utilità, formattazione, diagnostica.
// Tutti gli script sono classici e condividono queste variabili globali.

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const L1_KM = 1500000;
const SWPC = 'https://services.swpc.noaa.gov';

// Stato condiviso dell'app
const S = {
  lat: 69.65, lon: 18.96, label: 'Tromsø, Norvegia', tz: null,
  source: 'AUTO',            // sonda L1: AUTO = riferimento NOAA
  magRaw: null, windRaw: null, sum: {}, kp: null, sources: [],
  episodes: [], selectedStart: null,
  ovationRaw: null, ovation: null, hemi: null,
  sky: { data: null, lat: null, lon: null, fetchedAt: 0 },
  ground: { station: null, byStation: {}, errors: {}, pending: false, requestId: 0 },
  noaa: null, noaaAlerts: null, webcams: [], camFilter: 'near', camRadius: 200, camLimit: 4,
  loadedAt: null, view: 'adesso',
};

function num(v) {
  if (v === null || v === undefined || typeof v === 'boolean' || (typeof v === 'string' && !v.trim())) return null;
  const x = Number(v);
  if (!isFinite(x) || x <= -9990) return null; // valori sentinella NOAA
  return x;
}

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};

// ---------- orari ----------
function toMs(t) {
  if (!t) return NaN;
  const iso = /Z$|[+-]\d\d:\d\d$/.test(t) ? t : String(t).replace(' ', 'T') + 'Z';
  return new Date(iso).getTime();
}
function zone() { return S.tz || Intl.DateTimeFormat().resolvedOptions().timeZone; }
function fmtClock(ms, z) {
  if (ms == null || !isFinite(ms)) return '—';
  try { return new Date(ms).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: z || zone() }); } catch (e) { return '—'; }
}
function fmtDay(ms, z) {
  if (ms == null || !isFinite(ms)) return '—';
  try { return new Date(ms).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: z || zone() }).replace('.', ''); } catch (e) { return '—'; }
}
function fmtDayClock(ms, z) { return fmtDay(ms, z) + ' · ' + fmtClock(ms, z); }
function tzName(z) {
  try { return new Intl.DateTimeFormat('it-IT', { timeZone: z || zone(), timeZoneName: 'short' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName').value; } catch (e) { return ''; }
}
function fmtDur(min) {
  const m = Math.round(min);
  return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') + ' min';
}
function ago(ms) {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  return m < 1 ? 'meno di 1 min fa' : m + ' min fa';
}
function itNum(x, d) { return Number(x).toFixed(d == null ? 0 : d).replace('.', ',').replace('-', '−'); }
function signed(x, d) { const s = itNum(Math.abs(x), d); return x < 0 ? '−' + s : (x > 0 ? '+' + s : s); }

// ---------- diagnostica ----------
const DIAG = { items: {}, order: [], errors: [] };
function diagSet(name, status, detail) {
  if (!DIAG.items[name]) DIAG.order.push(name);
  DIAG.items[name] = { status, detail: detail || '', t: new Date().toLocaleTimeString('it-IT') };
  if (typeof renderDiag === 'function') renderDiag();
}
function diagError(msg) {
  const m = String(msg).slice(0, 300);
  if (DIAG.errors.indexOf(m) === -1) DIAG.errors.push(m);
  if (DIAG.errors.length > 20) DIAG.errors.shift();
  if (typeof renderDiag === 'function') renderDiag();
}
window.addEventListener('error', (e) => diagError((e.message || 'errore') + (e.filename ? ' @ ' + e.filename.split('/').pop() + ':' + e.lineno : '')));
window.addEventListener('unhandledrejection', (e) => diagError('promise non gestita: ' + (e.reason && e.reason.message ? e.reason.message : e.reason)));
function diagReport() {
  const l = ['=== Aurora Bande (new version) · report diagnostica ===', 'Data: ' + new Date().toString(), 'URL: ' + location.href, 'Browser: ' + navigator.userAgent,
    'SunCalc: ' + (window.SunCalc ? 'ok' : 'NON CARICATA'), '--- fonti dati ---'];
  DIAG.order.forEach((n) => { const i = DIAG.items[n]; l.push('[' + i.status.toUpperCase() + '] ' + n + (i.detail ? ' — ' + i.detail : '') + '  (' + i.t + ')'); });
  l.push('--- errori javascript ---', DIAG.errors.length ? DIAG.errors.join('\n') : 'nessuno');
  return l.join('\n');
}

// ---------- rete ----------
async function getRaw(url, label, kind, timeoutMs) {
  const name = label || url.replace(/^https?:\/\//, '').split('?')[0];
  diagSet(name, 'wait', 'richiesta in corso…');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs || 25000);
  try {
    // Digitraffic rifiuta i parametri che non conosce (HTTP 400): per lui niente parametro anti-cache
    const res = await fetch(/digitraffic\.fi/.test(url) ? url : url + (url.includes('?') ? '&' : '?') + '_=' + Date.now(), { cache: 'no-store', signal: ctl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = kind === 'text' ? await res.text() : await res.json();
    diagSet(name, 'ok', kind === 'text' ? data.length + ' caratteri' : (Array.isArray(data) ? data.length + ' righe' : 'ok'));
    return data;
  } catch (e) {
    const why = e && e.name === 'AbortError' ? 'nessuna risposta entro il tempo limite' : (e && e.name === 'TypeError' ? 'rete bloccata o CORS' : (e && e.message ? e.message : String(e)));
    diagSet(name, 'err', why);
    return null;
  } finally { clearTimeout(timer); }
}
const getJSON = (url, label, t) => getRaw(url, label, 'json', t);
const getTEXT = (url, label, t) => getRaw(url, label, 'text', t);

// ---------- icone (linea, 24px, currentColor) ----------
const ICONS = {
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  cloud: '<path d="M7 18a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 8.5a4.5 4.5 0 0 1 .5 9.5H7z"/>',
  camera: '<path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  pin: '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2z"/><path d="M10 21h4"/>',
  chev: '<path d="m6 9 6 6 6-6"/>',
  down: '<path d="M12 5v14m0 0-5-5m5 5 5-5"/>',
  up: '<path d="M12 19V5m0 0-5 5m5-5 5 5"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.5-3.5L4 9m0-5v5h5M4 13a8 8 0 0 0 14.5 3.5L20 15m0 5v-5h-5"/>',
  play: '<path d="M8 5v14l11-7z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  locate: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  sunrise: '<path d="M3 18h18M7 18a5 5 0 0 1 10 0M12 9V3.5M9.5 5.5L12 3l2.5 2.5"/>',
  sunset: '<path d="M3 18h18M7 18a5 5 0 0 1 10 0M12 3v5.5M9.5 6.5L12 9l2.5-2.5"/>',
  stars: '<path d="M10 4l1.6 4.4L16 10l-4.4 1.6L10 16l-1.6-4.4L4 10l4.4-1.6zM18 13l.9 2.1L21 16l-2.1.9L18 19l-.9-2.1L15 16l2.1-.9z"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
};
function icon(n, cls) { return '<svg class="ab-icon' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + ICONS[n] + '</svg>'; }

// ---------- pezzi di markup ripetuti ----------
function tag(kind, label) { return '<span class="ab-tag" data-kind="' + kind + '"><i></i>' + esc(label) + '</span>'; }
const TAGS = { measured: 'Misurato', computed: 'Calcolato', estimated: 'Stimato', forecast: 'Previsto' };
