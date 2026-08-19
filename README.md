# Massekalk

Tegn en vei i kartet og få ut hvor mye som må graves, sprenges og fylles –
regnet mot Kartverkets nasjonale høydemodell (DTM1, 1 × 1 m laserdata).

Ingen innlogging, ingen database å drifte, ingen npm-avhengigheter utenom
kartkomponenten. Kjører både lokalt og på Vercel.

## Kom i gang

**På nett:** appen ligger på Vercel. Hver push til `main` blir lagt ut automatisk.

**Lokalt:**

```bash
node server.js
```

Åpne så <http://localhost:5178>. Ingen npm install – programmet bruker bare
det som ligger i Node fra før.

Terrengdata blir hentet automatisk. Flisene har ett år med hurtigbuffer, så andre
gangen du åpner samme prosjektet går det med en gang – også uten nett.

## Prosjekt

Prosjektene ligger i nettleserens egen database (IndexedDB) på den maskinen du
bruker. Det gjør at programmet virker likt lokalt og på Vercel, uten innlogging
og uten at noen må drifte en database.

Under **Åpne** finner du derfor:

* **Importer fil** – hent inn et prosjekt fra en `.json`-fil
* **Eksporter** – ta med ett prosjekt til en annen maskin eller en kollega
* **Eksporter alle** – sikkerhetskopi av alt

Ta en eksport med jevne mellomrom. Tømmer du nettleserdata, forsvinner prosjektene.
Skal flere jobbe på samme prosjekt samtidig, trengs det en delt database –
se «Videre arbeid» nederst.

## Slik bruker du det

1. **Søk opp stedet** i søkefeltet oppe til venstre (stedsnavn eller adresse).
2. **Trykk «Tegn senterlinje»** og klikk deg langs traseen. Dobbeltklikk for å avslutte.
3. **Sett kurveradius** ved å klikke på et knekkpunkt – akkurat som BC/EC/R i en vanlig veiplan.
4. **Lengdeprofilen** kommer opp automatisk. Programmet foreslår en linje som følger terrenget
   og holder stigningskravet. Dra i knekkpunktene for å justere, dobbeltklikk for å legge til
   eller fjerne et.
5. **Legg inn grunnforhold** under fanen «Grunnforhold»: standard dybde til fjell, kjente
   strekninger, og observasjoner du klikker inn i kartet (verktøyet «Fjellpunkt»).
   Observasjonene vektes med avstand og overstyrer standardverdien i nærheten.
6. **Les massene** i sidepanelet, og trykk **Rapport** for et utskriftsklart sammendrag.

## Veiklasse som hurtigvalg

Under **Vegmal** velger du veiklasse, og malen blir satt opp med kravene som
faktisk gjelder — vegbredde, minste radius, grøftedybde, breddeutvidelse i kurver
og største stigning. Tallene er hentet rett fra *Normaler for landbruksveier med
byggebeskrivelse* (Landbruks- og matdepartementet / Skogkurs), klasse for klasse,
og kilden står i programmet. Alt kan overstyres.

To ting normalen gjør som er verdt å vite:

* **Kurvetabellen oppgir total vegbredde, ikke et tillegg.** Bygger du 4,5 m
  bred vei og normalen krever 5,5 m i en R = 10-sving, blir utvidelsen 1,0 m.
  Bredden avhenger også av hvor mye kurven dreier, så det blir interpolert mellom
  kolonnene for 45° og 135°.
* **Stigningskravet er ulikt med og uten lass.** Klasse 5 tillater 14 % i en
  R = 30-sving når tømmerlasset skal opp, men 17 % når det er den tomme bilen
  som klatrer. Derfor setter du hvilken vei lasset kjører, og programmet velger
  riktig krav i hver bakke.

Klasse 1 har ingen egen tabell i normalen — den blir bygd i samarbeid med
offentlig vegmyndighet — så der er verdiene bare et utgangspunkt, og
programmet sier ifra om det.

## Høyder du bestemmer selv

Skal du treffe en lengdeprofil som allerede er prosjektert, legger du høydene inn
under fanen **Høyder**:

* Lim inn hele tabellen fra veiplanen eller regnearket. Formatet er fritt —
  mellomrom, semikolon, tabulator eller komma, `250` eller `0+250`,
  punktum eller komma som desimaltegn.
* **Fyll hver N m** lager rader med jevn avstand, for eksempel hver 5 m.
* **Låste** høyder ligger i ro. «Foreslå profil», «Massebalanse» og «Optimaliser»
  flytter bare de frie punktene, og sier ifra når alt er låst.

