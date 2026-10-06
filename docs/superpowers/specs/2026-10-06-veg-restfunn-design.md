# Veg-delen: restfunnene fra GJENNOMGANG.md

Dato: 2026-10-06 · Gren: `veg-restfunn`

`GJENNOMGANG.md` har 166 funn fra 18 granskere. De kritiske er rettet; de
alvorlige, moderate og små var «delvis rettet og ikke systematisk ettergått».
Nå er hvert av dem ettergått mot koden slik den er i dag (fem lese-agenter,
med node-kjøringer og mutanter): rundt 80 står, rundt 30 er delvis rettet, og
resten er rettet eller ikke en feil. Denne spesifikasjonen sier hva som gjøres
med hvert av de åpne, i puljer.

## 1. Prinsipper

- **Alt som endrer høyder, ligger på knapper** (brukerens regel). Innmålte og
  innlagte høyder endres aldri av en omregning. Funn der koden i dag gjør det,
  går først (pulje 1).
- Hver retting får en prøve som ville vært rød før. Prøver som låser feil
  oppførsel, endres sammen med rettingen og står i commit-meldingen.
- Avledet geometri (vertikalkurver mellom knekkpunktene, kurvene i planlinja)
  er beregnet, ikke innlagt. Rettes den, kan tallene i et lagret prosjekt endre
  seg ved neste beregning – det står i FORTSETTELSE.md, ikke i en merknad.
- Puljene flettes inn i `main` når de er gjennomgått og grønne.

## 2. Pulje 1 – høyder uten knapp, og knapper som legger høydene feil

| Funn | Hva | Retting |
|---|---|---|
| N15 | `oppdater()` endret `P.vip` ved hver omregning: `justerProfilTilLengde` slettet knekkpunkt bak linjeslutt – også låste – og la til et endepunkt; ett punkt ble kastet av forslaget | Beregningen får en **avledet** profil, `vipTilLengde(vip, L)`: det første punktet bak slutten er med som det er, så vegen som er igjen blir den samme og den siste vertikalkurven er hel; resten bak slutten er ikke med. Mangler et stykke i enden, forlenges den med den siste stigningen. Et punkt under en halv centimeter bak slutten er på slutten. `P.vip` røres ikke, og «Rett opp» og «Optimaliser» flytter bare høyder på linja. Forslag av seg selv bare når profilen er **tom** (et nytt anlegg har ingen høyder å miste); med ett punkt beholdes det i forslaget, og blir det ikke noe forslag, står punktet. Punkt bak linjeslutt står i høydetabellen som «bak slutten». *(Endret etter gjennomgangen: først ble punktene bak byttet ut med et endepunkt på slutten, og det klemte den siste kurven.)* |
| N2/L12 | Én overstyrt kanthøyde (tverrfall) gjaldt hele vegen og slo av doseringen | Overstyringen gjelder fra den forrige til den neste overstyringen; utenfor spennet deres gjelder standard tverrfall og dosering, med en overgang på 10 m |
| N18 | «Fyll inn» kastet låste høyder som lå tettere enn halve steget | Alle låste blir liggende; det fylles rundt dem; antallet står i statuslinja |
| B8 | Å åpne prosjektet som alt er åpent, la den lagrede versjonen over ulagrede endringer uten spørsmål | Samme navn og ulagrede endringer: spør først |
| B13 | «Lås alle» og punkthøyde fra tverrsnittet låste uten K = 0 – linja gikk forbi den låste høyden | K = 0 når et punkt låses på knapp (ikke når et prosjekt åpnes) |
| L32 | SL-feltet hadde `step="0.01"`, så et piltrykk rundet høyden og låste punktet | `step="0.001"` |
| A10 | «Massebalanse» bisekterte på en balanse uten bærelaget – 3 485 m³ måtte kjøres inn per km | Balansen knappen sikter mot, tar med det som kan bygges av egne masser (bærelaget) |
| A25 | Uten terreng flyttet «Massebalanse» alle ulåste høyder 8 m ned og sa «i balanse» | Avbryter uten å røre høydene, og sier hvorfor |
| M31 | Sluttrettingen i «Rett opp» brukte terrengprofilen og grensene fra før linja ble flyttet sidelengs | Terrengprofilen og grensene bygges på nytt før sluttrettingen |
| A6 | Veiklassevalget satte vegbredden ned til klassens minstebredde | En bredere bredde brukeren har satt, blir stående; statuslinja sier det |
| N16 | Tomt felt for profilavstand ga 1 m | Tomt felt beholder verdien som gjaldt |
| — | Tomt tverrfallsfelt ga 0,05 % (reserven var brøken, delt på 100 igjen) | Tomt felt beholder verdien som gjaldt |
| M32 | `tillattStigning` prøvde bare ni punkt på strekket – kurver imellom ble oversett | Prøvene høyst 5 m fra hverandre |
| A9 | «Rett opp» satte K opp, aldri ned | K senkes mot kravet når nabokurven mangler plass (på knapp) |

## 3. Pulje 2 – lagring og angre

| Funn | Hva | Retting |
|---|---|---|
| L29 | `_kjør` ga selve IDBRequest-objektet – et prosjekt som bare lå i reservelageret, kunne ikke åpnes | Svaret er `result` |
| B6 | `hent()` svelget lesefeil, så importen og lagringen skrev over et prosjekt med samme navn | «Finnes ikke» og «fikk ikke lest» skilles; ved lesefeil avbrytes det |
| N14 | Et slettet prosjekt som sto åpent, kom tilbake ved neste autolagring | Navnet og lagret-tilstanden nullstilles |
| N12 | «Ny» lagret ikke det åpne prosjektet først | Som «Åpne»: ventende autolagring kjøres |
| N13 | Autolagringen tok navnet midt i skrivingen | Navnet tas fra prosjektet, ikke fra feltet |
| N9 | «Eksporter alle» la `null` i sikkerhetskopien | Hoppes over og nevnes |
| L27 | Løpenummeret ble bygd på det utrimmede navnet | Trimmet |
| B11, N4, N17 | Angre manglet for malfeltene, «Tøm tabellen», høydetabellen, innliming, punkthøyde, fjellobservasjoner, strekninger, veiklassevalg, «Nullstill mal», lås alle/ingen og draging i lengdeprofilen; merket ble satt før vaktene | `merk` før hver endring, og etter vaktene |
| N11 | × i linjetabellen brukte et foreldet radnummer | Slås opp på punktet |

