'use strict';
// Aurora Bande · functions — interruttore delle notifiche Telegram, dal foglio «Avvisi» dell'app.
// L'app è pubblica: per non lasciare che chiunque accenda o spenga le notifiche di un'altra persona, serve un codice
// (secret TELEGRAM_TOGGLE_CODE) che si inserisce una volta per dispositivo. Spento di default.

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { getFirestore } = require('firebase-admin/firestore');
const { initializeApp, getApps } = require('firebase-admin/app');
const crypto = require('crypto');
const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, postMessage, telegramEnabled } = require('./telegramSend');

if (!getApps().length) initializeApp();

const TELEGRAM_TOGGLE_CODE = defineSecret('TELEGRAM_TOGGLE_CODE');
const ORIGIN = 'https://bandellidavide.github.io';

const sameCode = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a || '')).digest(), y = crypto.createHash('sha256').update(String(b || '')).digest();
  return crypto.timingSafeEqual(x, y);
};

exports.telegramToggle = onRequest({ region: 'europe-west1', cors: false, secrets: [TELEGRAM_TOGGLE_CODE, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID] }, async (req, res) => {
  res.set('Access-Control-Allow-Origin', ORIGIN);
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'POST') { res.status(405).send('Metodo non consentito'); return; }
  const b = req.body || {};
  if (!sameCode(b.code, TELEGRAM_TOGGLE_CODE.value())) { res.status(403).json({ error: 'codice' }); return; }
  const db = getFirestore(), ref = db.collection('state').doc('telegram');
  if (b.action === 'set') {
    const enabled = b.enabled === true, was = await telegramEnabled(db);
    await ref.set({ enabled, changedAt: Date.now() }, { merge: true });
    if (enabled && !was) await postMessage('Notifiche Telegram di Aurora Bande attive. Ti avviso quando NOAA conferma una tempesta geomagnetica G1 o superiore, o ne prevede una (WATCH). Per spegnerle: Avvisi nell’app.');
    else if (!enabled && was) await postMessage('Notifiche Telegram di Aurora Bande spente. Per riaccenderle: Avvisi nell’app.');
  }
  res.json({ enabled: await telegramEnabled(db) });
});
