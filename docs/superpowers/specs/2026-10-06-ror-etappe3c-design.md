# Rør, etappe 3c – planlagt mot innmålt

Dato: 2026-10-06 · Gren: `ror-etappe3c`

Når røret er gravd ned og målt inn, skal man kunne se om det ligger der det var
planlagt: avviket i plan og i høyde i hvert innmålte punkt, hvor mye av røret som
er målt inn, og hvor det er utenfor toleransen.

## 1. Avklart

| Spørsmål | Svar |
|---|---|
| Prinsipp | Alt på knapper. Sammenligningen slås på med knappen «Vis avvik mot innmålt» i Rør-fanen. Den endrer ingenting – verken planen eller de innmålte høydene. |
| Designvalg | Tas underveis og står her (brukeren: «ta valgene selv»). |
| Automatisk tilpasning av planen til det innmålte | Nei. Det ville endret høyder uten et trykk, og er ikke bedt om. |

## 2. Hva sammenlignes

- Det aktive **tegnede** anlegget mot **alle innmålte røranlegg** i prosjektet –
  anlegg med målte punkt og uten plan. Rørene i dem er de samme som kartet og
  profilen viser (`Ror.byggLinjer` med rettingene): et punkt som er slått av, er
  ikke med, og koder som er slått av i kodetabellen, er ikke med.
- Hvert **målte punkt** på et innmålt rør knyttes til det **nærmeste planlagte
  røret med samme kode** innenfor **søkebredden** (standard 1,0 m, vannrett fra
  rørets senterlinje). Punktobjektene (kum, muffe, bend …) er ikke med.
  - *Samme kode* er skrivemåten likestilt: store bokstaver, `_` som mellomrom og
    mellomrom mellom tall og bokstaver – «SP160PE» = «SP 160 PE» = «sp_160pe».
  - *Eller samme system og dimensjon*, når begge er kjent: «SP 160 PVC» knyttes
    til «SP 160PE», «VL 160PE» gjør det ikke. Kodetabellen i hvert anlegg
    gjelder, så en dimensjon eller et system brukeren har rettet, teller.
- **Sideavvik:** vannrett avstand fra den planlagte senterlinja, med fortegn:
  **+ til høyre** i tegneretningen. Ligger punktet forbi enden av røret, måles det
  vinkelrett på det siste strekket, og hvor langt forbi står for seg. På utsiden av
  en knekk er det avstanden til knekkpunktet.
- **Høydeavvik:** bunn innvendig innmålt − bunn innvendig planlagt **ved samme
  stasjon**. Den planlagte bunnen er topp rør på planen ved stasjonen (rett linje
  mellom punktene på linja) − D + gods. Den innmålte bunnen er det målte punktet
  (topp rør) − D + gods for den **innmålte** koden; mangler den en dimensjon,
  brukes planens. **+ betyr at røret ligger høyere enn planen.**
- **Dekning:** strekket mellom to nabopunkt på det innmålte røret dekker planen
  mellom stasjonene deres når begge er knyttet til samme planlagte rør. Et enkelt
  knyttet punkt dekker stasjonen sin. **Hull på 2 m eller mer** – også fra starten
  og til enden – står som «ikke innmålt». Dekningen er lengden minus hullene. Et
  rør uten et eneste knyttet punkt er ikke innmålt i det hele tatt.
- **Nær, men utenfor søkebredden:** punkt med samme kode som ligger mellom
  søkebredden og **10 m** fra et planlagt rør, telles per rør. Et rør som er lagt
  1,5 m til siden ser ellers bare «ikke innmålt» ut, og ingen ville skjønt hvorfor.
- **Grad:** hvor ille et punkt er – det største av |sideavvik| / toleranse i plan
  og |høydeavvik| / toleranse i høyde. Over 1 er utenfor. De verste punktene
  sorteres på den.

## 3. Toleranser

Standard, settes i Rør-fanen og lagres i anlegget (`mal.plan.avvik`):

| | Standard | Grenser |
|---|---|---|
| I plan | 0,10 m | 0,005–2 m |
| I høyde, selvfall | 0,03 m | 0,005–2 m |
| I høyde, trykk | 0,10 m | 0,005–2 m |
| Søkebredde | 1,0 m | 0,1–10 m |

Toleransen i høyde følger rørets regel (selvfall eller trykk). Et ugyldig tall
settes tilbake i feltet, som de andre innstillingene. Standardene er et
utgangspunkt – kravene i kontrakten (NS 3420-K) gjelder.

`mal.plan.avvik = { vis: false, plan: 0.10, selvfall: 0.03, trykk: 0.10, sok: 1.0 }`.
Knappen er av som standard. Tilstanden og toleransene lagres med prosjektet, går
gjennom `merk` og kan angres. En fil uten feltet får standarden; et ugyldig tall i
fila blir standarden.

## 4. Hvor det vises (når knappen er på)

