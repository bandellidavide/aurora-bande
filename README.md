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

## Confronto numerico col magnetometro (opzionale)

I dati del magnetometro terrestre (rete FMI IMAGE) non hanno header CORS, quindi il
browser non può leggerli direttamente da un sito online. Sulla pagina pubblica questa
sezione mostra "dati insufficienti" — il resto del sito funziona comunque normalmente.

Per il confronto numerico completo, scarica anche `aurora-server.py` e avvialo con
Python 3 nella stessa cartella di `index.html`, poi apri `http://127.0.0.1:8866/`:

```
python aurora-server.py
```

## Aggiornare il sito

Sostituisci `index.html` con la versione nuova e fai commit: GitHub Pages si aggiorna
da solo in un paio di minuti.

## Licenza

Uso personale. Le fotografie sono di Davide Bandelli, tutti i diritti riservati.
I dati appartengono ai rispettivi enti pubblici che li distribuiscono.
