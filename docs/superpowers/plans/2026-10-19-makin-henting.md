# Hent fra Makin – implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Innmålinger hentes rett fra Makins sky-API inn i et eget, punktlåst røranlegg med én knapp, og hver henting gjør anlegget likt Makin uten å røre rettinger, kodetabell og grøfter.

**Architecture:**

- `api/makin.js` er en smal proxy med en fast liste kall. Nøkkelen kommer fra nettleseren i `Authorization` for hvert kall og blir aldri lagret. ZIP-fila pakkes ut på serveren med `lib/zip.js`, og nettleseren får SOSI-tekst tilbake.
- `public/js/makin.js` (`Makin`) er klienten. Den tar seg av nøkkelen i `localStorage`, gjør kallene, venter på eksporten og henter i tidsbolker når svaret blir for stort. Den kan prøves i Node med innsprøytet `fetch` og lager.
- `Ror.byttPunkter` bytter punktsettet og rydder rettinger som peker på punkter som er borte.
- `public/js/ui-makin.js` (`MakinUI`) har knappene og dialogene og legger hentingen inn i anlegget.
- Låsen, kopien og dobbelttellingen ligger i `ui-ror.js` og `app.js`.

**Tech Stack:** Vanilla JS i nettleseren, Node-funksjoner på Vercel (ingen avhengigheter), `zlib.inflateRawSync`.

**Spec:** `docs/superpowers/specs/2026-10-19-makin-henting-design.md`

## Global Constraints

- Ingen nye avhengigheter i `package.json`.
- Nøkkelen finnes bare i `localStorage['massekalk.makin']` som `{v:1, nokkel}` og i `Authorization`-hodet på kall til `/api/makin`. Den skal aldri ligge i `P`, angre-historikken, eksporter, logger (`console.*` på serveren), feilmeldinger eller commits.
- Proxyen kaller bare `https://api.cloud.makin3d.com` med stier bygd av validerte parametre: `orgId` er et heltall > 0, `projectId` er en UUID, `exportId` er et heltall > 0, og `systemUuids` er UUID-er. Aldri en adresse eller sti fra klienten.
- Alle svar fra `/api/makin` har `Cache-Control: no-store`.
- Prøvene bruker bare oppdiktede punkter og navn. Ingen ekte as-built-data, prosjektnavn, org-id eller nøkler i repoet (se `test/rorprove.js` linje 6-7 for mønsteret).
- Ingen henting uten at brukeren trykker. Massekalk skriver aldri til Makin. Det eneste `POST` mot Makin er å starte en eksport.
- Eksporten er `format=Sosi&includeLinePoints=true&block=true`, med `types: ["point","line"]`.
- Vercel: `maxDuration: 30` (vercel.json). Et svar fra funksjonen må være under 4,5 MB, så proxyen sier `413` over 4 000 000 byte.
- Én henting er ett angre-steg: `app.merk('hentet fra Makin')`. Anlegget endres bare når alt er hentet og lest uten feil.
- All tekst brukeren ser er på norsk, i samme tone som resten av appen.

## Review Focus

1. **Feil eller utløpt nøkkel** (Makin gir 401/403): brukeren får «Makin godtok ikke nøkkelen» og valget å bytte den. Anlegget er uendret. *(Task 4 og 5)*
2. **Nettfeil eller 5xx midt i en henting**, også mellom to tidsbolker: anlegget er uendret, og det kommer en forståelig melding. *(Task 4 og 5)*
3. **Eksporten blir aldri ferdig** (409 hele tiden): massekalk gir opp etter 20 forsøk og sier fra. Ingenting er endret. *(Task 4)*
4. **Prosjekt uten punkter, eller bare koder som er krysset bort**: «Fant ingen innmålte punkter i Makin-prosjektet» vises. Et eksisterende anlegg beholder punktene sine, og et nytt anlegg lages ikke. *(Task 5)*
5. **Brukeren har byttet sone på Makin-anlegget**: nye punkter regnes om til anleggets sone, som i `RorUI.leggInn` (ui-ror.js:545-554), og flytter seg ikke flere hundre kilometer. *(Task 5)*

