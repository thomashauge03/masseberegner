# Massekalk

Teikne ein veg i kartet og få ut kor mykje som må gravast, sprengjast og fyllast –
rekna mot Kartverket sin nasjonale høgdemodell (DTM1, 1 × 1 m laserdata).

Ingen innlogging, ingen database å drifte, ingen npm-avhengigheiter utanom
kartkomponenten. Køyrer både lokalt og på Vercel.

## Kom i gang

**På nett:** appen ligg på Vercel. Kvar push til `main` blir lagt ut automatisk.

**Lokalt:**

```bash
node server.js
```

Opne så <http://localhost:5178>. Ingen npm install – programmet brukar berre
det som ligg i Node frå før.

Terrengdata blir henta automatisk. Flisene har eit år med hurtigbuffer, så andre
gongen du opnar same prosjektet går det med ein gong – òg utan nett.

## Prosjekt

Prosjekta ligg i nettlesaren si eiga database (IndexedDB) på den maskina du
brukar. Det gjer at programmet verkar likt lokalt og på Vercel, utan innlogging
og utan at nokon må drifte ein database.

Under **Åpne** finn du difor:

* **Importer fil** – hent inn eit prosjekt frå ei `.json`-fil
* **Eksporter** – ta med eitt prosjekt til ei anna maskin eller ein kollega
* **Eksporter alle** – sikkerheitskopi av alt

Ta ein eksport med jamne mellomrom. Tømmer du nettlesardata, forsvinn prosjekta.
Skal fleire jobbe på same prosjekt samtidig, må det ein delt database til –
sjå «Vidare arbeid» nedst.

## Slik brukar du det

1. **Søk opp staden** i søkefeltet oppe til venstre (stadnamn eller adresse).
2. **Trykk «Tegn senterlinje»** og klikk deg langs traseen. Dobbeltklikk for å avslutte.
3. **Sett kurveradius** ved å klikke på eit knekkpunkt – akkurat som BC/EC/R i ein vanleg vegplan.
4. **Lengdeprofilen** kjem opp automatisk. Programmet foreslår ei linje som følgjer terrenget
   og held stigningskravet. Dra i knekkpunkta for å justere, dobbeltklikk for å leggje til
   eller fjerne eit.
5. **Legg inn grunnforhold** under fana «Grunnforhold»: standard djupn til fjell, kjende
   strekningar, og observasjonar du klikkar inn i kartet (verktøyet «Fjellpunkt»).
   Observasjonane vektast med avstand og overstyrer standardverdien i nærleiken.
6. **Les massane** i sidepanelet, og trykk **Rapport** for eit utskriftsklart samandrag.

## Veiklasse som hurtigval

Under **Vegmal** vel du veiklasse, og malen blir sett opp med krava som
faktisk gjeld — vegbreidd, minste radius, grøftedjupn, breiddeutviding i kurver
og største stigning. Tala er henta rett frå *Normaler for landbruksveier med
byggebeskrivelse* (Landbruks- og matdepartementet / Skogkurs), klasse for klasse,
og kjelda står i programmet. Alt kan overstyrast.

To ting normalen gjer som er verdt å vite:

* **Kurvetabellen oppgir total vegbreidd, ikkje eit tillegg.** Byggjer du 4,5 m
  brei veg og normalen krev 5,5 m i ein R = 10-sving, blir utvidinga 1,0 m.
  Breidda avheng òg av kor mykje kurven dreiar, så det blir interpolert mellom
  kolonnane for 45° og 135°.
* **Stigningskravet er ulikt med og utan lass.** Klasse 5 tillèt 14 % i ein
  R = 30-sving når tømmerlasset skal opp, men 17 % når det er den tomme bilen
  som klatrar. Difor set du kva veg lasset køyrer, og programmet vel rett krav
  i kvar bakke.

Klasse 1 har inga eiga tabell i normalen — den blir bygd i samarbeid med
offentleg vegmyndigheit — så der er verdiane berre eit utgangspunkt, og
programmet seier ifrå om det.

## Høgder du bestemmer sjølv

Skal du treffe ein lengdeprofil som alt er prosjektert, legg du høgdene inn
under fana **Høyder**:

* Lim inn heile tabellen frå veiplanen eller reknearket. Formatet er fritt —
  mellomrom, semikolon, tabulator eller komma, `250` eller `0+250`,
  punktum eller komma som desimalteikn.
* **Fyll hver N m** lagar rader med jamn avstand, til dømes kvar 5 m.
* **Låste** høgder ligg i ro. «Foreslå profil», «Massebalanse» og «Optimaliser»
  flyttar berre dei frie punkta, og seier ifrå når alt er låst.

I **tverrprofilet** kan du skrive inn høgda på venstre vegkant, i senterlinja og
på høgre vegkant for det profilet du står i. Senterlinja styrer lengdeprofilen,
og vegkantane styrer tverrfallet på si side — så eit oppmålt tverrsnitt kan
leggjast rett inn, med ulikt fall til kvar side om det trengst.

Knappane over lengdeprofilen:

| Knapp | Kva han gjer |
|---|---|
| Foreslå profil | Ny profillinje som følgjer terrenget og held stigningskravet |
| Massebalanse | Løftar/senker heile profilen til skjering og fylling går opp i opp |
| Optimaliser | Finjusterer kvart knekkpunkt for minst mogleg masseflytting (sprengning vektast tyngst) |

## Kva som blir rekna

