# Rør, etappe 1 – import og visning av innmålte rør

Dato: 2026-10-05 · Gren: `ror-etappe1`

Masseberegneren har veg og tomt. Dette er tredje anleggstype: **rør**, hentet inn fra
en as-built-fil fra maskinstyringen og tegnet riktig i kart, lengdeprofil og 3D, med
overdekning mot terrenget og en egen del i rapporten.

Rør bygges i tre etapper, hver med egen spec og plan:

1. **Import og visning** – denne fila.
2. **Grøftemasser** for innmålte rør – graving i jord og fjell, fundament, omfylling,
   gjenfylling. Må håndtere at flere rør ligger i samme grøft.
3. **Planlegging av nye rør** – tegne rør som ikke er gravd ennå og regne grøfta på
   forhånd.

Etappe 1 skal derfor legge datamodellen slik at 2 og 3 kan bygges oppå uten å endre
filformatet.

---

## 1. Avklart med brukeren

| Spørsmål | Svar |
|---|---|
| Hva skal rørene brukes til? | Vise dem, regne grøftemasser, planlegge nye – i etapper, visning først |
| Hvor på røret er punktene målt? | **Toppen av røret.** Senter = topp − D/2, bunn = topp − D |
| Retting når appen kobler feil | **Enkle grep:** slå av punkt, bryte en strek, koble to ender. Grepene overlever ny import |
| Overdekning måles mot | **Kartverkets terreng (DTM1)**, det samme som resten av appen |
| Rapport og PDF i etappe 1 | **Ja, enkel del:** oversiktsplan, tabell per rør, lengdeprofiler |

## 2. Fila – hva som faktisk kommer inn

Eksempelfila (`asbuilts_VA Prøvefelt_2026-09-15T08_30_00.000Z.xml`, Novatron Xsite
Manage) er LandXML 1.2 med **bare punkter** – 423 `CgPoint` i tre `CgPoints`-grupper,
ingen linjer:

```xml
<CgPoint name="1150-…_0c4e7b21-…" surveyOrder="1" code="180 PE" timeStamp="2026-08-27T09:12:44.000Z"
         state="existing" role="measured">6488855.307 429458.503 205.766</CgPoint>
```

- Teksten er `nord øst høyde` (LandXML-rekkefølge).
- `name` er en unik id per punkt – den brukes til å kjenne igjen punktet ved ny import.
- `code` er fritekst fra operatøren: `180 PE`, `90PE`, `SP 160PE`, `VA 110PE`, `110PVC`,
  `32PE`, `40 FIBER`, `110DRENS`, `180 PE DIFUSJON`, og punktobjekter som `90PE MUFFE`,
  `SP MUFFE`, `ANNBORING`, `STAGEKUM`, `160 GREN`, `AS_BUILT_PNT`.
- Fila oppgir **ikke** koordinatsystem. Tallene passer med EUREF89 UTM32 (et sted i
  Agder). Som UTM33 ville de havnet i Sverige.

### 2.1 Målerekkefølgen kan ikke brukes til å trekke linjene

Operatøren måler fram og tilbake og hopper mellom rørene i samme grøft. Koblet i
`surveyOrder` får 40 FIBER et hopp på 689 m, og 110PVC får fem knekker over 120° på 61 m
rør. Prøvd på hele fila:

| Måte | 90PE | 40 FIBER | 110PVC (stikkledninger) |
|---|---|---|---|
| Målerekkefølge | 1 linje, falske hopp opptil 189 m | hopp opptil 689 m | sikksakk |
| Rekkefølge, brutt ved >25 m og skjøtt igjen | 1 linje, 755 m, 2 knekker | 3 linjer, 4 knekker | 4 linjer, 5 knekker |
| **Etter geometri (minste spenntre, maks 25 m)** | **1 linje, 734 m, ingen knekker** | **3 linjer, 891 m** | **4 stubber à ~10 m** |

Spenntreet er stabilt mellom 20 og 30 m maks avstand; ved 40 m begynner de korte
stikkledningene å smelte sammen. **Standard: 25 m**, kan endres per anlegg.

## 3. Tilnærminger som ble vurdert

**Hvor rørene bor i prosjektet**

- **A. Ny anleggstype `ror` (valgt).** Samme mønster som veg og tomt: egen mal, egne
  data, eget arbeidsbilde. Etappe 2 trenger nettopp det et anlegg har – egen mal
  (grøftemal), egne masser, egen kolonne i prosjektoversikten. Kostnaden: rundt hundre
  steder i koden tenker «tomt, ellers veg» og må få en tredje grein.
