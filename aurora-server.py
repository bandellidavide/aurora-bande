#!/usr/bin/env python3
"""Aurora Bande: aprire il file con Python 3 nella stessa cartella dell'HTML.
Servizio solo locale: http://127.0.0.1:8866/. Nessun pacchetto da installare.
Dati: FMI IMAGE, CC BY 4.0. https://space.fmi.fi/image/realtime/UT/
"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
from urllib.request import urlopen, Request
from datetime import datetime, timezone
import json
import math
import re
import threading
import time
import webbrowser

STATIONS = {'KEV', 'MAS', 'KIL', 'IVA', 'MUO', 'PEL', 'RAN', 'OUJ', 'HAN', 'NUR'}
HTML_FILE = Path(__file__).resolve().with_name('aurora-bande.html')
_CACHE = {}
_LOCK = threading.Lock()

def parse_fmi(text, expected_station):
    """Keep finite X/Y/Z samples; require the documented station header."""
    rows = text.splitlines()
    if not rows or f'{expected_station} X' not in rows[0]:
        raise ValueError('Intestazione IMAGE non riconosciuta per la stazione richiesta')
    buckets = {}
    for line in rows[2:]:
        cells = line.split()
        if len(cells) != 9:
            continue
        try:
            stamp = datetime(*map(int, cells[:6]), tzinfo=timezone.utc).timestamp()
            xyz = list(map(float, cells[6:9]))
            if not all(math.isfinite(v) and abs(v) < 90000 for v in xyz):
                continue
            minute = int(stamp // 60) * 60000
            buckets.setdefault(minute, []).append(xyz)
        except (ValueError, OverflowError):
            continue
    # Minute means require at least three of the expected six 10-second samples.
    return [[minute] + [sum(v[i] for v in vals) / len(vals) for i in range(3)]
            for minute, vals in sorted(buckets.items()) if len(vals) >= 3]

def ground_payload(station):
    with _LOCK:
        entry = _CACHE.get(station)
        if entry and time.monotonic() - entry[0] < 60:
            return entry[1]
    url = f'https://space.fmi.fi/image/realtime/UT/{station}/{station}data_24.txt'
    with urlopen(Request(url, headers={'User-Agent': 'Aurora-Bande-local/1.0'}), timeout=12) as response:
        text = response.read(2_000_000).decode('utf-8')
    samples = parse_fmi(text, station)
    if not samples:
        raise ValueError('Nessun campione IMAGE valido')
    payload = {'station': station, 'samples': samples,
               'fetchedAt': datetime.now(timezone.utc).isoformat(),
               'source': 'FMI IMAGE', 'sourceUrl': url, 'license': 'CC BY 4.0'}
    with _LOCK:
        _CACHE[station] = (time.monotonic(), payload)
    return payload

def magnetogram(station, hours):
    if station not in STATIONS or hours not in {'01', '02', '06', '24'}:
        raise ValueError('Stazione o intervallo non supportati')
    key = (station, hours)
    with _LOCK:
        cached = _CACHE.get(key)
        if cached and time.monotonic() - cached[0] < 60:
            return cached[1]
    base = f'https://space.fmi.fi/image/realtime/UT/{station}/'
    with urlopen(Request(base + f'XYZlast{hours}.html', headers={'User-Agent': 'Aurora-Bande-local/1.0'}), timeout=12) as response:
        page = response.read(100_000).decode('utf-8')
    match = re.search(r'<img\s+[^>]*src=["\'](XYZ_\d{14}_' + hours + r'\.jpg)["\']', page, re.IGNORECASE)
    if not match:
        raise ValueError('Immagine FMI non trovata')
    with urlopen(Request(base + match.group(1), headers={'User-Agent': 'Aurora-Bande-local/1.0'}), timeout=12) as response:
        image = response.read(5_000_000)
    if not image.startswith(b'\xff\xd8'):
        raise ValueError('Immagine non valida')
    with _LOCK:
        _CACHE[key] = (time.monotonic(), image)
    return image

class Handler(BaseHTTPRequestHandler):
    def reply(self, status, body, content_type):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        # Prevent DNS rebinding; accept only this local service's hostnames.
        host = self.headers.get('Host', '')
        if host not in {'127.0.0.1:8866', 'localhost:8866'}:
            self.reply(403, b'Host non consentito', 'text/plain; charset=utf-8')
            return
        route = urlsplit(self.path)
        if route.path in {'/', '/aurora-bande.html'}:
            if HTML_FILE.is_file():
                self.reply(200, HTML_FILE.read_bytes(), 'text/html; charset=utf-8')
            else:
                self.reply(404, b'Metti aurora-bande.html nella stessa cartella del file Python.', 'text/plain; charset=utf-8')
        elif route.path == '/_aurora/magnetogram':
            query = parse_qs(route.query)
            station = query.get('station', [''])[0]
            hours = query.get('hours', ['02'])[0]
            if station not in STATIONS or hours not in {'01', '02', '06', '24'}:
                self.reply(400, b'Stazione o intervallo non validi', 'text/plain; charset=utf-8')
                return
            try:
                self.reply(200, magnetogram(station, hours), 'image/jpeg')
            except Exception:
                self.reply(502, b'Magnetogramma FMI temporaneamente non disponibile', 'text/plain; charset=utf-8')
        elif route.path == '/_aurora/ground':
            station = parse_qs(route.query).get('station', [''])[0]
            if station not in STATIONS:
                self.reply(400, b'Stazione non supportata', 'text/plain; charset=utf-8')
                return
            try:
                body = json.dumps(ground_payload(station), allow_nan=False).encode()
                self.reply(200, body, 'application/json; charset=utf-8')
            except Exception:
                self.reply(502, b'{"error":"Dati numerici FMI temporaneamente non disponibili"}', 'application/json; charset=utf-8')
        else:
            self.reply(404, b'Not found', 'text/plain; charset=utf-8')

if __name__ == '__main__':
    print('Aurora Bande · http://127.0.0.1:8866/')
    print('Lascia aperta questa finestra. Premi Ctrl+C per chiudere.')
    try:
        server = ThreadingHTTPServer(('127.0.0.1', 8866), Handler)
        threading.Timer(0.4, lambda: webbrowser.open('http://127.0.0.1:8866/')).start()
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    except OSError as exc:
        print(f'Impossibile avviare il servizio: {exc}')