- **Rør-fanen:** «Avvik mot innmålt» med knappen og en kort forklaring. Når den
  er på: toleransene, en tabell per planlagt rør (punkt, innmålt lengde og andel,
  utenfor, største avvik i plan og i høyde, nær men utenfor) og de ti største
  avvikene. Røret i en rad kan velges – profilen viser det.
- **Kartet:** hvert knyttet punkt som en ring – grønn og liten innenfor, rød og
  større utenfor – med kode, stasjon, avvikene og «innenfor»/«utenfor» i
  verktøytipset. Fargen står aldri alene.
- **Profilen:** de innmålte punktene (topp rør) på det planlagte røret, med en
  strek fra planens topp rør til punktet. Tittelen sier hvor mange punkt og hvor
  mange utenfor; avlesningen viser avviket for punktet nærmest pekeren.
- **Merknadene:** per rør – punkt utenfor toleransen (antall og største avvik),
  strekk som ikke er innmålt, og punkt nær men utenfor søkebredden. Er det ingen
  innmålte anlegg, eller ingen punkt knyttet, står det én merknad som sier det.
- **Rapporten og PDF-en:** «Avvik mot innmålt» med toleransene og fortegnene
  forklart, tabellen per rør og de største avvikene. Profilene i rapporten viser
  punktene, siden de tegnes av den samme koden.
- **Ikke** i 3D og ikke i eksportfilene.

Stasjonene vises som lengde på bakken (× bakkefaktoren), som profilen.

## 5. Modulen

Ny ren modul `public/js/roravvik.js` (`RorAvvik`), prøvd i node
(`test/roravvikprove.js`):

- `normKode(kode)` – skrivemåten likestilt.
- `likKode(kodeA, kA, kodeB, kB)` – samme kode, eller samme system og dimensjon.
- `sammenlign({ plan, planKoder, innmalt, toleranse, bakkefaktor })` →
  `{ punkter, perLinje, verste, merknader, toleranse, antallInnmalt, anlegg }`.
  - `plan`: linjene fra `RorPlan.bygg` (med `plan.regel`).
  - `innmalt`: `[{ anlegg, navn, koder, linjer }]` med linjene fra
    `Ror.byggLinjer` i regnesonen.
  - Hvert punkt: `{ anlegg, navn, punkt, kode, x, y, z, linje, s, stasjon, side,
    hoyde, toppPlan, bunnPlan, bunnInnmalt, forbi, utenforPlan, utenforHoyde,
    ok, grad }`.
  - Per linje: `{ id, kode, regel, lengde, antall, utenfor, maksSide, maksHoyde,
    naer, ikkeInnmalt: [{ fra, til }], dekket }`.
- `oppsummering(avvik, linjer, bakkefaktor)` – radene til tabellene i fanen,
  rapporten og PDF-en, i linjenes rekkefølge.
- `punkttekst(p, toleranse)` – verktøytipset og avlesningen.
- `fortegn(v, d)` – «+0,05», «−0,02», «0,00».

Toleransene og grensene står i `RorPlan` (`StandardPlanmal.avvik`, `GRENSER`),
der resten av planmalen står.

## 6. Med i 3c fra gjennomgangen av 3a

1. **Andre tegnede anlegg får terrenget sitt hentet** sammen med det aktive når
   de ligger nær det (innenfor terrengbeltet). Kryssingskontrollen bygger dem
   med terrenget som er lastet, og der det manglet, fikk de ingen linjer – et
   kryss med dem ble aldri sett.
2. **Et klikk nær et innmålt punkt midt i en ny trase:** bare endene kobles på,
   men statuslinja sa «festet til» for hvert punkt. Nå sier den «ved 90PE –
   kobles på om det blir en ende», og når traseen lagres, hvilke ender som ble
   koblet.

## 7. Utenfor 3c

- Automatisk tilpasning av planen til det innmålte.
- Innmålte kummer og punktobjekter mot planlagte kummer (hører til «kummer i 3D»).
- Avviket vist fra det innmålte anleggets side.
- Avvik i 3D og i eksportfilene.

## 8. Prøver

- Node (`test/roravvikprove.js`): kodelikhet; sideavvik med fortegn, ved knekk og
  forbi enden; høydeavvik med gods fra hver sin kode; toleranse for selvfall og
  trykk; knytning til nærmeste rør; dekning og hull (ende, midt, ett punkt, ingen
  punkt); nær men utenfor; de verste; merknadene; ingen innmålte anlegg.
- Nettleser (`planAvvik`): knappen slår av og på, fanen, kartet, profilen,
  merknadene, toleransene, angre, rapporten og PDF-en; et innmålt punkt som
  slås av, er ikke med. `planTerrengAndre`: et annet tegnet anlegg får terrenget
  sitt, og krysset med det varsles. `planTegnTrase`: statuslinja sier «ved», og
  hvilke ender som ble koblet.