---

### Task 1: Sonde mot en ekte eksport (manuell, ingen data i repoet)

**Files:** Create `test/makin-sonde.js`. Den committes, men det den skriver ut, gjør ikke det.

**Interfaces:**
- `node test/makin-sonde.js`. Nøkkelen leses fra `MAKIN_NOKKEL`, og organisasjon og prosjekt fra `MAKIN_ORG` og `MAKIN_PROSJEKT`. Uten de to siste lister skriptet organisasjoner og prosjekter (id og antall, aldri navn) og stopper.
- Skriptet kaller Makin direkte (ikke proxyen). Det starter en eksport, laster ned SOSI, pakker ut med en midlertidig `zlib`-løsning i skriptet og skriver bare **struktur**:
  - gruppenavn og antall (`.PUNKT`, `.KURVE` …);
  - feltnavnene som finnes under hver gruppe;
  - `..KOORDSYS`, `..ENHET` og `..ORIGO-NØ` fra hodet;
  - om noen `..NAME` går igjen;
  - om et felt skiller maskiner;
  - byte-størrelsen på ZIP og SOSI.
- Skriptet skriver aldri koordinater, navn eller koder.

**Steps:**
- [ ] Skriv skriptet. Første linje i kommentaren sier at utskriften ikke skal limes inn i commits eller saker.
- [ ] Be brukeren lage en ny nøkkel («Opprett ny nøkkel» på web.makin3d.com/profile/tokens) og kjøre skriptet i sin egen terminal. Bruk ```bash-blokker, med `MAKIN_NOKKEL` satt i terminalen deres, aldri i chatten.
- [ ] Skriv funnene inn i specen under «Avgjort etter gjennomlesingen», som en ny punktliste «Funn fra sonden 2026-…». Ta med svaret på disse fire:
  - (a) Kommer linjepunktene som `.PUNKT`?
  - (b) Hvilket felt skiller maskiner, om noe?
  - (c) Går navn igjen?
  - (d) Hvilken sone har fila?
- [ ] Commit skriptet og specen.

### Task 2: ZIP-leser og proxy

**Files:** Create `lib/zip.js`, `api/makin.js`, `test/makinprove.js`. Modify `server.js` (`RUTER`) and `package.json` (`test`: legg til `node test/makinprove.js` etter `stikkutsnittprove`).

**Interfaces:**
- `lesZip(buf: Buffer) → Array<{navn: string, data: Buffer}>`. Den leser den sentrale katalogen (EOCD-signatur `0x06054b50`, oppføringer `0x02014b50`) og støtter metode 0 (lagret) og 8 (`zlib.inflateRawSync`). Andre metoder og ødelagte filer kaster `Error('Kunne ikke lese ZIP-fila fra Makin')`.
- `api/makin.js` eksporterer `handler(req, res)` som standard og `lagHandler({ fetch }) → handler` for prøvene.
  - Ruten er `/api/makin?hva=<kall>&org=<orgId>&prosjekt=<uuid>&eksport=<id>`.
  - `hva` kan være:
    - `organisasjoner` → `GET /v1/organizations`;
    - `prosjekter` → `…/{org}/projects`;
    - `maskiner` → `…/projects/{p}/geometry/systems`;
    - `koder` → `…/geometry/objects`;
    - `start` (krever `POST`) → `POST …/geometry`. Kroppen er JSON `{systemer: uuid[]|null, koder: string[]|null, fra?: iso, til?: iso}` og blir til `{systemUuids, codeNames, types:["point","line"], fromTimestamp, toTimestamp}`. Felt som er `null`, utelates.
    - `hent` → `GET …/geometry/{eksport}?format=Sosi&includeLinePoints=true&block=true`.
  - Svar:
    - JSON-kall: `200` med Makins `data` videresendt uendret.
    - `start`: `200 {eksport: <exportId>}`.
    - `hent`: `200 {status:'klar', filer:[{navn, base64}]}` (bare `.sos`-oppføringer, rå bytes som base64; nettleseren dekoder med `Ror.dekod`, så tegnsettet tolkes ett sted); `409` gir `202 {status:'venter'}`; over 4 000 000 byte i svaret gir `413 {feil:'for stor'}`.
    - Mangler nøkkel: `401 {feil:'mangler nøkkel'}`.
    - Ugyldig parameter: `400 {feil}`.
    - Makin 401/403: `401 {feil:'avvist'}`.
    - Annen feil fra Makin: `502 {feil:'Makin svarte <status>'}`.
  - Kroppen leses fra `req.body` hvis Vercel har tolket den, ellers fra strømmen, som `server.js` gir.

**Steps:**
- [ ] Prøver i `test/makinprove.js`, i samme `sjekk/paastand/kaster`-stil som `test/rorprove.js`:
  - `lesZip` på en ZIP bygd i prøven med én lagret og én deflatet oppføring (`zlib.deflateRawSync`) gir begge navnene og innholdet tilbake.
  - Ødelagt buffer kaster.
  - Med en falsk `fetch` som tar opp URL, metode og hoder: hvert `hva` treffer riktig Makin-URL; `Authorization` sendes videre uendret; `no-store` er satt.
  - `org=1/../x`, `prosjekt=ikke-uuid`, `eksport=-1`, et ukjent `hva` og `hva=start` med `GET` gir alle `400`, og `fetch` kalles ikke.
  - Makin 409 gir `202 venter`, og 403 gir `401 avvist`.
  - Et stort svar gir `413`.
  - Feilsvarene inneholder ikke nøkkelen.
- [ ] Kjør `node test/makinprove.js` og se at den feiler.
- [ ] Skriv `lib/zip.js` og `api/makin.js`, og legg `/api/makin` inn i `RUTER`.
- [ ] Kjør `npm test`. Alt skal være grønt.
- [ ] Commit.

### Task 3: SOSI fra sky-API-et og bytte av punktsett

**Files:** Modify `public/js/ror.js` (`lesSOSI` slik sonden krever, ny `byttPunkter`, eksporten nederst) and `test/makinprove.js`.

**Interfaces:**
- `Ror.byttPunkter(ror, nye: Punkt[]) → {punkter, nye: n, borte: n, endret: n, rettingerBorte: n}`. Den er ren og endrer ikke `ror`.
  - Den regner ut nye, borte og endret ved å sammenligne id-ene med `ror.punkter`. Endret betyr samme id, men annen `n/o/z/kode`.
  - Den teller rettingene som peker på id-er som ikke finnes i `nye`: hver id i `retting.av`, og hvert par i `retting.brudd` og `retting.koble` der en av id-ene mangler.
- `Ror.rensRetting(ror, ider: Set<string>) → void`. Den fjerner nettopp de rettingene `byttPunkter` talte. `alias`, `ikkeSamme`, `koder` og `groft` røres ikke.
- Hvis sonden viste at linjepunktene **ikke** kommer som `.PUNKT`: `lesSOSI` leser også `.KURVE` med `..NØH`-rekker som punkter. Navnet blir linjenavnet + ` (n)`, og koden blir linjens.
- Hvis sonden viste at navn går igjen mellom maskiner **og** fila har et felt som skiller dem: id blir `<felt>|<navn>`. Har fila ikke et slikt felt, henter Task 4 én eksport per maskin og setter maskinnavnet foran id (`Makin.hentEksport` sitt `idForan`).

**Steps:**
- [ ] Prøver:
  - `byttPunkter` på et anlegg med fire punkt og rettinger `av:['B']`, `brudd:[['A','B']]` og `koble:[['C','D']]` mot nye punkt `A`, `C`, `D` (der `C` har ny z) og `E` gir `nye 1, borte 1, endret 1, rettingerBorte 2`. `ror` er uendret.
  - `rensRetting` etterpå gir `av:[]`, `brudd:[]` og `koble:[['C','D']]`.
  - En oppdiktet SOSI i formen sonden fant, gir punktene med riktige id-er og riktig `epsg`.
- [ ] Se prøvene feile, skriv koden og se dem bli grønne (`npm test`).
- [ ] Commit.

### Task 4: Klienten `Makin`

**Files:** Create `public/js/makin.js` (lastes i `index.html` rett etter `ror.js`, og eksporteres med `module.exports` som `ror.js` gjør). Modify `test/makinprove.js`.

**Interfaces:**
- `Makin.lag({ fetch, lager, vent }) → klient`. Standard er `window.fetch`, `localStorage` og `ms => new Promise(r => setTimeout(r, ms))`. Prøvene sprøyter inn alle tre.
- `klient.nokkel() → string|null`, `klient.lagreNokkel(k)` og `klient.glemNokkel()`. De bruker `lager['massekalk.makin']` med `{v:1, nokkel}`, er pakket inn i try/catch og tåler at lageret kaster (se `ui-kart.js:161-184`).
- `klient.kall(hva, param, kropp?) → Promise<data>`. Feil kastes som `MakinFeil` med `.art`:
  - `'nokkel'` for 401;
  - `'nett'` når `fetch` kaster;
  - `'makin'` for 5xx eller 502;
  - `'for stor'` for 413.
- `klient.hentEksport({orgId, prosjektId, systemer, koder}, framdrift?) → Promise<{filer:[{navn, tekst}], idForan?: string}>`:
  - Den starter eksporten og henter. Ved `202 venter` venter den 2000 ms og prøver igjen, høyst 20 ganger. Etter det kaster den `MakinFeil('Makin ble ikke ferdig med fila', 'venter')`.
  - Klienten gjør `base64` om til `tekst` med `Ror.dekod` før den returnerer.
  - Ved `'for stor'` deler den tidsrommet i to (fra minste `firstLogged` til største `lastLogged` i `kall('koder')`, ellers de siste 10 årene til nå) og henter halvdelene hver for seg. Det gjentas til hver del er under grensen, men aldri smalere enn ett døgn.
  - `framdrift(tekst)` får «Ber Makin lage fila …», «Venter på Makin (n) …» og «Henter …».
  - Hvis Task 3 bestemte én eksport per maskin, gjøres dette per maskin, og hver fil får `idForan` lik maskinnavnet.

**Steps:**
- [ ] Prøver med falsk `fetch`, `vent` som ikke venter, og et lager som er et vanlig objekt, eller et som kaster:
  - Nøkkelen kan lagres, leses og glemmes.
  - Et lager som kaster, gir `null` og ikke et unntak.
  - `Authorization: Bearer <k>` sendes.
  - 401 gir `art 'nokkel'`.
  - To ganger `venter` og så `klar` gir filene og tre `framdrift`-kall med «Venter».
  - 21 ganger `venter` kaster `'venter'`.
  - 413 på hele perioden og så `klar` på begge halvdelene gir begge filene, og `start`-kroppene har `fra`/`til` som deler perioden.
  - En nettfeil på andre halvdel kaster (ingen halv henting).
- [ ] Se prøvene feile, skriv `makin.js` og se dem bli grønne.
- [ ] Commit.

### Task 5: Knappene, dialogene og hentingen inn i anlegget

**Files:**
- Create `public/js/ui-makin.js`, som lastes etter `ui-ror.js`.
- Modify:
  - `public/index.html`: knappen `verktoyRorMakin` rett etter `verktoyRorImport`, med teksten «☁ Hent fra Makin».
  - `public/js/app.js`: `visAnleggsvalg` linje 1327 og anleggspanelet linje 1378. Lag knappen `data-nyttmakin="1"` «⌀ Rør fra Makin» etter `data-nyttror`, og koble den som `data-nyttror`.
  - `public/js/prosjektform.js`: `_rettRorfelt` beholder et gyldig `ror.makin` og `ror.kopiAv` og fjerner et ugyldig.
  - `public/js/nettlesertest.js`: prøven `makinHenting`, lagt til i lista etter `'rorImport'`.

**Interfaces:**
- `a.ror.makin = { orgId: number, prosjektId: string, prosjektnavn: string, systemer: string[]|null, koder: string[]|null, sistHentet: iso, antall: number }`.
- `MakinUI.init(app)`, `MakinUI.nyttAnlegg()` (fra anleggspanelet) og `MakinUI.hent(a)` (fra kartknappen på et Makin-anlegg).
- `MakinUI.klient`: en `Makin.lag()`. Prøvene bytter den ut.
- **Synlighet:**
  - `verktoyRorMakin` synes bare når det aktive anlegget har `ror.makin`.
  - `verktoyRorImport`, `#rorImportNy` og dra-og-slipp på kartet skjules eller sperres der (se Task 6).
