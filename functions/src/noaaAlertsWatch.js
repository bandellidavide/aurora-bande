'use strict';
// Aurora Bande · functions — controlla da sola le allerte geomagnetiche di NOAA, ogni 5 minuti,
// e manda una notifica push (vera, anche ad app chiusa) in tre casi: NOAA conferma una tempesta G1+ in corso (ALERT, soglia Kp>=5
// raggiunta), NOAA la prevede a ore (WARNING, «attesa»), oppure emette un WATCH, cioè il preavviso per i prossimi giorni.
// Antirumore: NOAA riemette/estende lo stesso avviso più volte in poche ore (visto nei dati reali) —
// si avvisa solo quando il livello sale oltre l'ultimo notificato, stesso principio di stepLevel()
// in js/alerts.js lato client (soglia + passo), non a ogni riemissione dello stesso avviso.

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const { getFirestore } = require('firebase-admin/firestore');
const { initializeApp, getApps } = require('firebase-admin/app');
const webpush = require('web-push');
const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, sendTelegram } = require('./telegramSend');

if (!getApps().length) initializeApp();

const VAPID_PRIVATE_KEY = defineSecret('VAPID_PRIVATE_KEY');
// pubblica: sicura da esporre, è la stessa usata dal client in js/pwa.js
const VAPID_PUBLIC_KEY = 'BIrpeVr4OBEcorrIjunS5xWH9bHZyjcxRMTKmctUKQuXIFZ2z8sfoN98AZLOmFxIpBUVHxFW1WyTqbM9rqCYI2I';
const VAPID_SUBJECT = 'mailto:bandelli.davide@gmail.com';
const G_WORDS = ['nessuna', 'minore', 'moderata', 'forte', 'severa', 'estrema'];

const G_PLAIN = [null,
  'si vede di solito solo nell’estremo nord. Dall’Italia no.',
  'si vede di solito fino a circa 55° di latitudine (Scozia, Danimarca). Dall’Italia no.',
  'si vede di solito fino a circa 50° (Germania, nord Francia); da noi al più un bagliore basso a nord.',
  'si vede di solito fino a circa 45°: possibile anche in Italia del nord.',
  'si vede molto più a sud del solito, anche in Italia. Evento rarissimo.'];

const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

// stessa estrazione di js/noaa.js (parseAlert/parseAlertUntil): se le soglie cambiano là, aggiornare anche qui.
function parseUntil(msg) {
  const m = /(?:Now Valid Until|Valid To):\s*(\d{4}) (\w{3}) (\d{1,2}) (\d{2})(\d{2}) UTC/.exec(msg);
  return m ? Date.UTC(+m[1], MONTHS[m[2]], +m[3], +m[4], +m[5]) : null;
}
// WATCH: «Highest Storm Level Predicted by Day: Oct 09:  G2 (Moderate)»; vale l'ultimo emesso, CANCEL WATCH lo annulla
// (stessa logica di parseWatch/activeWatch in js/noaa.js e js/ui.js).
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
// ALERT: vale per il suo periodo sinottico di 3 ore («Threshold Reached: … 1926 UTC», «Synoptic Period: 1800-2100»), come parsePeriodEnd in js/noaa.js
function parsePeriodEnd(msg) {
  const r = /Threshold Reached:\s*(\d{4}) (\w{3}) (\d{1,2}) (\d{2})(\d{2}) UTC/.exec(msg), p = /Synoptic Period:\s*(\d{2})(\d{2})-(\d{2})(\d{2})/.exec(msg);
  if (!r || !p) return null;
  const reached = Date.UTC(+r[1], MONTHS[r[2]], +r[3], +r[4], +r[5]);
  let end = Date.UTC(+r[1], MONTHS[r[2]], +r[3], +p[3], +p[4]);
  if (end <= reached) end += 86400000;
  return end;
}
function parseAlert(a) {
  const msg = (a.message || '').replace(/\r/g, '');
  const title = msg.split('\n').map((s) => s.trim()).find((s) => /^(CANCEL WATCH|EXTENDED WARNING|ALERT|WARNING|WATCH|SUMMARY|CONTINUED ALERT)\b/i.test(s)) || '';
  const kp = /K-index of (\d)/i.exec(title);
  const geo = /Geomagnetic|K-index/i.test(title);
  const ms = Date.parse(String(a.issue_datetime || '').replace(' ', 'T') + 'Z');
  const isAlert = /^(CONTINUED )?ALERT/i.test(title), isWarning = /^(EXTENDED )?WARNING/i.test(title);
  return { kp: kp ? +kp[1] : null, until: parseUntil(msg), periodEnd: isAlert ? (parsePeriodEnd(msg) || ms + 3 * 3600000) : null, isAlert, isWarning, geo, ms, watch: geo ? parseWatch(title, msg, ms) : null };
}
const dayLabel = (ms) => new Date(ms).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace('.', '');
const clockIt = (ms) => new Date(ms).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });

