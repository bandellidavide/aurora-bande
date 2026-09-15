#!/usr/bin/env python3
"""Scarica i dati del magnetometro FMI IMAGE e li salva come JSON statici.

Eseguito da GitHub Actions ogni pochi minuti (vedi .github/workflows/pages.yml)
cosi' il sito pubblico puo' leggere data/ground/<STAZIONE>.json invece di aver
bisogno del proxy locale aurora-server.py. Stessa logica di parsing di
aurora-server.py, tenuta separata perche' gira in un contesto diverso (CI, non
un server long-running).
"""
from pathlib import Path
from urllib.request import urlopen, Request
from datetime import datetime, timezone
import json
import math
import re

STATIONS = ['KEV', 'MAS', 'KIL', 'IVA', 'MUO', 'PEL', 'RAN', 'OUJ', 'HAN', 'NUR']
OUT_DIR = Path(__file__).resolve().parent.parent / 'data' / 'ground'


def parse_fmi(text, expected_station):
    """Keep finite X/Y/Z samples; require an X/Y/Z header (FMI uses instrument
    codes that don't always match the station code, e.g. NUR is reported as NU3)."""
    rows = text.splitlines()
    if not rows or not re.search(r'\bX\b.*\bY\b.*\bZ\b', rows[0]):
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


def fetch_station(station):
    url = f'https://space.fmi.fi/image/realtime/UT/{station}/{station}data_24.txt'
    with urlopen(Request(url, headers={'User-Agent': 'aurora-bande-actions/1.0'}), timeout=20) as response:
        text = response.read(2_000_000).decode('utf-8')
    samples = parse_fmi(text, station)
    return {
        'station': station,
        'samples': samples,
        'fetchedAt': datetime.now(timezone.utc).isoformat(),
        'source': 'FMI IMAGE',
        'sourceUrl': url,
        'license': 'CC BY 4.0',
    }


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ok = 0
    for station in STATIONS:
        try:
            payload = fetch_station(station)
        except Exception as exc:
            print(f'{station}: errore ({exc})')
            continue
        if not payload['samples']:
            print(f'{station}: nessun campione valido, salto')
            continue
        (OUT_DIR / f'{station}.json').write_text(json.dumps(payload, allow_nan=False), encoding='utf-8')
        print(f'{station}: {len(payload["samples"])} campioni')
        ok += 1
    if ok == 0:
        raise SystemExit('Nessuna stazione ha prodotto dati validi')


if __name__ == '__main__':
    main()