- **Nøkkeldialogen:** et passordfelt «Lim inn API-nøkkelen fra Makin (Profil → API-nøkler → Opprett ny nøkkel)», «Husk på denne maskinen» (alltid på) og «Avbryt».
  - Det skal også være mulig å bytte og glemme nøkkelen. Det gjøres med en lenke i koblingsdialogen og i Rør-fanen på et Makin-anlegg.
- **Koblingsdialogen:**
  - Organisasjon. Den hoppes over hvis det bare finnes én.
  - Prosjekt, som en nedtrekksliste.
  - Maskiner, med avkrysning og `systemName` og `recordCount`. Alle er på.
  - Koder, med avkrysning og `codeName` og `recordCount`. Alle er på.
  - Når alle er krysset av, lagres `null`.
  - Bruk samme modalmønster og klasser som `RorUI.dialog` (ui-ror.js:392).
- **Hentingen:**
  1. `les = Ror.lesFil(tekst)` per fil. Flere filer flettes med `Ror.slaSammenFiler`.
  2. Sone: på et nytt anlegg er det `Ror.gjettSone`. På et eksisterende regnes punktene om til `a.ror.sone` (se `RorUI.leggInn`).
  3. `app.merk('hentet fra Makin')`.
  4. `Ror.byttPunkter` og deretter `Ror.rensRetting`.
  5. Nye koder får forslag fra `Ror.koderFra`, men eksisterende `a.ror.koder` vinner.
  6. `a.ror.kilder = [{fil:'Makin: '+prosjektnavn, program:'Makin 3D', dato, importert, antall}]`. Kilden erstattes, den legges ikke til.
  7. `a.ror.makin.sistHentet` og `antall` oppdateres.
  8. Statuslinja viser «N punkt fra Makin · x nye, y borte, z endret», og «· r rettinger falt bort» når r er større enn 0.
  9. Et nytt anlegg heter `_ledigNavn(prosjektnavn)` og legges inn slik `RorUI.leggInn` gjør i else-grenen, med `P.ubestemt`-regelen.