I **tverrprofilet** kan du skrive inn høyden på venstre vegkant, i senterlinjen og
på høyre vegkant for det profilet du står i. Senterlinjen styrer lengdeprofilen,
og vegkantene styrer tverrfallet på sin side — så et oppmålt tverrsnitt kan
legges rett inn, med ulikt fall til hver side om det trengs.

Knappene over lengdeprofilen:

| Knapp | Hva den gjør |
|---|---|
| **Rett opp** | Beholder profilen du har, retter bruddene på kravene, og går så løs på å få ned sprengning og fylling. Bruk denne på et prosjekt som allerede er tegnet |
| Foreslå profil | Ny profillinje fra terrenget. Kaster den du har |
| Massebalanse | Løfter/senker hele profilen til skjæring og fylling går opp i opp |
| Optimaliser | Finjusterer hvert knekkpunkt for billigst mulig løsning |

## Hva «billigst» betyr

Optimaliseringen vekter, i den rekkefølgen det gjør vondt:

1. **Sprengning** – dyrest, og det man helst vil unngå
2. **Graving i løsmasse**
3. **Transport** inn eller ut av anlegget når massene ikke går opp
4. **Inngrepet i terrenget** – renskevolumet er tykkelsen ganger fotavtrykket,
   altså et direkte mål på hvor bredt man river opp lia
5. **Avstanden til terrenget** – arealet mellom veglinjen og bakken i
   lengdeprofilen, så veien legger seg rolig oppå terrenget i stedet for å
   svinge over og under det
6. **Fylling** – billigst, så lenge massene finnes

I tillegg er kravene fra veiklassen og grensene for hva som lar seg bygge lagt
inn som svært dyre brudd, så en løsning som bryter dem blir aldri valgt.

Under **Vegmal → Grenser** setter du hva som lar seg bygge: største
fyllingshøyde, største skjæringsdybde og største utslag fra vegkant. «Regn bare
ut til» stopper regnestykket et gitt antall meter fra vegkanten, så du får
massene for det du faktisk har tenkt å gjøre. Setter du **«Kan flytte linjen
inntil»**, får «Optimaliser» lov til å flytte senterlinjen sidelengs for å treffe
billigere terreng – knekkpunktene i kartet flyttes, så du ser hvor den nye linjen
går.

Der terrenget gjør det umulig å holde både stigningskravet og fyllingsgrensen –
over en trang kløft må veien bru den – blir profilen dratt så nær som mulig, og
resten kommer som merknad. Programmet sier ifra i stedet for å skjule det.

## Hva som blir regnet

| Post | Slik |
|---|---|
| Rensk / avdekking | Tykkelse × (fotavtrykk + margin på hver side) |
| Skjæring | Fra terreng etter rensk ned til planum, grøft og skjæringsskråning |
| – fordelt på fjell og løsmasse | Etter dybden til fjell i hvert punkt |
| Fylling | Fra terreng etter rensk opp til planum og fyllingsskråning |
| Bærelag / slitelag | Tykkelse × bredde, breddeutvidet i kurver |
| Massebalanse | Hvor mye av skjæringen som kan brukes om igjen i fyllingen |
| Massetransport | Brucknerkurve – hvor det er overskudd og hvor det mangler masse |

Detaljer som er tatt med:

* **Kurvekorreksjon.** I en krapp kurve blir det mer masse på yttersiden enn på
  innsiden. Hver arealstripe blir vektet med `(1 + t · krumning)` etter Pappus' regel,
  så volumet blir riktig også i en R = 10-sving.
* **Breddeutvidelse i kurver** etter tabell, med jevn overgang inn og ut (standard 15 m).
* **Sammensatt skjæringsskråning.** Skråningen er slak i løsmassen over fjellet og
  brattere i fjellet under – den blir bygd opp steg for steg gjennom lagene.
* **Stigningskrav etter kurveradius.** Profil som bryter kravet blir merket.
* **Lengdekorreksjon.** UTM-planet strekker lengdene litt. Programmet regner ut
  punktmålestokken og gjør om til virkelig lengde på bakken (kan slås av).

Alle volum er *prosjektert fast volum* (p.f.m³) om ikke annet står. Omregning til
anbrakt volum (p.a.m³) skjer med faktorene du setter under «Vegmal».

## Datagrunnlag

| Hva | Kilde |
|---|---|
| Terreng | Kartverket, nasjonal høydemodell DTM1 (1 m, flybåren laser) |
| Bakgrunnskart | Kartverket WMTS (topografisk, turkart, gråtone) |
| Terrengskygge | Kartverket høydedata, skyggerelieff av laserdataene |
| Løsmasser | NGU (valgfritt kartlag) |
| Stedsnavn og adresser | Kartverkets åpne API |

