# Come mettere online Aurora Bande con GitHub Pages

Tempo richiesto: circa 10 minuti la prima volta. È gratis e non scade.
Alla fine avrai un indirizzo tipo `https://tuonome.github.io/aurora-bande/` da mandare a chiunque.

---

## 1. Crea l'account GitHub (solo la prima volta)

Vai su **github.com** e registrati. Serve solo una email e una password.
Scegli con attenzione il **nome utente**: finirà dentro l'indirizzo del sito.
Qualcosa come `davidebandelli` o `aurorabande` funziona bene.

> Devo fartelo notare: l'account devi crearlo tu di persona, non posso farlo io al posto tuo.

---

## 2. Crea il repository

1. In alto a destra clicca **+** → **New repository**
2. **Repository name**: `aurora-bande`
3. Lascia la descrizione vuota o scrivi «Dashboard per la caccia all'aurora boreale»
4. Seleziona **Public** ← obbligatorio, altrimenti GitHub Pages non funziona sul piano gratuito
5. **Non** spuntare «Add a README file» (ce l'hai già)
6. Clicca **Create repository**

---

## 3. Carica i file

Nella pagina che si apre, clicca **uploading an existing file** (il link nel testo grigio).

Trascina dentro **tutti e tre** i file della cartella `aurora-bande-sito`:

- `index.html` ← questo è il sito vero e proprio, il nome deve restare esattamente così
- `README.md`
- `GUIDA-PUBBLICAZIONE.md`

In fondo alla pagina clicca **Commit changes**.

---

## 4. Accendi GitHub Pages

1. Nel repository, vai su **Settings** (in alto)
2. Nel menu di sinistra, **Pages**
3. Sotto **Source** scegli **Deploy from a branch**
4. **Branch**: `main`, cartella `/ (root)`
5. **Save**

Aspetta 1-2 minuti, poi ricarica la pagina: in cima comparirà l'indirizzo del sito.
Sarà **`https://tuonome.github.io/aurora-bande/`**.

Quello è il link da condividere.

---

## 5. Aggiornare il sito in futuro

Quando ti mando una versione nuova:

1. Apri il repository su GitHub
2. Clicca su `index.html`
3. Clicca l'icona della matita (**Edit**) — oppure **Add file → Upload files** e trascina il nuovo `index.html` sopra il vecchio
4. **Commit changes**

Il sito si aggiorna da solo in un paio di minuti. L'indirizzo non cambia mai.

---

## Cosa migliora rispetto al file sul PC

Non è solo comodità di condivisione — la pagina funziona proprio meglio online:

- **La apri dal telefono mentre sei fuori.** Questa è la differenza vera: la dashboard è
  già pensata per lo schermo del telefono, e in macchina o sul posto ti serve lì, non a casa.
- **Le notifiche del browser funzionano davvero.** Da `file://` molti browser le bloccano.
  Da un sito `https` no: gli alert sul Bz sud ti arrivano sul serio.
- **Le impostazioni delle allerte restano salvate** in modo affidabile, cosa che da file locale
  è capricciosa.
- **La condividi con i clienti** prima di un'uscita: vedono da soli perché quella notte sì
  e un'altra no. Per una guida è un bel biglietto da visita.

---

## Due avvertenze oneste

**Il link è pubblico.** Chiunque ce l'abbia può aprirlo, e Google col tempo potrebbe indicizzarlo.
Nella pagina non c'è nulla di privato — la tua foto e il tuo Instagram ci sono apposta — ma tienilo
presente prima di aggiungerci in futuro cose tipo i tuoi punti segreti di ripresa.

**Le fonti dati sono servizi pubblici gratuiti.** NOAA e Open-Meteo reggono tranquillamente
il traffico di una pagina personale. Il servizio Overpass (i punti panoramici) è quello più
delicato: se un giorno il sito avesse tanti visitatori, quella funzione andrebbe messa dietro
un bottone invece che caricata in automatico. Per ora non è un problema, ma se il sito gira
dimmelo e la sistemo.

---

## Poi, se vuoi un indirizzo tuo

Un dominio tipo `aurorabande.it` costa sui 15 euro l'anno e si collega a GitHub Pages
in pochi minuti (Settings → Pages → Custom domain). Se decidi di comprarlo ti guido io
nella configurazione dei DNS.