- **Feil:** Ingenting i `P` endres før steg 3.
  - `'nokkel'` gir «Makin godtok ikke nøkkelen» og nøkkeldialogen.
  - Andre feil gir statuslinja med meldingen.

**Steps:**
- [ ] Nettleserprøve `makinHenting`. Bytt `MakinUI.klient` ut med en falsk klient som gir to oppdiktede SOSI-svar etter hverandre.
  - Det nye anlegget får `ror.makin` og punktene.
  - Sett `retting.av` på et punkt som blir borte i neste svar, og en kodefarge i kodetabellen. Etter henting nr. 2 er rettingen borte og kodefargen er den samme.
  - Ctrl+Z (`app.angre()`) gir punktene fra henting 1 tilbake.
  - Et svar som kaster `'nett'`, og et svar uten punkter lar `P` stå byte-likt (`JSON.stringify`).
  - Et anlegg i sone 33 får punkter fra en fil i sone 32 regnet om.
  - `ror.makin` overlever lagring og åpning (`Lager` rundt).
  - Knappen synes bare på Makin-anlegget.
- [ ] Kjør `Nettlesertest.kjor(['makinHenting'])` og se den feile. Se `nettlesertest-oppskrift` i minnet for oppsettet: egen port, rAF i skjult rute, 45 s-grense.
- [ ] Bygg `ui-makin.js` og koblingene.
- [ ] Kjør prøven og `rorImport`. Begge skal være grønne. Kjør også `npm test`.
- [ ] Commit.

