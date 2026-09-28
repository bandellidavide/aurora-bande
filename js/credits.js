'use strict';
// Aurora Bande · new version — fonti, licenze e crediti.
// Ogni voce riporta cosa viene usato, con quale licenza e la formula di credito richiesta dal titolare.
// Se aggiungi una fonte nuova (una camera, un'API), aggiungila qui: è l'unico posto da aggiornare per il foglio «Fonti e crediti».

const CREDITS = [
  {
    name: 'NOAA · Space Weather Prediction Center (SWPC)',
    uses: 'Campo magnetico e vento solare a L1, ovale aurorale (OVATION) e potenza emisferica, previsione a 3 giorni, scale G/S/R, commento dei previsori, regioni solari, brillamenti (satelliti GOES), immagini SUVI e CCOR-1, mappa sinottica del Sole, modello WSA-ENLIL, allerte.',
    license: 'Dati del governo statunitense, senza copyright. NOAA chiede di citare la fonte e vieta di far credere che approvi questo servizio; se i dati vengono elaborati, non vanno presentati come originali.',
    credit: 'Dati: NOAA Space Weather Prediction Center.',
    link: ['https://www.swpc.noaa.gov/', 'swpc.noaa.gov'],
  },
  {
    name: 'FMI · rete di magnetometri IMAGE',
    uses: 'Variazione del campo magnetico a terra (scheda Adesso e Fronti). Dati in tempo reale, provvisori.',
    license: 'Creative Commons Attribution 4.0 (CC BY 4.0). Il gruppo IMAGE chiede di ringraziare gli istituti che mantengono la rete.',
    credit: 'We thank the institutes who maintain the IMAGE Magnetometer Array: Tromsø Geophysical Observatory of UiT the Arctic University of Norway (Norway), Finnish Meteorological Institute (Finland), Institute of Geophysics Polish Academy of Sciences (Poland), GFZ German Research Centre for Geosciences (Germany), Geological Survey of Sweden (Sweden), Swedish Institute of Space Physics (Sweden), Sodankylä Geophysical Observatory of the University of Oulu (Finland), DTU Technical University of Denmark (Denmark), and Science Institute of the University of Iceland (Iceland).',
    link: ['https://space.fmi.fi/image/', 'space.fmi.fi/image'],
  },
  {
    name: 'NASA · CCMC · DONKI',
    uses: 'Analisi delle espulsioni di massa coronale (CME): brillamento collegato, posizione, velocità, simulazione d’arrivo sulla Terra, onde d’urto misurate.',
    license: 'Analisi fatte a mano da ricercatori NASA e NOAA. NASA avverte che le informazioni in tempo reale di DONKI sono di qualità prototipale e da usare in contesto di ricerca.',
    credit: 'Dati: NASA Community Coordinated Modeling Center (CCMC), DONKI.',
    link: ['https://ccmc.gsfc.nasa.gov/tools/DONKI/', 'ccmc.gsfc.nasa.gov/tools/DONKI'],
  },
  {
    name: 'NASA/SDO · Helioviewer',
    uses: 'Foto del Sole all’ora di un brillamento (canale 131 Å), aprendo un punto del grafico dei brillamenti.',
    license: 'Immagini del satellite SDO della NASA, generate da Helioviewer.org.',
    credit: 'AIA data courtesy of NASA/SDO and the AIA, EVE, and HMI science teams.',
    link: ['https://helioviewer.org/', 'helioviewer.org'],
  },
  {
    name: 'Open-Meteo',
    uses: 'Nuvole, temperatura, pioggia e vento del luogo (scheda Cielo e Adesso); ricerca dei luoghi (dati GeoNames).',
    license: 'CC BY 4.0. Uso gratuito solo non commerciale: se un giorno l’app avesse pubblicità o abbonamenti serve la licenza commerciale. Le medie e le sintesi mostrate (per esempio «nuvole stanotte») sono calcolate da Aurora Bande.',
    credit: 'Weather data by Open-Meteo.com. Place search: GeoNames.',
    link: ['https://open-meteo.com/en/license', 'open-meteo.com/en/license'],
  },
  {
    name: 'Fintraffic · Digitraffic',
    uses: 'Webcam stradali della Finlandia (scheda Webcam), lette in diretta dall’API aperta.',
    license: 'CC BY 4.0. Immagini aggiornate circa ogni 10 minuti.',
    credit: 'Source: Fintraffic / digitraffic.fi, license CC 4.0 BY.',
    link: ['https://creativecommons.org/licenses/by/4.0/', 'creativecommons.org/licenses/by/4.0'],
  },
  {
    name: 'Camere dedicate all’aurora',
    uses: 'Immagini e dirette mostrate direttamente dai server dei titolari, con collegamento alla loro pagina. Nulla viene copiato o salvato.',
    license: 'Le immagini appartengono ai rispettivi titolari; alcuni non indicano una licenza esplicita. Se sei un titolare e preferisci che la tua camera non compaia, segnalalo a Davide Bandelli.',
    credit: 'Finnish Meteorological Institute (Kevo, Kilpisjärvi, Muonio, Sodankylä, Hankasalmi) · Swedish Institute of Space Physics, IRF (Kiruna) · Tromsø Geophysical Observatory, UiT (Skibotn) · UNIS / Kjell Henriksen Observatory (Longyearbyen) · University of Calgary / Canadian Space Agency, AuroraMAX (Yellowknife, Calgary) · Landhotel (Hella, tramite IPCamLive).',
    link: ['https://rwc-finland.fmi.fi/index.php/all-sky-camera-images/', 'rwc-finland.fmi.fi'],
  },
  {
    name: 'OpenStreetMap',
    uses: 'Ricerca di webcam vicine al luogo (tramite Overpass API).',
    license: 'Open Database License (ODbL).',
    credit: '© OpenStreetMap contributors.',
    link: ['https://www.openstreetmap.org/copyright', 'openstreetmap.org/copyright'],
  },
  {
    name: 'BigDataCloud',
    uses: 'Solo il nome del luogo quando usi «Usa la mia posizione»: il servizio gratuito è ammesso per la posizione del dispositivo, con il tuo consenso. Per luoghi cercati o coordinate scritte a mano non viene usato.',
    license: 'Servizio gratuito lato client, con la loro politica di uso corretto.',
    credit: 'Reverse geocoding: BigDataCloud.',
    link: ['https://www.bigdatacloud.com/', 'bigdatacloud.com'],
  },
  {
    name: 'SunCalc',
    uses: 'Calcolo di buio, crepuscolo, sorgere e tramonto, fase e posizione della luna.',
    license: 'Licenza BSD a 2 clausole, © Vladimir Agafonkin.',
    credit: 'SunCalc di Vladimir Agafonkin.',
    link: ['https://github.com/mourner/suncalc', 'github.com/mourner/suncalc'],
  },
  {
    name: 'IBM Plex',
    uses: 'Caratteri della pagina, caricati da Google Fonts.',
    license: 'SIL Open Font License 1.1.',
    credit: 'IBM Plex Sans e IBM Plex Mono, © IBM Corp.',
    link: ['https://github.com/IBM/plex', 'github.com/IBM/plex'],
  },
];