async function sendToAll(db, payload) {
  // stesso avviso anche su Telegram, solo se abilitato dall'app (state/telegram)
  const p = JSON.parse(payload);
  await sendTelegram(db, [p.title, p.body, p.url].join('\n'));
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY.value());
  const subsSnap = await db.collection('pushSubscriptions').get();
  await Promise.all(subsSnap.docs.map(async (doc) => {
    try {
      await webpush.sendNotification(doc.data().subscription, payload);
    } catch (e) {
      // sottoscrizione scaduta o revocata: autopulizia, nessuna manutenzione manuale
      if (e && (e.statusCode === 404 || e.statusCode === 410)) await doc.ref.delete();
    }
  }));
}

const URL_ADESSO = 'https://bandellidavide.github.io/aurora-bande/#adesso';

// Tempesta G1+ (Kp>=5), due notizie separate:
//   «in corso» = ALERT, soglia raggiunta nel periodo di 3 ore attuale (dato misurato);
//   «attesa»   = WARNING ancora in vigore (NOAA se l'aspetta, ma non è ancora successo).
// Antirumore: ognuna parte solo quando supera il livello già notificato; un'attesa non parte se non supera ciò che è già in corso.
// Si azzera quando non c'è più né l'una né l'altra. Funzione pura: restituisce il nuovo stato (null = invariato) e i messaggi.
function stormNotices(parsed, now, st) {
  const topOf = (arr) => (arr.length ? arr.reduce((m, a) => (a.kp > m.kp ? a : m), arr[0]) : null);
  // un ALERT emesso a fine periodo (es. 17:58 per il periodo 15-18, visto il 10 ott) vale comunque 15 minuti: il giro ogni 5 minuti non lo perde
  const reached = topOf(parsed.filter((a) => a.geo && a.isAlert && a.kp != null && a.kp >= 5 && a.ms <= now && Math.max(a.periodEnd, a.ms + 15 * 60000) > now));
  const expected = topOf(parsed.filter((a) => a.geo && a.isWarning && a.kp != null && a.kp >= 5 && a.ms <= now && a.until != null && a.until > now));
  // lastNotifiedKp è il campo della versione precedente, che contava i WARNING: vale come «ultima attesa notificata»
  const lastReached = st.lastReachedKp || 0, lastExpected = st.lastExpectedKp != null ? st.lastExpectedKp : (st.lastNotifiedKp || 0);
  if (!reached && !expected) return { state: lastReached || lastExpected || st.lastNotifiedKp ? { lastReachedKp: 0, lastExpectedKp: 0 } : null, messages: [] };
  const sendReached = !!reached && reached.kp > lastReached;
  const sendExpected = !!expected && expected.kp > Math.max(lastExpected, lastReached, reached ? reached.kp : 0);
  if (!sendReached && !sendExpected) return { state: null, messages: [] };
  const messages = [];
  if (sendReached) {
    const g = reached.kp - 4;
    messages.push({
      title: 'NOAA: tempesta geomagnetica G' + g + ' in corso',
      body: 'NOAA conferma: soglia Kp ' + reached.kp + ' raggiunta alle ' + clockIt(reached.ms) + ' (ora italiana). Scala da G1 a G5: G' + g + ' = ' + G_WORDS[g] + '. L’aurora ' + G_PLAIN[g],
      url: URL_ADESSO,
    });
  }
  if (sendExpected) {
    const g = expected.kp - 4;
    messages.push({
      title: 'NOAA: tempesta geomagnetica G' + g + ' attesa',
      body: 'Previsione NOAA, non ancora in corso: avviso valido fino alle ' + clockIt(expected.until) + ' (ora italiana). Scala da G1 a G5: G' + g + ' = ' + G_WORDS[g] + '. L’aurora ' + G_PLAIN[g],
      url: URL_ADESSO,
    });
  }
  return { state: { lastReachedKp: sendReached ? reached.kp : lastReached, lastExpectedKp: sendExpected ? expected.kp : lastExpected, notifiedAt: now }, messages };
}
// solo per le prove in locale (index.js non lo esporta, quindi Firebase non lo vede)
exports._test = { parseAlert, stormNotices };

