# Rør – oversiktskartet med terreng: høydekoter og lengdeprofiler

Dato: 2026-10-06 · Gren: `ror-kart-terreng`

## Hva brukeren ba om

> «må ha tegning med terreng au slik at dem som jobber vet hvor det skal»

Oversiktskartet har Kartverkets kart under rørene: veger, bygninger og vann.
Det viser ikke formen på bakken eller hvor dypt rørene ligger. Arbeidslaget
trenger begge deler.

## Valgene

1. **Høydekoter i kartet** fra Kartverkets terrengmodell (DTM, den appen
   regner med).
   - Hver tegning har sitt utsnitt. Terrenget hentes for det, med 1 m
     oppløsning opp til 1:2500, 2 m til 1:5000, 4 m til 1:10 000 og ellers
     8 m.
   - Ekvidistansen følger målestokken: 0,5 m til 1:500, 1 m til 1:1000, 2 m
     til 1:2500, 5 m til 1:5000 og ellers 10 m. Den dobles til det er høyst
     60 koter i utsnittet.
   - Hver femte kote er tykkere og har høyden skrevet på, på hvit bunn.
   - Kotene er brune og tynne, under rørene.
   - Valget heter «Høydekoter fra terrengmodellen», på fra start. Det virker
     også uten bakgrunnskart.
2. **Lengdeprofil for hvert rør**, valget «Lengdeprofil for hvert rør», på
   fra start.
   - Sidene kommer etter kartene: to rør per A3-side, ett per A4-side, i
     samme rekkefølge som numrene i kartet.
   - Hvert rør har en tittel: kode, nummer, lengde, innmålt eller planlagt,
     og fallet for selvfall.
   - Selve tegningen viser terrenglinja, røret fra topp til bunn innvendig i
     sin farge, og kummene som loddrette streker med navn.
   - Under tegningen står et tallbånd per stasjon: «Profil», «Terreng»,
     «Topp rør», «Bunn innv.» og «Overdekning».
   - Lengden følger en fast målestokk-rekke (1:200 til 1:5000). Høyden er
     overdrevet ti ganger, eller mindre om høydeforskjellen ikke får plass.
   - Er røret for langt for én stripe i 1:5000, deles det over flere
     striper.
   - Rør uten høyder får ingen profil. Det gjelder tegnede rør uten
     dimensjon, eller der terrenget mangler langs hele røret. Det står i
     statuslinja.
3. **Numrene i kartet**: med lengdeprofiler får hvert rør et lite nummer ved
   midten, på hvit bunn, som i profiltittelen («SP 160PE · 2»).
4. **Høydene:**
   - Innmålte rør bruker de målte punktene, som er topp rør.
   - Tegnede rør regnes med terrenget, som i appen, men på en kopi.
   - Bunn innvendig er topp − dimensjon + gods (`RorPlan.bunnFraTopp`).
   - Overdekningen er terreng − topp.
5. **Ingenting i prosjektet endres.** Terrenget hentes i en egen
   terrengmodell for kartet, ikke i appens.

## Oppbygging

- **`public/js/rorkart.js`:**
  - `koter(rutenett, ekvidistanse)` – marsjerende kvadrater, kjeding og
    forenkling, ren og prøvbar.
  - `velgEkvidistanse(N, zMin, zMax)`.
  - Tegning av koter i kartet, og numrene.
- **`public/js/rorlengde.js` (ny, ren):**
  - `striper(rorliste, flate)` – målestokk og deling.
  - `tegnStripe(P, stripe, …)` – rutenett, terreng, rør, kummer og
    tallbånd.
- **`public/js/ui-rorkart.js`:**
  - `samle({ terreng })` gir høydene når terrenget er hentet.
  - Henter terrenget for utsnittene og langs rørene, med framdrift og
    «Avbryt».
  - Prøver terrenget langs hvert rør og legger lengdeprofilene til.

## Etter gjennomgangen

- **Tallbåndet:**
  - Endene og kummene settes først, og så stegene der det er plass,
    minst 11 mm mellom dem.
  - Står en kum nærmere enden enn det, vinner enden.
- **Striper:**
  - Et langt rør deles i like lange striper, og hver stripe har et punkt på
    begge kantene. Røret, terrenget og høydene går dermed helt ut.
  - Høyden står aldri i mindre målestokk enn lengden.
  - Får høydeforskjellen ikke plass, vises stykket rundt røret, og aksen
    merker bare det som står i rammen.
  - Aksens desimaler følger steget.
- **Terrengflisene langs rørene** tas med et rektangel per bit på høyst
  16 m, så en flis røret bare snitter i hjørnet, også kommer med.
- **Tak og avbryt:**
  - Et kart som trenger mer enn 100 fliser (256 × 256 m), får ingen koter,
    og det står i kartet.
  - Lengdeprofilene til sammen har et tak på 400 fliser.
  - «Avbryt» og framdriften per flis gjelder også terrenget.
- **Nummer** får bare rørene som har høyder, altså de som får en profil.
- **Fallet** på et tegnet selvfallsrør står i fallretningen. Motfall er
  minus og sies.
- **Statuslinja** sier hvor mange terrengfliser som manglet.

## Prøver

- **Koter (selvtesten):**
  - en kjegle gir lukkede ringer, én per nivå;
  - et skrått plan gir rette, parallelle koter;
  - NaN i rutenettet gir brudd, ikke krasj;
  - ekvidistansen dobles i bratt terreng.
- **Lengdeprofil (selvtesten):**
  - målestokk og deling av et langt rør;
  - tallbåndet har stasjoner, terreng, topp, bunn og overdekning;
  - overdekningen er terreng − topp;
  - kummen står på riktig stasjon.
- **Hele PDF-en (selvtesten):** koter i kartet, numrene og
  profilsidene.
- **Nettleseren:**
  - terrenget fra `_medFlattTerreng` gir koter der det er helning;
  - profilsidene finnes og er nummerert som i kartet;
  - prosjektet og appens terreng er urørt.
