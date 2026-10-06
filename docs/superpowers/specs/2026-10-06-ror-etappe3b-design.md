# Rør, etappe 3b – eksport til maskinstyring og stikning

Dato: 2026-10-06 · Gren: `ror-etappe3b`

Etappe 3a tegner, høydefører og regner grøfta for planlagte rør. 3b får dem ut av
programmet: til maskinstyringen som 3D-linjer, til stikkeren som punkt, og til kommunen
og tegneren i de formatene programmet alt skriver for veg og tomt.

---

## 1. Avklart med brukeren

| Spørsmål | Svar |
|---|---|
| Hvilken høyde skal maskinstyringen få? | **Alle tre som egne lag:** bunn innvendig, topp rør og gravebunn – den som setter opp maskina, velger |
| Designvalg underveis | Tas underveis og står her med begrunnelsen |
| Prinsipp | Alt som endrer høyder, ligger på knapper. Eksporten leser bare – den endrer ingenting |

## 2. Hva som eksporteres

- **Alle røranlegg**, tegnede og innmålte. Begge gir de samme linjene (`res.linjer`), og et
  innmålt rør til kommunen er like nyttig som et planlagt til maskina.
- **Hvert rør som tre 3D-linjer**, i plan langs rørets senter:
  - **topp rør** – linjas egne høyder (målt for innmålte, regnet for tegnede);
  - **bunn innvendig** – topp − D + gods (godset som i 3a, `RorPlan.gods`);
  - **gravebunn** – bunnen av grøfta fra grøftemotoren (`res.groft.profiler`), der det
    graves. Der grøfta ikke er regnet (røret over terrenget, ingen dimensjon), brytes linja
    – den trekkes aldri over et sted uten tall.
- **Kummene** (tegnede anlegg): senter med bunnløp og lokk (terrenget i senter).
- **Et rør uten dimensjon** får bare topp rør, og svaret sier det.
- **Rør uten høyder** (tegnet før terrenget er hentet) står ikke i resultatet og kommer
  ikke med; eksporten krever et ferdig regnet anlegg, som for veg og tomt.

## 3. Formatene

### KOF – stikningspunkt
- Punkt langs hvert rør: hvert knekkpunkt, hver 10. meter og enden. Mellompunktene på
  trykkrør (hver meter) er for mange til et instrument – de står i linjeformatene.
- Tre linjer per punkt, med kodene `RORBUNN`, `RORTOPP` og `GRAVBUNN` (gravebunn bare der
  den finnes). Navnet er `<rørnr>-<løpenr><B|T|G>`, for eksempel `1-004B` – innenfor ti tegn
  også med samlefilens prefiks (`A1-004B`).
- Kummene: `K<nr>B` (`KUMBUNN`, bunnløp) og `K<nr>T` (`KUMTOPP`, terreng i senter).
- Hodet sier hva rørnumrene er: `MERK: 1 = SP 160PE (selvfall, ⌀160)`.

### LandXML – 3D-linjer
- `<PlanFeatures>` med én `<PlanFeature>` per rør og høyde – «1 SP 160PE – bunn innvendig»,
  «… – topp rør», «… – gravebunn» – som 3D `<Line>`-strekk i `<CoordGeom>`, slik tomta
  skriver sine linjer.
- `<CgPoints>` med kummene: `k1 bunnløp` og `k1 lokk`.
- `PipeNetworks` er vurdert og ikke valgt: røret er en polylinje med mange knekk, og et
  nettverk krever en struktur i hvert knekkpunkt. Få maskinstyringer leser det.

### SOSI
- `.KURVE` per rør og høyde. `OBJTYPE Rørledning` for bunn og topp, `Grøftebunn` for
  gravebunnen, med `..NAVN` (koden), `..HØYDEREF` (`"bunn innvendig"`, `"topp rør"`,
  `"gravebunn"`) og `..DIAMETER` (mm). Katalogen er programmets egen, som for veg og tomt.
- `.PUNKT` per kum: `OBJTYPE Kum`, `..NAVN`, `..DIAMETER`, høyde bunnløp.

