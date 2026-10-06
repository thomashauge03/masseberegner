# Stikkrenner – plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stikkrenner under en prosjektert veg: satt ut i kartet, lengden og høydene regnet av tverrsnittet, vist i kart, tverrsnitt og lengdeprofil, og med i rapport, PDF og eksport.

**Architecture:** En ren modul `public/js/stikkrenner.js` regner én renne av tverrsnittet i profilet der den krysser (`res.geometriFor(s)`). Profilet regnes som eget profil ved at stasjonen legges i `ekstraStasjoner` i alle tre kallene som regner vegens masser. Rennene lagres per veganlegg i `a.stikkrenner`, som snuplassene.

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
- Produces: `Stikkrenner.beregn(renne, tverrsnitt, mal, { stigning, lengde })` → `{ id, navn, s, dim, vinkel, innlop, lengde, fall, bunnInn, bunnUt, laastInn, laastUt, senket, overdekning, overdekningVed, kravOverdekning, ytre, ender: { venstre: { t, overflate, type, bunn, x, y }, hoyre: {…} }, merknader: [{ type, tekst }] }` eller `{ id, navn, feil }`; `Stikkrenner.fraMal(mal)`, `Stikkrenner.bunnISenter(svar)`, `Stikkrenner.STANDARD`, `Stikkrenner.GRENSER`.

- [ ] Skriv prøven (fem bolker: fylling på flatt, skjev renne, sidebratt, låste høyder, det som ikke går) med fasit regnet for hånd.
- [ ] Skriv modulen; kjør `node test/stikkrenneprove.js` til alt er grønt.
- [ ] Legg prøven i `npm test`.

### Task 2: Malen, prosjektfila og beregningen

**Files:**
- Modify: `public/js/masser.js` (StandardMal og MALGRENSER: `stikkrenneDim`, `stikkrenneFall`, `stikkrenneOverdekning`, `stikkrenneTillegg`)
- Modify: `public/js/prosjektform.js` (`a.stikkrenner = []`, FELT)
- Modify: `public/js/app.js` (`ekstraStasjoner` i de tre kallene; `res.stikkrenner`; merknadene)
- Modify: `public/index.html` (skriptet)

- [ ] StandardMal og MALGRENSER.
- [ ] `klargjor`: lista per anlegg, og `stikkrenner` i FELT.
- [ ] `App._rennestasjoner(a)` og `ekstraStasjoner` i `beregn`, `vegOverlapp` og naboens fotavtrykk.
- [ ] `App.regnStikkrenner(res)`: svaret per renne med vegens stigning; merknadene i resultatet med type `stikkrenne`.
- [ ] `npm test` – selvtesten uendret.

### Task 3: Skjermen

**Files:**
- Modify: `public/index.html` (verktøyknappen, malfeltene, lista)
- Modify: `public/js/ui-kart.js` (modus, klikk, tegning)
- Modify: `public/js/app.js` (`stikkrennerTilSkjema`, skjemaet, knappens synlighet)
- Modify: `public/js/ui-tverrprofil.js`, `public/js/ui-lengdeprofil.js`

- [ ] «⊖ Stikkrenne»: klikk ved linja → renne i nærmeste profil, ett angresteg.
- [ ] Kartet: strek fra ende til ende og merke i krysset med popup og «Slett».
- [ ] Lista under Vegmal: feltene, svaret og ⚠.
- [ ] Tverrsnittet og lengdeprofilet.

### Task 4: Rapport, PDF og eksport

**Files:**
- Modify: `public/js/ui-rapport.js`, `public/js/ui-pdfrapport.js`, `public/js/eksport.js`

- [ ] Tabellen «Stikkrenner» i rapporten og PDF-en.
- [ ] KOF: `STIKKINN`/`STIKKUT`; DXF: laget `STIKKRENNE`.

### Task 5: Nettleserprøven, dokumentene og fletting

- [ ] `Nettlesertest.stikkrenner`: verktøyet, lista med angre, merknaden, rapporten og KOF-en.
- [ ] README, FORTSETTELSE.
- [ ] Hele runden: `npm test`, anleggs- og tomteprøven, nettleseren fra en ny last.
- [ ] Gjennomgang, rettelser, skanning for kundedata, flett og push.
