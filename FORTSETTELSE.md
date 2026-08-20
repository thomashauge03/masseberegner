# Hvor arbeidet står

Denne fila finnes for at arbeidet skal kunne tas opp igjen nøyaktig der det ble
lagt fra seg. Alt som er gjort ligger i git og er pushet til
`github.com/thomashauge03/masseberegner`. Ingenting er bare i en nettleser eller
en samtale.

## Ta det opp igjen

Åpne en ny økt i `C:\Users\thoma\massekalk` og si: **«fortsett fra
FORTSETTELSE.md»**. Alt som trengs står her og i `GJENNOMGANG.md`.

Kjør testene først, så du vet du starter fra noe som virker:

```bash
node test/selftest.js
```

Nettlesertesten kjøres ved å åpne programmet med `?test=1`, eller fra konsollen
med `Nettlesertest.kjor()`. Utviklingstjeneren startes med `node server.js`
(port 5178). Programmet ligger også på https://masseberegner.vercel.app.

Ved siste lagring: **308 prøver i selvtesten, 184 i nettlesertesten, alle
grønne.** Massene på demoen er uendret gjennom hele runden: 1 548 m³ skjæring,
1 015 m³ fjell, 135 m³ fylling — rettingene gjelder feilmåter, ikke normalveien.

## Det som skal gjøres nå

`GJENNOMGANG.md` er lista. 18 uavhengige granskere gikk gjennom hver sin del av
programmet, og hvert funn ble forsøkt motbevist av to andre — én som skulle
vise at det var feil, én som skulle avgjøre om det kan skje i praksis. **70 funn
overlevde begge: 12 kritiske, 31 alvorlige, 23 moderate, 4 små.** 16 ble felt.

### Rettet så langt

Hver retting har en prøve som ville vært rød før, og hver ligger i sin egen
commit med målingen som bekreftet den.

- **Et hull i terrengmodellen ble lest som havflaten.** Høydetjenesten svarer
  0,00 m for hver eneste piksel utenfor dekningen. En veg på kote 260 ville
  fått 260 m skjæring uten en eneste merknad. *(kritisk)*
- **`isFinite(null)` er sant** — en tom fjelldybde gjorde hele skjæringen til
  fjell: 2 991 m³ sprengning i stedet for 1. Samme hull traff hele
  klem-vakten. *(tre kritiske, ett alvorlig)*
- **Et hull i terrenget la hele veien på kote null** — NaN spredte seg fra
  glattingen gjennom `rettProfil` til hvert eneste knekkpunkt. *(kritisk)*
- **LandXML kastet vertikalkurvene** — 1,0 m avvik i høybrekket mot det
  maskinstyringen får. SOSI manglet `VERT-DATUM`. *(kritisk + alvorlig)*
- **Lagring skrev over andre prosjekter uten å spørre**, reservelageret ble
  skrevet til men aldri lest fra, og demoprosjektet kunne overskrive ditt
  eget. *(kritisk + tre alvorlige)*
- **«Angre» på sidelengs flytting slettet arbeid du gjorde etterpå.**
  *(kritisk)*
- **Sju funn i grensesnittet** — tverrfallsfeltet kunne ikke settes, «Skjæring
  her» målte fra feil flate, hull ga oppdiktede tall, K skrev over låste
  høyder, innsatt punkt kollapset kurver, dobbeltklikk la inn et punkt for
  mye, veiklassen hang på rekkefølgen. *(alvorlige)*
- **Fjelldybden måles nå der man står**, ikke bare i senterlinja. Ikke et funn,
  men det kom fram under etterprøvingen, og det angår den største usikkerheten
  i hele regnestykket.
- **Eksporten hadde ingen prøver i det hele tatt.** Tjue nye.
- **Veglinja falt ut av PDF-avlesningen** fordi den hadde færre enn femten
  punkt, og Bézier-kurver ble lest som rette korder. *(to kritiske)*

Ett meldt funn holdt ikke: skjæringsskråningen marsjerer *ikke* forbi
fjelloverflaten. Prøvd tre ganger; 1120 av 1120 steg bruker riktig helning.

**Alle tolv kritiske funn er nå gjennomgått.**

### Igjen på lista

Bruk `GJENNOMGANG.md` for detaljene. De tyngste som står igjen:

- **`public/js/geo.js:60`** — sonevalget. Nå synlig i stedet for stille, siden
  manglende dekning blir oppdaget, men bør fortsatt vurderes.
- **`public/js/vertikalprofil.js`** — `_bygg` kan slette lovlige
  vertikalkurver, og `rettVertikalgeometri` setter K opp men aldri ned.
- **`public/js/app.js`** — kostnadsfunksjonen måler stigningskravet mot feil
  radius og straffer ikke vertikalkurvebrudd.
- **`public/js/ui-pdfrapport.js`** — bolkmerkingen og stikningstabellen tåler
  ikke en profilavstand som ikke går opp i 20 eller 5.
- **`test/selftest.js`** — flere prøver kan aldri feile, og fjellmodellen er
  fortsatt tynt dekket. *(Seksjon 8 svelget enhver feil; det er rettet.)*

## Kjør gjennomgangen på nytt

Granskningen kjørte som en arbeidsflyt med 228 agenter. Skriptet ligger i
`.claude/projects/.../workflows/scripts/massekalk-gjennomgang-wf_55bff05e-ae3.js`
og kan kjøres igjen — ferdige agenter svarer fra mellomlageret, så bare det som
er endret koster noe:

```
Workflow({scriptPath: "<stien over>", resumeFromRunId: "wf_55bff05e-ae3"})
```

Journalen med alle svarene ligger ved siden av, i `journal.jsonl`.

## Det som ble gjort i denne runden

Kort, så konteksten ikke går tapt:

- Vertikalgeometrien kontrolleres nå også når høydene er lagt inn for hånd, og
  «Rett opp» løser alle bruddene den kan løse — 81 → 0 på en prøve med
  strammede grenser.
- PDF-avlesningen hadde aldri virket på en ekte PDF. Strømlengden ble målt til
  `endstream` i stedet for å tas fra `/Length`. Ydestad-planen gir nå 11
  strømmer og 5556 kurver mot 0 før.
- Ny PDF-eksport, skrevet fra grunnen uten bibliotek. Kontrollert med Poppler.
- Knekkpunkt kan settes inn midt på linja (klikk på linja i Rediger), og
  «Angre» angrer virkelig — hele prosjektet, seksti steg bakover.
- Autolagring to sekunder etter siste endring.
- Avlesning i tverrsnittet: helning på tvers og langs under musepekeren.
- Rettet at tegning kunne legge et punkt midt i rekken, som fikk linja til å gå
  i sikksakk. Det var en feil jeg selv innførte dagen før.

## Det som fortsatt ikke er avklart

- **Eksportfilene er aldri prøvd i et mottakersystem.** KOF, LandXML, SOSI og
  DXF er skrevet etter spesifikasjonen og strukturen er kontrollert, men ingen
  har importert en av dem i en maskinstyring eller hos kommunen.
- **Dybden til fjell er den største usikkerheten i tallene.** En halvmeter feil
  flytter sprengningen 109 % på demoen — mer enn hele volumet. Det er ikke
  programmet som er upresist; det er at ingen vet hvor fjellet ligger uten
  sondering.
- **Ingen har brukt programmet på en ekte jobb ennå.**
