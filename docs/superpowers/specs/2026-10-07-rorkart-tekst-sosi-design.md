# Rørtypen langs rørene i oversiktskartet, og SOSI med bare innmålingen

Dato: 2026-10-07 · Gren: `rorkart-tekst-sosi`

To ønsker fra brukeren etter at «gjør alt ferdig» var levert:

- «kan vi og få ut pdf med alle på 1 oversiktskart så står d tydelig mange
  plasser hvilke type rør som er der på kartet med tekst»
- «i sosi filen skal vi bare gi ut kordinatene til rørene som vi fikk inn med
  filen ikke ta med noe av terrenget osv»

Begge er avgrensede endringer i det som finnes. Brukeren har gitt fullmakt til
å ta valgene; de står her.

## 1. Rørtypen skrevet langs rørene

Oversiktskartet (rorkart.js) hadde fargen per type, tegnforklaringen og et
nummer midt på hvert rør. Ute på plassen holder ikke fargen: to blå og tre
brune nyanser skilles ikke i dagslys.

**Teksten** er koden, som i tegnforklaringen (`SP 160PE`), i 6,5 pt fet, i
rørets farge med en hvit kant (bokstavene strøket i hvitt først, Tr 1). Den
står langs røret, midt på streken, og aldri opp ned: den leses fra venstre,
eller nedenfra.

**Hvor** (`Rorkart.plasserTekster`, ren funksjon):
- Langs røret omtrent hver 60. mm på arket (`TEKSTAVSTAND`), fra 30 mm. Rørene
  forskyves en tredjedel av avstanden etter tur, så rør i samme grøft – som
  ligger oppå hverandre på arket – skrives på hver sine steder.
- Bare der røret er rett nok: ingen del av røret under teksten går mer enn
  0,6 mm ut fra korda. Ellers flyttes teksten 4, 8 eller 12 mm langs røret,
  eller sløyfes der.
- Ingen tekst oppå en annen, et nummer, et kotetall eller merknaden nederst i
  kartet (skillende akser, så to skrå tekster tett i tett ikke regnes som
  kollisjon), og inne i rammen.
- **Hvert rør får typen minst én gang.** Først én tekst per rør, de korteste
  først – de har færrest plasser – så resten langs de lange. Får et rør ingen
  langs streken (en stikkledning med nummeret midt på), legges teksten ved
  siden av, midt på og parallelt, 2 mm fri av streken (3 eller 4 mm når det er
  trangt), over, ellers under.
- Et rør kortere enn halve teksten får ingen.

**PDF-skriveren** (`PdfSkriver.tekst`) får `vinkel`, `loddrett: 'm'` og
`glorie`. Vannrett tekst skrives byte for byte som før.

**Valget:** «Rørtypen skrevet langs rørene, mange steder» i dialogen, på fra
start (`valg.tekst`). Gjelder samlekartet og typesidene; de grå rørene på en
typeside får ikke tekst.

## 2. SOSI for innmålte rør: bare innmålingen

SOSI-fila for rør skrev tre kurver per rør – bunn innvendig (regnet av
dimensjonen), topp rør og gravebunn (regnet mot Kartverkets terreng) – og
kommentarer om terreng og grøft.

**For et innmålt anlegg** (`!res.plan`) er SOSI-fila nå innmålingen:
- Én `Rørledning` per rør med punktene fra fila – koordinatene og høydene slik
  de kom inn – med koden (`..NAVN`), `..HØYDEREF "topp rør"` (det innmålingen er
  målt på, som ellers i programmet) og diameteren fra koden.
- Ingen bunn innvendig, ingen gravebunn, ingen kummer, og ingen merknader om
  terreng eller grøft (`RorEksport.sosiMerknader`).
- Enslige punkt (målt med rørkode, uten nabo) er ikke rør; fila sier i en
  kommentar hvor mange som ikke er med.
- Centimeter, som før – samlefila deler ett hode (`...ENHET 0.01`) med veg og
  tomt.

Svaret under eksportknappen og samlefila følger det samme. Planlagte rør og de
andre formatene (KOF, LandXML, DXF, CSV, GeoJSON) er uendret: der er bunnen og
gravebunnen det maskina trenger.

## Prøver

- **Eksportprøven:** SOSI for et innmålt anlegg (én kurve per rør,
  koordinatene i centimeter, ingen bunn, gravebunn eller kum, de enslige sies,
  uten terreng ingen merknad), KOF uendret, tegnet uendret.
- **Selvtesten:** skrå tekst i PDF-skriveren; plasseringen (avstand, aldri opp
  ned, loddrett, skrått, knekk, kort rør, stikkledning ved siden av, over og
  under, skrå stikkledning med nummeret i veien, grøfta med forskyvning, de
  korteste først, rammen, opptatt, skrå bokser); i PDF-en (farge, hvit kant,
  dreid, slått av, ikke oppå numre, kotetall eller merknaden).
- **Nettleseren:** avkrysningen er på fra start og når valget; kartet har
  tekstene; SOSI for innmålte rør i knappen og samlefila.
