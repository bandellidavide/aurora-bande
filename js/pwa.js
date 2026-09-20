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
