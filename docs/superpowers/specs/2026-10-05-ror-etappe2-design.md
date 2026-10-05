# Rør, etappe 2 – grøftemasser

Dato: 2026-10-05 · Gren: `ror-etappe2`

Etappe 1 henter inn innmålte rør og viser dem. Etappe 2 regner grøfta de ligger i:
graving i løsmasse, sprengning i fjell, fundament, omfylling og gjenfylling, løpemeter
per dybdeklasse og en massebalanse – mot et teoretisk grøfteprofil. Flere rør i samme
grøft regnes som én grøft.

Regnestykket bryr seg ikke om røret er innmålt eller planlagt. Etappe 3 (planlegge nye
rør) skal bruke det som det er.

---

## 1. Avklart med brukeren

| Spørsmål | Svar |
|---|---|
| Hva skal massene brukes til? | **Alt tre:** oppgjør for jobben som er gjort, kalkyle før jobben, massedisponering |
| Normalgrøft i løsmasse | **Skråning 1:1, bunnbredde D + 2 × 0,3 m, fundament 0,15 m under røret, omfylling til 0,3 m over topp rør, gjenfylling med stedlige masser.** Standardverdier som kan endres per anlegg |
| Flere rør i samme grøft | **Automatisk felles grøft:** groper som overlapper blir én grøft, og hver kubikk telles én gang |
| Justering når det automatiske ikke stemmer | **Skille grøfter, slå sammen grøfter, mål per rør eller kode, mål på en strekning – og helningen på alle nivåer** |
| Hvor er det fjell? | **Strekninger markert på røret + prosjektets sonderinger der de finnes.** Ellers løsmasse. Standarddybden (0,5 m) brukes ikke for rør |
| Grøft i fjell | **Loddrette vegger i fjell, samme bunnbredde og fundament som i løsmasse.** Løsmassen over graves med vanlig skråning fra kanten av fjellgrøfta |
| Hvilke tall? | **Kubikk per lag, løpemeter per dybdeklasse, fordelt per rør og kode, massebalanse** |
| Regnemåte | **Rutenett** (A under) |
| Rør der koden ikke gir dimensjon | **Dimensjonen kreves.** Røret får ingen grøft før dimensjonen er satt; kodetabellen og importdialogen markerer koden, og grøftedelen sier hvilke koder og hvor mange meter som ikke er med. Ingen tall som ser riktige ut uten å være det |
| Hvor mye av gravemassen kan brukes til gjenfylling? | **100 % som standard**, kan endres per anlegg |

Fra etappe 1: punktene er toppen av røret, målt midt over senterlinja. Grøfta ligger
derfor sentrert på linja gjennom punktene, og bunn rør er topp − D.

## 2. Tilnærminger som ble vurdert

**A. Rutenett under grøfta – valgt.** Ruter på 0,2 m i et belte rundt rørene. Hvert
rør gir en grop; hver rute er gravd ned til den dypeste gropa som når den. Felles grøft
kommer av seg selv der gropene overlapper, og ingenting telles to ganger – heller ikke
der rør møtes, deler seg eller krysser. Samme grunnmønster som tomta.

**B. Tverrprofiler langs hvert rør, som vegen.** Kjent, og lag og dybdeklasser faller
rett ut. Men felles grøft må settes sammen profil for profil, og der rør møtes, deler
seg eller krysser på skrå, blir det enten dobbelttelling eller spesialtilfeller.
Svinger og avgreininger gir overlapp og hull.

**C. Lengde × tverrsnitt per rør.** Raskest å lage, men felles grøft blir en grov
gruppering som bommer der rørene sprer seg.

## 3. Datamodell

```js
anlegg (type 'ror') {
  mal: {
    maksAvstand: 25,                       // etappe 1
    groft: { bunntillegg: 0.30, fundament: 0.15, omfylling: 0.30, helning: 1.0, brukbar: 1.0 }
  },
  ror: {
    …etappe 1: sone, kilder, punkter, koder, retting…,
    koder: { '<kode>': { …etappe 1…, groft: { bunntillegg?, fundament?, omfylling?, helning? } } },
    groft: {
      strekninger: [{ fra: '<punkt-id>', til: '<punkt-id>',
                      mal: { bunntillegg?, fundament?, omfylling?, helning? },
                      fjell: null | <dybde fra terreng til fjell, m>, egen: false }],
      sammen: [['<punkt-id på rør A>', '<punkt-id på rør B>']]
    }
  }
}
```

