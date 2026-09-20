# Aurora Bande

Osservatorio per la caccia all'aurora boreale: campo magnetico e vento solare misurati a L1, arrivo stimato
degli episodi di Bz sud, risposta dei magnetometri a terra, cielo (nuvole, buio, luna), webcam, brillamenti,
CME e previsioni NOAA. Descrive **possibilità**, non promette aurore.

Progetto e fotografia di **Davide Bandelli** — [@davidebandelli](https://www.instagram.com/davidebandelli/)

Si può usare nel browser e **installare come app** (Chrome: icona di installazione nella barra degli indirizzi, oppure
il pulsante «Installa l'app» in fondo alla pagina).

## Come è fatto

Una pagina statica, senza build e senza librerie da installare:

```
index.html              guscio: testata, navigazione, cinque schede, fogli
css/                    token del design system e stili
js/                     stato e utilità, dati L1, magnetometri, cielo, NOAA, avvisi, grafici, quadro d'insieme, crediti, interfaccia
manifest.webmanifest    installazione come app
sw.js                   service worker: guscio in cache, dati sempre dalla rete
icons/                  icone dell'app
versione-precedente/    le due pagine di prima (Ora · L1→Terra e Sole & NOAA)
sole-noaa.html          rimanda alla scheda «Giorni»
scripts/                aggiornamento dei dati dei magnetometri
aurora-server.py        server locale opzionale (dati dei magnetometri al minuto)
```

Le regole di calcolo (soglie, margine d'arrivo, quadro d'insieme) e le fonti sono descritte nel foglio «Come è calcolato»
e «Fonti e crediti» dentro l'app. **Se aggiungi una fonte, una camera o un'API, aggiungila in `js/credits.js`** e metti la
riga «Dati: …» accanto al grafico che la usa. Se aggiungi o togli un file dell'app, aggiorna `SHELL` e `VERSION` in `sw.js`
(il workflow controlla che ogni file elencato esista).

## Fonti dei dati

NOAA SWPC, rete IMAGE (FMI), NASA DONKI, NASA/SDO tramite Helioviewer, Open-Meteo (uso non commerciale), Fintraffic,
OpenStreetMap, camere di FMI, IRF, UiT, UNIS, Univ. Calgary e Landhotel. Licenze e formule di credito: foglio «Fonti e crediti».

## Confronto numerico col magnetometro

I dati della rete IMAGE non hanno header CORS, quindi il browser non può leggerli in diretta da un sito online. Il sito pubblico
li legge da `data/ground/<STAZIONE>.json`, rigenerato ogni 5 minuti da un workflow di GitHub Actions
(`.github/workflows/pages.yml` + `scripts/update_ground_data.py`) che scarica i dati da FMI e ripubblica il sito.

**Nota**: GitHub disabilita i workflow schedulati dopo 60 giorni senza commit sul repo. Se il magnetometro smette di
aggiornarsi dopo una lunga pausa, basta un push su `main` (o «Run workflow» nella tab Actions).

Chi lavora in locale può avviare `aurora-server.py` (Python 3, nessuna dipendenza) nella cartella del progetto:

```
python aurora-server.py
```

poi aprire `http://127.0.0.1:8866/`: la pagina lo rileva e usa i dati dei magnetometri al minuto. Il server serve anche
css, js, icone e le pagine precedenti.

## Pubblicare

Il sito si pubblica con GitHub Actions: un push su `main` ricostruisce e ripubblica tutto in un paio di minuti.

## Licenza

Uso personale. Le fotografie sono di Davide Bandelli, tutti i diritti riservati. I dati e le immagini appartengono ai
rispettivi titolari (vedi «Fonti e crediti»).