Høydene er kontrollert mot Kartverkets offisielle punkt-API og stemmer **eksakt**
(`node test/selftest.js`, punkt 8). Knappen «Kontroller høyder mot Kartverket»
under fanen «Linje» kjører den samme kontrollen på din egen trasé.

## Hvor sikre er tallene

Terrenghøydene er målt. **Dybden til fjell er et anslag** – og det er den som
avgjør hva jobben koster. Sidepanelet og rapporten regner derfor sprengningen om
igjen med fjellet en halvmeter høyere og en halvmeter lavere, så du ser hva
anslaget faktisk betyr i kubikk. På demoprosjektet flytter et halvmetersbom
1 115 m³ – 70 % av hele skjæringsvolumet.

Registrer fjellpunkt i kartet der dere vet hva som ligger under. Det er det
eneste som strammer inn dette tallet.

**Husk:** terrengmodellen viser terrenget slik det var da området sist ble skannet.
Er det gjort inngrep etterpå, eller står det tett skog med dårlig laserdekning,
må du kontrollere mot befaring.

## Eksport

* **Stikningsdata (CSV)** – profilnummer, nord, øst, veghøyde og vegkanter. Kan leses
  inn i maskinstyring.
* **Masseoppsett per profil (CSV)** – areal og volum for hvert profil.
* **GeoJSON** – senterlinje, fotavtrykk og fjellobservasjoner.
* **Rapport** – utskriftsklar HTML som kan lagres som PDF fra nettleseren.

## Test

```bash
node test/selftest.js
```

124 kontroller: koordinatregning mot kjente referanser, linjeføring mot geometri
regnet for hånd, lengdeprofil mot parabelformlene, masseberegning mot et tverrsnitt
regnet ut for hånd med sju siffer, veiklassene mot tallene i normalen, innlesing av
høydetabeller, eget tverrfall per profil, avkortet beregningsbredde, grensene mot
terrenget, massebalansen mot bokføringsreglene, pakkingen av terrengfliser, og
terrengmodellen mot Kartverket.

```bash
node test/demo-ydestad.js
```

Kjører hele kjeden på virkelig terreng ved Ydestad i Lyngdal og skriver
demoprosjektet til `public/demo/`.

## Filer

```
api/dtm/flis.js          henter og pakker en terrengflis (Vercel-funksjon)
api/punkt.js             kontroll mot Kartverkets punkt-API
api/sok.js               stedsnavn- og adressesøk
lib/hoydedata.js         GeoTIFF-leser, flishenting og pakking
server.js                lokal utviklingsserver som bruker de samme funksjonene
vercel.json              utlegging

public/js/geo.js         UTM-projeksjon (Krüger, 4. orden) og målestokkfaktor
public/js/linjeforing.js horisontal linjeføring med sirkelkurver
public/js/vertikalprofil.js  lengdeprofil, retting mot kravene, innlesing av høydetabell
public/js/terreng.js     terrengmodell i nettleseren, bilineær interpolasjon
public/js/masser.js      tverrprofil og volumberegning
public/js/veiklasser.js  veiklassene fra landbruksveinormalen
public/js/lager.js       prosjektlager i nettleseren, import og eksport
public/js/farger.js      tegnefargene, hentet fra CSS-variablene
public/js/ui-*.js        kart, lengdeprofil, tverrprofil, rapport
public/bilde/hm-logo.png HM-logoen (samme fil som i de andre appene)
public/demo/             demoprosjekt som blir lagt inn første gangen
```

Terrengflisene blir sendt som hele centimeter over et nullnivå for flisen
(16 bits). Terrengmodellen er selv oppgitt i centimeter, så ingenting går tapt –
kontrollen mot Kartverkets API gir nå **0,000 m avvik** – og flisen blir under
halvparten så stor på nettet. `FLIS_VERSJON` i `public/js/terreng.js` må økes
dersom formatet blir endret, siden flisene blir bufret i ett år.

## Videre arbeid

* **Delte prosjekt.** I dag ligger prosjektene lokalt i nettleseren. Skal flere på
  kontoret se de samme prosjektene, trengs det en delt database (Supabase eller
  Vercel Postgres) med innlogging.
* **Stikkrenner.** Veiplanene har stikkrenner med plassering, dimensjon og lengde.
  Disse kan legges inn som punkt langs linjen med automatisk lengde ut fra
  fyllingshøyden.