## 4. Pulje 3 – rapport, PDF og eksport

N6/A18 (20 m-bolkene overlapper og har feil etiketter), N7/A19 (stikningstabellen
dropper profiler stille), N8 («0,5 m grunnere» når forskyvningen er mindre), L20
(tabelloverskrift alene nederst), L22 (prosjektnavnet avkortes ikke), L23
(blandede desimaltegn), L30 («profil 0» for merknader om hele linja), L28 (sidepanelet
viser innskrevet, ikke brukt, profilavstand), M21 (slitelaget mangler i «Må
kjøres inn»), M1 (faktormerknaden oppgir standardverdien), L18 (SOSI-kommentaren),
restene av L16/L17 (DXF på kote 0 når foten mangler) og M19 (PDF-en merker ikke
fyllingsvolum).

## 5. Pulje 4 – PDF-innlesing

A2 og A3 (/Length), M2 (linjeskift-trimming), M3 (lukket flate foran veglinja),
M4 (ukomprimerte strømmer), M5 (/Contents-array og CTM), M6 (baner fra høyre),
M7 (referansepunkt for tett), M8 (under fem streker) og B14 (lerretet uten CSS –
vokser for hver musebevegelse ved skalering 1,25).

## 6. Pulje 5 – regler og beregning

N5 (flyttallsstøv i radiusbånd), M13 (K1-reglene – infoboksen sier hva som ikke
gjelder), M14 (K4 18 %), M15 (0,999 og «øk K til»), M16/M30 (låste telles per
runde), M17 (dubletter), M20 (beregningsbredde slår av utslagskontrollen), M22
(fjellpunkt mot strekning – vekten avtar mot rekkevidden), M23 (radius i skarp
knekk), M24 (hårnål), M33 (sideforskyvningen leser terrenget langs kandidaten),
A1 (gulv for profilavstand), A8 og A14 (proporsjonal innkorting av kurver – den
minste får det den trenger), A13 (begge knekkpunkt varsles), A21 (straffen tar
alle brudd), A22 (kontroll på fint rutenett før resultatet godtas), A23 («N nye
brudd»), L3 (tverrfallsretning valideres), L5 (kortstrekktillegget), L8
(rettProfil fordeler jevnt), L10 (dobbel merknad for hull), L11/L24
(fjell/løsmasse-splitten), L13 (180°), L14 og L15 (advarslene om kurver), L25
(bakkefaktoren én gang på volum), N19 (terrengets reservevekter) og B23 (K5).
**Ikke gjort:** L6 (K7s stigningsvilkår) og L7 (dreining over 135°) krever
normalens figurer – infoboksen sier at de ikke er med.

## 7. Pulje 6 – grensesnitt og tilgjengelighet

N20 (min/step), N21 (skyveren), N22 (labels og `role="status"`), L26 (klikk på
skyggelinja), B2 (innsatt punkt i en kurve – radiuskollaps sies og kan angres),
B3 (dobbeltklikk), A5 (hull i avlesningen), M10 (`_helning`) og L4 (`_somForhold`).

## 8. Pulje 7 – tjeneren og terrenget

N23 (px i flishodet), N24 (`res`), N25 (feilsvar bufres), B16 (diskmellomlageret)
og L34 (filstien og hvilket grensesnitt tjeneren lytter på).

## 9. Pulje 8 – prøvene

N26–N28 (prøver som ikke kan feile), N29 (modulkontrollen), N30–N32 (bakkefaktor,
rampen, Bruckner), N33 (talregresjon på ekte terreng uten nett), B20 (seksjon 8),
B21 (Kartverket forbi mellomlageret), L35 (`paastand` skriver detaljen) og L36
(`console.error` under nettlesertesten).

## 10. Pulje 9 – det den siste gjennomgangen fant

Gjennomgangen av pulje 6–8 og rettelsene fant ingen kritiske feil, men disse
viktige:
- LandXML kunne skrive linjeslutt to ganger eller baklengs.
- `GET //` tok ned utviklingstjeneren.
- `merk` + `slippMerke` var ikke uten virkning: «Gjør om» ble tømt, og med
  full liste forsvant den eldste posten.
- En prøve for navnet i angrelista kunne ikke feile.
- 41 rettelser hadde ingen prøve som feilet når rettelsen ble tatt bort.

Småfunnene er også tatt:
- tekst i PDF-ordbøker;
- den nyeste utgaven i objektstrømmer;
- `h`/`s` i baner;
- tilbakesteg mot det lengste linja har nådd;
- plassdelingen lineær i praksis;
- hjørneradien ved siden av en kurve;
- halve søketreff;
- etiketter uten id;
- ventede konsollfeil per prøve.

Valg:
- Et skarpt hjørne regnes fortsatt med den største kurven som får plass. Det
  er en øvre grense, og merknaden ber om at det legges inn en kurve. Å bruke
  klassens minste radius i stedet ville gjort hvert hjørne så strengt som
  normalen tillater, også der det er plass til en slak kurve.
- Et kort bratt strekk mellom profilene vurderes med alle profilene rundt,
  ikke bare naboene.
