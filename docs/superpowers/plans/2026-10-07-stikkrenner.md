# Stikkrenner – plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stikkrenner under en prosjektert veg: satt ut i kartet, lengden og høydene regnet av tverrsnittet, vist i kart, tverrsnitt og lengdeprofil, og med i rapport, PDF og eksport.

**Architecture:** En ren modul `public/js/stikkrenner.js` regner én renne av tverrsnittet i stasjonen der den krysser, `res.snittVed(s)`: regnet av de samme dataene som profilene, men utenfor volumsummen. Rennene lagres per veganlegg i `a.stikkrenner`, som snuplassene.

> **Endret etter gjennomgangen.** Første versjon la stasjonen i `ekstraStasjoner` i de tre kallene som regner vegens masser, og hentet snittet med `res.geometriFor(s)`. Det flyttet massene (10 % mer fylling ved en kolle mellom to profiler) og ga KOF-punkt med samme navn. Nå: `res.snittVed(s)` i `masser.js`, og ingen ekstra stasjoner. Se «Rettelser etter gjennomgangen» nederst.

**Tech Stack:** Vanilla JS uten byggesteg, IIFE-moduler med `module.exports` for node-prøvene; Leaflet i kartet; canvas i profilene.

**Spec:** `docs/superpowers/specs/2026-10-07-stikkrenner-design.md`

## Global Constraints

- Alt som endrer høyder, ligger på knapper; låste høyder (`bunnInn`, `bunnUt`) endres aldri av seg selv.
- Hver handling er ett angresteg: `App.merk(hva)` før endringen.
- Repoet er offentlig: prøvene bruker oppdiktede data.
- Massene uten renner er uendret (selvtesten og demoen).

---

### Task 1: Den rene modulen og prøven

**Files:**
- Create: `public/js/stikkrenner.js`
- Create: `test/stikkrenneprove.js`
- Modify: `package.json` (npm test kjører prøven)

**Interfaces:**
- Produces: `Stikkrenner.beregn(renne, tverrsnitt, mal, { stigning, lengde, terreng })` → `{ id, navn, s, dim, vinkel, innlop, lengde, fall, bunnInn, bunnUt, laastInn, laastUt, senket, senketInn, overdekning, overdekningVed, kravOverdekning, ytre, vegg, ender: { venstre: { t, overflate, type, bunn, x, y }, hoyre: {…} }, merknader: [{ type, tekst }] }` eller `{ id, navn, feil }`; `Stikkrenner.fraMal(mal)`, `Stikkrenner.bunnISenter(svar)`, `Stikkrenner.STANDARD`, `Stikkrenner.GRENSER`.

- [x] Skriv prøven (fem bolker: fylling på flatt, skjev renne, sidebratt, låste høyder, det som ikke går) med fasit regnet for hånd.
- [x] Skriv modulen; kjør `node test/stikkrenneprove.js` til alt er grønt.
- [x] Legg prøven i `npm test`.

### Task 2: Malen, prosjektfila og beregningen

**Files:**
- Modify: `public/js/masser.js` (StandardMal og MALGRENSER: `stikkrenneDim`, `stikkrenneFall`, `stikkrenneOverdekning`, `stikkrenneTillegg`)
- Modify: `public/js/prosjektform.js` (`a.stikkrenner = []`, FELT)
- Modify: `public/js/app.js` (`res.stikkrenner`; merknadene)
- Modify: `public/index.html` (skriptet)

- [x] StandardMal og MALGRENSER.
- [x] `klargjor`: lista per anlegg, og `stikkrenner` i FELT.
- [x] ~~`App._rennestasjoner(a)` og `ekstraStasjoner` i `beregn`, `vegOverlapp` og naboens fotavtrykk.~~ Erstattet av `res.snittVed(s)`.
- [x] `App.regnStikkrenner(res)`: svaret per renne med vegens stigning og terrenget; merknadene i resultatet med type `stikkrenne`.
- [x] `npm test` – selvtesten uendret.

### Task 3: Skjermen