- **B. Et lag på prosjektet, som fjellobservasjonene.** Minst kode nå, rørene synes i
  alle anlegg. Men etappe 2 og 3 ville måtte flytte dataene inn i et anlegg likevel –
  filformatet ville endret seg to ganger.
- **C. Egen side/app.** Ingen deling av terreng, prosjekt eller rapport. Forkastet.

**Hvordan linjene trekkes** – se 2.1. Geometri (spenntre) er valgt; målerekkefølgen er
forkastet på målte tall.

## 4. Datamodell

```js
{
  id: 'a3', type: 'ror', navn: 'VA Prøvefelt',
  ip: [], vip: [], tverrfall: {…},   // tomme, som på en tomt – veg-kode som slår opp P.ip krasjer ikke
  mal: { …StandardRormal },          // innstillingene; etappe 2 utvider den med grøfta
  ror: {
    sone: 32,                        // UTM-sonen koordinatene i fila står i
    kilder: [{ fil, program, dato, importert, antall }],
    punkter: [{ id, kode, n, o, z, tid, nr }],  // urørt fra fila: nord, øst, høyde, tid, surveyOrder
    koder: { '90PE': { form: 'linje', dim: 90, materiale: 'PE', system: '', farge: 'p2', vis: true }, … },
    retting: { av: [id…], brudd: [[idA, idB]…], koble: [[idA, idB]…] }
  }
}
```

- `StandardRormal = { maksAvstand: 25 }`.
- **Koordinatene lagres som i fila** (nord/øst i `sone`), ikke som grader slik veg og tomt
  gjør. Grunn: as-built er dokumentasjon, og sonen skal kunne rettes etter import uten tap.
  Til kartet: `Geo.fraUtm(o, n, sone)`. Til regning: samme sone som `App.sone` gir tallene
  rett; annen sone går via grader (`Geo.tilUtm`), avvik under 0,01 mm.
- `App.sone` settes fra første punkt når røranlegget er aktivt (`Geo.sone(lon)`), som
  `_settSone` gjør for tomta.
- **Linjene lagres ikke.** De regnes ut fra punktene, kodene og rettingene hver gang –
  da kan de aldri komme i utakt med dataene.
- `ror` blir et av vinduene i `Prosjektform.FELT`, så `P.ror` peker inn i det aktive
  anlegget slik `P.tomt` gjør.

## 5. Komponenter

| Fil | Ansvar | Avhenger av |
|---|---|---|
| `public/js/ror.js` (ny) – `Ror` | Ren logikk, ingen DOM: les LandXML, tolk koder, trekk linjer, slå sammen import, gjett sone, navn fra filnavn, profil og overdekning langs en linje | `Geo` (global i nettleser, `global.Geo` i selvtest) |
| `public/js/ui-ror.js` (ny) – `RorUI` | Importdialogen, rørfanen i sidepanelet, kodetabellen, rettingsknappene, dra-og-slipp | `Ror`, `App`, `Kart` |
| `public/js/ui-rorprofil.js` (ny) – `Rorprofil` | Lengdeprofil for valgt rør på lerret; samme tegnefunksjon brukes i rapporten | `Farger` |
| `public/js/ui-ror3d.js` (ny) – `Ror3d` | 3D: terreng rundt rørene + rørene som streker | `Tegner3d` (ui-3d.js) |
| `ui-kart.js` | `tegnRor()`, rørene dempet i bakgrunnen for andre anlegg, klikk i rettingsmodus | `Ror`, `Farger` |
| `app.js`, `prosjektform.js`, `ui-3d.js`, `ui-rapport.js`, `ui-pdfrapport.js`, `ui-forklaring.js` | Den tredje greina overalt der det i dag står «tomt, ellers veg» | – |
| `index.html`, `app.css` | Rørpanelet, rørmodus i rutenettet, fargene | – |

`Ror` følger mønsteret til de andre logikkfilene: `const Ror = {…}` og
`if (typeof module !== 'undefined') module.exports = Ror;`, så selvtesten kan
`require` den.

### 5.1 `Ror.lesLandXML(tekst) → { punkter, program, dato, epsg, advarsler }`

- Regex-basert, ikke `DOMParser` – Node har ingen, og selvtesten skal kunne kjøre den.
- Leser `Units/Metric linearUnit` (annet enn meter → feil), `Application name`,
  `CoordinateSystem epsgCode` hvis den finnes, og hver `CgPoint` med attributter i vilkårlig
  rekkefølge. XML-entiteter dekodes.
