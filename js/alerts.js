'use strict';
// Aurora Bande · new version — avvisi. Funzionano solo mentre la pagina resta aperta: non sono un servizio in background.
// Un avviso segnala che una condizione è stata superata: non è una conferma di aurora.

const ALERT_DEFAULTS = {
  bzEnabled: false, bzThreshold: -5, bzStep: 2,
  kpEnabled: false, kpThreshold: 5, kpStep: 1,
  speedEnabled: false, speedThreshold: 500, speedStep: 50,
  ovationEnabled: false, ovationThreshold: 30, ovationStep: 10,
  skyEnabled: false, skyThreshold: 7, skyStep: 1,
};
const ALERT_RULES = [
  { key: 'bz', label: 'Bz favorevole', unit: 'nT', dir: 'below', help: 'Avvisa quando Bz scende sotto la soglia' },
  { key: 'kp', label: 'Kp elevato', unit: '', dir: 'above', help: 'Avvisa quando il Kp sale sopra la soglia' },
  { key: 'speed', label: 'Vento solare veloce', unit: 'km/s', dir: 'above', help: 'Avvisa quando la velocità supera la soglia' },
  { key: 'ovation', label: 'OVATION nel tuo luogo', unit: '/100', dir: 'above', help: 'Avvisa quando il modello supera la soglia' },
  { key: 'sky', label: 'Cielo sereno', unit: '/10', dir: 'above', help: 'Avvisa quando il punteggio del cielo supera la soglia' },
];
let alertSettings = { ...ALERT_DEFAULTS, ...store.get('aurora_alert_settings', {}) };
const alertFlags = { watch: false, watchNew: true, watchWindow: true, sound: false, ...store.get('aurora_alert_flags', {}) };
alertFlags.watch = false; // per sicurezza gli avvisi ripartono spenti a ogni apertura
const alertState = { bz: -1, kp: -1, speed: -1, ovation: -1, sky: -1 };
const frontWatch = { initialized: false, seen: new Set(), windows: new Set() };
const alertLog = [];
let audioCtx = null, toastTimer = null;

function saveAlerts() { store.set('aurora_alert_settings', alertSettings); store.set('aurora_alert_flags', alertFlags); }

function stepLevel(value, threshold, step, dir) {
  const s = step && step > 0 ? step : 1;
  if (dir === 'above') return value < threshold ? -1 : Math.floor((value - threshold) / s);
  return value > threshold ? -1 : Math.floor((threshold - value) / s);
}

function armFrontWatch() {
  frontWatch.seen.clear(); frontWatch.windows.clear();
  const now = Date.now();
  S.episodes.forEach((e) => { frontWatch.seen.add(e.start); if (e.arrStart != null && now >= e.arrStart - ARRIVAL_MARGIN_MS) frontWatch.windows.add(e.start); });
  frontWatch.initialized = l1Now().fresh;
  Object.keys(alertState).forEach((k) => { alertState[k] = -1; });
}

function fireAlert(title, body) {
  if (!alertFlags.watch) return;
  alertLog.unshift({ title, body, t: new Date().toLocaleTimeString('it-IT') });
  alertLog.length = Math.min(alertLog.length, 8);
  const toast = $('toast');
  if (toast) { toast.textContent = title + ' · ' + body; toast.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true; }, 20000); }
  if (window.Notification && Notification.permission === 'granted') { try { new Notification(title, { body, tag: 'aurora-' + title }); } catch (e) {} }
  if (alertFlags.sound && audioCtx) {
    try {
      audioCtx.resume();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.connect(g); g.connect(audioCtx.destination); o.frequency.value = 880; g.gain.value = 0.18; o.start();
      setTimeout(() => { o.frequency.value = 660; }, 150); setTimeout(() => o.stop(), 400);
    } catch (e) {}
  }
  if (typeof renderAlertLog === 'function') renderAlertLog();
}

function checkAlerts() {
  if (!alertFlags.watch) return;
  const c = l1Now();
  const vals = {
    bz: c.bz, kp: S.kp, speed: c.v, ovation: S.ovation ? S.ovation.val : null,
    sky: (() => { const n = nightCloud(); return n == null ? null : Math.round((100 - n) / 10); })(),
  };
  const texts = {
    bz: (v) => 'Bz è a ' + itNum(v, 1) + ' nT (soglia ' + itNum(alertSettings.bzThreshold, 0) + ' nT)',
    kp: (v) => 'Kp è a ' + itNum(v, 1) + ' (soglia ' + alertSettings.kpThreshold + ')',
    speed: (v) => 'Velocità a ' + Math.round(v) + ' km/s (soglia ' + alertSettings.speedThreshold + ' km/s)',
    ovation: (v) => 'OVATION a ' + Math.round(v) + '/100 nel luogo scelto (soglia ' + alertSettings.ovationThreshold + ')',
    sky: (v) => 'Punteggio del cielo a ' + v + '/10 (soglia ' + alertSettings.skyThreshold + ')',
  };
  ALERT_RULES.forEach((r) => {
    if (!alertSettings[r.key + 'Enabled'] || vals[r.key] == null) return;
    const lvl = stepLevel(vals[r.key], alertSettings[r.key + 'Threshold'], alertSettings[r.key + 'Step'], r.dir);
    if (lvl > alertState[r.key]) fireAlert(r.label, texts[r.key](vals[r.key]));
    alertState[r.key] = lvl;
  });
}

function checkFrontAlerts(now) {
  if (!alertFlags.watch) return;
  if (!l1Now().fresh) return;
  if (!frontWatch.initialized) { armFrontWatch(); return; }
  for (const e of arrivalQueue(now)) {
    if (!frontWatch.seen.has(e.start)) {
      frontWatch.seen.add(e.start);
      if (alertFlags.watchNew) fireAlert('Nuovo episodio di Bz sud', 'Arrivo stimato ' + fmtClock(e.arrStart - ARRIVAL_MARGIN_MS) + '–' + fmtClock(e.arrStart + ARRIVAL_MARGIN_MS) + ' · Bz sud per ' + fmtDur(e.durMin) + '. Stima indicativa.');
    }
    if (e.arrStart != null && now >= e.arrStart - ARRIVAL_MARGIN_MS && !frontWatch.windows.has(e.start)) {
      frontWatch.windows.add(e.start);
      if (alertFlags.watchWindow && now <= e.arrStart + ARRIVAL_MARGIN_MS) fireAlert('Finestra di arrivo iniziata', 'Episodio L1 delle ' + fmtClock(e.start) + ' · controlla il riscontro a terra. Arrivo non confermato.');
    }
  }
}

async function enableNotifications() {
  if (!window.Notification || !window.isSecureContext) return 'Le notifiche del browser non sono disponibili qui: restano gli avvisi dentro la pagina.';
  try {
    const p = await Notification.requestPermission();
    return p === 'granted' ? 'Notifiche consentite.' : 'Notifiche non consentite: restano gli avvisi dentro la pagina.';
  } catch (e) { return 'Notifiche non disponibili in questo browser.'; }
}
function toggleSound() {
  alertFlags.sound = !alertFlags.sound;
  if (alertFlags.sound) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch (e) { alertFlags.sound = false; } }
  saveAlerts();
}
