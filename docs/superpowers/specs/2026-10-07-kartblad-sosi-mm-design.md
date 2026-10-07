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
- **Samlefila** står i millimeter når et innmålt røranlegg er med, ellers i
  centimeter som før; veg og tomt skriver i den enheten fila har
  (`Eksport.sosiDelerVeg/Tomt(…, enhet)`, `Eksport.sosiHode(…, enhet)`).
- Tegnede rør og de andre formatene er uendret.

## 2. Kartblad: delt i ark så det kan leses

Et anlegg på et par kilometer på ett A3-ark står i 1:5000: en stikkledning er
et punkt og typen en flekk. Nå deles det i **kartblad**.

**Valget** i dialogen, «Kartblad»:
- **Automatisk** (forvalgt): delt i blad i 1:1000 når alt ikke får plass på
  ett ark i den målestokken;
- delt i blad i 1:500, 1:1000 eller 1:2000;
- alt på ett ark, som før.

Notisen under valget sier hvor mange ark det blir, før man trykker – «Oversikten
og 9 kartblad i 1:1000» eller «Alt på ett ark, i 1:500».

**Bladene** (`Rorkart.kartblad`): et rutenett over rørene, sentrert, med 10 %
overlapp – så et rør langs en kant står helt på minst ett blad – og litt luft
rundt. Bare rutene der et rør eller en kum er med, blir blad: et L-formet
anlegg gir ikke tomme ark i hjørnet. Nummerert rad for rad fra nord. Et lite
anlegg står i sin egen målestokk, som før.

**PDF-en** med blad:
1. **Oversikten** – alle rørene på ett ark, med hvert blad som en stiplet rute
   og nummeret midt i. Tegnforklaringen sier hvor mange blad som følger.
2. **Bladene**, «Kartblad 3 av 9», hvert i sin målestokk med bakgrunn, koter,
   rørene, numrene, kummene og typen langs rørene. I kanten av kartet står
   **nabobladene**, med en pil ut av kartet: «◄ Kartblad 2», «Kartblad 4 ►»,
   «▲ Kartblad 1», «▼ Kartblad 7». Tegnforklaringen sier at oversikten står
   på side 1.
3. Et kart per type og lengdeprofilene, som før.

## 3. Typen i hvite tekstbokser

Typen langs rørene står nå i **hvite tekstbokser** – en hvit boks med tynn
kant i rørets farge og teksten i samme farge – dreid langs røret. Den hvite
kanten rundt bokstavene (`glorie` i PDF-skriveren) er tatt ut; den brukes ikke
lenger. Plasseringen er den samme (`plasserTekster`), og bladrutenes nummer og
nabobladene er med i det tekstene går utenom.

## Prøver

- **Eksportprøven:** det innmålte i millimeter med bare objekttypen og koden,
  ingen merknader; tegnet i centimeter, en halv bort fra null.
- **Selvtesten:** strekk i rute; kartblad på rad, med overlapp og luft, et
  L-formet anlegg, rekkefølgen; «auto», «en», 1:500 og et lite anlegg i sin
  egen målestokk; naboene; PDF-en med oversikten (stiplede ruter med nummer),
  bladene (tittel, naboer, typen) og tegnforklaringen; tekstboksene; vegen i
  millimeter og hodet.
- **Nettleseren:** valget av kartblad med notisen (også for et anlegg på
  1 km), tomta i millimeter, samlefila i millimeter med de innmålte med bare
  koden.