- Punkt uten høyde, tomt punkt (`pntRef`/selvlukket) og tall som ikke er tall hoppes over
  og telles i `advarsler`. Dobbel `name` i samme fil: første vinner, telles.
- Mangler `name`: id lages av kode og koordinater.
- Mangler `code`: `desc` hvis den ikke er «undefined», ellers `UTEN KODE`.
- Tegnsett: nettleserdelen leser fila som bytes og dekoder etter `encoding=` i
  XML-hodet (UTF-8 standard, ISO-8859-1/windows-1252 støttes), så æøå i kodene overlever.

### 5.2 `Ror.tolkKode(kode) → { form, dim, materiale, system, variant }`

- Normaliserer: store bokstaver, tall skilles fra bokstaver (`90PE` → `90 PE`).
- **Punktobjekt** hvis koden har et punktord: MUFFE, ANBORING/ANNBORING, KUM, STAKEKUM/
  STAGEKUM, SPYLEKUM, GREN, BEND, BØY, ENDE, ENDELOKK, PROPP, KRYSS, OVERGANG, REDUKSJON,
  VENTIL, HYDRANT, SKJØT, PUNKT, PNT (dekker `AS_BUILT_PNT`).
- Ellers **linje** hvis den har en dimensjon (første tall 16–3000 = ytterdiameter i mm).
  Uten dimensjon og uten punktord: punktobjekt.
- System fra prefiks: SP spillvann, VA/VL vann, OV overvann, DR drens, AF felles; FIBER/
  KABEL/EL/TREKKERØR er kabelrør; DRENS i koden gir drens.
- Materiale: PE, PEH, PP, PVC, GRP, BET/BETONG, DUKTIL, STÅL.
- Variant: resten (f.eks. DIFUSJON).
- Tolkningen er bare et forslag. Kodetabellen i importdialogen og i rørfanen lar brukeren
  rette form, dimensjon og farge, og slå av en kode. Valgene lagres i `ror.koder`.

### 5.3 `Ror.byggLinjer(ror, mal, tilXY) → { linjer, enslige, objekter }`

Per kode med `form: 'linje'` og `vis: true`:

1. Punktene i koden, minus `retting.av`.
2. Kantkandidater: alle par innen `mal.maksAvstand`, vannrett avstand. Rutenett med
   cellestørrelse = maks avstand, så det ikke blir n².
3. Kruskal: først `retting.koble` (tvungne kanter, også over maks avstand), så
   kandidatene sortert på lengde. Resultatet er en skog uten sykler.
4. `retting.brudd` tas ut **etter** treet er bygd. Da deler bruddet treet i to, og treet
   kan ikke koble rundt bruddet via en nabo – det ville bare flyttet streken.
5. Hvert tre deles i polylinjer mellom knuter (grad ≠ 2). Retning: fra enden med lavest
   `surveyOrder`.
6. Punkt uten nabo blir `enslige` (vises med merknad). Punktobjekter samles i
   `objekter`.

Linje-id: `kode + ':' + den alfabetisk minste punkt-id-en i linja` – stabil nok til at
valgt rør overlever en ombygging.

### 5.4 Import, ny import og sone

- `Ror.slaSammen(gammel, ny)` slår sammen på punkt-id: nye legges til, kjente får
  oppdaterte koordinater, ingenting slettes stille. Rettingene beholdes. Svarer med
  antall nye/kjente/endrede, som vises i dialogen.
- `Ror.gjettSone(punkter, epsg, prosjektpunkter)`: (1) `epsgCode` fra fila; (2) ellers
  sonen som legger punktene nærmest de andre anleggene i prosjektet (innen 100 km);
  (3) ellers 32. Dialogen viser gjetningen i en nedtrekksliste (32/33/35) med posisjonen
  i grader, og kartet zoomer dit etter import. Sonen kan endres i rørfanen etterpå.
- Nordverdi utenfor 6,4–8,0 mill. (f.eks. NTM, ~1,2 mill.): feil med forklaring, ikke
  stille feilplassering.
- `Ror.navnFraFil('asbuilts_VA Prøvefelt_2026-09-15T08_30_00.000Z.xml')` → `VA Prøvefelt`.

### 5.5 Profil og overdekning – `Ror.profil(linje, terrengZ, steg = 1)`