### Task 6: Lås, kopi og dobbelttelling

**Files:**
- Modify:
  - `public/js/ui-ror.js`: målene i `dialog`, `leggInn`, `#rorImportNy`, dra-og-slipp linje 41-49, og en ny knapp «Lag en kopi» i Rør-fanen.
  - `public/js/app.js`: `kopierAnlegg`, `_innmalteRor` linje 3626, og løkkene ellers som går over innmålte røranlegg.
  - `public/js/nettlesertest.js`: prøven `makinLaas` etter `'makinHenting'`, og knappesjekkene på linje 9077-9084 og 10284.

**Interfaces:**
- `App.kopierAnlegg(id) → anlegg`.
  - Den lager en dyp kopi (`JSON.parse(JSON.stringify(a))`) med ny id fra samme kilde som `nyttAnlegg`, og navnet `_ledigNavn(a.navn + ' (kopi)')`.
  - Kopien får ikke `ror.makin`, men får `ror.kopiAv = a.id`.
  - Den legges rett etter originalen i `P.anlegg` og blir aktiv. Det er ett angre-steg: `merk('kopi av anlegg')`.
- `App.telles(a) → boolean` er usann for et Makin-anlegg når et annet anlegg har `ror.kopiAv === a.id`.
  - Den brukes i `_innmalteRor` og i hver løkke som summerer innmålte røranlegg til rapport, avvik, kryssing eller 3D-masser. Finn dem med `grep -n "!.*ror.plan" public/js/*.js`.
  - Kartet viser fortsatt originalen, men dempet (lavere opasitet). Bruk samme grep som kartet bruker for anlegg som ikke er aktive.
