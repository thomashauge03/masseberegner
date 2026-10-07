# Kartblad i oversiktskartet, typen i hvite tekstbokser, og SOSI med bare det fra fila

Dato: 2026-10-07 · Gren: `sosi-mm-kartblad`

Tre ønsker fra brukeren:

- «jeg vil bare ha med dataene som kom inn fra xml filen til sosi»
- «kan du og ha med bilder eller kart der alle er med så må du bare dele opp i
  antall sider slik at d og er synlig og med navn i sånn hvite tekstbokser hva
  rørene er med samme fargekode flere plasser, si som dett prosjektet må man
  zoome inn å ha flere tegninger»

## 1. SOSI for innmålte rør: bare det som kom inn med fila

Valgt av brukeren i dialog: **linjer, ett rør per kurve** (ikke punktene hver
for seg).

- Én `Rørledning` per rør med punktene fra innmålingen, koordinatene og
  høydene i **millimeter** (`...ENHET 0.001`) slik de står i XML-fila, og
  koden som `..NAVN`.
- Ingenting programmet har regnet eller antatt: ingen bunn innvendig,
  gravebunn eller kummer, ingen diameter (tolket ut av koden), ingen
  høydereferanse (antatt «topp rør»), intet anleggsnavn og ingen merknader –
  heller ikke om de enslige punktene.
- To like punkt etter hverandre (samme sted og høyde) er ett, så kurven ikke
  får et strekk uten lengde.
- **I sonen fila hadde.** Programmet regner i sonen lengdegraden gir (eller
  vegens/tomtas), og en fil i UTM 32 fra et sted øst for 12° Ø ble regnet om
  til UTM 33 – da sto ikke ett tall som det kom inn. Punktene skrives som de
  er lagret (`p.n`, `p.o`, `p.z`), og hodet sier fila sin sone
  (`RorEksport.sosiSone`). En fil i en annen sone som ble *lagt til* et
  anlegg, ble regnet om ved importen, og kilden sier det – den står i
  anleggets sone. Et innmålt anlegg uten punkt har ingen fil, og sonen er
  bare forvalget: da gjelder regnesonen.
- **Samlefila** står i millimeter når et innmålt røranlegg er med, ellers i
  centimeter som før; veg og tomt skriver i den enheten fila har
  (`Eksport.sosiDelerVeg/Tomt(…, enhet)`, `Eksport.sosiHode(…, enhet)`).
  Fila har én sone: står man i et innmålt røranlegg, er det fila sin; ellers
  regnesonen. Et anlegg i en annen sone står utenfor, og svaret sier det – for
  et innmålt «innmålingen er i UTM 33, fila i UTM 32 – eksporter anlegget for
  seg». Før ble det regnet om, og tallene var ikke fila sine.
- Tegnede rør og de andre formatene er uendret.

## 2. Kartblad: delt i ark så det kan leses

Et anlegg på et par kilometer på ett A3-ark står i 1:5000: en stikkledning er
et punkt og typen en flekk. Nå deles det i **kartblad**.

**Valget** i dialogen, «Kartblad»:
- **Automatisk** (forvalgt): delt i blad i 1:1000 når alt ikke får plass på
  ett ark i den målestokken – i 1:2000 når 1:1000 gir over 120 blad;
- delt i blad i 1:500, 1:1000 eller 1:2000;
- alt på ett ark, som før.

Notisen under valget sier hvor mange ark det blir, før man trykker – «Oversikten
og 9 kartblad i 1:1000» eller «Alt på ett ark, i 1:500».

**Bladene** (`Rorkart.kartblad`): et rutenett over rørene, sentrert, med 10 %
overlapp – så et rør langs en kant står helt på minst ett blad – og litt luft
rundt. Nummerert rad for rad fra nord. Et lite anlegg står i sin egen
målestokk, som før.

- **Hvert blad har en kjerne**: ruta minus halve overlappen mot naboene.
  Kjernene dekker alt uten å overlappe, og et blad blir med når et rør eller
  en kum er i kjernen – ikke når et rør bare krysser overlappen, som naboen
  viser. Et L-formet anlegg gir ikke tomme ark i hjørnet, og i prøveanlegget
  ble ett av ni blad borte: det hadde bare en bit naboen alt viste.
- **Bare kjernene et strekk kan nå, prøves.** Å prøve hver rute mot hvert
  strekk tok sekunder i valget for et langt anlegg; nå går 60 kronglete rør på
  3 × 2 km i 1:500 på noen millisekunder.
- **Høyst 120 blad.** Over det sier valget fra – «149 kartblad i 1:1 000 er for
  mange – velg en mindre målestokk, færre rørtyper eller alt på ett ark»; i
  1:2000, den minste målestokken bladene har, «velg færre rørtyper eller alt på
  ett ark» – i stedet for å hente bakgrunn til et søkk av ark. «Lag PDF» lukker
  da ikke valget, men sier det samme der. «Automatisk» går ned til 1:2000 selv,
  så et anlegg på 40 km ikke åpner med en feil.