- Stasjonering langs linja (vannrett). Topp rør lineært mellom målte punkt, prøvd hver
  meter og i hvert målte punkt. `senter = topp − D/2`, `bunn = topp − D`.
- `terreng = App.terreng.z(x, y)` – Kartverkets DTM direkte, **ikke**
  `prosjektterreng()` (som ville målt mot en ferdig veg i samme prosjekt).
- `overdekning = terreng − topp`. Hull i terrenget (NaN) gir ukjent overdekning, ikke 0.
- Svarer også med lengde (2D og 3D), minste/største overdekning og fall mellom punktene.
- Terrengflisene lastes langs hvert rør med `Terreng.lastKorridor` og en enkel adapter
  (`lengde`, `punktVed(s)`), halvbredde = 3D-konteksten. Bufret med en nøkkel som tomta
  gjør, så det ikke lastes på nytt ved hver tegning.

## 6. Brukerflate

**Inngang.** Anleggsvelgeren får «⌀ Nye rør» ved siden av «Ny veg» og «Ny tomt», og
førstevalget i et nytt prosjekt (`#velganlegg`) får «Rør (fra fil)». Knappen åpner filvelgeren
(`.xml`). En fil sluppet på kartet gjør det samme. Avbryter man, lages ingenting.

**Importdialogen.** Program og dato, antall punkter, advarsler, sone med posisjon,
kodetabellen (kode · antall · linje/punkt · dimensjon · farge · ta med) og, når et
røranlegg er aktivt, valget «legg til i dette» eller «nytt røranlegg». Ved «Importer»:
`merk()` for angre, anlegget lages eller slås sammen, kartet zoomer til rørene.

**Rørmodus** er et eget arbeidsbilde, som tomtemodus: `.rute.rormodus` med kart øverst og
rørpanelet under, sidepanelet til høyre. Lengdeprofil og tverrprofil hører til en
senterlinje og vises ikke.

- **Kart:** hvert rør i sin farge, strektykkelse etter dimensjon. Punktobjekter som små
  firkanter. Verktøytips med kode, dimensjon, lengde og overdekning. Klikk velger røret.
  Andre anlegg dempet i bakgrunnen, og røranlegg dempet når en veg eller tomt er aktiv.
- **Rørpanelet:** «Profil» og «3D» som tomtpanelets «Snitt»/«Ovenfra». Velger for røret
  (`90PE · 734 m`), ◀ ▶ for å bla, avlesning under musa: stasjon, terreng, topp rør,
  overdekning, fall.
- **Profilen:** terrenglinje, røret som bånd mellom topp og bunn, målte punkt, overdekning
  ved punktene, punktobjekter innen 3 m av røret, høydeoverdrivelse skrevet på tegningen.
- **3D:** terrenget i en korridor rundt rørene (40 m standard, samme valg som tomta),
  rørene som streker oppå (de ligger jo under bakken – røntgenvisning), loddrette staker
  fra terrenget ned til røret i hvert målte punkt så dybden synes.
- **Sidepanelet** i rørmodus: fanene «Rør», «Koder» og «Forklaring».
  - *Rør:* lista over rør gruppert på kode med lengde og minste/største overdekning,
    merknader (røret over terrenget i modellen, hull i terrenget, enslige punkt, brudd
    som ikke gjelder lenger), sone, maks avstand, rettingsknappene og «Tilbakestill
    rettinger».
  - *Koder:* samme tabell som i dialogen.
- **Retting** (`Kart.modus`): *Slå av/på punkt* (klikk på et målt punkt), *Bryt* (klikk på
  en strek), *Koble* (klikk to ender). Hvert grep går gjennom `merk()`, så Ctrl+Z virker.

**Rapport og PDF.** Rørdelen: kilde (fil, program, dato, sone, «høyder slik de står i
fila, forutsatt NN2000»), oversiktsplan (strektegning med målestokk og nordpil),
tabell per rør (kode, dimensjon, lengde, antall punkt, minste/største overdekning,
merknad) og lengdeprofil for hvert rør over 20 m. Stikkledninger under 20 m står bare i
tabellen. Profilene tegnes på nytt i lys palett, som resten av rapporten.

## 7. Integrasjon – den tredje greina

Kartleggingen fant de stedene som i dag behandler alt som ikke er tomt, som veg. Alle må
gjennomgås. De som ellers ville gjort skade:

- `nyttAnlegg` tvinger typen til veg/tomt; `Prosjektform.klargjor` gir alt som ikke er
  tomt, vegmalen.
