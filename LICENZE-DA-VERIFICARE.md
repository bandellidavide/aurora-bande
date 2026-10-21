# Licenze: cose da verificare

Controllo fatto il 21 ott 2026. I crediti sono in `js/credits.js`. Questo file tiene traccia di ciò che resta aperto.

## Rischi aperti
- **Stackplot TGO/UiT (Europa / Nord America)**: nessuna licenza esplicita; TGO ha sospeso i dati real-time per app e servizi; uso commerciale solo con accordo. Per ora compaiono solo nelle bozze di design (immagini copiate da SpaceWeatherLive). Prima di metterli nell'app: link esterno oppure mail a TGO (Magnar Gullikstad Johnsen). Se entrano, aggiungere voci TGO/UiT e USGS («Credit: U.S. Geological Survey», dati USGS disegnati da TGO).
- **Fonti non commerciali** (CC BY NC: TGO, GFZ, PGI, DTU, Univ. Islanda dentro IMAGE) **e Open-Meteo**: se l'app avrà pubblicità, abbonamenti o servizi a pagamento, serve licenza/accordo commerciale.
- **IMAGE: IRF e SGO**, licenza «da stabilire» sul sito FMI: ricontrollare `space.fmi.fi/image/www/index.php?page=rules_of_road`.

## Da verificare
- **EUMETSAT**: la Meteosat 10,8 µm di EUMETView è dato «Core» CC BY 4.0, o rientra tra i dati con accesso a licenza? I termini del sito dicono che i dati satellitari seguono la Data Policy, non il Creative Commons. Controllare la pagina del prodotto su `user.eumetsat.int`.
- **Camere aurora** (IRF Kiruna, TGO Skibotn, UNIS Longyearbyen, AuroraMAX, Landhotel/IPCamLive, explore.org): una per una, condizioni di embed o hotlinking. FMI (Muonio, Hankasalmi, Nyrölä, Metsähovi): licenza immagini all-sky.
- **Veðurstofa Íslands**: confermare CC BY 4.0 sulla pagina della mappa nubi.
- **Statens vegvesen / Fintraffic**: confermare dicitura di credito attuale.
- **Helioviewer**: condizioni dell'API pubblica per uso in app (nessun limite chiaro trovato).
- **BigDataCloud**: l'uso è ok solo con la posizione GPS del dispositivo (oggi `reverseGeocode()` parte solo se `fromDevice`). Non usarlo con luoghi cercati.
- **Open-Meteo**: mettere il link «Weather data by Open-Meteo.com» visibile vicino ai dati (oggi solo nel foglio crediti).
- **Google Fonts / IBM Plex**: nessun dubbio, solo ricordare che il caricamento da Google invia l'IP del visitatore (valutare di ospitare i font).
