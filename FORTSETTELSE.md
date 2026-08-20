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

Ved siste lagring: **254 prøver i selvtesten, 179 i nettlesertesten, alle
grønne.**

## Det som skal gjøres nå

`GJENNOMGANG.md` er lista. 18 uavhengige granskere gikk gjennom hver sin del av
programmet, og hvert funn ble forsøkt motbevist av to andre. Resultatet er

| Alvor | Antall |
|---|---|
| kritisk | 15 |
| alvorleg | 49 |
| moderat | 66 |
| liten | 36 |

**Ingenting av dette er rettet ennå.** Rekkefølgen bør være: kritisk først, og
innenfor hver retting en prøve som ville vært rød før.

De tyngste, slik de ser ut ved første lesning:

- **`lib/hoydedata.js` og `public/js/terreng.js`** — høydetjenesten svarer
  `0.00 m` der det ikke finnes data, ikke NaN. Hele NaN-håndteringen kan være
  død kode, og et hull i terrengmodellen kan bli lest som havnivå. Dette må
  etterprøves mot tjenesten før noe rettes, og det er det viktigste punktet på
  hele lista: det angår tallene brukeren priser på.
- **`public/js/masser.js:381`** — skjæringsskråningen marsjerer forbi
  fjelloverflaten, så løsmassen over fjellet kan få fjellhelning.
- **`public/js/masser.js` rettInngang** — `null` og tom streng slipper forbi
  klem-vakten fordi `isFinite(null)` er sant. Skråningsfeltene blir aldri
  reparert, bare kommentert.
- **`public/js/eksport.js:93`** — LandXML skriver knekkpunktene uten
  vertikalkurvene.
- **`public/js/lager.js:102`** — lagring overskriver et eksisterende prosjekt
  uten å spørre, og autolagringen gjør det av seg selv.
- **`public/js/geo.js:60`** — sonevalget kan sende deler av landet til en
  høydemodell uten data der.
- **`test/selftest.js`** — flere prøver kan aldri feile. Fjellmodellen er
  utestet, og seksjon 8 svelger enhver feil og rapporterer likevel «0 feil».

Bruk `GJENNOMGANG.md` for detaljene — hvert funn har fil, linje, hva som er
galt, når det slår til, og hva følgen blir.

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