- **Låsen:**
  - Et anlegg med `ror.makin` står aldri i lista over mål i importdialogen.
  - `leggInn` med `leggTil` eller `anlegg:<id>` på et Makin-anlegg lager et nytt anlegg i stedet.
  - `#rorImportNy` og kartknappen «Importer rør» vises ikke på Makin-anlegget.
  - Dra-og-slipp mens et Makin-anlegg er aktivt åpner importdialogen med «Nytt røranlegg» valgt.
  - Rør-fanen viser «Hentet fra Makin <tid> · <prosjektnavn>» og knappene «Lag en kopi» og «Bytt nøkkel».
  - Alt annet virker som før.

**Steps:**
- [ ] Nettleserprøve `makinLaas`:
  - Importdialogen på et prosjekt med et Makin-anlegg og et vanlig anlegg har bare det vanlige som mål.
  - Dra-og-slipp med Makin aktiv gir et nytt anlegg, og Makin-anlegget har like mange punkt som før.
  - «Lag en kopi» gir et aktivt anlegg uten `makin` og med `kopiAv`, og en fil kan legges til i kopien.
  - En ny henting (falsk klient) endrer originalen, men ikke kopien.
  - `_innmalteRor()` har kopien og ikke originalen. Uten kopi har den originalen.
  - Rettingsverktøyene virker på Makin-anlegget (`retting.av` endres).
- [ ] Kjør prøven og se den feile. Skriv koden.
- [ ] Kjør `makinLaas`, `makinHenting`, `rorImport`, `rorRetting`, `rorRapport`, `planAvvik` og `lagringOgAngre`. Alle skal være grønne.
- [ ] Commit.

### Task 7: Dokumentasjon og hele runden

**Files:** Modify `README.md` (rør-avsnittet: «Hent fra Makin», nøkkelen bare i nettleseren, låsen) and `FORTSETTELSE.md` (status og hva som gjenstår).

**Steps:**
- [ ] Oppdater README og FORTSETTELSE.
- [ ] Kjør `npm test` og hele nettleserprøven (`?test=1`). Begge skal være grønne. Den kjente røde sjekken fra minnet «uflettede merknadsprøver» skal nevnes hvis den fortsatt står.
- [ ] Prøv for hånd lokalt med `preview_start`: knappene synes, og nøkkeldialogen og koblingsdialogen åpner seg mot en falsk klient. Med ekte nøkkel gjør brukeren det selv.
- [ ] Commit. **Ikke push** før brukeren sier ja, for push til main deployer.
