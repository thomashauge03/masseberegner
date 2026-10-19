# Hent fra Makin – design

Dato: 2026-10-19

## Hvorfor

I dag laster brukeren ned innmålingene (as-built) fra Makin' 3D for hånd og
drar SOSI-/KOF-/LandXML-filene inn i massekalk. Rør-importen leser allerede
disse formatene (SOSI fra Makin' Excavator: 020920a, KOF: b389099). Målet er
at filene kommer rett fra Makin til massekalk med ett trykk, og at det som
ligger i massekalk er likt det som ligger i Makin hver gang brukeren ber om det.

## Mål

- En egen knapp, **«Hent fra Makin»**, ved siden av «📂 Importer rør».
- Første gang kobler brukeren massekalk-anlegget til et Makin-prosjekt. Valget
  huskes i prosjektet.
- Hvert trykk etter det henter **alle** innmålingene i Makin-prosjektet på nytt
  og bytter ut det som kom fra Makin forrige gang, så massekalk blir likt Makin
  (også når noe er slettet eller rettet der).
- **Punktene** fra Makin er låst: de byttes bare ut av en ny henting, og ingen
  annen fil kan legges inn i Makin-anlegget. **Arbeidet oppå punktene** –
  rettinger (rør av, bryt, koble), «samme rør»/«ikke samme»/«skill»,
  kodetabellen, sone, maks avstand og grøfter – er lov på Makin-anlegget og blir
  liggende når punktene hentes på nytt (brukerens valg 2026-10-19).
- Vil brukeren endre selve punktsettet (legge til en annen fil) eller ha et
  frosset øyeblikksbilde, lager massekalk en **kopi** (et nytt, vanlig
  røranlegg). Neste henting rører ikke kopien.

## Ikke-mål

- Ingen bakgrunnssynk og ingen tidsstyring. Henting skjer på knappen – og,
  endret etter brukerens ønske 2026-10-19, når prosjektet åpnes (se «Avgjort av
  brukeren»).
- Massekalk skriver **aldri** noe til Makin. Bare lesing.
- Kopien følger ikke med når Makin får nye punkter. Den er et øyeblikksbilde fra
  da den ble laget.
- Ikke maskinposisjoner i sanntid, ikke komprimeringsdata (compaction), ikke
  prosjektfiler (modeller) fra Makin.

## Anti-mål (dette ville vært feil selv om det virker)

- **API-nøkkelen ligger på serveren eller i koden.** Massekalk ligger åpent på
  nettet og repoet er offentlig. En nøkkel på serveren ville latt hvem som helst
  med lenken hente kundens innmålinger.
- Ekte as-built-data, prosjektnavn eller nøkler havner i commits, prøver eller
  skjermbilder (se minnet «offentlig repo, ingen kundedata»).
- En henting overskriver noe brukeren har laget selv (en kopi, et annet anlegg).
- Proxyen kan brukes til å nå andre adresser enn Makins API (åpen proxy).

## Makins API (det vi bygger på)

Den nye nøkkeltypen («Opprett ny nøkkel» på web.makin3d.com/profile/tokens).
Dokumentasjon: https://api.cloud.makin3d.com/scalar, spesifikasjon:
https://api.cloud.makin3d.com/openapi/v1.json. Basis: `https://api.cloud.makin3d.com`,
autentisering `Authorization: Bearer <nøkkel>`.

Det vi trenger:

| Kall | Brukes til |
|---|---|
| `GET /v1/organizations` | velge organisasjon (`orgId`, heltall) |
| `GET /v1/organizations/{orgId}/projects` | velge prosjekt (`uuid`, `name`) |
| `GET …/projects/{projectId}/geometry/systems` | maskinene som har logget (`systemUuid`, `systemName`, `recordCount`) |
| `POST …/projects/{projectId}/geometry` | starte eksport; kropp `{systemUuids?, codeNames?, types?: ["point","line"], fromTimestamp?, toTimestamp?, includeDeleted?}` → `{exportId}` |
| `GET …/projects/{projectId}/geometry/{exportId}?format=Sosi&includeLinePoints=true&block=true` | laste ned eksporten som ZIP; `409` betyr «ikke ferdig ennå» |

Makin svarer **ikke** med CORS-hoder (sjekket 2026-10-19: OPTIONS gir 405, GET
gir ingen `Access-Control-*`). Nettleseren kan derfor ikke kalle Makin direkte;
kallene må gå gjennom massekalks egen server.

Den gamle API-en (`cloud.makin3d.com/api/v1`, «legacy-nøkler») har `log_points`,
men Makin sier legacy-nøkler skal fjernes. Vi bruker bare den nye.

## Slik virker det for brukeren

1. **Nøkkelen.** Første gang brukeren trykker «Hent fra Makin» uten lagret
   nøkkel, ber massekalk om den (lim inn). Den lagres bare i nettleseren på den
   maskinen, under `localStorage['massekalk.makin']`, etter samme mønster som
   `massekalk.kartvalg` (ui-kart.js:161-184): try/catch, `{v:1, …}`, tåler privat
   modus. Den ligger aldri i `P`, så den havner ikke i prosjektlagringen,
   angre-stegene eller eksporter. Det skal finnes en måte å bytte og glemme
   nøkkelen på.
2. **Koble til.** Er det aktive anlegget ikke koblet til Makin, viser massekalk
   en dialog: organisasjon (hoppes over hvis det bare er én), prosjekt, og
   maskiner (alle avkrysset som standard). Valget lagres på anlegget.
3. **Henting.** Massekalk starter eksporten, venter til den er klar, pakker ut
   SOSI-fila og legger punktene inn i det låste Makin-anlegget, der de erstatter
   alle punktene fra forrige henting. Brukeren ser en enkel framdrift
   («Ber Makin lage fila … henter … N punkter»), og en kort oppsummering etterpå
   (antall punkt, nye/borte siden sist om det er enkelt å få til).
4. **Makin-anlegget.** Det er merket «fra Makin» med tidspunkt for siste
   henting. Rettinger, kodetabell og grøfter brukes som på et vanlig anlegg.
   Det som ville endret punktsettet (importere en fil inn i det), er sperret, og
   der får brukeren valget «Lag en kopi». Kopien heter for eksempel
   «<navn> (kopi)», er et vanlig innmålt røranlegg uten Makin-kobling, og blir
   aktivt.
5. **Etter ny henting** blir rettinger, «samme rør», kodetabell og grøfter
   liggende. De henger på punktenes navn (`id`) og koder; en retting som peker
   på et punkt som ikke lenger finnes, faller bort, og oppsummeringen sier hvor
   mange (ikke stille). Koder som er nye fra Makin, får forslag i kodetabellen
   som ved vanlig import; koder brukeren har satt opp, beholdes.

## Data

- På anlegget (lagres med prosjektet):
  `a.ror.makin = { orgId, prosjektId, prosjektnavn, systemer: [uuid…] | null, sistHentet, antall }`.
  `systemer: null` betyr alle maskiner.
- Punktene legges i `a.ror.punkter` som i dag (`{id, kode, n, o, z, tid, nr}`),
  via `Ror.lesFil` på SOSI-teksten. `a.ror.kilder` får én kilde per henting, eller
  erstattes med siste henting (byggerens valg; kildelista skal ikke vokse uten
  grense ved mange hentinger).
- Nøkkelen: bare `localStorage['massekalk.makin']`, se over.

## Serveren (proxy)

Ny Vercel-funksjon `api/makin.js`, koblet inn i `RUTER` i `server.js` så den
virker likt lokalt. Den:

- tar imot nøkkelen fra nettleseren i et hode (`Authorization`) for hvert kall,
  sender den videre til Makin og **lagrer, logger eller mellomlagrer den aldri**;
  svarene får `Cache-Control: no-store`;
- slipper bare gjennom en fast liste med kall (de fem over), bygd fra
  validerte parametre (`orgId` heltall, `projectId`/`exportId` på riktig form),
  aldri en adresse eller sti fra klienten;
- pakker ut ZIP-fila fra eksporten på serveren (ingen avhengigheter i dag:
  en liten leser for ZIP-katalogen med `zlib.inflateRawSync`, som
  `lib/hoydedata.js` allerede bruker zlib) og sender SOSI-teksten videre;
- holder seg innenfor Vercels `maxDuration: 30` (vercel.json). `block=true` er
  begrenset hos Makin og kan likevel gi `409`; da svarer proxyen «ikke klar», og
  nettleseren prøver igjen etter et par sekunder, med en øvre grense før den gir
  opp med en forståelig melding.

## Låsingen

Det finnes ingen låsing av anlegg i dag (agent-kartlegging 2026-10-19). Det som
endrer et innmålt røranlegg etter import:

- kartverktøyene «rør av», «bryt», «koble» (`retting`), «tilbakestill»;
- «samme rør» / «ikke samme» / «skill» (`alias`, `ikkeSamme`);
- kodetabellen (form, dimensjon, farge, med) og grøft per kode;
- sone og maks avstand i Rør-fanen;
- import av nyere fil / legge til i anlegget (inkl. som mål i importdialogen);
- grøft på strekning / felles grøft;
- gi nytt navn, slette, flytte anlegget.

Brukeren har valgt at **bare punktsettet låses**. Det betyr at på et
Makin-anlegg er bare dette sperret:

- import av nyere fil / legge til fil i anlegget: `#rorImportNy`, kartknappen
  «📂 Importer rør» med anlegget som mål, dra-og-slipp, og målene `leggTil` /
  `anlegg:<id>` i importdialogen (Makin-anlegget skal ikke stå i lista);
- at noe annet enn hentingen skriver til `a.ror.punkter` eller `a.ror.makin`.

Alt annet i lista over er lov. Gi nytt navn og slette anlegget er også lov
(sletting fjerner koblingen; neste kobling lager et nytt anlegg).

Hentingen bytter ut `a.ror.punkter` og oppdaterer `a.ror.makin` og `kilder`,
men rører ikke `retting`, `alias`, `ikkeSamme`, `koder` (bortsett fra å legge
til nye), `groft`, `sone` eller `mal`. Én henting er ett angre-steg
(`app.merk('hentet fra Makin')`).

## Kopien

Finnes ikke i dag. En dyp kopi av anlegget med ny `id`, nytt navn, uten
`ror.makin`, lagt rett etter originalen i `P.anlegg`, og gjort aktivt. Ett
angre-steg (`app.merk('kopi av anlegg')`).

## Prøver

- Node (`npm test`): ZIP-leseren og proxyens adresse-bygging/validering, med
  laget testdata (ingen ekte innmålinger). Makin kalles aldri fra prøvene; en
  falsk Makin-tjener eller innsprøytet `fetch`.
- Nettleserprøven (`?test=1`): knappene synes der de skal; en fil kan ikke
  importeres inn i Makin-anlegget; en ny henting erstatter punktene, men
  rettinger, «samme rør», kodetabell og grøfter blir liggende (og en retting på
  et punkt som er borte, faller bort og telles); kopien kan få filer lagt til og
  røres ikke av en ny henting; originalen telles ikke dobbelt når det finnes en
  kopi. Med falske svar, ikke ekte nettverk.

## Avgjort av brukeren

- Egen knapp, henting når brukeren trykker.
- 2026-10-19, etter første utgave: Makin-anleggene hentes også på nytt av seg
  selv når prosjektet åpnes. Likt Makin gir ingen endring og ingen angrepost;
  uten lagret nøkkel eller ved feil står det bare en linje i statuslinja.
  (Makins API kan ikke liste prosjektfilene, så «velge blant filene i Makin»
  er ikke mulig; brukeren valgte å beholde punkthentingen.)
- Hver henting gjør massekalk likt Makin.
- Fila fra Makin skal ikke endres; endring av punktsettet betyr en ny fil (kopi).
- Bare punktene låses. Rettinger, kodetabell og grøfter er lov på
  Makin-anlegget og blir liggende når punktene hentes på nytt.
- Massekalk skriver aldri til Makin.
- Nøkkelen limes inn lokalt, ikke på serveren (forslag brukeren sa ja til).

## Mine valg (kan overstyres)

- Hent alt hver gang i stedet for bare det nye – enklere og fanger slettinger.
- SOSI som format (`includeLinePoints=true`), siden Makin' Excavator-SOSI er det
  rør-importen er best prøvd på.
- Alle maskiner som standard, med mulighet for å velge noen i koblingsdialogen.
- Ett Makin-anlegg per Makin-prosjekt.

## Avgjort etter gjennomlesingen (mine valg)

- **Første steg er å se på en ekte eksport.** Ingen har ennå lest en SOSI fra
  Makins sky-API. Før noe bygges, hentes én eksport lokalt med brukerens nøkkel
  og ses på – aldri lagret i repoet. Det avgjør: om linjer kommer som `.KURVE`
  (som `lesSOSI` i dag hopper over, ror.js:287) og må leses som punktrekker; om
  punktnavn kolliderer mellom maskiner (da blir id `maskin|navn`, ellers blir
  punkter borte som «doble»); om navnene er de samme fra henting til henting; og
  hvilken sone fila er i. Parseren tilpasses etter det, og prøvene får laget
  testdata i samme form.
- **Å koble til lager alltid et nytt, tomt Makin-anlegg.** Et eksisterende
  anlegg gjøres aldri om til et Makin-anlegg. Knappen finnes derfor også i
  anleggspanelet («⌀ Rør fra Makin», ved siden av «⌀ Nye rør (fra filer)»),
  så den virker i et prosjekt uten innmålte rør. På et Makin-anlegg blir
  kartverktøy-knappen «Hent fra Makin» (hent på nytt).
- **Hvilke koder.** Koblingsdialogen viser kodene Makin har (`geometry/objects`)
  med avkrysning, alle på som standard. Valget lagres i
  `a.ror.makin.koder` (`null` = alle) og sendes som `codeNames`. Slik kan
  kantstein, terreng o.l. holdes utenfor rør-tolkningen.
- **Kopi og dobbelttelling.** `_innmalteRor` (app.js:3626) summerer alle
  innmålte røranlegg i rapporter, avvik og kryssing. Når det finnes en kopi av et
  Makin-anlegg, telles originalen ikke med i beregningene (den vises fortsatt,
  dempet, og kan hentes på nytt). Lages flere kopier, er det brukerens ansvar å
  slette dem hen ikke vil ha med.
- **Størrelse.** Vercel-funksjoner kan svare med høyst ca. 4,5 MB. Proxyen
  pakker ut på serveren; blir SOSI-teksten for stor, hentes eksporten i
  tidsbolker (`fromTimestamp`/`toTimestamp`) og settes sammen i nettleseren.
  Byggeren måler på den ekte eksporten før hen bygger bolkingen.

## Åpne spørsmål

Ingen. (Hva som låses, ble avgjort av brukeren 2026-10-19: bare punktsettet.)