- `harInnhold` ser bare på `ip` og `tomt.punkter` – et prosjekt med bare rør ville
  **aldri blitt autolagret**. Samme hull i `slettAnlegg` (sletter uten å spørre),
  `velgAnleggstype` (erstatter et «tomt» anlegg) og `ubestemt`-sjekken.
- `oppdater()` kjører vegløypa for alt som ikke er tomt. Rør får sin egen:
  last terreng → bygg linjer → regn profiler → `App.resultat = { type: 'ror', … }`.
- `Kart.tegn()`, 3D-bakgrunnen (`ui-3d.js`), `visMalfane`, `malTilSkjema`/`skjemaTilMal`,
  `anleggsmerke`, `bakkefaktor`, `_mittOmraade`, `byttAnlegg`, `leggTilAnlegg`.
- Prosjektsummen og nøkkeltallene: rør har ingen masser i etappe 1 og skal ikke telle
  som «ikke regnet ennå».
- `gjennomAlleAnlegg` (prosjektrapport, PDF, eksport av alt): rør gir sin rapportdel, og
  eksportene hopper over rør **med en gang** med grunn («rør kan ikke eksporteres ennå»),
  i stedet for å vente 45 s på et resultat som aldri kommer.

Ny hjelper: `App.erRor()`, ved siden av `erTomt()`.

## 8. Feil og merknader

| Tilfelle | Hva brukeren ser |
|---|---|
| Ikke LandXML | «Fila er ikke LandXML. Velg en .xml-eksport fra maskinstyringen.» |
| Ingen `CgPoint` | «Fant ingen innmålte punkter i fila.» |
| Enhet ikke meter | «Fila er i ‹enhet›. Bare meter støttes.» |
| Punkt uten høyde / ugyldige tall / doble id-er | Telles og vises i dialogen; punktene hoppes over |
| Nordverdi som ikke er UTM i Norge | Feil med tallet og forklaring (NTM støttes ikke ennå) |
| Hull i terrenget langs røret | Overdekning vises som ukjent der; merknad med antall meter |
| Overdekning under null | Merknad: «røret ligger over terrenget i modellen – terrenget er trolig endret etter skanning, eller punktet er feil» |
| Brudd/kobling som ikke treffer lenger etter ny import | Merknad med antall |

## 9. Tilgjengelighet

Nye knapper er `<button>`, alle felt har `<label>`. **Farge er aldri alene:** koden står
som tekst ved fargen i lister, verktøytips, profil og rapport. Rørfargene legges som
CSS-variabler i alle tre fargeblokkene (mørk, lys, utskrift) via `Farger`, med minst 3:1
kontrast mot kart- og panelbakgrunn.

## 10. Prøver

**Selvtest (Node), ny seksjon:**

- `lesLandXML`: attributter i vilkårlig rekkefølge, entiteter, punkt uten høyde, doble
  id-er, manglende kode, feil enhet, ikke-LandXML, `CoordinateSystem`.
- `tolkKode`: alle 18 kodene fra den ekte fila + `OV 200PP`, `DR 110`, `SP 160 PVC`.
- `byggLinjer` på oppdiktede punkter som etterligner fila (fram og tilbake, rør om
  hverandre, stikkledninger): én linje per rør i riktig rekkefølge, ingen falske hopp,
  brudd ved for stor avstand, brudd/kobling/av virker, brudd kan ikke kobles rundt.
- `slaSammen`, `gjettSone`, `navnFraFil`.
- `profil` mot et kunstig terreng (skråplan) – overdekning og lengder eksakt.
- `Prosjektform`: røranlegg overlever klargjøring, `FELT` inkluderer `ror`
  (`anleggsprove.js` oppdateres).

Den ekte fila legges **ikke** i repoet (kundens data). Ligger stien i
`ROR_FIL`, kjører selvtesten den i tillegg og skriver et sammendrag.

**Nettlesertest:** import av en oppdiktet fil, linjer i kartet, profil tegnet, bytte
veg ↔ rør ↔ tomt uten feil, angre/gjør om, autolagring slår til, retting med angre,
rapport og PDF med rørdel, eksport hopper over rør uten å vente.

## 11. Utenfor etappe 1

Grøftemasser og felles grøft (etappe 2). Tegne nye rør (etappe 3). Eksport av rør
(KOF/SOSI/DXF). Overflater (TIN) fra maskinstyringen. NTM. LandXML-linjer
(`PlanFeatures`, `PipeNetworks`). En felles kodeliste på tvers av prosjekter.