exports.noaaAlertsWatch = onSchedule({ schedule: 'every 5 minutes', timeZone: 'Europe/Rome', region: 'europe-west1', secrets: [VAPID_PRIVATE_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID] }, async () => {
  const resp = await fetch('https://services.swpc.noaa.gov/products/alerts.json');
  if (!resp.ok) return;
  const alerts = await resp.json();
  const now = Date.now();
  const parsed = Array.isArray(alerts) ? alerts.map(parseAlert) : [];
  const db = getFirestore();

  // 1) tempesta G1+ (Kp>=5): «in corso» (ALERT) e «attesa» (WARNING) sono due notizie diverse, vedi stormNotices()
  const stateRef = db.collection('state').doc('kpWatch');
  const stateSnap = await stateRef.get();
  const d = stormNotices(parsed, now, stateSnap.exists ? stateSnap.data() : {});
  // lo stato si scrive prima dell'invio: se l'invio fallisce a metà, al giro dopo non si rimanda tutto
  if (d.state) await stateRef.set(d.state);
  for (const m of d.messages) await sendToAll(db, JSON.stringify(m));

  // 2) WATCH: preavviso di una tempesta G1+ nei prossimi giorni. Si avvisa una volta per ogni «firma» (giorni + livello):
  // le riemissioni identiche non rimandano nulla, un WATCH che cambia (es. G1 -> G2, o un altro giorno) sì.
  const lastWatch = parsed.filter((a) => a.watch).sort((a, b) => b.ms - a.ms)[0];
  const days = lastWatch && !lastWatch.watch.cancel ? lastWatch.watch.days.filter((d) => d.g >= 1 && d.ms + 86400000 > now) : [];
  const sig = days.map((d) => new Date(d.ms).toISOString().slice(0, 10) + ':G' + d.g).join(',');
  const watchRef = db.collection('state').doc('watchWatch');
  const watchSnap = await watchRef.get();
  const lastSig = watchSnap.exists ? (watchSnap.data().sig || '') : '';
  if (!sig) { if (lastSig) await watchRef.set({ sig: '' }); return; }
  if (sig === lastSig) return;
  await watchRef.set({ sig, notifiedAt: now });
  const top = days.reduce((m, d) => (d.g > m.g ? d : m), days[0]);
  await sendToAll(db, JSON.stringify({
    title: 'NOAA: tempesta G' + top.g + ' prevista ' + dayLabel(top.ms),
    body: 'Scala da G1 a G5: G' + top.g + ' = ' + G_WORDS[top.g] + '. L’aurora ' + G_PLAIN[top.g] + ' Previsione NOAA, non ancora in corso.',
    url: URL_ADESSO,
  }));
});