### DXF
- 3D-polylinjer på lagene `<KODE>_BUNN`, `<KODE>_TOPP` og `<KODE>_GRAVEBUNN` (koden renset
  til det R12 tåler, som lagnavnene i dag).
- Kummene som `CIRCLE` med ytre diameter (D + 0,2 m) på bunnløpet, og `TEXT` med navn og
  bunnløp, på laget `KUM`.

### Stikningsliste (CSV)
- `Ror;Kode;Punkt;Type;Stasjon;Nord;Ost;Bunn_innvendig;Topp_ror;Gravebunn;Terreng;Overdekning`
  – de samme punktene som i KOF-fila, og en rad per kum.

### Masser (CSV)
- Grøftemassene per kode (lengde, graving, sprengning, fundament, omfylling, gjenfylling,
  kummer), summen, dybdeklassene og massebalansen – de samme tallene som Rør-fanen.

### GeoJSON
- Hvert rør som `LineString` med egenskapene (nr, kode, dimensjon, lengde, regel, minste og
  største overdekning), og kummene som `Point`.

## 4. Alle i prosjektet

Røranleggene er med i samlefilene («Alle i prosjektet») for alle formatene og CSV-ene, med
anleggsprefikset foran punktnavnene og lagene, som veg og tomt.

## 5. Grensesnittet

- Eksport-fanen vises også for røranlegg. Knappene sier hva de lager for rør («Stikningspunkt
  (KOF)», «Rørene som 3D-linjer (LandXML)», «Grøftemasser per kode (CSV)» …), og notisen
  forklarer de tre høydene. Rutenettet er bare for tomt.

## 6. Modulen

Ny ren modul `public/js/roreksport.js` (`RorEksport`), uten DOM, prøvd i node:

- `punkter(app, res)` → per rør: `{ linje, nr, kode, k, D, gods, linjer: { topp, bunn,
  gravebunn: [[…], …] }, stikk: [{ s, x, y, topp, bunn, gravebunn, terreng, type }] }`
- `kofKropp(app, res, navner)` + `kofMerknader(app, res)`; `kof(app, res)`
- `landxmlDeler(app, res, pre)` → `{ linjer, punkter }`; `landxml(app, res)`
- `sosiDeler(app, res, idFra, navn)` → `{ rader, omr, niva, nesteId }`; `sosi(app, res)`
- `dxfKropp(app, res, lagpre)`; `dxf(app, res)`
- `stikningRader(app, res)`, `masseRader(app, res)`, `geojson(app, res)`

Hjelperne (`kofPunkt`, `kofHode`, `kofNavner`, `landxmlDokument`, `sosiHode`, `sosiTekst`,
`dxfDokument`, `dxfLagpre`, `xml`) kommer fra `Eksport`.

## 7. Kanter

- Ingen terreng / ikke regnet → `kanEksportere` sier nei, som i dag.
- To KOF-punkt med samme navn → eksporten stopper med en melding (vakten finnes).
- Et rør som starter og slutter i samme punkt (lukket), eller er kortere enn 10 m: bare
  knekkpunktene og enden.
- Sone: koordinatene er i regnesonen (`res.sone`), og hodet bruker den samme.

## 8. Prøver

- **Node** (`test/roreksportprove.js`, med i `npm test`): stasjonene (knekk, hver 10. m,
  enden), høydene (bunn = topp − D + gods), gravebunnen mot grøftemotoren og bruddet der
  den mangler, KOF-navnene (unike, ≤ 10 tegn, prefiks), kodene og kummene, LandXML
  (PlanFeature per rør og høyde, N Ø Z-rekkefølge, CgPoints), SOSI (kurver, punkt, område,
  centimeter), DXF (lag, sirkel på bunnløpet), stikningslista og massene.
- **Nettleser** (`planEksport`): Eksport-fanen vises for et tegnet anlegg, hver knapp
  lager en fil med riktig innhold, og samlefila med veg, innmålte og tegnede rør har alle.
  Prøven som krevde at rør *ikke* kunne eksporteres, snus.

## 9. Utenfor 3b

LandXML `PipeNetworks`. Stikningslista i rapporten og PDF-en. Valgfri stikningsavstand.
