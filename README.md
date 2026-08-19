# Massekalk

Teikne ein veg i kartet og få ut kor mykje som må gravast, sprengjast og fyllast –
rekna mot Kartverket sin nasjonale høgdemodell (DTM1, 1 × 1 m laserdata).

Programmet køyrer lokalt på maskina. Ingen innlogging, ingen skytenester, ingen
tredjepartsbibliotek utanom kartkomponenten.

## Kom i gang

```bash
node server.js
```

Opne så <http://localhost:5178>.

Terrengdata blir henta automatisk og mellomlagra i `cache/`, så andre gongen du
opnar same prosjektet går det med ein gong – òg utan nett.

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

66 kontrollar: koordinatrekning mot kjende referansar, linjeføring mot geometri
rekna for hand, lengdeprofil mot parabelformlane, masseberegning mot eit tverrsnitt
rekna ut for hand med sju siffer, massebalansen mot bokføringsreglane, og
terrengmodellen mot Kartverket.

```bash
node test/demo-ydestad.js
```

Køyrer heile kjeda på verkeleg terreng ved Ydestad i Lyngdal og lagrar
demoprosjektet som kan opnast i programmet.

## Filer

```
server.js                lokal server, GeoTIFF-lesar, flis-cache, prosjektlagring
public/js/geo.js         UTM-projeksjon (Krüger, 4. orden) og målestokkfaktor
public/js/linjeforing.js horisontal linjeføring med sirkelkurver
public/js/vertikalprofil.js  lengdeprofil med parabolske vertikalkurver
public/js/terreng.js     terrengmodell i nettlesaren, bilineær interpolasjon
public/js/masser.js      tverrprofil og volumberegning
public/js/ui-*.js        kart, lengdeprofil, tverrprofil, rapport
prosjekter/              prosjektfiler (JSON)
cache/                   nedlasta terrengfliser
```