- `StandardGroftmal = { bunntillegg: 0.30, fundament: 0.15, omfylling: 0.30, helning: 1.0, brukbar: 1.0 }`.
- `helning` er vannrett per loddrett: 1,0 = 1:1, 0,5 = 1:0,5, **0 = loddrett**.
- `bunntillegg` er arbeidsrommet på hver side: bunnbredde = D + 2 × bunntillegg. D er
  dimensjonen fra kodetabellen i meter. **Mangler den, får røret ingen grøft** – det er
  ikke med i noen av tallene før dimensjonen er satt, og det sies fra (se 7). Et rør med
  D = 0 ville gitt en grøft som er for grunn og for smal uten at noe så galt ut.
- `fundament` er tykkelsen under bunn rør; `omfylling` er høyden over topp rør.
- `brukbar` er andelen av gravd løsmasse som kan gå tilbake som gjenfylling (0–1).
- **Det mest spesifikke vinner, felt for felt:** strekning → kode → anlegg.
- En strekning ligger mellom to punkt på **samme rør** (rekkefølgen spiller ingen rolle),
  og lagres mot punkt-id-ene fra fila, som rettingene i etappe 1. Da står den seg når en
  nyere fil importeres. `fjell: 0` er fjell i dagen; `null` betyr at strekningen ikke
  sier noe om fjell. `egen: true` er egen grøft (skille).
- `sammen` er par av punkt-id-er, ett på hvert av to rør. Rørene får felles grøft med
  flat bunn der de går side om side innen 10 m.
- **Ingen resultater lagres.** Grøfta regnes av dataene hver gang, som linjene.
- **Klargjøringen** (`prosjektform.js`, i samme funksjon som rørfeltene) klemmer tallene
  til lovlige spenn – helning 0–3, bunntillegg 0–2, fundament 0–1, omfylling 0–2,
  brukbar 0–1, fjell 0–20 – og tar bort strekninger og par som ikke er gyldige. Et felt
  som ikke er et tall, faller tilbake på nivået over.

## 4. Komponenter

| Fil | Ansvar | Avhenger av |
|---|---|---|
| `public/js/groft.js` (ny) – `Groft` | Ren logikk, ingen skjerm: standardmalen, hvilke mål som gjelder hvor, rutenettet med gropene, lagene, styrende rør, løpemeter og dybdeklasser, massebalansen | ingenting (alt kommer inn som argumenter) |
| `public/js/ui-groft.js` (ny) – `GroftUI` | Grøftedelen i Rør-fanen, feltene, lista over justeringer, verktøyene «Grøft på strekning» og «Felles grøft» | `Groft`, `App`, `Kart`, `RorUI` |
| `masser.js` | Ny metode `Fjellmodell.sondert(x, y)`: dybde fra sonderinger innen rekkevidden, ellers `null` – aldri standarddybden | – |
| `app.js` | `beregnRor` regner grøfta etter profilene; prosjektsammendraget | `Groft` |
| `prosjektform.js` | Klargjøring av de nye feltene | `Groft` |
| `ui-kart.js` | Grøftekanten, strekninger og sammenslåinger, klikk i de to verktøyene | `Groft` |
| `ui-rorprofil.js` | Grøfta i lengdeprofilen og avlesningen | – |
| `ui-ror3d.js` | Grøfta som åpen grop i terrenget (lag av/på) | – |
| `ui-rapport.js`, `ui-pdfrapport.js` | Delen «Grøftemasser» | – |
| `index.html`, `app.css` | Knappene, grøftedelen, fargene | – |
| `test/groftprove.js` (ny) | Prøvene mot fasit | `Groft` |

### 4.1 `Groft.beregn(o) → resultat`

Inn:

```js
{
  linjer,          // fra App.byggRor(): [{ id, kode, punkter: [{ id, z }], xy: [{ x, y }] }] i regnesonen
  koder,           // kodetabellen (dimensjon og kodemål)
  mal,             // anleggets grøftemal
  justering,       // ror.groft: strekninger og sammen
  terrengZ,        // (x, y) → kote, NaN der terreng mangler
  fjellSondert,    // (x, y) → dybde til fjell | null
  faktorer,        // prosjektets faktorer, som veg og tomt
  rute: 0.2
}
```

Ut:

```js
{
  sum: { gravingLos, sprengning, fundament, omfylling, gjenfylling, rorvolum, areal },
  perLinje: Map(id → { …samme felt…, lengde, dybdeklasser: [m, m, m, m, m] }),
  perKode:  Map(kode → { …samme felt…, lengde, dybdeklasser }),
  dybdeklasser: [{ fra: 0, til: 1, lengde }, …, { fra: 4, til: Infinity, lengde }],
  balanse: { gjenfyllingFraGraving, overskuddLos, sprengtFast, sprengtLos,
             kjopFundament, kjopOmfylling, kjopGjenfylling },
  modell,          // segmentene og flisregisteret – til Groft.nivaa(modell, x, y) og Groft.kanter(modell)
  profiler: Map(id → [{ s, terreng, gravebunn, fundamentBunn, fundamentTopp, omfyllingTopp, fjell }]),
  utenDimensjon: [{ kode, lengde }],   // rør som ikke er med fordi dimensjonen mangler
  merknader: [{ type, linje?, tekst }]
}
```