function renderCreditsSheet() {
  const items = CREDITS.map((c) => '<div class="ab-credit-item"><h3>' + esc(c.name) + '</h3><p>' + esc(c.uses) + '</p><p class="ab-credit-lic"><b>Licenza:</b> ' + esc(c.license) + '</p><p class="ab-credit-txt"><b>Credito:</b> ' + esc(c.credit) + '</p>' + (c.link ? '<div class="ab-linkrow">' + extLink(c.link[0], c.link[1]) + '</div>' : '') + '</div>').join('');
  $('sheetCredits').innerHTML = sheetHead('sheetCreditsTitle', 'Fonti e crediti') + '<div class="ab-sheet__body">' +
    '<p class="ab-notice"><b>Posizione e riservatezza.</b> Il luogo scelto, o la tua posizione se la consenti, resta sul dispositivo. Le sue coordinate vengono inviate solo ai servizi dei dati: Open-Meteo (meteo), Overpass/OpenStreetMap (webcam vicine) e, solo per «Usa la mia posizione», BigDataCloud (nome del luogo). Nessun server di Aurora Bande le riceve.</p><p class="ab-notice" style="margin-top:var(--space-2)"><b>Aurora Bande non è un servizio ufficiale</b> di NOAA, NASA, FMI o degli altri titolari e non è approvato da loro. Episodi di Bz sud, arrivo stimato, quadro d’insieme, riscontro a terra e le altre sintesi sono elaborazioni proprie dei dati originali: non sono dati originali e non sono una previsione.</p>' +
    items + '<p class="t-caption" style="margin-top:var(--space-5);color:var(--ink-3)">Windy e EUMETView compaiono solo come collegamenti esterni: non ne vengono presi dati.</p></div>';
}