**Files:**
- Modify: `public/index.html` (verktøyknappen, malfeltene, lista)
- Modify: `public/js/ui-kart.js` (modus, klikk, tegning)
- Modify: `public/js/app.js` (`stikkrennerTilSkjema`, skjemaet, knappens synlighet)
- Modify: `public/js/ui-tverrprofil.js`, `public/js/ui-lengdeprofil.js`

- [x] «⊖ Stikkrenne»: klikk ved linja → renne i nærmeste profil, ett angresteg.
- [x] Kartet: strek fra ende til ende og merke i krysset med popup og «Slett».
- [x] Lista under Vegmal: feltene, svaret og ⚠.
- [x] Tverrsnittet og lengdeprofilet.

### Task 4: Rapport, PDF og eksport

**Files:**
- Modify: `public/js/ui-rapport.js`, `public/js/ui-pdfrapport.js`, `public/js/eksport.js`

- [x] Tabellen «Stikkrenner» i rapporten og PDF-en.
- [x] KOF: `STIKKINN`/`STIKKUT`; DXF: laget `STIKKRENNE`.

### Task 5: Nettleserprøven, dokumentene og fletting

- [x] `Nettlesertest.stikkrenner`: verktøyet, lista med angre, merknaden, rapporten og KOF-en.
- [x] README, FORTSETTELSE.
- [x] Hele runden: `npm test`, anleggs- og tomteprøven, nettleseren fra en ny last.
- [ ] Gjennomgang, rettelser, skanning for kundedata, flett og push.

## Rettelser etter gjennomgangen

- **Massene flyttet seg.** Rennas stasjon ble et eget profil i volumsummen. Nå `res.snittVed(s)` i `masser.js`: snittet regnes for seg, med de samme påslagene, og står utenfor summen.
- **Verktøyet kastet** i en veg lagt til med «+ Veg»: `nyttAnlegg` gir `a.plasser` og `a.stikkrenner` fra start.
- **En låst høyde med «innløp auto»** kunne flytte seg til den andre enden når siden snudde: siden låses med, i det samme angresteget. Oppslaget i resultatet gjøres når det trengs – radene står gjennom beregningene, og et oppslag fra da raden ble bygd fant ikke renna.
- **Overflaten i endene:** bakken leses der enden ligger (ikke i foten), minus rensken bare innenfor renskebredden; grøfta i en skjev rennes ende følger vegens stigning.
- **Topp rør** var bunn + hele den ytre diameteren – én vegg for mye.
- **Senkingen:** innløpet først, renna dreid om utløpet, så langt minstefallet tåler; resten senker hele renna.
- **KOF:** navnene `SR<nr>` fra id-en (faste når en renne slettes); vegens egne punkt får to eller tre desimaler når to stasjoner ligger tett.
- **Kartet:** merkene fra lista, strekene bare fra resultatet for vegen som står oppe; ingen renner i tomt- eller rørvisning.
- **Tverrsnittet:** renna tegnet fylt med mørk kant – den forsvant i utskiftingsbåndet.
- **Lista:** en beregning skriver bare svaret inn, så feltet man står i, beholder markøren; vinkelen klemmes begge veier.
- **Merknadene** er escapet i sammendraget og rapporten.

### Andre gjennomgang

- **◀ ▶ fra rennas snitt** gikk til starten av vegen: snittet står mellom profilene, og oppslaget falt tilbake til det første. Nå går første steg til profilet ved siden av; skyveren står ved det nærmeste; etiketten sier «snittet til SR1». Et profil like ved en renne er profilet – renna tok det, og ◀ ▶ kom aldri fram.
- **Høydefeltene under tverrsnittet** virker i rennas snitt (`settPunkthoyde`); et tall forsvant uten et ord.
- **Skjev renne:** endene leses i snittet der renna krysser foten eller grøfta (`o.snitt`, sekanter); uten et kryss rett på tvers, med merknad.
- **Id-ene:** `klargjor` gir en renne uten en god id en ledig; numrene brukes aldri om igjen i en veg (`a.nesteStikkrenne`).
- **Sidelåsen:** uten et svar låses ingenting før siden er valgt; «auto» kan ikke velges med en låst høyde.
- **Lengdeprofilet:** merket midt i røret, ikke én vegg over; SR-nummeret i tverrsnittets merkelapp.