| Post | Slik |
|---|---|
| Rensk / avdekking | Tjukn × (fotavtrykk + margin på kvar side) |
| Skjering | Frå terreng etter rensk ned til planum, grøft og skjeringsskråning |
| – fordelt på fjell og lausmasse | Etter djupna til fjell i kvart punkt |
| Fylling | Frå terreng etter rensk opp til planum og fyllingsskråning |
| Berelag / slitelag | Tjukn × breidd, breiddeutvida i kurver |
| Massebalanse | Kor mykje av skjeringa som kan brukast om att i fyllinga |
| Massetransport | Brucknerkurve – kvar det er overskot og kvar det manglar masse |

Detaljar som er tekne med:

* **Kurvekorreksjon.** I ein krapp kurve blir det meir masse på yttersida enn på
  innsida. Kvar arealstripe blir vekta med `(1 + t · krumning)` etter Pappus' regel,
  så volumet blir rett òg i ein R = 10-sving.
* **Breiddeutviding i kurver** etter tabell, med jamn overgang inn og ut (standard 15 m).
* **Samansett skjeringsskråning.** Skråninga er slak i lausmassen over fjellet og
  brattare i fjellet under – ho blir bygd opp steg for steg gjennom laga.
* **Stigningskrav etter kurveradius.** Profil som bryt kravet blir merkt.
* **Lengdekorreksjon.** UTM-planet strekkjer lengdene litt. Programmet reknar
  punktmålestokken og gjer om til verkeleg lengd på bakken (kan slåast av).

Alle volum er *prosjektert fast volum* (p.f.m³) om ikkje anna står. Omrekning til
anbrakt volum (p.a.m³) skjer med faktorane du set under «Vegmal».

## Datagrunnlag

| Kva | Kjelde |
|---|---|
| Terreng | Kartverket, nasjonal høgdemodell DTM1 (1 m, flyboren laser) |
| Bakgrunnskart | Kartverket WMTS (topografisk, turkart, gråtone) |
| Terrengskugge | Kartverket høgdedata, skuggerelieff av laserdataene |
| Lausmassar | NGU (valfritt kartlag) |
| Stadnamn og adresser | Kartverket sitt opne API |

Høgdene er kontrollerte mot Kartverket sitt offisielle punkt-API og stemmer innanfor
**5 millimeter** (`node test/selftest.js`, punkt 6). Knappen «Kontroller høyder mot
Kartverket» under fana «Linje» køyrer den same kontrollen på din eigen trasé.

**Hugs:** terrengmodellen viser terrenget slik det var då området sist vart skanna.
Er det gjort inngrep etterpå, eller står det tett skog med dårleg laserdekning,
må du kontrollere mot befaring.

## Eksport

* **Stikningsdata (CSV)** – profilnummer, nord, aust, veghøgd og vegkantar. Kan lesast
  inn i maskinstyring.
* **Masseoppsett per profil (CSV)** – areal og volum for kvart profil.
* **GeoJSON** – senterlinje, fotavtrykk og fjellobservasjonar.
* **Rapport** – utskriftsklar HTML som kan lagrast som PDF frå nettlesaren.

## Test

```bash
node test/selftest.js
```

111 kontrollar: koordinatrekning mot kjende referansar, linjeføring mot geometri
rekna for hand, lengdeprofil mot parabelformlane, masseberegning mot eit tverrsnitt
rekna ut for hand med sju siffer, veiklassane mot tala i normalen, innlesing av
høgdetabellar, eige tverrfall per profil, massebalansen mot bokføringsreglane,
pakkinga av terrengfliser, og terrengmodellen mot Kartverket.

```bash
node test/demo-ydestad.js
```

Køyrer heile kjeda på verkeleg terreng ved Ydestad i Lyngdal og skriv
demoprosjektet til `public/demo/`.

## Filer

```
public/js/veiklasser.js  veiklassane frå landbruksveinormalen
public/js/farger.js      tegnefargane, henta frå CSS-variablane
public/bilde/hm-logo.png HM-logoen (same fila som i dei andre appane)

api/dtm/flis.js          hentar og pakkar ei terrengflis (Vercel-funksjon)
api/punkt.js             kontroll mot Kartverket sitt punkt-API
api/sok.js               stadnamn- og adressesøk
lib/hoydedata.js         GeoTIFF-lesar, flishenting og pakking
server.js                lokal utviklingsserver som brukar dei same funksjonane
vercel.json              utlegging

public/js/lager.js       prosjektlager i nettlesaren, import og eksport
public/js/geo.js         UTM-projeksjon (Krüger, 4. orden) og målestokkfaktor
public/js/linjeforing.js horisontal linjeføring med sirkelkurver
public/js/vertikalprofil.js  lengdeprofil med parabolske vertikalkurver
public/js/terreng.js     terrengmodell i nettlesaren, bilineær interpolasjon
public/js/masser.js      tverrprofil og volumberegning
public/js/ui-*.js        kart, lengdeprofil, tverrprofil, rapport
public/demo/             demoprosjekt som blir lagt inn første gongen
```

Terrengflisene blir sende som heile centimeter over eit nullnivå for flisa
(16 bits). Terrengmodellen er sjølv oppgitt i centimeter, så ingenting går tapt –
kontrollen mot Kartverket sitt API gir no **0,000 m avvik** – og flisa blir under
halvparten så stor på nettet. `FLIS_VERSJON` i `public/js/terreng.js` må aukast
dersom formatet blir endra, sidan flisene blir bufra i eit år.

## Vidare arbeid

* **Delte prosjekt.** I dag ligg prosjekta lokalt i nettlesaren. Skal fleire på
  kontoret sjå dei same prosjekta, må det ein delt database til (Supabase eller
  Vercel Postgres) med innlogging.
* **Stikkrenner.** Vegplanane har stikkrenner med plassering, dimensjon og lengd.
  Desse kan leggjast inn som punkt langs linja med automatisk lengd ut frå
  fyllingshøgda.
