# Rør etappe 3c – planlagt mot innmålt: implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Et tegnet røranlegg kan sammenlignes med de innmålte røranleggene i prosjektet – avvik i plan og høyde per innmålt punkt, dekning og toleranser – på en knapp, uten at noe endres.

**Architecture:** Ny ren modul `public/js/roravvik.js` gjør sammenligningen av linjene planen og importen allerede gir (`RorPlan.bygg`, `Ror.byggLinjer`). `App.beregnRor` kaller den når knappen er på og legger svaret i `res.avvik` og merknadene. Rør-fanen, kartet, profilen, rapporten og PDF-en leser `res.avvik`.

**Tech Stack:** Vanilla JS uten byggesteg, IIFE-moduler med `module.exports` for node; prøver i node (`test/*.js`) og i nettleseren (`public/js/nettlesertest.js`).

**Spec:** `docs/superpowers/specs/2026-10-06-ror-etappe3c-design.md`

## Global Constraints

- Alt på knapper: sammenligningen endrer verken planen eller de innmålte høydene.
- Norske identifikatorer og kommentarer; kommentarene forklarer hvorfor.
- Ingen kundedata i commits: prøvene bruker oppdiktede punkt; ekte filer kjøres via miljøvariabel og skriver bare antall.
- Fargen står aldri alene: teksten sier innenfor/utenfor.
- Standard: plan 0,10 m, høyde 0,03 m selvfall / 0,10 m trykk, søkebredde 1,0 m; grenser 0,005–2 m og 0,1–10 m.
- Hull i dekningen: 2 m. Nær men utenfor: inntil 10 m. De største avvikene: ti.

## Filene

| Fil | Hva |
|---|---|
| `public/js/roravvik.js` (ny) | `RorAvvik`: normKode, likKode, sammenlign, oppsummering, punkttekst, fortegn |
| `test/roravvikprove.js` (ny) | Node-prøvene mot fasit regnet for hånd |
| `public/js/rorplan.js` | `StandardPlanmal.avvik`, `GRENSER.avvikPlan/avvikHoyde/sok` |
| `public/js/prosjektform.js` | `mal.plan.avvik` ryddes når en fil åpnes |
| `public/js/app.js` | `_innmalteRor()`, `res.avvik` i `beregnRor`, grøftenøkkelen, terrenget for andre tegnede anlegg |
| `public/js/ui-rorplan.js` | Avsnittet «Avvik mot innmålt» i Rør-fanen; statusteksten ved klikk og lagring av trase |
| `public/js/ui-kart.js` | Punktene i kartet |
| `public/js/ui-rorprofil.js` | Punktene i profilen, tittelen og avlesningen |
| `public/js/farger.js` | `avvikInnenfor`, `avvikUtenfor` |
| `public/js/ui-rapport.js`, `public/js/ui-pdfrapport.js` | Avsnittet i rapporten og PDF-en |
| `public/index.html`, `package.json` | Skriptet og prøven |
| `public/js/nettlesertest.js` | `planAvvik`, `planTerrengAndre`, `planTegnTrase` |
| `README.md`, `FORTSETTELSE.md` | Dokumentasjonen |

---

### Task 1: RorAvvik – modulen og node-prøvene

**Files:**
- Create: `public/js/roravvik.js`
- Create: `test/roravvikprove.js`
- Modify: `public/js/rorplan.js` (StandardPlanmal.avvik, GRENSER)
- Modify: `package.json` (prøven i `npm test`)

**Interfaces:**
- Consumes: `RorPlan.kodeAv`, `RorPlan.regel`, `RorPlan.stasjonering`, `RorPlan.bunnFraTopp`, `RorPlan.StandardPlanmal.avvik`.
- Produces: `RorAvvik.sammenlign(o)` → `{ punkter, perLinje: Map, verste, merknader, toleranse, antallInnmalt, anlegg }`; `RorAvvik.oppsummering(avvik, linjer, bf)`; `RorAvvik.punkttekst(p, tol)`; `RorAvvik.fortegn(v, d)`; `RorAvvik.normKode`, `RorAvvik.likKode`.

