'use strict';
// Aurora Bande · functions — iscrizione/cancellazione alle notifiche push.
// Il client manda la PushSubscription creata dal browser (endpoint + chiavi): qui si salva
// solo quello, niente altro, in Firestore. Le regole di Firestore bloccano l'accesso diretto:
// solo queste funzioni (Admin SDK) possono leggere o scrivere la collezione.

const { onRequest } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');
const { initializeApp, getApps } = require('firebase-admin/app');
const crypto = require('crypto');

if (!getApps().length) initializeApp();

const ORIGIN = 'https://bandellidavide.github.io';
const REGION = 'europe-west1';

function withCors(res) {
  res.set('Access-Control-Allow-Origin', ORIGIN);
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
}

// id del documento = hash dell'endpoint: stesso dispositivo che si iscrive due volte sovrascrive, non duplica
function idFor(endpoint) { return crypto.createHash('sha256').update(endpoint).digest('hex'); }

function validSubscription(s) {
  return !!s && typeof s.endpoint === 'string' && s.endpoint.length > 0 && s.endpoint.length < 2000 &&
    !!s.keys && typeof s.keys.p256dh === 'string' && typeof s.keys.auth === 'string';
}

exports.pushSubscribe = onRequest({ region: REGION, cors: false }, async (req, res) => {
  withCors(res);
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'POST') { res.status(405).send('Metodo non consentito'); return; }
  const sub = req.body && req.body.subscription;
  if (!validSubscription(sub)) { res.status(400).send('Sottoscrizione non valida'); return; }
  await getFirestore().collection('pushSubscriptions').doc(idFor(sub.endpoint)).set({ subscription: sub, savedAt: Date.now() });
  res.status(204).send('');
});

exports.pushUnsubscribe = onRequest({ region: REGION, cors: false }, async (req, res) => {
  withCors(res);
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'POST') { res.status(405).send('Metodo non consentito'); return; }
  const endpoint = req.body && req.body.endpoint;
  if (typeof endpoint !== 'string' || !endpoint) { res.status(400).send('Endpoint mancante'); return; }
  await getFirestore().collection('pushSubscriptions').doc(idFor(endpoint)).delete();
  res.status(204).send('');
});