Alle kubikk er faste/teoretiske m³ (ferdig utlagt for fyllmassene). `omfylling` er uten
selve røret; `rorvolum` står for seg.

### 4.2 Gropa for ett rør

For midtpunktet q i en rute og et rør p: nærmeste punkt på linja gir stasjon s og
vannrett avstand d. Ved stasjonen gjelder målene for s (strekning → kode → anlegg):

- topp(s) lineært mellom de målte punktene; bunn rør = topp − D
- gravebunn z_b = bunn rør − fundament
- halv bunnbredde w = D/2 + bunntillegg
- fjelloverflaten z_f = terreng(q) − fjelldybde, der fjelldybden kommer fra en strekning
  på p ved s, ellers `fjellSondert(q)`, ellers finnes ikke fjell

Gravenivået fra p i q:

- innenfor bunnen (d ≤ w): z = z_b
- utenfor (e = d − w): z = (fjell over gravebunnen ? z_f : z_b) + e / helning

Med helning 0 blir det loddrett: utenfor bunnen graves ingenting. I fjell står veggen
loddrett opp til fjelloverflaten, og skråningen i løsmassen begynner der. Forbi enden
av et rør gir avstanden til endepunktet en avrundet ende, slik en grøft slutter.

### 4.3 Felles grøft, egen grøft og sammenslåing

- **Felles:** rutas gravenivå z_g er den laveste av gropene fra alle rørene. Gropene
  smelter sammen der de overlapper.
- **Egen grøft:** en strekning med `egen: true` regnes som en egen grop som ikke slås
  sammen med de andre. Volumet legges til – også der gropene overlapper, fordi det var
  to grøfter.
- **Slått sammen:** for et par A–B, der B ligger innen 10 m fra A, trekkes en flat bunn
  mellom dem: firkanter mellom etterfølgende stasjoner, med gravebunn lineært mellom
  A-s og B-s gravebunn. Firkantene er en ekstra grop med vanlig skråning ut fra kantene.

### 4.4 Lagene i en rute

Søylen fra z_g opp til terrenget T. For hvert rør r som har sin egen grop under
terrenget i ruta, legges rørets lag inn slik de ville vært i dets egen grøft:

- fundament fra rørets gravenivå i ruta opp til bunn rør
- omfylling fra bunn rør (eller gravenivået, om det ligger høyere) opp til
  topp rør + omfylling

Alt klippes til [z_g, T]. Overlapper lag fra flere rør, telles de én gang; fundament går
foran omfylling. Resten av søylen er **gjenfylling**. Den delen av søylen som ligger
under fjelloverflaten, er **sprengning**, resten er **graving i løsmasse**.

Rørvolumet (π D²/4 × lengde i grøfta) trekkes fra omfyllingen. Kontrollen i prøvene:
graving + sprengning = fundament + omfylling + gjenfylling + rørvolum.

### 4.5 Styrende rør, løpemeter og dybdeklasser

- Hver rute føres på **det styrende røret**: det som har den laveste gropa der (likt →
  nærmeste). Felles grøft havner dermed på det dypeste røret.
- Langs hvert rør, hver meter og i hvert målt punkt: dybden = T − z_g der røret ligger.
  Er røret selv styrende der, telles meteren på det i dybdeklassen. Er et annet rør
  styrende, telles den der, så en felles grøft bare får én lengde.
- Dybdeklassene: 0–1, 1–2, 2–3, 3–4, over 4 m. «1–2 m» er fra og med 1 m til under 2 m.
- Per kode: summen av rørene med den koden.

### 4.6 Massebalanse

Med prosjektets faktorer, som veg og tomt:

- løsmasse tilgjengelig til gjenfylling = graving løsmasse × `brukbar` × `losmasseIFylling`
- gjenfylling fra graving = min(tilgjengelig, gjenfylling); resten **kjøpes**
- overskudd løsmasse (fast) = graving løsmasse − gjenfylling fra graving / `losmasseIFylling`
- sprengt fjell kjøres bort: fast m³ og løst (× `sprengningsfaktor`)
- fundament og omfylling **kjøpes**

## 5. Brukerflate

