'use strict';
// Aurora Bande · new version — installazione come app (Chrome sul desktop e sul telefono) e uso senza rete.
// Il pulsante «Installa l'app» compare nel piè di pagina solo quando il browser la ritiene installabile.

S.installEvt = null;
window.addEventListener('beforeinstallprompt', (ev) => { ev.preventDefault(); S.installEvt = ev; if (typeof renderSoon === 'function') renderSoon(); });
window.addEventListener('appinstalled', () => { S.installEvt = null; if (typeof renderSoon === 'function') renderSoon(); });

async function installApp() {
  const ev = S.installEvt; if (!ev) return;
  ev.prompt();
  try { await ev.userChoice; } catch (e) { /* scelta annullata */ }
  S.installEvt = null; if (typeof renderSoon === 'function') renderSoon();
}

// service worker solo su http(s) (non da file://) e non con il server locale di sviluppo, che cambia file di continuo
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').then(() => diagSet('App installabile (service worker)', 'ok', 'attivo'), (e) => diagSet('App installabile (service worker)', 'err', String(e && e.message || e))); });
}

// ============================ notifiche push vere (anche ad app chiusa) ============================
// Chiave pubblica VAPID: sicura da esporre, deve combaciare con quella in functions/src/noaaAlertsWatch.js.
const PUSH_VAPID_PUBLIC_KEY = 'BIrpeVr4OBEcorrIjunS5xWH9bHZyjcxRMTKmctUKQuXIFZ2z8sfoN98AZLOmFxIpBUVHxFW1WyTqbM9rqCYI2I';
const PUSH_API_BASE = 'https://europe-west1-aurora-bande.cloudfunctions.net';

function urlBase64ToUint8Array(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function pushSupported() { return 'serviceWorker' in navigator && 'PushManager' in window && window.isSecureContext; }

// stato reale, non un nostro flag: la sottoscrizione del browser è la fonte di verità, non si riazzera da sola
async function pushStatus() {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub ? 'on' : 'off';
  } catch (e) { return 'off'; }
}

async function pushSubscribe() {
  if (!pushSupported()) return 'Le notifiche push non sono disponibili su questo browser.';
  try {
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (perm !== 'granted') return 'Notifiche non consentite: niente push senza il permesso del browser.';
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(PUSH_VAPID_PUBLIC_KEY) });
    const res = await fetch(PUSH_API_BASE + '/pushSubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON() }) });
    if (!res.ok) return 'Iscrizione salvata sul telefono, ma il server non ha risposto: riprova tra poco.';
    return 'Notifiche push attive: arriveranno anche ad app chiusa quando NOAA conferma una tempesta.';
  } catch (e) { return 'Iscrizione non riuscita: ' + (e && e.message ? e.message : String(e)); }
}

async function pushUnsubscribe() {
  if (!pushSupported()) return 'ok';
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return 'ok';
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    fetch(PUSH_API_BASE + '/pushUnsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint }) }).catch(() => {});
    return 'ok';
  } catch (e) { return 'err'; }
}
