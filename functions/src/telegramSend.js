'use strict';
// Aurora Bande · functions — invio di messaggi Telegram, solo se l'utente li ha abilitati.
// Il bot (AuroraBandebot) è solo in invio: la ricezione dei messaggi è del plugin Claude Code, che fa il polling con lo stesso token.
// Un secondo programma che facesse getUpdates o un webhook andrebbe in conflitto: qui si usa solo sendMessage.

const { defineSecret } = require('firebase-functions/params');

const TELEGRAM_BOT_TOKEN = defineSecret('TELEGRAM_BOT_TOKEN');
const TELEGRAM_CHAT_ID = defineSecret('TELEGRAM_CHAT_ID');

async function postMessage(text) {
  const res = await fetch('https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN.value() + '/sendMessage', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID.value(), text, disable_web_page_preview: true }),
  });
  return res.ok;
}

// stato «abilitato» in Firestore (state/telegram): spento di default, lo accende solo chi ha il codice, dall'app
async function telegramEnabled(db) {
  const snap = await db.collection('state').doc('telegram').get();
  return snap.exists && snap.data().enabled === true;
}

// manda solo se abilitato; mai far fallire l'avviso principale (push) per un errore di Telegram
async function sendTelegram(db, text) {
  try { if (await telegramEnabled(db)) await postMessage(text); } catch (e) { console.error('Telegram non inviato:', e && e.message); }
}

module.exports = { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, postMessage, telegramEnabled, sendTelegram };