- **Rør-fanen** får en grøftedel: feltene for anleggets grøftemal, tabell per lag,
  løpemeter per dybdeklasse, tabell per kode, massebalansen, lista over strekninger og
  sammenslåinger (endre, slette) og merknadene. Hvert rør i lista får sin graving.
- **Koder-fanen:** kodetabellen får grøftefeltene. Tomt felt = anleggets verdi. En kode
  som tegnes som rør uten dimensjon, markeres med «mangler dimensjon – ingen grøft»,
  både her og i importdialogen.
- **Kartet:**
  - grøftekanten mot terrenget – der gravingen starter – som en tynn strek rundt rørene
  - strekninger markert langs røret, sammenslåinger som en stiplet forbindelse
  - verktøyet **Grøft på strekning**: klikk to målte punkt på samme rør, og en dialog
    tar imot helning, bunntillegg, fundament, omfylling, dybde til fjell og «egen grøft»
  - verktøyet **Felles grøft**: klikk på to rør
- **Lengdeprofilen:** gravebunnen, fjelloverflaten der den er kjent, fundament og
  omfylling som felt. Avlesningen under musa viser gravedybde og fjell.
- **3D:** laget «Grøft» viser grøfta som åpen grop i terrenget.
- **Rapport og PDF:** delen «Grøftemasser» – normalgrøfta tegnet med anleggets mål,
  tabellene, justeringene og forbeholdene (teoretisk profil; fjell bare der det er
  markert eller sondert; terreng slik det var før graving).
- **Prosjektsammendraget:** røranlegget får graving og sprengning i sin rad.
  Grøftemassene holdes utenfor vegens og tomtas massebalanse – gjenfyllingen går
  tilbake i grøfta.

Alt som endrer grøfta, går gjennom `merk()`, så det kan angres.

## 6. Integrasjon

- `App.beregnRor` regner grøfta etter profilene: `resultat.groft = Groft.beregn(…)`, med
  linjene fra `App.byggRor()`, `App.terreng.z` og `fjellmodellIUtm().sondert`.
- Terrenget er alt lastet i et belte på 40 m rundt rørene (3D-konteksten). Det dekker
  grøfter ned mot 8 m med 1:1.
- Grøfta regnes bare på nytt når linjene, kodene, grøftemalen, justeringene, fjellet
  eller terrenget er endret.

## 7. Feil og merknader

| Tilfelle | Hva brukeren ser |
|---|---|
| Terreng mangler i deler av grøfta | Merknad med arealet; rutene er ikke med i massene |
| Røret ligger over terrenget | Ingen grøft der; merknad med lengden |
| Rør uten dimensjon | Ingen grøft for røret. Grøftedelen og merknaden sier hvilke koder og hvor mange meter som ikke er med; koden markeres i kodetabellen og importdialogen |
| Strekning eller sammenslåing som ikke treffer lenger (etter ny import) | Merknad med antall, som rettingene |
| Sammenslåtte rør som aldri er innen 10 m | Merknad |
| Hvor fjellet kommer fra | Merknad med lengden fjell fra strekninger og fra sonderinger |

## 8. Tilgjengelighet

Knappene er `<button>` med `aria-pressed` på verktøyene; alle felt har `<label>`. Lagene
har navn i tekst og eget mønster i profilen, så farge aldri står alene.

## 9. Prøver

`test/groftprove.js`, fasit regnet for hånd:

- rett rør i flatt terreng: graving per meter = (b + h · n) · h, fundament, omfylling og
  gjenfylling som trapeser
- fjell på kjent dybde: sprengning = b · (fjellets høyde over gravebunnen)
- to parallelle rør: union av to groper, telles én gang
- grunt rør i grøfta til et dypt rør: eget fundament og egen omfylling på sitt nivå
- egen grøft: volumene legges sammen
- felles grøft med flat bunn mellom to rør
- loddrette vegger (helning 0)
- dybdeklasser og styrende rør
- rør uten dimensjon er ikke med, og meterne meldes per kode
- massebalansen med faktorene
- kontrollen graving + sprengning = fyll + rørvolum
- klargjøringen av feltene
- den ekte fila via `ROR_FIL` (ikke i repoet): tid og rimelige tall

Nettlesertesten: grøftedelen i fanen, feltene, verktøyene, kartet, profilen, 3D,
rapporten, PDF-en og angre.

## 10. Utenfor etappe 2

Eksport av grøfta til maskinstyring. Grøftekasse og spunt. Masseutskifting i
grøftebunnen. Overbygning under veg som gjenfylling. Flere jordarter med ulik helning i
samme grøft, ut over det strekningene gir. Planlagte rør (etappe 3).
