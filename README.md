# Aurora Bande

Dashboard personale per la caccia all'aurora boreale: vento solare, campo magnetico
interplanetario, potenza dell'ovale aurorale, magnetometri in tempo reale, meteo e
punti di osservazione — tutto in una pagina sola.

Progetto e fotografia di **Davide Bandelli** — [@davidebandelli](https://www.instagram.com/davidebandelli/)

## Come funziona

È un singolo file HTML senza dipendenze da installare: `index.html`.
Tutto il CSS, il JavaScript e le immagini sono dentro al file.

Dati in tempo reale da:

- **NOAA SWPC** — vento solare, campo magnetico (satelliti a L1), indice Kp, modello OVATION,
  potenza emisferica, brillamenti solari, bollettini
- **Open-Meteo** — previsioni meteo e ricerca delle località
- **Rete IMAGE / Istituto Meteorologico Finlandese** — magnetometri in tempo reale
- **OpenStreetMap / Overpass** — punti panoramici vicini

## Confronto numerico col magnetometro

I dati del magnetometro terrestre (rete FMI IMAGE) non hanno header CORS, quindi il
browser non può leggerli in diretta da un sito online. Il sito pubblico li legge invece
da `data/ground/<STAZIONE>.json`, rigenerato ogni 5 minuti da un workflow di GitHub
Actions (`.github/workflows/pages.yml` + `scripts/update_ground_data.py`) che scarica i
dati da FMI e ripubblica il sito — non serve nessuna azione manuale.

**Nota**: GitHub disabilita automaticamente i workflow schedulati dopo 60 giorni senza
commit sul repo. Se il magnetometro smette di aggiornarsi dopo una lunga pausa, basta
un push qualsiasi su `main` per riattivarlo (o "Run workflow" nella tab Actions).

Chi lavora sul codice in locale può anche avviare `aurora-server.py` (Python 3, nessuna
dipendenza) nella stessa cartella di `index.html` per dati live al minuto invece che al
refresh dei 5 minuti:

```
python aurora-server.py
```

poi aprire `http://127.0.0.1:8866/` — la pagina lo rileva automaticamente e lo preferisce
al file statico.

## Aggiornare il sito

Il sito su GitHub Pages si pubblica tramite GitHub Actions (non più dal branch
direttamente): basta un push su `main` con `index.html` aggiornato e il workflow
ricostruisce e ripubblica tutto in un paio di minuti.

## Licenza

Uso personale. Le fotografie sono di Davide Bandelli, tutti i diritti riservati.
I dati appartengono ai rispettivi enti pubblici che li distribuiscono.