**PDF-en** med blad:
1. **Oversikten** – alle rørene på ett ark, med hvert blad som en stiplet rute
   og nummeret midt i. Nummeret er så stort som ruta gir plass til, mellom 5
   og 11 pt; i et langt anlegg er rutene små, og et nummer som ville dekket et
   annet, står ikke – annethvert i raden er nok til å telle seg fram. **Boksen
   er tett rundt et lite tall**: med luften fra 11 pt skalert ned var en 5
   pt-boks 2,4 mm høy, mens radene på oversikten står ned mot 1,7 mm fra
   hverandre (A4, to rader på 60 blad – mer gir taket ikke), og første rad fikk
   annethvert nummer, raden under ingen. Med 0,2 mm luft er boksen 1,7 mm.
   (Å prøve numrene spredt, lengst fra dem som er prøvd først, ble prøvd på 200
   tilfeldige anlegg og ble ikke bedre: i rekkefølge står annethvert, spredt
   ble det av og til to hull.) Tegnforklaringen sier hvor mange blad som følger.
2. **Bladene**, «Kartblad 3 av 8», hvert i sin målestokk med bakgrunn, koter,
   rørene, numrene, kummene og typen langs rørene. **Utenfor** kanten av kartet
   står **nabobladene**, med en pil ut: «▲ Kartblad 1» over, «▼ Kartblad 7»
   under, og langs sidene, lest nedenfra, «◄ Kartblad 2» i margen til venstre
   og «► Kartblad 4» i mellomrommet før tegnforklaringen. Inne i kartet dekket
   merket overlappen – den samme stripa på begge bladene, så det som lå under,
   sto ingen steder. Tegnforklaringen sier at oversikten står på side 1.
3. Et kart per type og lengdeprofilene, som før.

## 3. Typen i hvite tekstbokser

Typen langs rørene står nå i **hvite tekstbokser** – en hvit boks med tynn
kant i rørets farge og teksten i samme farge – dreid langs røret. Den hvite
kanten rundt bokstavene (`glorie` i PDF-skriveren) er tatt ut; den brukes ikke
lenger. Plasseringen er den samme (`plasserTekster`), og bladrutenes nummer er
med i det tekstene går utenom.

## Prøver

- **Eksportprøven:** det innmålte i millimeter med bare objekttypen og koden,
  ingen merknader; tegnet i centimeter, en halv bort fra null; regnet i en
  annen sone: tallene og sonen fra fila, mens et tegnet anlegg står i
  regnesonen.
- **Selvtesten:** strekk i rute; kartblad på rad, med overlapp og luft, et
  L-formet anlegg, rekkefølgen; et stikk som bare krysser overlappen (intet nytt
  blad – men fem meter lenger ned, ett til), en kum alene i et blad, et rør helt
  ytterst i et så trangt rutenett som det kan bli; 60
  kronglete rør der hver bit står på et blad, og fort; for mange blad i 1:500
  (med rådet), men ikke i 1:2000, «auto» som går ned til 1:2000 på 40 km, og
  70 km der også 1:2000 er for mange (et annet råd); «auto», «en», 1:500 og et
  lite anlegg i sin egen målestokk; naboene; PDF-en med oversikten (stiplede
  ruter med nummer), bladene (tittel, naboer, typen) og tegnforklaringen;
  nabobladene utenfor kartet og på arket – til venstre, til høyre før
  tegnforklaringen, over og under – med en pil ved hvert som peker ut; numrene
  på oversikten for 75 blad (5 pt, tette bokser, ingen oppå hverandre), for
  fire (11 pt) og for to rader på A4 (begge får annethvert); tekstboksene;
  vegen i millimeter og hodet.
- **Nettleseren:** valget av kartblad med notisen (også for et anlegg på
  1 km, og for 40 km: «auto» i 1:2000, for mange i 1:1000, og «Lag PDF» som
  står og sier det), tomta i millimeter, samlefila i millimeter med de
  innmålte med bare koden; SOSI for en fil i en annen sone enn regnesonen –
  hver rad i millimeter finnes som et punkt i fila, og hodet er fila sitt –
  både fra knappen og i samlefila, der en veg og et innmålt i en annen sone
  står utenfor med hvorfor.
- **Gjennomgangen** (tredje runde) fant at nabomerkene dekket den samme stripa
  på begge bladene, at numrene på oversikten sto oppå hverandre i et langt
  anlegg, at valget kunne henge i sekunder, og at SOSI-tallene ble regnet om
  når regnesonen var en annen enn fila sin. Fjerde runde fant at hele rader på
  A4 kunne stå uten nummer, at et tomt innmålt anlegg satte samlefila i sone
  32, at «Lag PDF» lukket valget med for mange blad, og at rådet i 1:2000 ikke
  kunne følges. Alle er rettet, med prøver og mutanter.
