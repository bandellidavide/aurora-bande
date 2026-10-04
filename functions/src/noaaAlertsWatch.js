'use strict';
// Aurora Bande · functions — controlla da sola le allerte geomagnetiche di NOAA, ogni 5 minuti,
// e manda una notifica push (vera, anche ad app chiusa) quando ne arriva una nuova G1 o superiore.
// Antirumore: NOAA riemette/estende lo stesso avviso più volte in poche ore (visto nei dati reali) —
// si avvisa solo quando il livello sale oltre l'ultimo notificato, stesso principio di stepLevel()
// in js/alerts.js lato client (soglia + passo), non a ogni riemissione dello stesso avviso.

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const { getFirestore } = require('firebase-admin/firestore');
const { initializeApp, getApps } = require('firebase-admin/app');
const webpush = require('web-push');

if (!getApps().length) initializeApp();

const VAPID_PRIVATE_KEY = defineSecret('VAPID_PRIVATE_KEY');
// pubblica: sicura da esporre, è la stessa usata dal client in js/pwa.js
const VAPID_PUBLIC_KEY = 'BIrpeVr4OBEcorrIjunS5xWH9bHZyjcxRMTKmctUKQuXIFZ2z8sfoN98AZLOmFxIpBUVHxFW1WyTqbM9rqCYI2I';
const VAPID_SUBJECT = 'mailto:bandelli.davide@gmail.com';
const G_WORDS = ['nessuna', 'minore', 'moderata', 'forte', 'severa', 'estrema'];

const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

// stessa estrazione di js/noaa.js (parseAlert/parseAlertUntil): se le soglie cambiano là, aggiornare anche qui.
function parseUntil(msg) {
  const m = /(?:Now Valid Until|Valid To):\s*(\d{4}) (\w{3}) (\d{1,2}) (\d{2})(\d{2}) UTC/.exec(msg);
  return m ? Date.UTC(+m[1], MONTHS[m[2]], +m[3], +m[4], +m[5]) : null;
}
function parseAlert(a) {
  const msg = (a.message || '').replace(/\r/g, '');
  const title = msg.split('\n').map((s) => s.trim()).find((s) => /^(EXTENDED )?(ALERT|WARNING|WATCH|SUMMARY|CONTINUED ALERT)\b/i.test(s)) || '';
  const kp = /K-index of (\d)/i.exec(title);
  const geo = /Geomagnetic|K-index/i.test(title);
  return { kp: kp ? +kp[1] : null, until: parseUntil(msg), geo };
}

exports.noaaAlertsWatch = onSchedule({ schedule: 'every 5 minutes', timeZone: 'Europe/Rome', region: 'europe-west1', secrets: [VAPID_PRIVATE_KEY] }, async () => {
  const resp = await fetch('https://services.swpc.noaa.gov/products/alerts.json');
  if (!resp.ok) return;
  const alerts = await resp.json();
  const now = Date.now();
  // solo allerte geomagnetiche G1+ (Kp>=5) con una finestra di validità dichiarata da NOAA ancora in corso
  const active = (Array.isArray(alerts) ? alerts.map(parseAlert) : [])
    .filter((a) => a.geo && a.kp != null && a.kp >= 5 && a.until != null && a.until > now);
  const maxKp = active.length ? Math.max(...active.map((a) => a.kp)) : 0;

  const db = getFirestore();
  const stateRef = db.collection('state').doc('kpWatch');
  const stateSnap = await stateRef.get();
  const lastNotifiedKp = stateSnap.exists ? (stateSnap.data().lastNotifiedKp || 0) : 0;

  if (maxKp < 5) { if (lastNotifiedKp !== 0) await stateRef.set({ lastNotifiedKp: 0 }); return; }
  if (maxKp <= lastNotifiedKp) return; // livello già notificato: non rispammare sulle riemissioni NOAA

  await stateRef.set({ lastNotifiedKp: maxKp, notifiedAt: now });

  const g = Math.max(0, maxKp - 4);
  const payload = JSON.stringify({
    title: 'NOAA: tempesta geomagnetica G' + g,
    body: 'Kp atteso ' + maxKp + ' · ' + G_WORDS[g] + '. Dato ufficiale NOAA, non una stima.',
    url: 'https://bandellidavide.github.io/aurora-bande/#adesso',
  });

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
});
