# Rørtypen langs rørene i oversiktskartet, og SOSI med bare innmålingen

Dato: 2026-10-07 · Gren: `rorkart-tekst-sosi`

> **Endret senere samme dag** (`2026-10-07-kartblad-sosi-mm-design.md`): typen
> står i hvite tekstbokser, ikke med hvit kant rundt bokstavene; SOSI for
> innmålte rør har bare det fra fila, i millimeter, uten diameter,
> høydereferanse eller merknader; kartet kan deles i kartblad.

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
- Langs røret omtrent hver 60. mm på arket (`TEKSTAVSTAND`), fra 30 mm.
- Bare der røret er rett nok: korda under teksten minst 90 % av teksten (en
  knekk, eller et rør som går fram og tilbake), og ingen del av røret mer enn
  0,6 mm ut fra den.
- Ingen tekst oppå en annen, et nummer, en kum, et kotetall eller merknaden
  nederst i kartet (skillende akser, så to skrå tekster tett i tett ikke
  regnes som kollisjon), og inne i rammen. Det som er opptatt, ligger i et
  rutenett: 5000 rør tar om lag en tredjedel sekund.
- **Er plassen tatt**, flyttes teksten 4 eller 8 mm (for et nummer, en kum, et
  kotetall); så en tredjedel av avstanden lenger fram, så to – rør i samme
  grøft ligger oppå hverandre på arket, og slik skrives de på hver sine steder
  etter tur; så 12 mm; og til sist søkes hele avstanden rundt målet, hver
  2. mm, for de smale plassene mellom kummer.
- **Hvert rør får typen minst én gang der det er plass.** Først én tekst per
  rør, de korteste først – de har færrest plasser – så resten etter tur: mål
  nummer k for hvert rør før k + 1, og i hver runde det røret som har færrest.
  Får et rør ingen langs streken (en stikkledning med nummeret midt på),
  legges teksten ved siden av, midt på og parallelt, 2 mm fri av streken (3
  eller 4 mm når det er trangt), over, ellers under – og aldri tvers over
  røret selv.
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
  tomt – men rundet riktig: en halv bort fra null, med en milliondels
  centimeter i slingring for maskinens binærtall (−0,125 → −13, ikke −12).
- To like rader etter hverandre i en kurve er ett punkt: to målinger på samme
  sted og høyde, eller to som blir like på centimeteren. En kurve med et strekk
  uten lengde blir flagget av sjekkverktøyene.

Svaret under eksportknappen og samlefila følger det samme. Planlagte rør og de
andre formatene (KOF, LandXML, DXF, CSV, GeoJSON) er uendret: der er bunnen og
gravebunnen det maskina trenger.

## Prøver

- **Eksportprøven:** SOSI for et innmålt anlegg (én kurve per rør,
  koordinatene i centimeter, ingen bunn, gravebunn eller kum, de enslige sies,
  uten terreng ingen merknad), KOF uendret, tegnet uendret.
- **Selvtesten:** skrå tekst i PDF-skriveren; plasseringen (avstand, aldri opp
  ned, loddrett, skrått, knekk, fram og tilbake, kort rør, stikkledning ved
  siden av, over og under, med knekk, skrå stikkledning med nummeret i veien,
  grøfta – to og tre rør, og med kummer – de korteste først, et smalt
  mellomrom, rammen, opptatt, skrå bokser); i PDF-en (farge, hvit kant, dreid,
  slått av, ikke oppå numre, kotetall, merknaden eller kummer).
- **Gjennomgangen** fant at rør i samme grøft ofte fikk samme forskyvning (den
  fulgte nummeret i lista), og at tekstene dekket kummene. Begge er rettet,
  med prøver.
- **Nettleseren:** avkrysningen er på fra start og når valget; kartet har
  tekstene; SOSI for innmålte rør i knappen og samlefila.
