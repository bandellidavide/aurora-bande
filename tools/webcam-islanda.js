'use strict';
// Rigenera elenchi/webcam-islanda.json dall'elenco ufficiale delle webcam stradali di Vegagerðin (Islanda).
// Il loro server non permette la lettura dal browser, quindi l'app usa questa copia; le immagini restano in diretta dal loro server.
// Uso: node tools/webcam-islanda.js   (dalla cartella aurora-bande; Node 18 o superiore)
const fs = require('fs');
const path = require('path');

const SRC = 'https://gagnaveita.vegagerdin.is/api/vefmyndavelar2014_1';
// «til norðurs», «í norður», «séð norður», «… - norður», anche nord-est/nord-ovest; non i nomi di luogo (Norðdalur, Norðurárdalur)
const NORTH = /(?:\b(?:til|í|séð)\s+|[\s-]\s*)nor[ðd](?:ur|urs|vestur|vesturs|austur|austurs)\s*$|\b(?:til|í|séð)\s+nor[ðd](?:ur|urs|vestur|vesturs|austur|austurs)\b/i;
const ROAD_DOWN = /niður á veg/i;

(async () => {
  const res = await fetch(SRC, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const rows = await res.json();
  const byStation = new Map();
  for (const r of rows) {
    if (!r.Slod || !isFinite(r.Breidd) || !isFinite(r.Lengd)) continue;
    const k = r.Maelist_nr + '|' + r.Myndavel;
    if (!byStation.has(k)) byStation.set(k, []);
    byStation.get(k).push(r);
  }
  const cams = [];
  for (const views of byStation.values()) {
    const north = views.find((v) => NORTH.test(v.Skyring || ''));
    const pick = north || views.find((v) => !ROAD_DOWN.test(v.Skyring || '')) || views[0];
    cams.push({ name: pick.Myndavel + ' · Islanda', lat: +pick.Breidd.toFixed(5), lon: +pick.Lengd.toFixed(5), img: pick.Slod, view: (pick.Skyring || '').trim(), north: !!north });
  }
  cams.sort((a, b) => a.name.localeCompare(b.name, 'is'));
  const out = { source: 'Vegagerðin · ' + SRC, copied: new Date().toISOString().slice(0, 10), cams };
  const file = path.join(__dirname, '..', 'elenchi', 'webcam-islanda.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out) + '\n');
  console.log(cams.length + ' punti camera, ' + cams.filter((c) => c.north).length + ' con vista verso nord → ' + file);
})();