- [ ] **Step 1: Skriv prøvene** (`test/roravvikprove.js`). Fiksturen: en trase (0,0) → (40,0) → (40,30) fra 500000/6500000 med «SP 160PE» (selvfall, topp 8,0 → 7,3 lineært ved låste bunner) og «VL 110PE» (trykk) 2 m til venstre. Innmålte punkt med kjente avvik:
  - (10, −0,05) med topp lik planen → side +0,05 (til høyre), høyde 0.
  - (20, 0) med topp +0,05 → høyde +0,05, utenfor (selvfall 0,03).
  - (40,0)-knekken: et punkt (40,5; −0,5) på utsiden → side = −avstanden til knekkpunktet.
  - Forbi enden: (40, 30,6) → forbi 0,6, side vinkelrett.
  - «SP 160 PVC» knyttes (system og dimensjon), «VL 160PE» ikke.
  - Et punkt 1,5 m til siden → nær, ikke knyttet; 20 m unna → verken eller.
  - Gods fra den innmålte koden når den har en egen.
  - Dekningen: punkt fra 0 til 30 → ikke innmålt 30–70; ett punkt på et kort rør → ingen hull; ingen punkt → hele.
  - Toleransen for trykk (0,10) mot selvfall (0,03).
  - De verste sortert på grad; merknadene; ingen innmålte anlegg.
- [ ] **Step 2: Kjør** `node test/roravvikprove.js` – den feiler («Cannot find module»).
- [ ] **Step 3: Skriv modulen** (`public/js/roravvik.js`) etter spesifikasjonen, avsnitt 2 og 5:
  - `normKode`: store bokstaver, `_` → mellomrom, mellomrom mellom tall og bokstaver, ett mellomrom.
  - `likKode(a, ka, b, kb)`: `normKode(a) === normKode(b)`, eller begge har `dim > 0`, lik `dim` og likt, ikke-tomt `system`.
  - `naermest(xy, q)`: nærmeste sted over alle strekk med lengde; `side` er tverravstanden (+ til høyre: `((q−a) × (b−a)) / L`) når punktet er forbi første eller siste strekk, ellers avstanden med tverravstandens fortegn (utsiden av en knekk); `forbi` er lengden forbi enden.
  - `sammenlign(o)`: kandidatene per innmålt linje er de planlagte med `likKode`; ramme med 10 m margin før avstanden regnes; nærmeste innen søkebredden knyttes; mellom søkebredden og 10 m telles `naer` på det nærmeste; høyden med `bunnFraTopp` på hver side; `grad`; bitene for dekningen; hullene ≥ 2 m; merknadene; de ti verste.
- [ ] **Step 4: Kjør** `node test/roravvikprove.js` – alt grønt.
- [ ] **Step 5:** `rorplan.js`: `StandardPlanmal.avvik = { vis: false, plan: 0.10, selvfall: 0.03, trykk: 0.10, sok: 1.0 }`, `GRENSER.avvikPlan = [0.005, 2]`, `GRENSER.avvikHoyde = [0.005, 2]`, `GRENSER.sok = [0.1, 10]`; prøven for `klem` på de nye feltene. `package.json`: `&& node test/roravvikprove.js`.
- [ ] **Step 6: Commit** – «RorAvvik: planlagte rør mot innmålte – avvik i plan og høyde, dekning og toleranser».

### Task 2: Beregningen og fila

**Files:**
- Modify: `public/js/app.js` (`beregnRor`, ny `_innmalteRor`, ny `_andrePlanerNaer`)
- Modify: `public/js/prosjektform.js` (`mal.plan.avvik`)
- Modify: `public/index.html` (`<script src="js/roravvik.js">` etter roreksport.js)

**Interfaces:**
- Consumes: `RorAvvik.sammenlign`.
- Produces: `App.resultat.avvik` (null når knappen er av), avviksmerknadene (`type: 'avvik'`) i `App.resultat.merknader`, `App._innmalteRor()` → `[{ anlegg, navn, koder, linjer }]`.

- [ ] **Step 1:** `_innmalteRor()`: hvert røranlegg med punkt og uten plan, bygd med `Ror.byggLinjer(a.ror, a.mal, Ror.lagTilXY(a.ror.sone, this.sone))`.
- [ ] **Step 2:** I `beregnRor`, etter grøfta: `const av = r.plan && this.P.mal.plan.avvik; const avvik = av && av.vis ? RorAvvik.sammenlign({ plan: bygg.linjer, planKoder: r.koder, innmalt: this._innmalteRor(), toleranse: av, bakkefaktor }) : null;` – merknadene legges til, `avvik` står i resultatet.
- [ ] **Step 3:** Grøftenøkkelen tar `this.P.mal.plan.kum` i stedet for hele `mal.plan`: toleransene og knappen skal ikke regne grøfta på nytt.
- [ ] **Step 4:** Terrenget for andre tegnede anlegg i nærheten: `_andrePlanerNaer(traser, halv)` gir linjene (med `utenHoyde`) til de andre tegnede anleggene som har en ramme som når innenfor `halv` av det aktive; de legges til korridorene, og traseene deres står i nøkkelen.
- [ ] **Step 5:** `prosjektform.js`: `a.mal.plan.avvik` med `vis === true` og hvert tall gjennom `RP.klem` med standarden som reserve.
- [ ] **Step 6:** Prøv i nettleseren (konsollen): et tegnet anlegg med et innmålt ved siden av, `mal.plan.avvik.vis = true`, `App.beregnRor()` → `res.avvik.punkter.length > 0`.
- [ ] **Step 7: Commit** – «Avvik mot innmålt i beregningen, og terrenget for andre tegnede anlegg».

