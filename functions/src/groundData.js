'use strict';
// Aurora Bande · functions — magnetometri FMI IMAGE in tempo reale.
// FMI aggiorna i file ogni pochi secondi ma non permette la lettura diretta dal browser (niente CORS), e il cron di GitHub
// che li copiava sul sito «ogni 5 minuti» in pratica gira ogni 2-5 ore (verificato il 17 ott 2026): qui la funzione li legge
// da FMI e li restituisce all'app. Stesso formato e stessa logica di scripts/update_ground_data.py (medie al minuto di X/Y/Z,
// con almeno 3 dei 6 campioni da 10 secondi), tenuta allineata a mano.
// ?station=KIL → ultime 24 ore; &since=<ms> → solo i minuti successivi (l'app chiede solo il nuovo a ogni aggiornamento).

const { onRequest } = require('firebase-functions/v2/https');
const zlib = require('zlib');

const STATIONS = ['KEV', 'MAS', 'KIL', 'IVA', 'MUO', 'PEL', 'RAN', 'OUJ', 'HAN', 'NUR'];
const ORIGINS = ['https://bandellidavide.github.io', 'http://localhost:8124', 'http://127.0.0.1:8124'];
const CACHE_MS = 60 * 1000; // FMI non serve chiederlo più di una volta al minuto per stazione
const cache = {};

function parseFmi(text) {
  const rows = text.split('\n');
  if (!rows.length || !/\bX\b.*\bY\b.*\bZ\b/.test(rows[0])) throw new Error('Intestazione IMAGE non riconosciuta');
  const buckets = new Map();
  for (const line of rows.slice(2)) {
    const c = line.trim().split(/\s+/);
    if (c.length !== 9) continue;
    const n = c.map(Number);
    if (n.some((x) => !isFinite(x))) continue;
    const xyz = n.slice(6, 9);
    if (xyz.some((v) => Math.abs(v) >= 90000)) continue;
    const minute = Math.floor(Date.UTC(n[0], n[1] - 1, n[2], n[3], n[4], n[5]) / 60000) * 60000;
    if (!buckets.has(minute)) buckets.set(minute, []);
    buckets.get(minute).push(xyz);
  }
  return [...buckets.entries()].sort((a, b) => a[0] - b[0]).filter(([, v]) => v.length >= 3)
    .map(([m, v]) => [m, ...[0, 1, 2].map((i) => Math.round(v.reduce((s, x) => s + x[i], 0) / v.length * 10) / 10)]);
}

async function stationData(st) {
  const hit = cache[st];
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.payload;
  const url = 'https://space.fmi.fi/image/realtime/UT/' + st + '/' + st + 'data_24.txt';
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'aurora-bande-functions/1.0' }, signal: ctl.signal });
    if (!res.ok) throw new Error('FMI HTTP ' + res.status);
    const samples = parseFmi(await res.text());
    if (!samples.length) throw new Error('Nessun campione valido');
    const payload = { station: st, samples, fetchedAt: new Date().toISOString(), source: 'FMI IMAGE', sourceUrl: url, license: 'CC BY 4.0' };
    cache[st] = { at: Date.now(), payload };
    return payload;
  } finally { clearTimeout(timer); }
}

exports.groundData = onRequest({ region: 'europe-west1', cors: false, maxInstances: 3, memory: '256MiB', timeoutSeconds: 30 }, async (req, res) => {
  const origin = req.get('Origin');
  if (ORIGINS.includes(origin)) res.set('Access-Control-Allow-Origin', origin);
  res.set('Vary', 'Origin');
  if (req.method === 'OPTIONS') { res.set('Access-Control-Allow-Methods', 'GET'); res.status(204).send(''); return; }
  if (req.method !== 'GET') { res.status(405).send('Metodo non consentito'); return; }
  const st = String(req.query.station || '').toUpperCase();
  if (!STATIONS.includes(st)) { res.status(400).json({ error: 'stazione' }); return; }
  try {
    const p = await stationData(st), since = Number(req.query.since);
    const out = isFinite(since) && since > 0 ? { ...p, samples: p.samples.filter((s) => s[0] > since), partial: true } : p;
    const body = JSON.stringify(out);
    res.set('Cache-Control', 'no-store');
    res.set('Content-Type', 'application/json; charset=utf-8');
    if (/\bgzip\b/.test(req.get('Accept-Encoding') || '')) { res.set('Content-Encoding', 'gzip'); res.send(zlib.gzipSync(body)); }
    else res.send(body);
  } catch (e) {
    res.status(502).json({ error: 'fmi', detail: String(e && e.message || e).slice(0, 200) });
  }
});