### Task 3: Skjermen – Rør-fanen, kartet og profilen

**Files:**
- Modify: `public/js/ui-rorplan.js` (`fyllFane`, `koble`, `tegnKlikk`, `lagreTrase`)
- Modify: `public/js/ui-kart.js` (`tegnPlan`)
- Modify: `public/js/ui-rorprofil.js` (`dataFor`, `tegnPaa`)
- Modify: `public/js/farger.js`

- [ ] **Step 1:** Rør-fanen: avsnittet «Avvik mot innmålt» før «Innstillinger»: knappen `#planAvvik` (`aria-pressed`), forklaringen, og når den er på: fire felt (`planAvvikPlan`, `planAvvikSelvfall`, `planAvvikTrykk`, `planAvvikSok`), tabellen fra `RorAvvik.oppsummering` (radene velger røret med `data-linje`) og de ti største avvikene. Knappen og feltene går gjennom `merk` og `ferdig()`.
- [ ] **Step 2:** Kartet: hvert punkt i `res.avvik.punkter` som `L.circleMarker` (`className: 'avvikpunkt'` / `'avvikpunkt utenfor'`), verktøytips fra `RorAvvik.punkttekst`.
- [ ] **Step 3:** Profilen: `dataFor` gir `avvik` (punktene på røret, sortert på stasjon) og `avviksgrense`; `tegnPaa` tar dem med i høydeskalaen, tegner streken fra planens topp til punktet og punktet, setter antallet i tittelen og avviket i avlesningen.
- [ ] **Step 4:** Statusteksten: «ved X – kobles på om det blir en ende» / «ved en annen trase – blir en grein om det er en ende»; ved lagring: hvilke ender som ble koblet.
- [ ] **Step 5: Commit** – «Avvik mot innmålt i Rør-fanen, kartet og profilen».

### Task 4: Rapporten og PDF-en

**Files:**
- Modify: `public/js/ui-rapport.js` (`apneRorrapport`)
- Modify: `public/js/ui-pdfrapport.js` (`_rorinnhold`)

- [ ] **Step 1:** HTML: `<h2>Avvik mot innmålt</h2>`, forklaringen med toleransene og fortegnene, tabellen per rør og «De største avvikene».
- [ ] **Step 2:** PDF: samme innhold med `overskrift`, `brodtekst` og `tabell`.
- [ ] **Step 3: Commit** – «Avvik mot innmålt i rapporten og PDF-en».

### Task 5: Nettleserprøvene og dokumentasjonen

**Files:**
- Modify: `public/js/nettlesertest.js` (`planAvvik`, `planTerrengAndre`, `planTegnTrase`, lista)
- Modify: `README.md`, `FORTSETTELSE.md`

- [ ] **Step 1:** `planAvvik`: `_planProsjekt()` + et innmålt anlegg med oppdiktede punkt langs SP 160PE (kjente avvik); knappen på → resultatet, fanen (tabellen, de verste), kartet (antall `.avvikpunkt`, `utenfor`), profilen (`Rorprofil.dataFor(...).avvik`), merknadene; toleransen i høyde 0,06 → punktet er innenfor; et punkt slått av i det innmålte → borte; angre; rapporten (HTML) og PDF-en har avsnittet; knappen av → `res.avvik === null` og ingen punkt i kartet.
- [ ] **Step 2:** `planTerrengAndre`: terrenget mocket så bare hentede korridorer har høyde; to tegnede anlegg som krysser; i det ene skal krysset med det andre varsles.
- [ ] **Step 3:** `planTegnTrase`: statuslinja sier «ved 90PE – kobles på om det blir en ende», og etter lagring «koblet på 90PE».
- [ ] **Step 4:** Hele nettleserprøven og `npm test`; README (Rør-fanen, avviket) og FORTSETTELSE (3c, tallene).
- [ ] **Step 5: Commit**, kodegjennomgang med en underagent, rett funnene, kundedatasjekk, flett inn i `main`, push og sjekk at det er ute.
