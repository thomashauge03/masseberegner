# Gjennomgang av Massekalk

18 uavhengige granskere gikk gjennom hver sin del av programmet. Hvert funn ble
deretter forsøkt motbevist av to andre — én som skulle vise at det var feil, og én
som skulle avgjøre om det kan skje for et anleggsfirma i praksis.

**Status:** 166 funn fra granskerne. 170 dommer avsagt (145 står, 25 felt).
Motprøvingen var ikke ferdig da denne fila ble skrevet, så funnene under er
granskernes egne og ikke endelig sortert.

> Ingenting her er rettet ennå. Dette er lista over hva som skal gjennomgås.

| Alvor | Antall |
|---|---|
| kritisk | 15 |
| alvorleg | 49 |
| moderat | 66 |
| liten | 36 |


## Kritisk (15)

### Skråningstallene har ingen grenser, og «normaliseringen» de påstås å ha stopper ikke NaN

`public/js/masser.js:741` · etterprøvd

**Hva:** skjaeringLosmasse, skjaeringFjell og fylling står ikke i MALGRENSER. Loopen på 741–747 skriver bare en merknad og retter aldri verdien. Kommentaren på 740 sier «skraningene normaliseres allerede», og mener Math.max(0.02, m) i beregnTverrprofil (linje 384, 393, 428). Men Math.max(0.02, NaN) === NaN og Math.max(0.02, undefined) === NaN – klemmen virker bare mot negative tall, ikke mot NaN. NaN forplanter seg til hele volumregnskapet. I tillegg skrives den klemte 0.02-verdien aldri tilbake til mal, så «Forutsetninger»-tabellen i rapporten (ui-rapport.js:428–430, ui-pdfrapport.js:211) skriver den forkastede verdien.

**Når:** Prosjektfil med "fylling": null lagres/åpnes. JSON.stringify skriver null for NaN, og Lager.importer (lager.js:160–174) validerer ingenting. Flat veg 100 m, standardmal, ren fylling 3 m over terreng: alle volumene blir NaN, mens rensk blir 1852 m³ i stedet for 159,75 m³ fordi skråningsmarsjen løper helt ut til søkebredden. Rapporten viser NaN som «–» (ui-rapport.js:9), altså som «ingenting», ikke som feil. Merknaden sier «Fyllingsskråning var NaN – regnet med 0.02 (nesten loddrett)», som er usant. Variant 2: fylling = -1,5 (fortegnsfeil). Da blir 0,02 faktisk brukt, men mal.fylling står igjen som -1,5, så rapporten skriver «Fyllingsskråning 1:-1.5» mens volumet er regnet med 1:0,02.

**Følge:** NaN-varianten: hele masseoppsettet blir «–» og rensk er 11,6 ganger for stort (1852 mot 160 m³ på 100 m veg). Fortegnsvarianten: fylling 1230,0 m³ mot 2064,8 m³ riktig, altså 40 % for lite, og forutsetningsarket motsier merknaden. Begge deler er tall en pris settes på.

**Bevis:** Kjørt: fylling=NaN → sum.skjaering/fylling/rensk = NaN/NaN/1852,0 (fasit 341,3/0/159,75). fylling=-1,5 → fylling 1230,045 mot 2064,844 med 1,5. res.mal.fylling er uendret -1,5 / NaN / "abc" etter rettInngang. node -e bekrefter Math.max(0.02,NaN)===NaN. Strengen "1.5" gir motsatt feil: riktig tall (2064,844, identisk med tallet 1.5) men falsk merknad om at 0,02 ble brukt.

### null og undefined slipper forbi hele klem-vakten uten en eneste merknad

`public/js/masser.js:723` · etterprøvd

**Hva:** `if (v == null) continue;` hopper over både null og undefined før typekontrollen. Kommentaren på 707–715 sier at kontrollen ligger her nettopp fordi «en fil som lastes gar rett inn». Men null er den vanligste måten et tall mangler i JSON – JSON.stringify skriver null for NaN og Infinity – og beregnMasser sin Object.assign({}, StandardMal, o.mal) overskriver standardverdien med null. I regnestykket blir null tvunget til 0 (null+0,5 = 0,5), så resultatet er endelig og ser troverdig ut.

**Når:** Prosjektfil med "mal": {"vegbredde": null} importeres (lager.js:160–174 sjekker bare Array.isArray(p.ip)) eller åpnes (app.js:1594 – Object.assign erstatter ikke null). Målt på 100 m veg i 1:2 sideterreng, profilavstand 5 m.

**Følge:** vegbredde:null → skjæring 100,8 m³ mot 441,4 m³, altså 77 % for lite. baerelagTykkelse:null → 216,8 m³, 51 % for lite. renskDybde:null → 467/563,6 m³, 28 % for mye, og renskeposten blir 0. grofteDybdePlanum:null → 15 % for lite. maksSokebredde:null → hele skråningsmarsjen hoppes over (while (t < null) er alltid usann), 14 % for lite. Null merknader av typen «inngang» i samtlige tilfeller. Med undefined blir tverrfall/slitelagTykkelse/baerelagTykkelse til NaN, mens grøftefeltene gir nøyaktig 0 m³ skjæring og 0 m³ fylling – et tall som ser ut som en billig jobb.

**Bevis:** Kjørt for alle 12 MALGRENSER-feltene med null, 1:2 sideterreng: vegbredde -77,2 %, baerelagTykkelse -50,9 %, renskDybde +27,7 %, grofteDybdePlanum -14,9 %, grofteBunn -14,0 %, maksSokebredde -13,8 %, grofteInnerHelning -6,6 %, slitelagTykkelse -5,9 %, tverrfall -2,8 %. Antall inngangsmerknader: 0 i alle. Til sammenlikning fanges NaN riktig (vegbredde=NaN → res.mal.vegbredde 4,5 + merknad).

### Global isFinite i fjellvakten slipper null og tom streng gjennom – hele vegen blir regnet som fjell

`public/js/masser.js:753` · etterprøvd

**Hva:** Vakten bruker global isFinite, ikke Number.isFinite. isFinite(null) === true og isFinite('') === true, så en fjelldybde lik null eller tom streng passerer alle tre sjekkene (753, 758, 761). Nedstrøms blir fjellflate(t) = terrRå(t) - null = terrRå(t), altså fjell i dagen. Kommentaren på 750–752 beskriver akkurat denne faren («smitter over pa hele massebalansen, og det uten et eneste tegn»), men vakten dekker bare NaN.

**Når:** Prosjektfil med "fjell": {"standarddybde": null} importeres. P.fjell.standarddybde blir null (app.js:1596 – Object.assign erstatter ikke null). Brukeren trykker «Ny strekning», som lager {fra, til, dybde: P.fjell.standarddybde} = {dybde: null} (app.js:1707). Fjellmodell-konstruktøren normaliserer bare standarddybde (linje 103), ikke strekninger eller punkter. Samme skjer for et fjellpunkt satt i kartet (ui-kart.js:185). Målt på 100 m veg, 1:2 sideterreng, egentlig løsmassedekke 3 m.

**Følge:** Skjæring i fjell går fra 0 til 433,8 m³ (650,7 m³ sprengt volum) og skjæring i løsmasse fra 1816,2 m³ til 0. Total skjæring faller fra 1816 til 434 m³ fordi skråningen samtidig bytter fra 1:1,5 til 1:0,2. Ingen merknad. Dette er den dyreste posten i kalkylen: all gravemasse blir omgjort til sprengning, og tre firedeler av totalvolumet forsvinner.

**Bevis:** Kjørt: strekninger[{fra:0,til:100,dybde:null}] → fjell 433,8 / løsmasse 0,0 / sprengt 650,7, ingen inngangsmerknad. Samme med dybde:'' og med punkter[{dybde:null}]. dybde:NaN fanges riktig (fjell 0,0 / løsmasse 1816,2). node -e: isFinite(null)=true, isFinite('')=true, Number.isFinite(null)=false.

### Veglinjen faller ut av kandidatlisten fordi den har for få knekkpunkt — brukeren treffer terrenglinjen i stedet

`public/js/pdfimport.js:155` · etterprøvd

**Hva:** `if (b.length < 15) continue;` krever minst 15 punkt for at en bane skal regnes som profillinje. Terrenglinjen har mange punkt (innmålte terrengpunkt hver 5.-10. meter), men veglinjen tegnes fra VIP-punktene og har typisk 8-12 punkt på en hel skogsbilveg. Veglinjen — den ene streken hele verktøyet finnes for å lese — blir dermed silt bort. ui-pdf.js:151 `naermesteBane` leter BARE i `PdfImport.kandidater(...)`, og ui-pdf.js:235 tegner bare kandidatene som valgbare, så en bortsilt veglinje kan verken velges eller ses.

**Når:** 800 m veg, lengdeprofil med 1:10 overhøyde. Terrenglinje med 81 innmålte punkt, veglinje med 10 VIP-punkt over 800 pt bredde. `kandidater([terreng, veg])` gir 1 kandidat — bare terrenglinjen; `kand.some(k => k.bane === veg)` er false. Brukeren trykker «Velg linje» og klikker midt på veglinjen ved profil 180, der veg (104,40 moh) og terreng (104,08 moh) ligger 3,2 pt fra hverandre — godt innenfor grensen på 12/skala ≈ 10,9 pt. naermesteBane returnerer TERRENGLINJEN, og den blir markert som «veglinje».

**Følge:** Høydene som legges inn er terrenget, ikke veien. Ved profil 400 gir veglinjen 100,26 moh mens terrenglinjen gir 95,21 moh — 5,05 m feil. Siden veglinjen nå ER terrenglinjen, blir differansen graving/fylling omtrent null på hele strekket, og jobben prises som om det knapt skal graves. Der veg og terreng ligger lenger fra hverandre (profil 380: 67 pt) får brukeren i stedet ingen respons i det hele tatt på klikket, uten noen forklaring. Feilen forsterkes av funnet om Bézier-kurver: hver vertikalkurve som tegnes som én `c`-operator reduseres til ett punkt, så veglinjen får enda færre punkt og faller enda sikrere under grensen på 15.

**Bevis:** pdfimp_valg.js: «kandidater: 1 -> 81 punkt / er veglinjen kandidat? false» og «klikk pa veglinjen ved s=180 (veg 104.4 moh, terreng 104.08 moh, 3.2 pt fra hverandre, grense 10.9 pt) -> TERRENGLINJEN». Høyder side om side: veglinje 101.00 103.33 104.12 102.50 100.26 99.80 101.71 103.66 103.40 mot terreng 100.00 105.13 105.27 98.11 95.21 94.78 103.70 104.31 104.94.

### Kontrollpunktene i Bézier-kurver kastes — en vertikalkurve leses som en rett korde

`public/js/pdfimport.js:108` · etterprøvd

**Hva:** `else if ((op === 'l' || op === 'c' || op === 'v' || op === 'y') && n >= 2) bane.push(bruk(tall[n-2], tall[n-1]))` tar bare sluttpunktet i kurveoperatorene. Endepunktet er riktig valgt for alle tre (`c`, `v`, `y` har sluttpunktet som de to siste operandene), men kurvaturen mellom punktene forsvinner helt: kurven blir en rett strek fra start til slutt. Ingen flatlegging, ingen advarsel. Vertikalkurver er nettopp der høydeavviket er størst.

**Når:** Vertikalkurve på veglinjen, L = 100 m, stigning +8 % inn og −8 % ut (høybrekk, A = 16 %). Tegnet som én kubisk Bézier med kontrollpunkt i tangentskjæringen — måten et tegneprogram normalt plotter en parabel. Målestokk 1 pt = 1 m vannrett, 1 m = 10 pt loddrett. `tolkBaner` gir tilbake en bane med 2 punkt: (0,1000) og (100,1000).

**Følge:** Midt i kurven leses 100,000 moh der den ekte høyden er 102,000 moh — 2,00 m for lavt. Arealet mellom parabelen og korden er 2/3 av midtordinaten, altså 1,33 m i snitt over hele de 100 metrene. For en 5 m bred veg er det ca. 665 m³ feil masse per vertikalkurve, og feilen har fortegn: høybrekk leses for lavt (for mye fylling / for lite sprengning), lavbrekk for høyt. Tallene ser helt troverdige ut i tabellen. På en veg med flere vertikalkurver summerer dette seg til flere tusen kubikk.

**Bevis:** pdfimp_geo.js seksjon A: «punkt i banen: 2 -> (0.0,1000.0) (100.0,1000.0)» og «z midt pa kurven: ekte=102.000 m, lest som korde=100.000 m -> feil -2.000 m». Kontrollpunktene 33.33/1026.67 og 66.67/1026.67 ble aldri lagt inn i banen.

### NaN fra et hull i terrengdataene sprer seg til hele lengdeprofilen, og veien havner på kote 0

`public/js/vertikalprofil.js:271` · etterprøvd

**Hva:** I rettProfil er vakten `if (brudd <= 1e-6) continue;` skrevet slik at NaN slipper forbi: `NaN <= 1e-6` er false, så koden fortsetter i stedet for å hoppe over strekket. `overskudd` blir NaN og skrives inn i BEGGE nabohøydene (linje 274–276). Løkken går 2000 runder fordi `verstBrudd < 1e-5` også er false for NaN, og NaN sprer seg både framover og bakover til hvert eneste knekkpunkt. Deretter filtrerer Vertikalprofil-konstruktøren (linje 23) bort alle punktene fordi ingen er finite, og `hoyde(s)` returnerer 0 for hele veien (linje 75).

**Når:** Terreng.z() gir NaN der høydemodellen mangler data (terreng.js:132, 133, 151 – manglende flis eller nodata), og hentTerrengProfil (app.js:303) legger de rå NaN-ene rett inn i terrengProfil.z uten filter. foreslaProfil glatter med vindu ± `vindu` stasjoner; med profilAvstand 4 (steg 2 m) og vipAvstand 40 blir vindu = 10, altså ±20 m. Et datahull på 42 m midt på et knekkpunkt gjør nøyaktig én glattet verdi til NaN – ett eneste NaN-knekkpunkt er nok. Etterprøvd: 400 m vei i li fra kote 120 til 132, terrenghull 140–180 m. Uten hull: 11 knekkpunkt, hoyde(200) = 126,00 m. Med hullet: alle 11 knekkpunkt NaN, Vertikalprofil beholder 0 punkt, hoyde(200) = 0.

**Følge:** Samme vei, samme terreng: skjæring 1 364 m³ og sprengning 672 m³ uten hullet, mot skjæring 1 565 998 m³ og sprengning 1 559 250 m³ med hullet – en faktor på ca. 2 300. Hele veien prises mot en linje som ligger 120 m under bakken. Et 42 m langt datahull forgifter alle 400 m, også der terrengdataene er i orden.

**Bevis:** Direkte: rettProfil([{s:0,z:100},{s:40,z:101},{s:80,z:NaN},{s:120,z:103},{s:160,z:104}], {maksStigningFor:()=>0.10}) gir z = [NaN, NaN, NaN, NaN, NaN] – 5 av 5. Ende til ende med M.beregnMasser: 1 565 998 m³ skjæring mot 1 364 m³.

### null slipper gjennom hele inngangskontrollen uten én eneste merknad

`public/js/masser.js:722` · etterprøvd

**Hva:** I klem() står `if (v == null) continue;`. Object.assign på linje 787-788 har allerede fylt inn StandardMal/StandardFaktorer for felt som mangler, så et felt kan bare være null hvis prosjektfila eksplisitt inneholder null. JSON kan ikke uttrykke NaN – null er derfor nettopp den ugyldige verdien som kommer inn langs den veien kontrollen ble skrevet for («en fil som lastes gar rett inn», linje 712-714). Verken MALGRENSER eller FAKTORGRENSER får se den, og null oppfører seg som 0 i all aritmetikk nedenfor.

**Når:** Prosjektfil (app.js:1594-1595 slipper den rett inn) med feltet satt til null. Testveg: 1 km, 20 % sidefall, vegnivå 4 m under terreng, fjell 3 m ned, standardmal.

**Følge:** mal.vegbredde = null: skjæring 39478 → 18889 m³ (−52 %), bærelag 2750 → 0 m³, 0 merknader. faktorer.fjellIFylling = null: fraFjell 14004 → 0 m³, dvs. all sprengstein forsvinner fra balansen og hele bærelaget må kjøres inn – 0 merknader. faktorer.sprengningsfaktor = null: «Sprengt fjell på lass» vises som 0 m³, altså det tallet transporten prises på – 0 merknader. faktorer.brukbarLosmasse = null: tilDeponi 17713 → 32066 m³ (+81 %) – 0 merknader. MALGRENSER krever vegbredde ≥ 0,5 og FAKTORGRENSER fjellIFylling ≥ 0,5; begge omgås.

**Bevis:** e7.js: «mal.vegbredde = null -> skjaering 18889 baerelag 0 rensk 2483 merknader: []» og «faktorer.fjellIFylling = null -> fraFjell 0 ... merknader: []». Referanse uten null: skjaering 39478, baerelag 2750, fraFjell 14004.

### LandXML kaster vertikalkurvene – lengdeprofilen eksporteres som rene knekkpunkter

`public/js/eksport.js:93` · etterprøvd

**Hva:** Lengdeprofilen skrives som `app.P.vip.map(v => '<PVI>' + v.s + ' ' + v.z + '</PVI>')`. Kurvelengden L = k·A, som Vertikalprofil faktisk bygger veien med (parabel z = zBVC + g1·x + A·x²/(2L)), forsvinner helt. En LandXML-leser tolker en ProfAlign som bare inneholder PVI-elementer som en ren tangentprofil med skarp knekk i hvert knekkpunkt. LandXML 1.2-skjemaet har et eget element for nøyaktig denne geometrien: ProfAlign godtar «any combination of PVI / ParaCurve / UnsymParaCurve / CircCurve», og <ParaCurve length="L">stasjon høyde</ParaCurve> er en symmetrisk parabolsk vertikalkurve om knekkpunktet – akkurat det Massekalk regner med. Det brukes ikke.

**Når:** Klasse 3-vei, +10 % opp mot -12 % ned over et høybrekk i profil 300, K = minVertikalHøybrekk/100 = 2 (verdien rettVertikalgeometri selv setter). Vertikalprofil bygger en 44 m lang parabel; veinivået i profil 300 er 128.790 m. LandXML-filen inneholder bare <PVI>300.0000 130.0000</PVI>, altså tangentskjæringen.

**Følge:** Maskinstyringen bygger høybrekket 1,21 m for høyt, mens KOF, SOSI, DXF, stikningslisten og hele masseberegningen sier 128,790. Med veiklassenes egne makshelninger blir avviket 0,64 m (klasse 2), 1,21 m (klasse 3), 1,28 m (klasse 1), 1,80 m (klasse 5) og 2,25 m (klasse 4). Avviket er A·L/8 og oppstår i HVERT knekkpunkt med k > 0 – altså i hele den normale arbeidsflyten der profilen er generert automatisk. Bare innlimte/låste høyder (k = 0) er upåvirket.

**Bevis:** Kjørt mot ekte moduler: profil.kurver = [{L:44}], profil.hoyde(300) = 128.790, tangentmodellen gir 130.000 → 1.21 m. Med K=5 og 8 %→-8 % ble avviket 1.60 m. Horisontalgeometrien i samme fil er derimot eksakt: rekonstruerte Line/Curve-elementene fra XML-en og sammenlignet med linje.punktVed(s) for R = 15/30/60/150/400 – største avvik 0,0000 m. Riktig utskrift her hadde vært <ParaCurve length="44.0000">300.0000 130.0000</ParaCurve> (verifisert mot LandXML-1.2.xsd lastet fra landxml.org).

### Skjæringsskråningen marsjerer rett forbi fjelloverflaten – løsmassen over fjellet får fjellhelning

`public/js/masser.js:381` · etterprøvd

**Hva:** I marsjen utover på skjæringssiden velges skråningshelningen ut fra høyden ved STARTEN av hvert steg (linje 382–384), mens finmarsjen bare slås på når punktet allerede ligger nærmere enn 1,0 m fra fjelloverflaten (linje 380–381). Med standardverdiene er grovsteget 0,4 m og fjellhelningen mal.skjaeringFjell = 0,2 (H:V). Ett grovt steg langs fjellskråningen stiger da steg/m = 0,4/0,2 = 2,0 m – dobbelt så mye som nærhetsvinduet på 1,0 m. Ligger marsjpunktet mellom 1,0 m og 3,0 m under fjelloverflaten, hopper marsjen derfor i ett jafs opp til 1,0 m FORBI fjellet uten at finsteget noen gang utløses, og fortsetter oppover med 5:1 der det egentlig er løsmasse som skal ligge 1:1,5. Bisekssjonen på slutten (linje 391–394) bruker i tillegg helningen fra det siste steget, altså fjellhelningen, helt inn til terrenget.

**Når:** Standardmal uten grøft/rensk/tverrfall, flatt terreng i kote 0, planum i kote −3,00, fjelloverflate i kote −2,00 (fjelldybde 2,0 m). Programmet bygger skråningen (2,250, −3,000) → (2,650, −1,000) → (4,150, 0,000). Riktig geometri er (2,250, −3,000) → (2,450, −2,000) → (5,450, 0,000): 0,2 m vannrett i fjell, deretter 3,0 m vannrett i løsmasse. Med full standardmal (grøft 0,20/0,30, rensk 0,20, takfall 5 %, vegbredde 4,5) og 2,8 m skjæringsdybde gjentar feilen seg for alle vanlige løsmassetykkelser.

**Følge:** Skjæringstoppen legges for nær vegen og skjæringsvolumet blir systematisk for LITE – aldri for stort. Rene tall fra prøvekjøringene: fjelldybde 2,0 m i det enkle snittet gir 16,600 m² mot riktig 20,500 m² (−19,0 %), og skjæringstoppen 4,15 m mot 5,45 m fra senterlinjen. Med full standardmal og 2,8 m skjæringsdybde: fjelldybde 1,0 m → 22,683 mot 23,515 m² (−3,5 %), løsmassedelen 5,492 mot 6,324 m² (−13,2 %); fjelldybde 3,0 m → 26,953 mot 32,875 m² (−18,0 %), løsmassedelen 22,373 mot 28,294 m² (−20,9 %). Over 500 m veg blir det 13 477 m³ mot 16 438 m³ – 2 961 m³ graving som ikke står i tilbudet. Enda tydeligere: fjelldybde 0,5 m og 1,0 m gir NØYAKTIG samme totale skjæringsvolum (11 341 m³) og samme skjæringstopp (3,513 m) – modellen ser ikke i det hele tatt at løsmassetykkelsen er doblet. Feilen er stille: ingen merknad, og «avkortet»/«ikke truffet» slår ikke inn. Den slår også ut i maksUtslag-kontrollen, i tverrprofiltegningen og i arealbehovet for grunnerverv.

**Bevis:** Kjørt beregnTverrprofil mot en uavhengig, eksakt tosidig skråning regnet i lukket form. Utskrift av sider[1].knekk viser spranget i ett steg fra z=−3,000 til z=−1,000 med fjelloverflaten på −2,000 imellom. Sveip over fjelldybde 0,2–4,0 m mot eksakt areal ga avvik fra 0,00 % til −18,01 %, alltid negative, med sagtannmønster (perioden er 2,0 m = steg/skjaeringFjell). beregnMasser over 500 m bekreftet 11 341 m³ for både fjelldybde 0,5 og 1,0 m.

### lagre() overskriver et eksisterende prosjekt uten spørsmål – og autolagringen gjør det av seg selv

`public/js/lager.js:102` · etterprøvd

**Hva:** lagre(navn, data) gjør s.put(rad) rett inn i en butikk med keyPath 'navn'. Det finnes ingen kollisjonssjekk og ingen «lagre som». Kontrasten er påfallende: importer() på linje 169 nekter uttrykkelig å overskrive og gir det nye prosjektet «(2)» i navnet, mens lagre() – den eneste veien inn for brukerens eget arbeid – ikke gjør noe slikt.

**Når:** «Skogsveg B» er ferdig prissatt og lagret. Brukeren har «Skogsveg A» oppe, skriver «Skogsveg B» i navnefeltet (app.js:1616 setter P.navn uten videre), og gjør så en hvilken som helst endring. beregn() kaller planleggAutolagring() (app.js:393), og 2 sekunder senere leser autolagre() navnet rett fra feltet (app.js:1497) og kaller Lager.lagre('Skogsveg B', P). Kjørt i prøveskript: før = ['Skogsveg A','Skogsveg B'], etterpå inneholder «Skogsveg B» innholdet fra A. Ingen bekreftelsesboks, ingen statusmelding, ingen angremulighet – Angre-historikken gjelder bare geometri, ikke lageret.

**Følge:** Et ferdig prissatt prosjekt blir borte uten spor. Ingen kopi finnes noe sted (IndexedDB har ingen versjonering, og put erstatter raden). Kan bare gjenopprettes hvis brukeren tilfeldigvis hadde eksportert en .massekalk.json på forhånd.

**Bevis:** Prøveskript med etterlikning av IndexedDB: Lager.lagre('Skogsveg B', {merke:'PROSJEKT A'}) etter at 'Skogsveg B' allerede fantes ga hent('Skogsveg B').merke === 'PROSJEKT A'. Returverdien fra lagre() er bare {navn,endret,data} – ingen indikasjon på at noe ble erstattet.

### «Angre»-lenken i linjepanelet sletter knekkpunkt du har lagt til etterpå – uten at det kan angres

`public/js/app.js:968` · etterprøvd

**Hva:** angreFlytting() skriver hele this.P.ip over med _ipForFlytting, som ble tatt vare på da «Optimaliser» flyttet linjen. Verken _tilbakeTil() (linje 50-68), linjeEndret() eller noen annen redigering tømmer flyttingsliste/_ipForFlytting, så lenken blir stående i linjepanelet (linje 1433-1446) uansett hva som skjer med linjen etterpå. _ipForFlytting har det antallet knekkpunkt linjen hadde ved optimaliseringen; er antallet et annet nå, blir differansen borte. Funksjonen kaller heller ikke merk().

**Når:** Bruker setter sideforskyvning og kjører «Optimaliser» – linjen flyttes sidelengs og sprengningen går fra 3691 til 3262 m³. Deretter forlenges veien med et fjerde knekkpunkt (394,8 m → 601,3 m). Panelet viser fortsatt «Senterlinjen er flyttet sidelengs · Angre». Brukeren klikker den lenken for å ta bort sideforskyvningen.

**Følge:** Det fjerde knekkpunktet forsvinner, veien kortes fra 601,3 m til 394,8 m, og 4073 m³ sprengning, 4431 m³ skjæring og 1001 m³ fylling faller ut av tallene. Statuslinjen sier bare «Senterlinjen er satt tilbake dit du tegnet den». Fordi angreFlytting ikke kaller merk(), ligger den 4-punkts linjen ikke i historikken i det hele tatt og kan ikke hentes tilbake med Ctrl+Z.

**Bevis:** Kjørt mot ekte app.js (p4/p5): «antall knekkpunkt: 4 → 3 · veglengde 601.3 → 394.8 m · nye angre-steg 0». Volumtabell: skjaering 8593→4162, skjaeringFjell 7784→3712, fylling 4438→3436.

### Sonevalget sender deler av Norge til en høydemodell som ikke har data der — og svaret blir kote 0, ikke feilmelding

`public/js/geo.js:60` · etterprøvd

**Hva:** sone(lon) velger UTM-sone bare ut fra lengdegrad (32 / 33 / 35). Men de tre DTM-mosaikkene hos Kartverket dekker ikke hver for seg hele landet. NHM_DTM_25835 har ingen data vest for ca. øst 290 000–320 000 (grensen er takkete) og sør for ca. nord 7 620 000; NHM_DTM_25832 mangler data nord for ca. nord 7 280 000. Utenfor dataflaten svarer exportImage med HTTP 200, gyldig TIFF, riktig størrelse og riktig georeferanse — fylt med 0.0. Verdien er endelig, så den passerer NODATA-filteret i lib/hoydedata.js:261 (|v| > 1e30), pakkOppFlis og Terreng.z(). Kommentaren på linje 54–55 påstår det motsatte («Kartverket leverer hele landet i alle tre sonene, prøvd i Trondheim, Tromsø, Bodø, Alta og Vadsø») — ingen av de fem stedene ligger i de berørte randsonene.

**Når:** Skogsbilvei i Reisadalen, Nordreisa (69.620 N, 21.150 Ø). Geo.sone(21.15) = 35 → api/dtm/flis?sr=25835. Alle fliser lastes uten feil (mangler = 0). Terreng.z() gir 0.00 m. Kartverket sitt punkt-API gir 931.57 m for nøyaktig samme punkt. Samme punkt i sone 33 gir 931.64 m.

**Følge:** Kjørte hele kjeden på en 1 189 m trasé der: sone 35 gir «terreng langs linja 0.0–0.0 moh», 2 061 m³ løsmasseskjæring, 1 995 m³ fjellskjæring, 0 m³ fylling og 0 merknader. Sone 33 (riktige data) gir 672–1 039 moh, 252 342 m³ fjellskjæring og 1 464 291 m³ fylling. Ingen advarsel noe sted — hverken mangler-telleren, «Mangler terrengdata» eller rapporten sier fra. Anbudet blir levert på et terreng som ligger 900 m for lavt.

**Bevis:** Målt tile-verdi vs punkt-API, cache tømt før hver henting: Storslett 69.768/21.030 → z=0.00 mot 4.07 m. Reisadalen 69.620/21.150 → 0.00 mot 931.57 m. Badderen/Kvænangen 69.920/21.980 → 0.00 mot 542.97 m. Nordreisa (Sarelv) 69.400/21.300 → 0.00 mot 644.5 m. Kautokeino sør 68.60/23.00 → 0.00 mot 407.90 m. Karesuando-området 68.50/22.60 → 0.00 mot 376.20 m. Anárjohka 68.60/25.50 → 0.00 mot 333.90 m. Vega 65.660/11.900 (sone 32) → 0.00 mot 25.94 m; Ylvingen 65.630/11.980 → 0.00 mot 11.71 m. Kontroller som er i orden: Skibotn, Alta, Karasjok, Tana, Lierne, Leka, Bardu, Narvik, Bodø, Røros, Trysil, Halden, Voss, Lyngdal m.fl. (avvik < 0.5 m). ImageServer-utstrekninger: 25832 x 249 750–780 750, y 6

### 0.00 m fra høydetjenesten blir lest som havnivå, ikke som manglende data

`public/js/terreng.js:47` · etterprøvd

**Hva:** Serveren gjør bare verdier med |v| > 1e30 om til NaN (lib/hoydedata.js:261). Der Kartverket ikke har høydedata svarer exportImage med 0.0, ikke med NoData. pakkOppFlis (terreng.js:38–49) og z() (terreng.js:138–154) slipper derfor 0.00 gjennom som en helt vanlig kote. Kommentaren i lastKorridor (terreng.js:88–90) sier at tjenesten svarer «med gyldige data ogsa utenfor Norge (bare uten verdier)» — det er feil: den svarer med nuller, og de er ikke til å skille fra ekte havnivå.

**Når:** Trasé nær riksgrensen eller nær kanten av Kartverket sin dekning. Målt tvers over datakanten øst for Trysil (61.30507 N, 13.12581 Ø, sone 33): Terreng.z() går fra 440.09 m til 0.00 m på 40 meter — et loddrett fall på 440 m midt inne i én flis (flis 1560 har både ekte data og nuller, så en «hele flisen er null»-test ville ikke fanget det). 25 km inn i Sverige (61.30/13.20) svarer punkt-API-et null, mens Terreng.z() svarer 0.00.

**Følge:** masser.js behandler et endelig tall som gyldig terreng (masser.js:322) og setter aldri manglerData. Et tverrsnitt som strekker seg ut i null-området får skråningen til å søke mot kote 0 i stedet for å stoppe med «Mangler terrengdata i dette tverrsnittet». Dette er også det som gjør funn 1 helt stille: retter man bare sonevalget, står denne igjen. Retter man denne, blir funn 1 minst synlig (NaN + datamerknad) i stedet for et galt tall.

**Bevis:** Profil tvers over datakanten, Terreng.z() ved nord 7 xxx 128.5, sone 33: øst 399 476 → 439.54 m; 399 496 → 440.09 m; 399 516 → 220.18 m; 399 536 → 0.00 m; og 0.00 videre østover. Punkt-API-et for 61.30/13.20 returnerer z = null (ingen datakilde), Terreng.z() returnerer 0.00. Alle fliser i 25835 vest for datakanten har 65 536/65 536 celler nøyaktig lik 0 og 0 NaN-celler.

### Høydetjenesten svarer 0.00 m der det ikke finnes data – hele NaN-håndteringen er død kode

`lib/hoydedata.js:261` · etterprøvd

**Hva:** NODATA_GRENSE = 1e30 (linje 34) forutsetter at manglende data kommer som en sentinelverdi med stor tallverdi. Det gjør den ikke. NHM_DTM-tjenestene returnerer eksakt 0.0f (float32) utenfor rasterutstrekningen sin. |0.0| > 1e30 er usant og isFinite(0) er sant, så løkken på linje 260-262 slipper verdien rett gjennom. Flisen pakkes som 0 cm over nullnivået, og klienten leser kote 0,00 m som ekte, målt terreng. Konsekvensen er at I16_NODATA aldri skrives i produksjon, at terreng.js sin NaN-reserve aldri utløses, og at merknaden av typen 'data' i masser.js aldri kan oppstå.

**Når:** Skogsbilveg i innlandet i Troms, 69,59529 N 21,70496 E, 696 moh. Geo.sone(21,705) gir 35, så programmet spør NHM_DTM_25835, flis 1149/30193. Der møter traseen en rett, diagonal dekningsgrense i tjenesten: 8,6 % av flisen er eksakt 0.00, nabofliсen i vest (1148/30193) er 99,9 % nuller, nabofliсene i sør og øst 0 %. To nabopiksler 1 m fra hverandre i rad j=0: x=294189,5 gir 0,00 m i Massekalk mens Kartverket sitt punkt-API svarer 696,07 m med datakilde dtm1; x=294190,5 gir 696,04 m i begge. Massekalk ser altså et sprang på 696 m over én meter, og tolker det som terreng.

**Følge:** Kjørt gjennom beregnMasser: 500 m rett veg på kote 696, 15 % sidefall, dekningsgrensen midt i traseen. Riktig terreng gir 2 348 m3 skjæring / 0 m3 fylling. Hullet levert som 0,00 m gir 1 186 m3 skjæring og 15 290 565 m3 fylling – og ingen merknad av typen 'data'. Samme hull levert som NaN gir 0 m3 fylling og 100 'data'-merknader. Feilen er 15,3 mill. m3 på 500 m veg. I den milde varianten (veg på kote 20-30 nær sjø eller nær en dekningskant) blir tallet stort nok til å ødelegge prisen, men lite nok til å se troverdig ut. Selvtesten sin kommentar ved linje 682 viser at utvikleren har vernet mot at terrengmodellen svarer null – kilden leverer et ekte tall 0, som passerer alle vaktene.

**Bevis:** Verifisert mot den levende tjenesten. Kystflis 25832/1234/25552: 64 937 av 65 536 piksler er eksakt 0. sjekkSkogdekke over de samme pikslene gir snitt vegetasjonshøyde 0,035 m og 0,0 % over 2 m – altså 'laseren nådde bakken perfekt' der det ikke finnes data i det hele tatt. Ingen av de 25 flisene fra brukerens tidligere økter har nuller, så dette har ikke slått inn på eksisterende prosjekter ennå.

### Fjellmodellen er fullstendig utestet — alle fem mutasjoner slipper gjennom

`test/selftest.js:614` · etterprøvd

**Hva:** Selftesten konstruerer alltid Fjellmodell med bare standarddybde satt (og én gang med punkter:[{dybde: undefined}] for å prøve NaN). Verken strekninger, rekkevidde eller virkelig sonderingsinterpolasjon (IDW) blir noen gang utøvd. Ordene «strekninger» og «rekkevidde» finnes ikke i selftest.js i det hele tatt. Likevel er begge koblet til grensesnittet: app.js:363-367 og 1707 lar brukeren legge inn fjelldybde per strekning og sonderingspunkt.

**Når:** Fem mutasjoner i masser.js:102-125, én om gangen: (a) IDW-vekt 1/(d*d) → 1/d; (b) linjen «if (d > this.rekkevidde) continue;» fjernet, slik at et sonderingspunkt virker i det uendelige; (c) «if (s >= st.fra && s <= st.til) return st.dybde;» → «if (false)», altså alle innlagte fjellstrekninger ignorert; (d) standarddybde-standarden 0,5 → 5 m; (e) rekkevidde-standarden 60 → 600 m. Selftest etter hver: 254 tester ok, 0 feil, exit 0 i alle fem tilfellene.

**Følge:** Skillet fjell/løsmasse er den største prisforskjellen i hele beregningen — sprengning koster mangedobbelt av graving. Mutasjon (c) betyr at brukeren kan legge inn «fjell 0,3 m fra profil 120 til 260» fra en prøvegrop, og programmet kan ignorere det fullstendig uten at én eneste test sier ifra. Mutasjon (d) endrer standard fjelldybde fra 0,5 m til 5 m for et hvert prosjekt som ikke overstyrer den, og gjør en veg fra ren sprengning til ren graving.

**Bevis:** Mutasjonsrunde 2, alle fem rapportert «SLAPP». Grep i selftest.js: strekninger=0 treff, rekkevidde=0 treff. Grep i app.js viser at feltene er koblet til skjemaet (app.js:363-367, 450-454, 1112, 1707).


## Alvorleg (49)

### Profilavstanden har tak, men ikke gulv – en liten positiv verdi krasjer beregningen

`public/js/masser.js:768` · etterprøvd

**Hva:** Vakten er `!isFinite(dSut) || dSut <= 0` pluss et tak på 100. Enhver positiv verdi under 1 slipper gjennom uten merknad. Kommentaren på 765–767 sier «Profilavstanden er den farligste av dem alle: null eller negativ gir en løkke som aldri kommer ut, og fana henger» – men en mikroskopisk positiv verdi gir nøyaktig samme løkke. Skjemaet klemmer til minst 1 (app.js: Math.max(1, tall('m_profilAvstand'))), men beregn() sender this.P.profilAvstand rett inn, og den settes direkte fra prosjektfilen via Object.assign(this.nyttProsjekt(), d) (app.js:1593).

**Når:** Prosjektfil med "profilAvstand": 1e-9 (eller et desimalskilletegn på avveie: 0,001 lest som 0.001). Åpne prosjektet – apneProsjekt kaller malTilSkjema, som bare fyller feltet, og deretter oppdater() → beregn().

**Følge:** profilAvstand = 1e-9 gir RangeError: Invalid array length i masser.js:801 – beregningen dør. profilAvstand = 0,001 gir 100 000 profiler per 100 m veg (5 millioner på en 5 km veg); målt tok 10 001 profiler på 100 m 426 ms, så 5 km blir minutter og trolig tom for minne i en nettleserfane. Ingen merknad forteller hvorfor.

**Bevis:** Kjørt: profilAvstand=1e-9 → RangeError: Invalid array length, kastet fra Array.push i masser.js:801. profilAvstand=0,01 → 10 001 stasjoner, 426 ms, null merknader. profilAvstand=0/-5/NaN fanges riktig, og >100 klemmes riktig.

### Regexet for /Length backtracker på indirekte lengde og kutter strømmen til en tidel

`public/js/pdfimport.js:47` · etterprøvd

**Hva:** `/\/Length\s+(\d+)(?!\s+\d+\s+R)/` skal ifølge kommentaren over (linje 43-45) IKKE gi treff når lengden står som en henvisning («/Length 12 0 R»), slik at koden faller tilbake på å trimme linjeskift. Men den negative lookaheaden hindrer ikke treff — den tvinger bare `\d+` til å backtracke. På «/Length 12 0 R» matcher `\d+` først «12», lookaheaden ser « 0 R» og feiler, `\d+` gir fra seg siste siffer og matcher «1», og etter «1» kommer «2» som ikke er whitespace, så lookaheaden lykkes. Resultatet blir n = 1. Objektnummeret leses som lengden, med siste siffer strøket.

**Når:** En PDF der innholdsstrømmen har indirekte lengde mot et objekt med tosifret nummer — «4 0 obj << /Length 12 0 R /Filter /FlateDecode >>». Dette er vanlig hos produsenter som skriver strømmen før de vet hvor lang den ble. Regexet gir n = 1, `start + 1 <= e` holder, så `slutt = start + 1`. Strømmen kappes fra 1094 byte til 1, DecompressionStream kaster på begge formatene, `pakkUt` returnerer null og `lesStrommer` dropper strømmen uten et ord.

**Følge:** Hele tegningen forsvinner. Med direkte /Length gir samme fil 1 strøm og 6 baner; med «/Length 12 0 R» gir den 0 strømmer og 0 baner. Har alle innholdsstrømmene i filen indirekte lengde, får brukeren meldingen «Fant ingen tegnede streker i filen. Er PDF-en skannet fra papir …» (ui-pdf.js:61) — som peker helt feil vei og sender brukeren i gang med å taste høyder for hånd. Merk at det bare er ensifrede objektnummer som fungerer: «/Length 9 0 R» gir null treff og faller riktig tilbake, «/Length 4500 0 R» gir 450, «/Length 250 0 R» gir 25.

**Bevis:** Regexet direkte: «/Length 12 0 R» -> 1, «/Length 4500 0 R» -> 450, «/Length 250 0 R» -> 25, «/Length 9 0 R» -> null. Ende til ende på bygde PDF-er med identisk innhold: «direkte komprimert=1094B ukomprimert=3711B -> 1 strøm(mer), 6 baner» mot «indirekte … -> 0 strøm(mer), 0 baner».

### /Length hentes fra forrige objekt fordi exec tar første treff i 400-tegns vinduet

`public/js/pdfimport.js:46` · etterprøvd

**Hva:** `const hode = tekst.slice(Math.max(0, s - 400), s)` tar 400 tegn bakover fra «stream», og `.exec(hode)` på linje 47 gir FØRSTE treff i det vinduet. Er den forrige strømmen kortere enn ca. 350 byte, ligger forrige objekts `/Length` fortsatt inne i vinduet og vinner over den riktige. Det finnes ingen binding mellom treffet og ordboken som hører til denne strømmen.

**Når:** To objekter etter hverandre: objekt 5 med en kort innholdsstrøm (22 B — for eksempel bare «/Fm0 Do» eller en utseendestrøm for en annotasjon) og objekt 6 med selve profiltegningen (509 B komprimert). Avstanden fra «/Length 22» i objekt 5 til «stream» i objekt 6 er 129 tegn, godt innenfor de 400. `hode` for objekt 6 gir dermed n = 22, `start + 22 <= e` holder, og profilstrømmen kappes fra 509 til 22 byte.

**Følge:** `lesStrommer` finner 1 strøm der det er 2, og den som går tapt er den store — selve tegningen. I forsøket ble tegningen med 60 streker borte, mens den bagatellmessige strømmen med 1 bane overlevde. Brukeren får enten ingen tegninger i det hele tatt, eller en tegning som er tom for profillinjer, og samme misvisende «skannet fra papir»-melding.

**Bevis:** pdfimp_strom.js seksjon E: «liten strom=22B, stor strom=509B, avstand fra forrige /Length til andre "stream": 129 tegn (vinduet er 400)» → «strommer funnet: 1 (skal vare 2)», «baner: [ 1 ]».

### «Skjæring her»/«Fylling her» måles fra rått terreng, ikke fra terreng etter rensk – 0,20 m feil, og feil fortegn nær nullpunktet

`public/js/ui-tverrprofil.js:359` · etterprøvd

**Hva:** Avlesningen henter terrenghøyden fra pr.geometri.terreng (linje 211 og 334). Den lista inneholder terrRå(t), altså terrenget FØR rensk (masser.js:588). Masseberegningen måler derimot d = terr(t) − jordflate(t) der terr = terrRå − mal.renskDybde (masser.js:330, 513, 522), og den flaten ligger i pr.geometri.rensk (masser.js:591) – som tegnes opp på linje 235-238, men aldri brukes i avlesningen. Rapporten sier det eksplisitt til brukeren: «Skjæring og fylling er regnet mot planum (under overbygningen) og mot terreng etter rensk» (ui-rapport.js:437). Avlesningen bryter denne konvensjonen: d blir systematisk renskDybde for stor på skjæringssida og renskDybde for liten på fyllingssida.

**Når:** Flatt terreng på kote 100,00, vegnivå 100,60, standard vegmal (renskDybde 0,20 m). beregnTverrprofil gir areal.skjaering = 0,004 m² og areal.fylling = 0,200 m² – altså et fyllingsprofil. Holder man pekeren i senterlinjen viser boksen «Skjæring her 0,10 m». Fasit i regnestykket på samme punkt er fylling 0,10 m. Ved t = ±2,0 m viser boksen «Skjæring her 0,20 m» der regnestykket har nøyaktig 0,00. Motsatt vei: flatt terreng 100,00 med vegnivå 102,00 gir «Fylling her 1,30 m» i senterlinjen, mens fyllingstykkelsen i regnestykket er 1,50 m (13 % for lite); rapportens «Største fyllingshøyde» for profilet er 1,50 m, avlesningen når aldri høyere enn 1,30 m. Tilsvarende på skjæring: terreng med 20 % tverrfall og vegnivå 99,20 gir maksSkjaering = 2,16 m i rapporten, mens avlesningen på samme sted viser 2,36 m.

**Følge:** Fast avvik = mal.renskDybde (0,20 m med standardmalen) på hvert eneste avlesningspunkt: skjæring overdrives med 0,20 m, fylling underdrives med 0,20 m. På lave fyllinger blir det 13-15 % for lite (1,30 mot 1,50 m). I sonen der planum ligger mellom renskflaten og råterrenget – et belte på 0,20 m høyde, som et hvert profil i overgangen skjæring/fylling går gjennom – får brukeren feil ORD: «Skjæring» der programmet selv bokfører fylling. Avlesningen kan altså ikke brukes til å kontrollere tallene i rapporten, den er systematisk uenig med dem.

**Bevis:** node-prøve mot beregnTverrprofil: t=0,00 terrRå 100,000 / rensk 99,800 / jord 99,900 → avlesning d=+0,100 («Skjæring her 0,10 m»), regnestykket d=−0,100 (fylling). areal.skjaering=0,004 m², areal.fylling=0,200 m². Fyllingstilfellet: «Fylling her 1,30 m» mot fasit 1,50 m. Skjæringstilfellet: avlest maks 2,36 m mot pr.maksSkjaering 2,16 m.

### Hull i terrengmodellen: avlesningen viser oppdiktede tall, og verdien fryser og står stille mot kanten av hullet

`public/js/ui-tverrprofil.js:333` · etterprøvd

**Hva:** utenfor-vakten sammenligner t mot pr.fotVenstre/pr.fotHoyre. Men når terrengmodellen mangler data hopper masseberegningen over punktet (masser.js:514-519 `continue`) FØR den pusher til geometri, så pr.geometri.terreng og .jord kan være kortere enn [fotVenstre, fotHoyre] og kan ha hull inni seg. utenfor blir da false selv om det ikke finnes data. Utenfor endene av lista klemmer _hoydeVed (linje 81-82) stille til ytterste punkt, og _helning låser seg til ytterste segment. Inne i et hull interpolerer _hoydeVed rett over hullet. Kommentaren på linje 330-332 sier at nettopp «et tall som står stille når man beveger seg ser ut som en malt verdi» skulle være fjernet – men bare for området utenfor skråningsfoten, ikke for manglende data.

**Når:** A) Terrengmodellen mangler data for t < −1,5 m. Profilet får fotVenstre = −2,650, men geometri.terreng slutter på t = −1,471. Fra −1,471 og helt ut til −2,650 – 1,18 m, 14 % av snittbredden – viser boksen nøyaktig de samme verdiene uansett hvor musa står: «Terreng 100,37 moh», «Jordarbeid 99,23 moh», «Skjæring her 1,14 m», «25,0 % 1:4,0». utenfor-flagget er false hele veien, og terrengprikken står bom stille mens pekeren beveger seg. B) Hull rett under vegen (|t| < 1,0 m, f.eks. bygning eller vann i DTM-en): fot −11,15..5,07, punktlista hopper fra t=−1,00 til t=+1,09. Over de 2,09 metrene viser boksen «Skjæring her 2,75 m» i senterlinjen, rent interpolert over et område uten data. Samme lista brukes til å male flatene, så tegningen maler 5,73 m² skjæring over hullet som volumtallet (26,2 m²) ikke inneholder – 18 % av det tegnede arealet finnes ikke i tallet.

**Følge:** Brukeren får todesimalers høyder og gravedybder på steder der terrengmodellen ikke har målt noe. I tilfelle A er tallet i tillegg konstant over en drøy meter av snittet, som ser ut som at terrenget er flatt der. Profilet har riktignok ⚠-merknaden «Terrengmodellen har hull i dette tverrsnittet» øverst til høyre, men avlesningsboksen skiller ikke målt fra oppdiktet. Den som priser på «Skjæring her 2,75 m» i senterlinjen priser på ingenting.

**Bevis:** node-prøve: terreng NaN for t∈(−4,5;−1,5) → fotVenstre −2,650, geometri.terreng −1,471..2,363, avlesningen konstant 100,368 / 99,226 / 1,14 m for t = −1,5 til −2,649, utenfor=false. Hull |t|<1,0 → hull i lista −1,00..1,09, avlesning t=0 «Skjæring her 2,75 m», 5,73 m² tegnet over hullet mot 0 i regnestykket.

### Hurtigvalg av veiklasse setter prosjektets veibredde ned til klassens minstebredde

`public/js/veiklasser.js:197` · etterprøvd

**Hva:** malFraVeiklasse skriver ubetinget m.vegbredde = k.vegbredde. Normalen oppgir disse tallene som MINSTEKRAV («Veibredden skal være minimum 4,0 m»), ikke som prosjektert bredde. app.js:1194 har en vakt som er ment å ta vare på en bredere vei byggherren har bestilt – «Vegbredden er minstekravet i klassen; byggherren kan ville ha mer» – men den kan aldri slå til, fordi malFraVeiklasse allerede har overskrevet feltet. Sammenlikningen blir alltid k.vegbredde < k.vegbredde = false.

**Når:** Byggherren vil ha 5,0 m bred klasse 3-vei. Brukeren skriver 5,0 i breddefeltet, og bytter så veiklasse i nedtrekkslisten (f.eks. for å sammenlikne K3 mot K4, eller velger K3 etter å ha satt bredden). onchange → velgVeiklasse → malFraVeiklasse setter bredden stille tilbake til 4,0 m. Feltet i skjemaet oppdateres, men det er ett tall blant tretti, og massetallene rekner seg om uten varsel.

**Følge:** Målt på 249 m vei i sidebratt li (30 % sidefall): skjæring faller fra 1335 til 1175 m³ (−160 m³, −12 %) og sprengning fra 30 til 19 m³. Skalert: ca. 640 m³/km skjæring for lite. Feilen går i retning for lave masser, altså for lavt tilbud.

**Bevis:** node-prøve: onsket = {...StandardMal, vegbredde: 5.0}; V.malFraVeiklasse('k3', onsket).vegbredde → 4. beregnMasser på samme linje/terreng: 5,0 m → skjær 1335 / sprengt 30; 4,0 m → skjær 1175 / sprengt 19.

### slitelagBredde kan bare gå nedover – resultatet avhenger av hvilken klasse du så på først

`public/js/veiklasser.js:203` · etterprøvd

**Hva:** m.slitelagBredde = Math.min(m.slitelagBredde || k.kjorebane, k.vegbredde). Math.min gjør feltet til en skralle: den klemmes ned mot den smaleste klassen brukeren har vært innom, og kommer aldri opp igjen når man går til en bredere klasse. I tillegg er reservebredden feil etter normalen: fallback er k.kjorebane, mens normalen for K2–K5 sier at «Slitelaget skal være minst 10 cm tykt ferdig komprimert, og utjamnes over hele veibredden» – altså vegbredde, ikke kjørebane.

**Når:** Brukeren klikker seg gjennom klassene for å se hva de betyr, innom K8 (enkel traktorvei, 2,5 m), og lander på K2. Etter K8 er slitelagBredde 2,5 m, og min(2,5; 4,5) = 2,5 – slitelaget blir liggende 2,5 m bredt på en 4,5 m bred helårs landbruksbilvei. Velges K2 direkte fra standardmalen blir det 4,0 m.

**Følge:** Målt på 249 m: slitelag 110 m³ ved direkte valg mot 73 m³ etter omveien om K8 – 37 m³, altså 150 m³/km flyttet fra slitelagsposten til bærelagsposten. Totalvolumet i overbygningen er uendret, så ingenting ser galt ut i sumlinjen, men knust slitelagsmasse og bærelagsmasse prises svært ulikt. Samme mal gir to ulike mengdefordelinger avhengig av klikkerekkefølgen.

**Bevis:** node-prøve: standard→K2 gir slitelagBredde 4; standard→K8→K2 gir 2.5 (vegbredde 4.5 i begge). beregnMasser: slitelag 110,4 m³ mot 73,0 m³ på 249 m.

### _bygg sletter lovlige vertikalkurver, og resultatet avhenger av hvilken vei veien er tegnet

`public/js/vertikalprofil.js:50` · etterprøvd

**Hva:** Innkortingsløkken regner `nesteGrense` fra `L[i+1]` slik den står akkurat da – altså den ennå ikke innkortede ønskelengden – mens `forrigeGrense` bruker `L[i-1]` som allerede er kortet inn i samme runde. Løkken korter bare inn (`if (L[i] > maks)`), aldri ut igjen. Når naboens ØNSKEDE lengde er større enn to ganger avstanden, blir `nesteGrense` negativ, `maks` blir 0, og L[i] settes til 0. Runden etter er naboen kortet inn og det er god plass igjen – men L[i] kan aldri vokse tilbake.

**Når:** Knekkpunkt på 0/40/80/120/160 m med høyder 100/102/106/94/96 og K = 3 overalt (helt vanlige tall for en skogsbilveg). Framover: bare én kurve overlever (knekkpunkt 3, L = 79,92 m). Knekkpunkt 1 – et brekk på 5 % som trenger 15 m kurve og har 40 m tangent tilgjengelig – får L = 0, og knekkpunkt 2 får også L = 0. Samme vei tegnet fra andre enden: knekkpunkt 2 får L = 64,935 m og knekkpunkt 3 får L = 15 m.

**Følge:** Største høydeforskjell mellom de to kjøreretningene: 3,496 m ved profil 120. På identisk terreng gir det skjæring 2 628,8 m³ den ene veien og 3 486,6 m³ den andre (+857,8 m³, +33 %), fylling 815,5 mot 237,5 m³ (−577,9 m³). I tillegg gir de slettede kurvene falske merknader av typen «Knekk på 5,0 % i lavbrekk uten avrunding. Kravet er radius 200 m, som trenger 10 m vertikalkurve» på knekkpunkt som allerede har K høyt nok – og rettVertikalgeometri kan ikke fjerne dem, fordi linje 333 hopper over punktet når k allerede er ≥ trengsK. Brukeren får «brudd står igjen» som ingen knapp kan rette.

**Bevis:** Speilvending av samme profil gir ulike kurvesett: framover [{vip:3, L:79.92}], bakover [{vip:2, L:64.935},{vip:3, L:15}]. Sveip over 3000 tilfeldige profiler med K i [0,5–4,5]: 9 042 knekkpunkt fikk kortere kurve enn det var plass til; verste tilfelle fikk 0 m der 115,9 m ville fått plass. Ingen overlappende kurver ble funnet (0 av 3000), så innkortingen i seg selv er trygg – det er rekkefølgen som er feil.

### rettVertikalgeometri setter K opp, aldri ned – et lavbrekk-K blir stående på et høybrekk og stjeler plassen fra nabokurven

`public/js/vertikalprofil.js:333` · etterprøvd

**Hva:** `if (vip[i].k >= trengsK - 1e-9) continue;` gjør at K bare kan økes. Kravet er ulikt i lavbrekk og høybrekk (200 mot 150 i standardmalen, 60 mot 100 i demomalen). Utglattingen i den andre grenen (linje 342–356) flytter høyder og kan snu fortegnet på A. Da står punktet igjen med K fra det gamle, strengere kravet, og kurvelengden L = K·A blir større enn plassen funksjonen selv la til grunn (`plass = min(dFor, dEtter)`). _bygg må da korte inn NABOENS kurve i stedet – altså lager rettingen et nytt brudd mens den retter et annet.

**Når:** 10 knekkpunkt med 18 m avstand, krav 200 m lavbrekk / 150 m høybrekk. Etter rettVertikalgeometri står knekkpunktet på profil 126 igjen med k = 2 (lavbrekkverdien) på et brekk som nå er et høybrekk på −12 %. Det gir L = 2 · 12 = 24 m der budsjettet er 18 m. _bygg regner da nesteGrense for naboen på profil 108 som 18 − 12 = 6 m og korter kurven der ned til 2·6·0,999 = 11,988 m, mens kravet er 17,813 m.

**Følge:** Et knekkpunkt som rettingen selv nettopp hadde satt riktig K på, mangler 5,82 m kurvelengde etterpå og gir merknad. I et sveip over 400 tilfeldige profiler står 23 igjen med et reelt vertikalkurvebrudd etter rettVertikalgeometri; verste mangel er 5,83 m kurvelengde. Fordi rettOpp i app.js kjører samme retting inntil 8 ganger og bryter ut når det ikke blir bedre (app.js:691), blir dette stående.

**Bevis:** Reprodusert med et brukersatt K: knekkpunkt med k = 8 midt i profilen ga L = 49,95 m og nullet nabokurven helt (L = 0 der 30 m var kravet). Sveip: 23 av 400 profiler har reelle brudd igjen etter rettingen.

### Massebalansen «Balanser massene» sikter mot, glemmer bærelaget

`public/js/masser.js:889` · etterprøvd

**Hva:** `const balanse = tilgjengelig - fyllingBehov;` tar ikke med baerelagBehov, selv om den detaljerte bokføringa rett over (linje 881-884) slår fast at bærelaget må dekkes av sprengstein. Feltet er merket «gammel, enkel balanse», men det er akkurat dette feltet app.js:769 bisekterer mot null i knappen «Balanser massene», og som app.js:826/829 vekter med 0,3 / 1,6 i optimaliseringskostnaden – den tyngste enkeltvekta etter fjell. balanse.balanse lar dessuten brukbar løsmasse dekke behovet på lik linje med stein, noe balansen ellers forbyr.

**Når:** 1 km veg i li: terreng z = 100 + 0,06x + 0,15y, fjell 1,2 m ned, standardmal, VIP hver 100 m. Kjørt nøyaktig samme bisektering som app.js:769 (lo=-8, hi=8, 26 halveringer) på balanse.balanse.

**Følge:** Bisekteringen løfter vegen +0,555 m. Der er balanse.balanse = 0, men manglerTotalt = 2750 m³ – hele bærelaget må kjøres inn. Senkes vegen i stedet til dz = −1,0 m er manglerTotalt = 0 og det er 1732 m³ sprengstein til overs. «Balanser massene» legger altså profilen ca. 1,5 m for høyt og skaper 2750 m³ innkjørt stein per km som ikke trengte å finnes. Samme felt gir motstridende svar i samme objekt: i et blandet tilfelle er balanse.overskudd = 302 m³ samtidig som manglerTotalt = 2448 m³.

**Bevis:** e4.js-skanning av dz: ved dz +0,50 er balanse.balanse 296 og manglerTotalt 2750; ved dz −1,00 er balanse.balanse 7571 og manglerTotalt 0 med overskuddFjell 1732. e2.js «Blandet»: balanse (gml) +302,4 overskudd mot manglerTotalt 2447,6.

### Fast fjell bokføres som rensk der fjellet ligger grunnere enn renskedybden

`public/js/masser.js:523` · etterprøvd

**Hva:** `const dFjell = Math.max(0, Math.min(zT, zF) - zJ);` – zT er terrenget etter rensk (terrRå − renskDybde, linje 330), zF er fjelloverflaten (terrRå − fjelldybde, linje 341). Er fjelldybde < renskDybde, klemmer Math.min fjelloverflaten stille ned til renskeflaten. De øverste (renskDybde − fjelldybde) meterne fast fjell havner da i renskeposten, som går rett til deponi (linje 887) og verken kan brukes i fylling eller bærelag. Det finnes ingen kobling mellom renskDybde (linje 610) og fjelldybden, og ingen merknad.

**Når:** 1 km veg, 20 % sidefall, vegnivå 3 m under terreng, fjellsyning registrert som fjelldybde 0 (nettopp det Fjellmodell.punkter er beskrevet for: «sondering, prøvegrop eller fjellsyning»), renskDybde 0,20 m (standard).

**Følge:** skjaeringFjell 22782 m³ mot 24197 m³ når rensken settes til 0 – 1415 m³ per km fast fjell prises som avdekking i stedet for sprengning. Rensk/deponi går fra 0 til 1807 m³, og fraFjell faller fra 31456 til 29616 m³, altså 1840 m³ mindre fyllingsmasse tilgjengelig. Resultatene er bit for bit identiske for fjelldybde 0, 0,05 og 0,10 m – modellen skiller ikke i det hele tatt mellom bart fjell og 10 cm jord. Feilen går alltid samme vei: for lite sprengning, for mye deponi.

**Bevis:** e5.js: «0.00 0.20 rensk 1807 fjell 22782» mot «0.00 0.00 rensk 0 fjell 24197»; «0.10 0.20» gir eksakt samme tall som «0.00 0.20». e2.js E3: fjelldybde 0, 0,05 og 0,2 gir alle rensk 1887 / fjell 30018. Merknadsliste: [].

### Skråningsfeltene blir aldri reparert – merknaden lyver, og NaN sprer seg til alle volumene

`public/js/masser.js:745` · etterprøvd

**Hva:** Kommentaren på linje 740 sier «skraningene normaliseres allerede», og merknaden sier «regnet med 0.02 (nesten loddrett)». Normaliseringa er `Math.max(0.02, m)` (linje 384, 393 og 428), men Math.max(0.02, NaN) er NaN. Negative verdier blir riktig klemt til 0,02; verdier som ikke er tall blir det ikke. mal.fylling, mal.skjaeringLosmasse og mal.skjaeringFjell står ikke i MALGRENSER, så klem() ser dem aldri, og løkka på linje 741-747 melder fra uten å rette.

**Når:** Prosjektfil med "fylling": "1,5" – norsk kommadesimal, det mest nærliggende i en håndredigert fil. Math.max(0.02, "1,5") = NaN.

**Følge:** sum.fylling, sum.skjaering, balanse.fyllingBehov og hele massebalansen blir NaN, samtidig som merknaden sier «Fyllingsskråning var 1,5 – regnet med 0.02 (nesten loddrett)». Rapporten fylles med NaN mens den forteller brukeren at feilen er rettet opp. Tilsvarende med skjaeringLosmasse = NaN: sum.skjaering blir NaN og merknaden sier igjen at 0,02 er brukt. Til sammenlikning fungerer negativ verdi som lovet: fylling = −2 gir sum.fylling 1230 m³ regnet med 0,02.

**Bevis:** e1.js E1b: «sum.fylling = NaN» med merknad «Fyllingsskråning var 1,5 – regnet med 0.02 (nesten loddrett)». E1a (NaN) likeså. E1c (−2) gir endelig tall, altså er det bare ikke-tall som faller gjennom.

### Bare ett av to knekkpunkt varsles når en kurve kortes inn

`public/js/linjeforing.js:61` · etterprøvd

**Hva:** Når tangentene på et strekk er for lange, skaleres BEGGE ned med samme faktor (linje 58–59), men `const nr = i + (tangent[i] > tangent[i+1] ? 0 : 1)` velger ut ett eneste knekkpunkt, og `advarsler.some(a => a.ip === nr)` hindrer at flere legges inn. Nabokurven kortes inn like mye uten at noe sier fra.

**Når:** IP = [(0,0) r=0, (300,0) r=200, (300,100) r=60, (600,100) r=0]. Mellombenet er 100 m, begge tangentene skaleres med 0,384. ip2 får R=76,85 (bestilte 200) og ip3 får R=23,05 (bestilte 60). advarsler = [{ip:1, "Radien i knekkpunkt 2 er for stor for strekket"}]. Knekkpunkt 3 nevnes ikke med et ord.

**Følge:** I 4000 tilfeldige linjeføringer ble 7810 kurver kortet inn; 2741 av dem (35 %) fikk ingen advarsel som navngir sitt eget knekkpunkt. Verste observerte uvarslede tilfelle: bestilt R=38 m, levert R=0,022 m. masser.js:917–920 kopierer advarslene rett inn i merknadslisten, så rapporten det prises på tier om den kurven. Er den innkortede radien over mal.minRadius (23,05 > 10 for K3), sier masser.js:951 heller ingenting. Praktisk utslag for K3: R=23 i stedet for R=60 gir 6,50 m breddeutvidelse der brukeren tegnet 0, og 6 % stigningstak i stedet for 10 %. Midtordinaten faller fra 24,9 m til 9,5 m, så senterlinjen ligger 15,3 m fra der en R=60-kurve ville lagt den – altså over helt annet terreng enn massene er regnet på.

**Bevis:** node-skript: 4000 tilfeldige linjeføringer, teller kurver med k.r < ip[k.ip].r og sjekker om advarsler.some(a=>a.ip===k.ip). Resultat 2741/7810 uten advarsel. Det navngitte eksempelet er kjørt separat og gir R=76,85/23,05 med bare én advarsel (ip:1).

### Proporsjonal nedskalering ødelegger en kurve som hadde fått plass, og har ingen nedre grense

`public/js/linjeforing.js:57` · etterprøvd

**Hva:** `const skala = (L * 0.999) / sum` skalerer begge tangentene med samme faktor, selv når det finnes en lovlig fordeling der den ene beholder full radius. Faktoren har heller ikke noe gulv, så R kan ende vilkårlig nær null uten at konstruksjonen stopper.

**Når:** Samme linje som over: T(ip2)=200, T(ip3)=60, L=100. En lovlig fordeling er T(ip3)=60 og T(ip2)=39,9 – summen 99,9 ≤ 0,999·100 – som ville gitt ip3 nøyaktig den bestilte R=60. Koden gir i stedet R(ip2)=76,85 og R(ip3)=23,05, altså 38 % til begge. I den tilfeldige serien ble en bestilt R=38 m redusert til R=0,0222 m, en bue på 3,5 cm.

**Følge:** En kurve brukeren har prosjektert riktig blir ødelagt fordi naboen er urimelig, og resultatet kan bli en «kurve» på noen centimeter. En slik bue er kortere enn profilavstanden, så ingen profilstasjon lander inni den og masser.js:951 (minRadius) får aldri sett radien. Kombinert med funn 1 kan hele hendelsen passere uten en eneste merknad i rapporten.

**Bevis:** Kjørt direkte: R(ip2)=76.85, R(ip3)=23.05 mot den lovlige fordelingen 39,9/60. Verste uvarslede klipp i tilfeldig serie: {bestilt:38, fikk:0.0222}. Egen test viser at en R=5-kurve (bue 7,85 m) med 20 m profilavstand treffer 1 av 16 profiler.

### To knekkpunkt på nøyaktig samme koordinat sletter kurven helt – uten kurve og uten advarsel

`public/js/linjeforing.js:44` · etterprøvd

**Hva:** `norm()` (linje 219) returnerer {0,0} for en nullvektor fordi `Math.hypot(0,0) || 1` gir 1. Da blir kryss=prikk=0 og `Math.atan2(0,0)` = 0, så avbøyningen leses som null og `continue` på linje 45 dropper kurven. Skaleringsløkken tester deretter `sum > L*0.999`, altså `0 > 0`, som er usant – så det legges ikke inn noen advarsel heller.

**Når:** IP = [(0,0) r=0, (100,0) r=30, (100,0) r=30, (100,100) r=0], det vil si samme knekkpunkt lagt inn to ganger med den bestilte radien på begge. Resultat: kurver=0, advarsler=0, lengde=200,00 m. Uten duplikatet: kurver=1, R=30, lengde=187,12 m. Kjørt hele veien gjennom ekte lat/lon: Geo.tilUtm gir bitidentiske UTM-koordinater, og app.byggLinje (app.js:248–255) har ingen duplikatsjekk.

**Følge:** En prosjektert 30-meterssving blir stille til en 90-graders skarp knekk. Lengden blir 12,88 m (6,9 %) for lang. radiusVed i hjørnet gir Infinity, så masser.js:951 sier ingenting om minsteradius, veiklasser.normalbreddeIKurve gir 0,00 m breddeutvidelse i stedet for 5,75 m for K3, og maksStigningNormal gir 10 % stigningstak i stedet for 8 %. Ingen av de tre kontrollene som skulle fanget dette virker. Rekkevidde: doble klikk er den dokumenterte måten å avslutte tegningen på (ui-kart.js:65, doubleClickZoom er slått av på linje 14), og Leaflet sender to click-hendelser med identisk latlng før dblclick; nye punkt får automatisk standardRadius = 30 (app.js:96). Å dra én knekkpunktmarkør oppå en annen gir samme resultat.

**Bevis:** t8.js: ipLatLon med to like punkt → utm[1] === utm[2] er true → Linjeforing gir kurver=0, advarsler=0, lengde 693,33 m mot 684,69 m uten duplikatet. Overgangsserie: avstand 0 → 0 kurver/0 advarsler; 1e-9 → 0 kurver/1 advarsel; 1e-6 til 5 m → 1 kurve med R lik 0,999·avstanden.

### SOSI: OMRÅDE (MIN-NØ/MAX-NØ) skrives i centimeter – skal være meter

`public/js/eksport.js:143` · etterprøvd

**Hva:** `rader.push('...MIN-NØ ' + cm(minN) + ' ' + cm(minO))` og tilsvarende for MAX-NØ ganger begge hjørnene med 100, som om ENHET 0.01 gjaldt for områdeboksen. SOSI-standarden sier det motsatte. SOSI del 1 (4.0 og 5.0): «Området angis i hele meter i det aktuelle koordinatsystem … Dersom GEOKOORD ikke er angitt, brukes sekunder for geografiske koordinater, meter for kartprojeksjonene», og kravlisten i 5.0: «Enhetsfaktoren skal ikke brukes på områdebeskrivelsen i filhodet.» Standardens eget eksempel har ENHET 0.010 sammen med ...MIN-NØ 100000 10000 – altså meter. Koordinatlinjene under ..NØH skal derimot skaleres med ENHET, og det gjør koden riktig.

**Når:** En vei rundt N 6 699 997 / Ø 500 000 (UTM32). Filen får `...MIN-NØ 669999738 50000000` og `...MAX-NØ 670020000 50020225`.

**Følge:** Den deklarerte områdeboksen leses som N = 669 999 738 m, Ø = 50 000 000 m – 663 299 741 m nord for der dataene faktisk ligger, og boksen er 100 ganger for stor (20 262 m × 20 225 m i stedet for 202,6 m × 202,3 m). SOSI-kontroll vil melde at samtlige koordinater ligger utenfor deklarert område, og et mottakersystem som bruker OMRÅDE til å bygge romlig indeks eller sette kartutsnitt havner i tomrommet. Selve koordinatene i filen er riktige, så en leser som ignorerer hodet klarer seg.

**Bevis:** Kjørt eksporten: MIN-NØ 669999738 50000000 mot faktisk minimum N 6 699 997,38 m / Ø 500 000,00 m. Spesifikasjonsteksten er hentet ut ordrett fra Kartverkets «SOSI Generell del – Realisering i SOSI-format» v4.0 og v5.0 (register.geonorge.no / standarder.geonorge.no).

### SOSI mangler VERT-DATUM/HØYDE-REF – høydene leses som NN54, men er NN2000

`public/js/eksport.js:141` · etterprøvd

**Hva:** Hodet inneholder TEGNSETT, TRANSPAR (KOORDSYS, ORIGO-NØ, ENHET), OMRÅDE, SOSI-VERSJON og SOSI-NIVÅ, men ingen `...VERT-DATUM`/`...HØYDE-REF` inne i ..TRANSPAR – samtidig som filen skriver høyder under ..NØH. SOSI del 1 v4.0 sier eksplisitt: «I de SOSI-filer som ikke har ...HØYDE-REF ligger det implisitt at det er benyttet NN54/NNN57. Det oppfordres imidlertid til alltid å lagre informasjon om høydereferansen i SOSI-fila.» I v5.0 er det gjort til et krav: «/krav/høyderef Informasjon om høydereferansen skal alltid spesifiseres i SOSI-filen.» Terrenget kommer fra Kartverkets DTM1, som er NN2000 – og programmets egen LandXML-eksport (linje 100) skriver verticalDatum="NN2000".

**Når:** Kommunen eller entreprenøren leser SOSI-filen etter standarden og tolker høydene som NN54, mens de i virkeligheten er NN2000. De to eksportfilene fra samme beregning motsier hverandre: LandXML sier NN2000, SOSI sier implisitt NN54.

**Følge:** Hele veien får feil høydereferanse i mottakersystemet. Forskjellen NN2000 − NN54 er i Norge typisk 0,10–0,30 m innlands og opptil ca. 0,35 m, og feilen er systematisk over hele traseen – ingen enkeltverdi ser gal ut. På en 4 m bred vei gir 0,20 m ca. 800 m³ feilplassert masse per km, uten at noe varsler om det.

**Bevis:** Kjørt eksporten og søkt i utdata: ingen linje matcher /VERT-DATUM|HØYDE-REF/. Sammenlignet med eksempelhodet i SOSI del 1 v4.0, som har `...VERT-DATUM NN54 SJØ0 HSH O` inne i ..TRANSPAR mellom ENHET og OMRÅDE. Merk at ENHET-bruken på selve høydeverdien derimot er riktig: «Dersom ENHET-H og ENHET-D ikke er satt, gjelder verdien for ENHET generelt.»

### «Masser per 20 meter» merker radene med feil profilstrekning når profilavstanden ikke går opp i 20

`public/js/ui-pdfrapport.js:265` · etterprøvd

**Hva:** Bolken navngis av `Math.floor(iv.fra / bolk) * bolk` og `til: start + bolk`, men `na.til` overskrives etterpå med `iv.til` (linje 273). Ny bolk startes bare når `Math.floor(fra/20)*20` endrer seg. Når profilavstanden ikke er en divisor i 20, faller intervallgrensene og 20-metersgrensene fra hverandre, og etiketten «fra–til» slutter å beskrive innholdet i raden. Volumene i raden er riktige tall – de er bare hengt på feil strekning, og etikettene overlapper hverandre mellom nabo-rader.

**Når:** Profilavstand 25 m (lovlig, feltet tillater 1–100): intervallene 0–25, 25–50, 50–75, 75–100 gir radene «0–25», «20–50», «40–75», «60–100». Raden «40–75» inneholder i virkeligheten bare 50–75. Profilavstand 6 m gir radene «0–24», «20–42», «40–60» … under overskriften «Masser per 20 meter» – første rad dekker 24 m, andre rad dekker 24–42.

**Følge:** Rad «40–75» påstår 35 m veg, men holder volumet for 25 m. Med en fjellskjæring på 20 m³/m blir 500 m³ presentert der leseren venter 700 m³ – 200 m³ feil på én rad, ca. 30 000 kr ved 150 kr/m³ hvis noen priser eller setter bort en delstrekning etter tabellen. Kolonnesummen nederst er fortsatt riktig, så feilen synes ikke i totalen. Samme logikk står i ui-rapport.js:317-331, så HTML-rapporten har den også.

**Bevis:** Kjørte inndelingen for profilavstand 5/6/7/15/25 m. pa=25: etikett "40–75" inneholder faktisk 50–75 (rensk 25 mot forventet 35). pa=15: etikett "20–45" inneholder faktisk 30–45. pa=5 og 100 er riktige.

### Stikningstabellen mister stille de fleste punktene når profilavstanden ikke går opp i 5 eller 10

`public/js/ui-pdfrapport.js:292` · etterprøvd

**Hva:** `const steg = res.lengdeKart > 600 ? 10 : 5;` er en absolutt meterverdi. Filteret i Rapport.stikningstabell (ui-rapport.js:292) beholder bare profiler der `Math.abs(p.s % steg) < 1e-6`. Stasjonene lages som 0, dS, 2·dS … (masser.js:801), så filteret gir egentlig «hver minste felles multiplum av dS og steg». Er dS ikke en divisor i steg, siles nesten alt bort – uten noen melding.

**Når:** Profilavstand 7 m på en 800 m veg: steg = 10, stasjonene er 0, 7, 14 … og bare multiplene av 70 overlever. Tabellen «Stikningsdata – senterlinje» får 13 rader av 116 profiler, med 70 m mellom hvert punkt. Profilavstand 3 m på 500 m veg: 35 av 168 rader, ett punkt hver 15. m i stedet for hver 5. m. Profilavstand 4 m: 26 av 126 rader.

**Følge:** Stikkeren tar med seg en tabell som ser komplett ut, men mangler 7 av 8 punkter, og punkttettheten er 70 m i stedet for 10 m i terreng der veien svinger. Brødteksten over tabellen sier bare at «hele oppsettet» finnes som CSV – den nevner ikke at det utskrevne oppsettet er tynnet ut, og heller ikke hvor tynt. Utsetting etter denne tabellen bommer på kurvatur og høyde mellom punktene.

**Bevis:** Kjørte filteret for profilavstand 3/4/5/6/7/15/25 m mot veg 500 og 800 m. pa=7, veg=800: 13 av 116 profiler, kom med 0, 70, 140, 210 … pa=6, veg=500: 18 av 85, kom med 0, 30, 60, 90 …

### Kostnadsfunksjonen måler stigningskravet mot feil radius

`public/js/app.js:859` · etterprøvd

**Hva:** Kostnadsfunksjonen bruker `maksStigningFraRadius(mal, pr.radius, ...)`. Både rapporten (masser.js:926-927) og selve rettingen (app.js:411, tillattStigning) bruker `effektivRadius(linje, mal, s)`, som tar med utflatingssonen på `mal.utflatingForKurve` meter foran og etter kurven. `effektivRadius <= pr.radius` alltid, så optimaliseringen jobber med en systematisk slakkere regel enn den som gjelder. På rettstrekket rett før en knapp kurve er `pr.radius = Infinity` (løsest bånd) mens `effektivRadius` er kurveradien (strengeste bånd).

**Når:** K5, lassretning −1, rettstrekk inn i en 12 m kurve: 4 av 83 profiler får tillatt 20 % i kostnadsfunksjonen mot 12 % i rapporten. Kjørt «Rett opp» på slak li (helning 0,10): prosjektet hadde 0 brudd etter rettingen, optimaliseringen la seg på 19,8 % i utflatingssonen foran en 40 m kurve og fikk NULL straff, mens rapporten meldte «Stigning 19.8 % overstiger 18 % i returretningen (utflating mot kurve med radius 40 m)». I en sveip over 40 prosjekt laget optimaliseringen nye stigningsbrudd i 9 av dem.

**Følge:** Grensen optimaliseringen respekterer er opptil 20 %/12 % = 1,67 ganger for slakk i utflatingssonene. Optimaliseringen kjøper seg billigere sprengning ved å bryte stigningskravet der den ikke ser at det finnes. Prises jobben på et slikt profil, må stigningen rettes i marka etterpå.

**Bevis:** t5b.js: «profiler med brudd i rapporten, men NULL straff i optimaliseringen: 4». t10_detalj.js SAK A: 0 brudd før optimalisering → 1 stigningsbrudd etter, merknad «Stigning 19.8 % overstiger 18 % ... (utflating mot kurve med radius 40 m)».

### Kostnadsfunksjonen har ingen straff for vertikalkurvebrudd

`public/js/app.js:856` · etterprøvd

**Hva:** Kostnadsfunksjonen (app.js:809-874) straffer kurvatur (fra merknadene), stigning, fyllingshøyde, skjæringsdybde, utslag og pr.advarsel. Kravet til vertikalkurveradius (mal.minVertikalLavbrekk / minVertikalHoybrekk, kontrollert i masser.js:992-1016) er ikke med i det hele tatt. Optimaliseringen flytter høyder fritt, og hver høydeendring endrer stigningsbruddet A og dermed kurvelengden som kreves – uten at det koster noe.

**Når:** «Optimaliser» kjørt alene på 40 prosjekt: knappen gjorde et prosjekt med 0 brudd ulovlig i 15 av dem, verste tilfelle 0 → 14 brudd (4 stigning, 10 vertikalkurve). Innenfor «Rett opp» laget optimaliseringen nye vertikalkurvebrudd i 16 av 30 kjøringer (0 → 9 og 7 → 23 i de verste).

**Følge:** En profil som er godkjent etter normalen blir ulovlig av å trykke «Optimaliser», og statuslinjen sier ingenting. Vertikalkurvebrudd er ikke synlige i massetallene, så et prosjekt kan prises på et profil som ikke lar seg bygge slik det står.

**Bevis:** t17_alene.js: «Optimaliser alene økte brudd i 28 av 40; gjorde et feilfritt prosjekt ulovlig i 15». t14_vk.js: «optimaliseringen laget nye vertikalkurvebrudd i 16 av 30».

### Optimaliseringen måler byggegrensene på et tre ganger grovere rutenett enn rapporten

`public/js/app.js:553` · etterprøvd

**Hva:** beregnRaskt setter `profilAvstand: Math.max(this.P.profilAvstand, 15, lengde/250)`, altså 15 m mot rapportens 5 m (standard P.profilAvstand). Kommentaren over sier at feilen «er den samme i alle – den forsvinner i sammenligningen». Det stemmer for volumene, som er glatte integraler. Det stemmer IKKE for maksFylling, maksSkjaering, utslag og stigning: de er punktvise ekstremalverdier, og en topp mellom to grove stasjoner får ingen straff overhodet.

**Når:** 25 prosjekt med profilen løftet 1,8 m: i 22 av dem lå minst ett fyllingsbrudd fra rapporten (dS=5) helt mellom optimaliseringens stasjoner (dS=15). Verste enkelttilfelle: profil 20 med 7,07 m fylling mot grensen på 4,0 m – 3,07 m over, som skulle kostet 3,07 × 3000 = 9 210 kostnadsenheter, men kostet 0 fordi verken stasjon 15 eller 30 var over grensen.

**Følge:** Optimaliseringen velger fritt profiler med fyllinger, skjæringer og utslag langt over det som er tillatt, fordi den ikke ser toppene. Rapporten melder dem etterpå, men da er høydene alt valgt, og massetallet er regnet på et profil som ikke holder grensene.

**Bevis:** t22_rutenett.js: «fyllingsbrudd som optimaliseringens grovere rutenett ikke ser i det hele tatt: 22 av 25 prosjekt», eksempel «s=20 med 7.07 m fylling».

### «Rett opp» kan ende med flere brudd enn den startet med, og sier det ikke

`public/js/app.js:719` · etterprøvd

**Hva:** Linje 719: `if (bruddFor.totalt > igjen && igjen > 0) deler.push(...)`. Meldingen om hvor mange brudd som ble rettet skrives bare når tallet gikk NED. Ble det flere, faller betingelsen bort og ingenting sier fra – brukeren får bare «N brudd står igjen», som leses som om de var der fra før. Årsaken er at optimaliseringen (linje 695) kjøres etter rettingen og kan lage nye brudd (funn 1 og 2), mens sluttrettingen på linje 700-704 kjøres én gang uten kontroll av resultatet.

**Når:** 30 kjøringer av rettOpp med tilfeldig terreng: i 11 av dem endte prosjektet med flere brudd enn før knappen ble trykket. Eksempel: 0 → 1 brudd med statuslinjen «Rettet opp: sprengning −26 m³ · fylling +156 m³ · 1 brudd står igjen (1 vertikalkurve)». Verste: 8 → 11 brudd med «Rettet opp: sprengning +635 m³ · fylling +232 m³ · 11 brudd står igjen». Et annet: 1 → 3 med «Minst inngrep: flyttet masse +298 m³ · 3 brudd står igjen (3 fylling)».

**Følge:** Knappen som skal fjerne alle brudd legger til nye, og statuslinjen leses som om de nye bruddene var der fra før. Brukeren har ingen måte å se at trykket gjorde det verre, annet enn å ha notert bruddtallet på forhånd.

**Bevis:** t14_vk.js: 11 av 30 kjøringer merket «! rettOpp gjorde det verre», med statusstrengene gjengitt. t10_detalj.js SAK B (1→2) og SAK C (8→11).

### rettVertikalgeometri regner plass uten å trekke fra nabokurvene, så noen vertikalkurvebrudd kan aldri fjernes

`public/js/vertikalprofil.js:329` · etterprøvd

**Hva:** `const plass = Math.min(dFor, dEtter)` er avstanden til nabo-VIP-ene. Vertikalprofil._bygg (vertikalprofil.js:49-52) korter kurven ned til `2 * min(dFor - L[i-1]/2, dEtter - L[i+1]/2) * 0.999` – altså trekkes halve nabokurven fra. Er nabokurvene lange, er det faktiske rommet mye mindre enn `plass`. rettVertikalgeometri setter da K = krav/100, tror den er ferdig, og på neste runde treffer den `if (vip[i].k >= trengsK) continue` (linje 333) og rører aldri punktet igjen. Bruddet står for alltid. Dette er årsaken til at rettOpp ikke kan innfri kravet om å fjerne ALLE brudd.

**Når:** VIP-liste [0:3.449, 12.81:1.158, 44.93:−5.712, 122.97:−0.67, 144.44:−3.893, 176.06:2.595, 230.52:2.485, 321.66:−0.417, 413.92:4.614, 440.46:1.435], alle K=1. Ved VIP 3 (s=123, A=−21,5 %) er kreves = 21,47 m og `plass` = 21,47 m, så rettingen setter K og gir seg. Nabokurven ved VIP 4 er 35,50 m lang og spiser 17,75 m bakover, så det faktiske rommet er 7,43 m og den bygde kurven blir 7,40 m – radius 34 m der kravet er 100 m. 40 runders retting endrer ingenting.

**Følge:** 926 av 4000 tilfeldige profiler (23 %) har vertikalkurvebrudd igjen etter 8 runders retting, verste mangel 14,07 m kurvelengde. rettOpp bryter av på «ikke lenger fremgang» (app.js:691) etter to runder og melder bruddene som «står igjen» uten å si at de er umulige å rette.

**Bevis:** t2_sok.js: «vertikalgeometri: 926 av 4000 profiler har brudd igjen etter 8 runder retting». t3_mekanisme.js: «vip 3 ... kreves=21.47 m bygget=7.40 m | rettVertikalgeometri sin "plass"=21.47 faktisk rom=7.43 <-- BRUDD STAR IGJEN».

### balanser() lander på nøyaktig −8 m og sier ingenting når terrenget mangler

`public/js/app.js:775` · etterprøvd

**Hva:** Bisekssjonen starter på lo=−8, hi=+8. Mangler terrenget helt, er `balanse.balanse` lik 0 for alle d. Da er `vLo * vHi > 0` usant (0 er ikke > 0), så koden går inn i bisekssjonsgrenen. Der er `vLo * vM <= 0` alltid sant (0 <= 0), så `hi` settes til `midt` hver eneste runde og kollapser mot lo = −8. Resultatet er d = −8,000. Funksjonen setter ingen statusmelding ved suksess, så det kommer ingen varsel.

**Når:** Prosjekt med tre VIP-er og terreng.z() som returnerer NaN (alle terrengfliser feilet – nettverksfeil mot Kartverket): balanser() senket alle tre ulåste høydene med nøyaktig −8,000 m. Statuslinjen var uendret.

**Følge:** Hele veglinjen flyttes 8 m ned uten at noe sies. Når terrengdataene senere kommer inn, regnes massene på et profil som ligger 8 m for lavt – på en 600 m veg med 4,5 m bredde er det i størrelsesorden 20 000 m³ skjæring som ikke skulle vært der. Feilen er ikke synlig noe sted i grensesnittet.

**Bevis:** t13_balanse.js: «balanse uten terreng: 0 / balanser() flyttet hoydene: -8.000 / -8.000 / -8.000 m / status etterpa: undefined».

### settInnPunkt blander ny P.ip med gammel app.linje – punktet havner feil sted i rekken

`public/js/ui-kart.js:148` · etterprøvd

**Hva:** settInnPunkt leser knekkpunktene fra app.ipTilUtm() (dagens P.ip) men henter stasjonene fra app.linje.kurver, der k.ip er indekser i den FORRIGE ip-lista. Linja bygges ikke om av settInnPunkt selv: linje 161 kaller app.linjeEndret(), som bare er planlegg(120) (app.js:575, app.js:340), altså en setTimeout på 120 ms – og clearTimeout i planlegg nullstiller den timeren for hvert nytt klikk. Kommer klikk nummer to før timeren har gått, peker find(k => k.ip === i) på kurven til nabopunktet, langs-tabellen forskyves ett hakk, og løkken på 155-158 velger en plass som er for tidlig.

**Når:** Veg med 6 knekkpunkt (1447 m, alle r=30). Bruker klikker på senterlinja ved profil 434, og igjen ved profil 724 innen 120 ms. Andre klikk får langs = [0,249,518,816,1098,1098,1447] mot en 7-elements ip-liste og velger plass 3 i stedet for 4. Punktrekken blir x=387 -> x=657 -> x=450 -> x=750: linja går 207 m bakover før den går fram igjen. Samme to klikk med pause mellom gir null endring i det hele tatt.

**Følge:** Vegen havner opptil 37,3 m fra der brukeren tegnet den, senterlinja vokser 48 m, IP-polygonet 397 m. Full beregnMasser på sidebratt terreng (1:4): skjæring 8351 -> 8694 m3 (+343 m3, +4,1 %), rensk +119 m3, bærelag +150 m3, fylling +35 m3 (+99 %), merknader 6 -> 14. Med pause mellom klikkene: 0 m3 avvik. Resultatet avhenger altså bare av hvor fort brukeren klikker.

**Bevis:** const ipUtm = app.ipTilUtm(); ... const kurve = (app.linje.kurver || []).find(k => k.ip === i); // k.ip er indeks i FORRIGE ip-liste

### Innsatt punkt får standardRadius også midt inne i en eksisterende kurve – radien kollapser fra 30 m til under 1 m

`public/js/ui-kart.js:160` · etterprøvd

**Hva:** Punktet settes alltid inn med r: P.standardRadius (30 m). Doku-kommentaren på 132-133 sier at punktet får standardradius «sa svingen blir myk med en gang». Treffer klikket inne i en kurve, ligger det nye knekkpunktet bare noen få meter fra tangentpunktet til nabokurven. Nedskaleringen i linjeforing.js:51-68 (sum av tangenter <= 0,999*L) klemmer da begge tangentene, og R = T/tan(|avbøy|/2) faller sammen. Sideveis flytter vegen seg bare ~1,4 m, så ingenting ser galt ut i kartet.

**Når:** Veg med 4 knekkpunkt, alle r=30. Kurven i IP1 går fra profil 190,0 til 209,3. Bruker klikker midt i kurven (profil 199,7) for å få mer sving, akkurat slik kommentaren på 49-55 inviterer til. Sveip over hele kurven: klikk på 193,5 gir R=17,7 m, 196,5 gir R=6,6 m, 198,0 gir R=2,7 m, 199,5 gir R=0,85 m, 201,0 gir R=2,2 m. Samme mekanisme ved dobbeltklikk på linja i Rediger: Leaflet sender to click-hendelser < 120 ms, begge går gjennom settInnPunkt, og med 0,3 m musebevegelse mellom dem blir minste radius 0,06 m.

**Følge:** Minste horisontalradius 30 m -> 0,85 m på en skogsbilveg. Full beregnMasser (1010 m veg, sidebratt 1:4): merknad «Radius 0.8 m er under minstekravet på 10 m», ett profil merket forbiKurvesenter – der sier masser.js:522-527 selv at «det finnes ikke noe entydig volum» – breddeutvidelse 0,50 -> 1,31 m, skjæring +49 m3. Maks tillatt stigning faller fra 14 % til 10 % over ±15 m (effektivRadius), som endrer hva «rett opp» gjør med høydeprofilen.

**Bevis:** P.ip.splice(plass, 0, { lat: latlng.lat, lon: latlng.lng, r: P.standardRadius || 0 });

### Dobbeltklikk for å avslutte tegningen legger inn ett knekkpunkt for mye

`public/js/ui-kart.js:65` · etterprøvd

**Hva:** Verktøytipset i index.html:42 sier «Dobbeltklikk for å avslutte». Leaflet 1.9.4 undertrykker ikke click ved dobbeltklikk – jeg har lest _handleDOMEvent og _fireDOMEvent i leaflet-src.js 1.9.4, det finnes ingen filtrering – så nettleseren sender click, click, dblclick. Begge click-hendelsene går gjennom kart.on('click') -> klikk() -> P.ip.push (linje 181) før dblclick-lytteren rekker å sette modus til 'rediger'. Brukeren får alltid ett ekstra knekkpunkt på slutten av vegen.

**Når:** Veg tegnet med 5 klikk (1010 m). Brukeren avslutter med dobbeltklikk på det siste punktet. Flytter pekeren seg én piksel mellom de to klikkene (0,3 m på zoom 17): 6 knekkpunkt i stedet for 5, minste radius 30 m -> 7,33 m, ny advarsel «Radien i knekkpunkt 5 er for stor for strekket - kurven er kortet inn», og merknaden «Radius 7.0 m er under minstekravet på 10 m». Ved 0,15 m mellom klikkene blir R = 3,66 m; ved eksakt samme piksel blir geometrien uskadd, men det ekstra punktet blir liggende i prosjektet.

**Følge:** Et knekkpunkt brukeren aldri ba om blir liggende i prosjektfila og i alle eksporter. Masser på testvegen: skjæring +1,9 m3, bærelag +5,6 m3, fylling +0,8 m3, og 5 nye merknader som ikke har noen reell årsak. Fordi punktet ligger oppå det forrige, er det nesten umulig å se og treffe i kartet for å slette det.

**Bevis:** kart.on('dblclick', () => { if (this.modus === 'tegn') this.settModus('rediger'); }); // de to click-hendelsene har alt kjørt P.ip.push

### Feilet IndexedDB-skriving havner i localStorage, men leses aldri derfra igjen – brukeren får «Lagret» og mister dagen

`public/js/lager.js:104` · etterprøvd

**Hva:** lagre() fanger feil fra _kjør('readwrite') og skriver til localStorage i stedet. Men flagget _reserve settes bare inne i db() (linje 47), altså kun når selve ÅPNINGEN feiler. Etter en feilet skriving står _reserve fortsatt false, så hent() og liste() går videre til IndexedDB – som er frisk og leverer den GAMLE raden. Reserven blir skrivbar, men aldri lesbar. lagre() kaster heller ikke videre, så app.lagre() (app.js:1455-1458) går rett i suksessgrenen, setter _lagretSom og skriver «Lagret «X»» i statuslinjen.

**Når:** Mandag lagres «Skogsveg Ydestad» normalt. Tirsdag avbrytes skrivetransaksjonen (QuotaExceededError fordi terrengflis-hurtiglageret har fylt opprinnelseskvoten, tabellen ryddes av nettleseren under lagringspress, eller 8-sekundersgrensen på linje 59 løper ut). Tirsdagens arbeid går til localStorage. Onsdag åpner brukeren prosjektet: hent() leser IndexedDB og gir mandagsversjonen tilbake.

**Følge:** En hel dags arbeid – lengdeprofil, fjellobservasjoner, tverrfall – forsvinner stille, samtidig som programmet har sagt «Lagret» og slukket det gule ulagret-merket. Verdiene ligger fortsatt i localStorage, men ingen kodevei leser dem så lenge IndexedDB svarer.

**Bevis:** Prøveskript: samme database, put kaster QuotaExceededError ved andre lagring. Lager.lagre kastet ikke ('NEI - den lot som ingenting'), _reserve = false, localStorage fikk tirsdagsversjonen, men hent() ga merke='MANDAG' med 1 vip-punkt i stedet for 2, og liste() viste bare mandagsraden.

### Prosjekter lagret i reservemodus kommer aldri fram igjen

`public/js/lager.js:80` · etterprøvd

**Hva:** liste() og hent() bruker localStorage bare i catch-grenen. Så snart IndexedDB svarer normalt igjen, blir hele reservelageret usynlig. Det finnes ingen sammenslåing av de to kildene og ingen overføring tilbake.

**Når:** Økt 1: alt virker, «Gammel veg» lagres i IndexedDB. Økt 2: databasen er låst av et annet vindu midt i en oppgradering (onblocked, linje 42) eller åpningen bruker mer enn TIDSGRENSE = 8000 ms. _reserve blir true for hele økten. «Gammel veg» er usynlig i Åpne-dialogen, og brukeren tegner og lagrer «Ny veg» – som havner i localStorage. Økt 3: databasen er ledig igjen. liste() viser bare ['Gammel veg']; hent('Ny veg') gir undefined.

**Følge:** Hele torsdagens prosjekt finnes fysisk på maskinen, men verken Åpne-dialogen, Eksporter eller Eksporter alle får tak i det. For brukeren er det tapt. I tillegg ser vedkommende i økt 2 et tomt lager og kan tro at alle tidligere prosjekter er slettet.

**Bevis:** Prøveskript med tre økter mot samme localStorage og samme IndexedDB-innhold: økt 2 liste() = [], etter lagring = ['Ny veg - hele torsdagen']; økt 3 liste() = ['Gammel veg'] og hent('Ny veg - hele torsdagen') = undefined.

### saFrø() tolker en lesefeil som «tomt lager» og skriver demoprosjektet over brukerens versjon

`public/js/lager.js:115` · etterprøvd

**Hva:** saFrø() gjør `const nå = await this.liste(); if (nå.length) return nå;` og henter så demofilen og kaller lagre(). Men liste() returnerer en TOM LISTE både når lageret faktisk er tomt og når lesingen feilet (catch-grenen på linje 83 gir _reserveRader(), som er tom hvis reserven ikke er tatt i bruk). Skrivingen etterpå kan godt lykkes selv om lesingen røk – og da erstattes en eksisterende rad med samme navn.

**Når:** Brukeren har åpnet «Ydestad demo», flyttet linjen og lagt inn fjellpunkt. Ved neste oppstart bruker getAll() mer enn 8 sekunder (stor database, kald disk, maskinen opptatt), så _kjør avviser på linje 59. liste() gir []. saFrø() henter demo/ydestad-demo.json og kaller lagre('Ydestad demo', fabrikkdemoen). Databasen har varmet opp, put lykkes, og brukerens rad er erstattet.

**Følge:** Brukerens redigerte prosjekt er permanent byttet ut med fabrikkdemoen. Samme mekanisme rammer importer(): når hent() feiler, returnerer den null, kollisjonssjekken på linje 169 finner ingen kollisjon, og lagre() på linje 171 overskriver et eksisterende prosjekt med samme navn i stedet for å lage «(2)».

**Bevis:** Prøveskript: getAll kaster 'tidsgrense' mens put virker. Før: 'Ydestad demo' hadde merke='BRUKEREN HAR ENDRET DENNE' og 1 vip-punkt. Etter saFrø-forløpet: merke='FABRIKKDEMO', 0 vip-punkt.

### «Et halvmetersbom flytter X m³» viser hele spennet over 1,0 m – omtrent dobbelt så mye som teksten sier

`public/js/ui-rapport.js:195` · etterprøvd

**Hva:** Linjen skriver u.spenn, som app.js:479 regner som |fjellGrunnere − fjellDypere|, altså forskjellen mellom fjell 0,5 m høyere OG 0,5 m dypere – et spenn på 1,0 meter. Overskriften sier «Et halvmetersbom», entall. Et faktisk bom på en halv meter er |fjellGrunnere − fjellNa| eller |fjellNa − fjellDypere|, altså om lag halvparten. Samme feil grunnlag brukes i prosentlinjen på linje 198 (andel = spenn / skjaeringTotalt) og i terskelen andel > 15 som utløser rødt varsel.

**Når:** Rett veg 400 m, standarddybde til fjell 1,5 m. Rapporten skriver «Et halvmetersbom flytter 1 031 m³» og «Det er 29 % av hele skjæringsvolumet». De tre linjene rett over viser 2 199 / 1 640 / 1 168 m³, så et halvmetersbom flytter i virkeligheten 559 m³ oppover eller 472 m³ nedover.

**Følge:** Overdriver den viktigste usikkerheten i anbudet med faktor 1,85 (1 031 mot 559 m³). Prosentlinjen sier 29 % der det riktige er 16 %. Det er nettopp dette tallet et anleggsfirma bruker til å sette risikopåslag på sprengningen, og boksens egen hjelpetekst peker på det som «den største usikkerheten i hele regnestykket».

**Bevis:** Prøveskript som kjører beregnMasser tre ganger med standarddybde 1,0 / 1,5 / 2,0: grunnere 2199, na 1640, dypere 1168 m³. spenn = 1031. |grunnere − na| = 559, |na − dypere| = 472. Forholdet spenn / faktisk halvmetersbom = 1,85.

### Åpner du prosjektet som allerede står åpent, kastes ulagrede endringer uten spørsmål

`public/js/app.js:1583` · etterprøvd

**Hva:** Vakten i apne() er «this.autolagringPause === 0 && navn !== (this.P && this.P.navn) && this.harUlagret()». Klikker man på prosjektet som alt er åpent i «Åpne»-listen, er navn === this.P.navn, og hele blokken hoppes over: verken autolagre() eller bekreft() kjøres. Rett etter kommer tomPaneler() og this.P = ...(hentet fra lageret).

**Når:** Bruker har «Vei A» åpen, flytter et knekkpunkt (skjæring 4140 → 16332 m³) og klikker «Åpne» for å se over listen, og klikker der på «Vei A» – for eksempel fordi han vil se datoen eller tror han velger et annet prosjekt. Autolagringens 2-sekundersklokke har ikke ringt ennå.

**Følge:** Skjæringen er tilbake på 4140 m³, ingenting ble lagret, fila er uendret og brukeren fikk verken spørsmål eller melding. Alt arbeid siden forrige lagring er borte. Åpner man et ANNET prosjekt, blir man derimot både autolagret og spurt – vernet finnes altså, det slås bare av i akkurat dette tilfellet.

**Bevis:** Kjørt mot ekte app.js (p8): «skjæring før: 16332 · etter: 4140 / lagret underveis: [] / fila er uendret: true». Til sammenlikning ga apne('Vei B') LAGERLOGG ['Vei A'].

### «Fyll inn» setter veghøyden til 0 moh der terrengdata mangler

`public/js/app.js:1386` · etterprøvd

**Hva:** fyllHoyder() skriver «z: isFinite(z) ? +z.toFixed(3) : 0» både på linje 1386 og 1392. Der terrengProfil.z er NaN – altså der en flis ikke kom fra Kartverket, eller der DTM-en ikke har verdier – blir veghøyden 0 meter over havet i stedet for at punktet utelates. leggTilHoyde() på linje 1360 gjør det motsatte og riktige i samme situasjon («if (!isFinite(hoyde)) return»), så filen er uenig med seg selv.

**Når:** Traseen ligger på ca. 300 moh og én terrengflis kom ikke ned (statuslinjen sa «⚠ Fikk ikke 1 av N terrengfliser», men er senere overskrevet av «Beregnet 80 profiler …»). Bruker klikker «Fyll inn» med 20 m steg i høydetabellen.

**Følge:** 2 av 21 høyder blir 0 moh. Veglinjen stuper 300 m ned i et par profiler, og sprengningen går fra 3371 m³ til 110442 m³ – 33 ganger for mye. Fyllingen faller fra 6619 til 924 m³. Ingen melding sier at høyder ble satt til null; statuslinjen viser bare «Beregnet 80 profiler på 155 ms». Ved 250 kr/m³ sprengning er det ca. 27 mill. kr i stedet for 0,8 mill.

**Bevis:** Kjørt mot ekte app.js (p9/p10): «2 av 21 høyder ble 0 moh · høyder: 305 307 309 312 314 316 318 321 323 0 0 303 …», skjaering 3928 → 111419 (x28,4), skjaeringFjell 3371 → 110442 (x32,8).

### justerProfilTilLengde deler på null når to høyder har samme profilnummer – endepunktet blir uendelig, og volumene blir stille feil

`public/js/app.js:317` · etterprøvd

**Hva:** g = (siste.z - V[V.length-2].z) / (siste.s - V[V.length-2].s) uten vakt mot at nevneren er null. Høydetabellens profilnummerfelt (linje 1309-1314) klemmer bare til [0, lengde] og har ingen kontroll mot duplikater, så to rader kan lett få samme s. Deretter blir det pårørte endepunktet «z: siste.z + g * (L - siste.s)» = ±Infinity (eller NaN når høydene er like).

**Når:** Innmålte høyder er lagt inn fram til profil 340 på en 394,8 m lang veg. Bruker retter profilnummeret i siste rad fra 340 til 320, der det alt står en høyde. profilEndret → planlegg → oppdater → justerProfilTilLengde legger til et endepunkt med z = Infinity.

**Følge:** Alle massepostene kommer ut som endelige, troverdige tall, men er feil: skjæring 30525 mot 32075 m³ (-1550 m³, -5 %), sprengning 29512 mot 31044 m³ (-1532 m³), fylling 1651 mot 1511 m³ (+9 %). Ingen merknad nevner høyden, og statuslinjen sier bare «Beregnet 80 profiler på 154 ms». De siste 55 m av veien er regnet på en vertikalgeometri som ikke finnes.

**Bevis:** Kjørt mot ekte app.js (p10/p12): «B) to rader på profil 320 – slik programmet gjør | endepunkt z = Infinity | skjæring 30525 | fjell 29512» mot «C) samme punkter, fornuftig endepunkt | z = 310.55 | skjæring 32075 | fjell 31044». «fikk brukeren noe varsel om at endepunktet var uendelig? NEI».

### Angre-historikken dekker bare kartet – alt i sidepanelene ligger utenfor

`public/js/app.js:1660` · etterprøvd

**Hva:** merk() kalles bare fra kartet (ui-kart.js 159/180/184/227/235/241) og fra rettOpp/balanser/optimaliser (637/757/798). Alt annet endrer this.P uten å registrere noe: skjemaTilMal via change-lytteren på linje 1660 (hele mal, faktorer, fjell, profilAvstand, bakkekorreksjon), fjellstrekninger (1119-1122), sletting av fjellobservasjon (1141), velgVeiklasse (1188-1197), punkthøyder (1236-1269), hele høydetabellen (1290-1412), linjetabellen (1424-1425), «Nullstill mal» (1662), lås alle/ingen (1679-1680), «Tøm tabellen» (1682-1687), h_retteLinjer (1699), ny strekning (1705). Kommentaren på linje 17-24 lover at «man kommer helt tilbake – ikke bare halvveis».

**Når:** a) Bruker limer inn 20 innmålte høyder, klikker «Tøm tabellen» ved en feil og bekrefter. b) Bruker sletter en fjellobservasjon fra Grunn-fanen. c) Bruker taster 15 i stedet for 1.5 i skjæringshelning løsmasse og trykker Ctrl+Z.

**Følge:** a) Ctrl+Z svarer «Ingenting å angre» – de 20 innmålte høydene er borte for godt. b) Sprengningen går fra 2971 til 3691 m³ (+720 m³, +24 %) og Ctrl+Z svarer «Ingenting å angre»; å LEGGE TIL en observasjon er derimot angrbart, så det er tilfeldig hva som kan tas tilbake. c) Skrivefeilen ga 7226 → 8242 m³ skjæring; ett Ctrl+Z tar bort både skrivefeilen og et helt urelatert knekkpunkt, mens knappens hjelpetekst bare sier «Angre «nytt knekkpunkt»».

**Bevis:** Kjørt mot ekte app.js (p7): «innmålte høyder tilbake: 0 av 20», «sprengning med observasjonen 2971 → 3691 (+720) · etter Ctrl+Z: Ingenting å angre · observasjoner: 0». p1 pkt. 4: «angre-knappen lover: Angre «nytt knekkpunkt» → etter Angre: skjaeringLosmasse = 1.5, antall knekkpunkt = 3 (var 4)».

### Tverrfallsfeltet har max="0.3" på et felt som er i prosent – pil ned setter tverrfallet til 0

`public/index.html:177` · etterprøvd

**Hva:** Feltet er i prosent: malTilSkjema skriver (m.tverrfall*100).toFixed(1) inn (app.js:1026) og skjemaTilMal deler på 100 igjen (app.js:1078). Men max="0.3" er hentet fra MALGRENSER.tverrfall = [0, 0.3] i masser.js:693, som er FORHOLDET (0–30 %). Startverdien 5 er derfor utenfor eget maks (validity.rangeOverflow = true fra første sekund). Når verdien ligger over max, klemmer nettleseren stepDown ned til nærmeste lovlige trinn: 0. stepUp blir en no-op, så feltet kan i praksis ikke justeres oppover med spinneren i det hele tatt.

**Når:** Brukeren står i Vegmal-fanen med standard 5,0 % tverrfall, klikker i feltet og trykker pil ned (eller på spinnerens nedpil, eller ruller musehjulet over feltet mens det har fokus) for å prøve 4,5 %. Feltet viser 0. change-hendelsen går til skjemaTilMal, som skriver mal.tverrfall = 0. Ingen advarsel kommer, fordi 0 ligger innenfor MALGRENSER [0, 0.3], og rettInngang har derfor ingenting å klage på. Verdien blir autolagret og følger med i PDF-rapporten.

**Følge:** Kjørt gjennom beregnMasser på 600 m veg med StandardMal (4,5 m bredde, 5 m profilavstand): ren skjæring 7599,7 → 7308,0 m³ (−291,7, −3,8 %), hvorav fjell 4524,6 → 4293,0 m³ (−231,5, −5,1 %). Ren fylling 5674,2 → 6075,0 m³ (+400,8, +7,1 %). I sidebratt terreng (1:5) faller fjellvolumet 234,9 → 154,8 m³, altså −34,1 % – og fjell er den dyre posten. Null merknader i alle tre tilfellene. Rett max er 30 (eller det taket firmaet vil ha), ikke 0.3.

**Bevis:** I nettleseren på http://localhost:5178: el.validity.rangeOverflow = true; el.value='5.0'; el.stepUp() → '5.0' (ingen endring); el.value='5.0'; el.stepDown() → '0'. Med change-hendelse: mal.tverrfall 0.05 → 0. Volumtallene fra eget skript mot masser.js/beregnMasser. Samme test over alle number-felt viser at m_tverrfall er det eneste med rangeOverflow – alle andre HTML-grenser stemmer eksakt med MALGRENSER/FAKTORGRENSER.

### K-feltet og «Rette linjer» skriver k på ALLE knekkpunkt, også de låste – veglinjen slutter å gå gjennom låste høyder

`public/js/app.js:1654` · etterprøvd

**Hva:** id('kVerdi').onchange gjør this.P.vip.forEach(v => v.k = k) uten å hoppe over v.laast, og id('h_retteLinjer').onchange (app.js:1699-1703) gjør nøyaktig det samme. Alle andre veier inn holder invarianten: leggTilHoyde setter k:0 (app.js:1367), limInnHoyder setter k:0 (app.js:1407), settPunkthoyde('senter') setter k:0 (app.js:1243), laas.onchange setter k=0 ved låsing (app.js:1323), PdfUI.leggInn setter k:0 (ui-pdf.js:199), og fyllHoyder bevarer låste punkt urørt (app.js:1384). index.html:125-126 lover brukeren i klartekst at «Veglinjen går nøyaktig gjennom en låst høyde, uten vertikalkurve».

**Når:** Brukeren limer inn høydetabellen fra veiplanen med «Legg inn som låste høyder» – alle punkt får k=0 og laast=true. Deretter skriver han en K-verdi i verktøylinja over lengdeprofilen for å se hvordan kurvene blir, eller hekter «Rette linjer mellom høydene» av og på. Fra da av har hvert eneste låste planpunkt en vertikalkurve, og linjen skjærer forbi høyden byggherren har bestemt.

**Følge:** Målt på tre låste høyder 0/100/200 med knekk fra +5 % til −3 %: K=1 gir 0,080 m avvik fra den låste høyden, K=5 gir 0,400 m, K=20 (feltets max) gir 1,600 m. Avviket forplanter seg rett inn i skjæring/fylling: 0,40 m på 600 m veg med 4,5 m bredde og 1:1,5 skråninger er grovt regnet i størrelsesorden 1400 m³ forskjøvet mellom skjæring og fylling. Feilen overlever «Foreslå profil» og «Optimaliser», fordi lasteHoyder() (app.js:1275) sender k videre til foreslaProfil.

**Bevis:** I den kjørende appen: tre vip-punkt satt til laast=true, k=0; deretter kVerdi.value='5' + change → alle tre står med k=5, laast=true. Av/på på h_retteLinjer beholder k=5. Avviksmålingene er kjørt mot Vertikalprofil.hoyde() i vertikalprofil.js.

### PDF-avlesningen tegnes på et lerret på 300 × 150 px, fordi hele PDF-dialogen mangler CSS

`public/index.html:316` · etterprøvd

**Hva:** #pdflerret har verken width/height-attributt eller noen CSS-regel. Regelen i app.css:301-304 som gir lerret størrelse og display:block lister bare #lengdeprofil og #tverrprofil. Klassene .pdfboks, .pdfinnhold, .pdfsteg, .pdfverktoy, .pdfstatus og .skilje finnes i markupen (index.html:299-317) men har ingen regel i app.css i det hele tatt. Lerretet faller derfor tilbake på nettleserens standard for canvas: display:inline, 300 × 150 CSS-piksler. tilpassVisning() i ui-pdf.js:95 har fallback-verdiene 900 og 460, så koden regner selv med et lerret som er tre ganger så bredt.

**Når:** Brukeren har lengdeprofilen som PDF, åpner «Åpne PDF…», og skal peke ut to punkt han vet profilnummer og høyde på. Hele tegningen – som gjerne er 900 × 300 PDF-enheter – klemmes inn i 280 × 130 px. Det finnes ingen zoom i dialogen. Ett klikk bommer typisk noen piksler på et rutenettkryss som er 1–2 px stort på skjermen.

**Følge:** Simulert på en tegning der profil 0–600 m og kote 200–260 moh: ved 300×150 er 1 skjermpiksel = 3,21 PDF-enheter, mot 1,02 ved de 900×460 koden forutsetter – 3,1 ganger grovere. En bom på 2 px på hvert referansepunkt gir opptil 1,12 m høydefeil på de avleste høydene (mot 0,37 m ved tiltenkt størrelse), og forskyver profilspennet fra 0–600 til −4,3–604,3. Til sammenligning flytter en jevn høydefeil på 1 m over 600 m veg grovt regnet 3600 m³ mellom skjæring og fylling. Klikk-til-koordinat-regnestykket i ui-pdf.js er i seg selv riktig (fraSkjerm bruker getBoundingClientRect konsekvent) – det er bare oppløsningen som er borte. Som bieffekt er de to .skilje-skillene i verktøylinja 0 px brede og dermed usynlige, og .pdfverktoy er display:block i stedet for en flex-rad.

**Bevis:** Målt i nettleseren med dialogen midlertidig synlig: #pdflerret clientWidth=300, clientHeight=150, getComputedStyle display='inline', ingen width/height-attributt; .dialogboks er 560 px. Presisjonstallene fra eget skript som kjører PdfImport.tilHoyder med tilpassVisning/tilSkjerm/fraSkjerm kopiert fra ui-pdf.js, for B/H = 300/150 mot 900/460.

### De tre sone-tjenestene dekker ikke samme område – valg av sone avgjør om det finnes data

`lib/hoydedata.js:18` · etterprøvd

**Hva:** DTM_TJENESTE/DOM_TJENESTE behandler 25832, 25833 og 25835 som likeverdige, og kommentaren i public/js/geo.js sier uttrykkelig at «Kartverket leverer hele landet i alle tre sonene» og at sonevalget «avgjør ikke om det finnes terrengdata». Det stemmer ikke. Hver ImageServer har sin egen rasterutstrekning, og utenfor den svarer den 0.00 m i stedet for en feil. Kombinert med at 0 aldri blir NaN (se forrige funn), betyr sonevalget i praksis om terrenget finnes eller ikke.

**Når:** Samme punkt, 69,59529 N 21,70496 E: EPSG:25833 gir 696,07 m og 0,0 % nuller i flisen. EPSG:25835 – som Geo.sone faktisk velger her – gir 0,00 m i punktet og 8,6 % nuller i flisen. EPSG:25832 gir 0,00 m og 100 % nuller i hele flisen, altså ingen dekning i det hele tatt så langt nord.

**Følge:** En trasé i Troms som ligger på feil side av utstrekningsgrensen til sone 35 får terreng på kote 0 for hele eller deler av strekningen, mens nøyaktig samme punkt hadde gitt riktig høyde om programmet hadde spurt sone 33. Feilen følger fylket, ikke prosjektet, så den treffer alltid de samme kundene. hentFlis kontrollerer bare flisstørrelsen mot px – aldri om tjenesten faktisk har data i det forespurte området.

**Bevis:** Målt mot alle tre tjenestene i samme punkt i samme kjøring, med Kartverket sitt punkt-API (696,07 m, datakilde dtm1) som fasit.

### Disk-mellomlageret leveres uten å sjekke versjon, lengde eller alder – FLIS_VERSJON når aldri serveren

`lib/hoydedata.js:235` · etterprøvd

**Hva:** Lesingen fra cache godtar enhver fil som er lengre enn 16 byte og starter med «MKT1». Innholdet valideres ikke mot px, filstørrelsen kontrolleres ikke mot 16 + px*px*2 (eller *4), og filnavnet (sr_resm_tx_ty[_dom].bin) inneholder ingen formatversjon. FLIS_VERSJON i terreng.js sendes som &v= i URL-en, men verken api/dtm/flis.js eller hentFlis leser den – den busher bare nettleseren og Vercel-kanten, aldri cache/-mappen.

**Når:** Utvikleren retter feilen over (0 -> NaN) og øker FLIS_VERSJON fra 3 til 4. Nettleseren og kantnettet henter på nytt. Den lokale serveren gjør det ikke: de 25 flisene som allerede ligger i C:/Users/thoma/massekalk/cache/ blir servert videre med det gamle, gale innholdet – med Cache-Control: immutable, max-age=31536000. Kommentaren i terreng.js linje 17-27 beskriver nøyaktig denne feilen («rakk en feil versjon å bli bufret i et helt år»), men vernet er lagt på det ene laget som ikke trengte det.

**Følge:** Enhver retting i pakking, nodata-håndtering eller TIFF-lesing får ingen virkning for områder brukeren allerede har regnet på – altså nettopp de prosjektene som skal prises på nytt. Testet: en plantet MKT1-fil med bare nuller ble levert som sannhet av hentFlis (maks høyde 0 der fasit er 276,88 m). En avkortet fil på 1016 byte i stedet for 131 088 ble også godtatt og sendt med 200 OK; klienten får da en Int16Array med 500 av 65 536 verdier og resten blir stille undefined -> NaN.

**Bevis:** Kjørt mot en isolert kopi av modulen i temp-mappe (prosjektets egen cache ble ikke rørt).

### Massebalansen kontrolleres bare mot en algebraisk identitet — påstanden kan aldri feile

`test/selftest.js:751` · etterprøvd

**Hva:** Seksjon 5 kontrollerer at «fylling går opp» med b.fyllFraLos + b.fyllFraFjell + b.manglerFylling === b.fyllingBehov (linje 751) og tilsvarende for bærelag (linje 752). Men i masser.js:883-884 er manglerFylling DEFINERT som fyllingBehov - fyllFraLos - fyllFraFjell, og manglerBaerelag som baerelagBehov - baerelagFraFjell. Summen er derfor en identitet: den er sann uansett hvilke tall gjenbruksrutinen kommer fram til. Det samme gjelder linje 753-754 «ingen negative poster»: alle postene er bygd med Math.min mot behovet, så de kan strukturelt ikke bli negative så lenge inngangsvakten klemmer negative faktorer. Ingen påstand noe sted sammenligner en balansepost mot et forventet tall.

**Når:** Jeg halverte fyllFraLos i masser.js:878 (const fyllFraLos = Math.min(brukbarLos, fyllingBehov) * 0.5) — altså feilberegnet hvor mye løsmasse fra skjæringen som kan gjenbrukes i fyllingen. Selftest: 254 tester ok, 0 feil, exit 0. På en 400 m veg i sidebratt terreng (terreng z=110-0.05x, veg i kote 100, standardmal, fjelldybde 20 m) endret dette manglerFylling fra 3742,1 m³ til 8213,7 m³ og overskuddLos fra 0 til 4471,6 m³. Selftestens egen påstand «fylling går opp» ga true både før og etter.

**Følge:** manglerFylling er tallet firmaet priser som innkjøpt/tilkjørt fyllmasse. En feil på 4472 m³ på en 400 m veg er mer enn en dobling av posten. Til ca. 150 kr/m³ innkjørt masse er det rundt 670 000 kr på ett kort anlegg. Testen som ser ut til å vokte balansen kan ikke oppdage det.

**Bevis:** Mutasjon «balanse: fyllFraLos halvert» → SLAPP (exit 0, 0 feil). Sammenligning kjørt med scratchpad/balansekonsekvens.js mot både original og mutert kopi: ORIGINAL {"fyllFraLos":8943.2,"manglerFylling":3742.1,"overskuddLos":0}; MUTERT {"fyllFraLos":4471.6,"manglerFylling":8213.7,"overskuddLos":4471.6}; selftest-påstanden «fylling går opp» = true i begge.

### Ingen prøve har skjæring og fylling samtidig — hele gjenbrukslogikken er aldri i drift

`test/selftest.js:740` · etterprøvd

**Hva:** De tre balansescenariene i seksjon 5 er «ren skjæring i fjell», «ren skjæring i løsmasse» og «ren fylling», alle på helt flatt terreng (z: () => 100). I alle tre er fyllFraLos = 0,00 og fyllFraFjell = 0,00 — det finnes ikke ett eneste tilfelle i selftesten der masse fra en skjæring faktisk brukes i en fylling. Det er nettopp den situasjonen hele massebalansen finnes for, og det som skiller en skogsbilveg fra en teoretisk øvelse.

**Når:** Kjørte de tre scenariene fra selftest.js:740-755 og skrev ut balansefeltene: alle tre gir fyllFraLos=0,00 fyllFraFjell=0,00. Bygde deretter et blandet snitt (rett linje 400 m, terreng z=110-0,05x, veg konstant i kote 100, fjelldybde 20 m) der veien skjærer i første halvdel og fyller i andre: der blir fyllFraLos = 8943,2 m³ og manglerFylling = 3742,1 m³. Et slikt snitt finnes ikke i noen test.

**Følge:** Rekkefølgen løsmasse-før-fjell, resten av fjellet til bærelag, og fordelingen mellom overskudd og mangel er den delen av programmet som avgjør om jobben skal prises med masseimport eller massedeponi. Ingen av delene blir utøvd. Det er også grunnen til at mutasjonen i funn 1 slipper gjennom.

**Bevis:** Utskrift fra kjøring: «ren skjaering i fjell fyllingBehov= 0.00 fyllFraLos= 0.00 fyllFraFjell= 0.00»; «ren skjaering i losmasse fyllingBehov= 0.00 …»; «ren fylling fyllingBehov= 6854.69 fyllFraLos= 0.00 fyllFraFjell= 0.00 manglerFylling= 6854.69».

### Sju av elleve merknadstyper blir aldri kontrollert — advarslene kan slås helt av

`test/selftest.js:346` · etterprøvd

**Hva:** masser.js produserer merknader av typene inngang, linje, data, avkortet, vertikalkurve, stigning, kurvatur, radius, fylling, skjaering, geometri og utslag. Selftesten kontrollerer bare fem av dem (inngang linje 629, linje 670, data 685, avkortet 887, vertikalkurve 444). Nettlesertesten kontrollerer ingen. Typene stigning (for bratt), kurvatur (radius under minstekrav), fylling (for høy fylling), skjaering (for dyp skjæring), utslag (skråningen stikker for langt ut), radius (rådet om hvilken radius som ville holdt) og geometri («Skråningen nådde ikke terrenget innenfor søkebredden») er helt uten dekning.

**Når:** Seks mutasjoner i masser.js: merknadsblokkene for stigning (linje 942), kurvatur (952), fylling (962), skjaering (968) og utslag (972) satt til «if (false)», og raad-typen radius omdøpt. Selftest etter hver: 254 tester ok, 0 feil. Deretter kontrollerte jeg at merknadene faktisk oppstår i praksis: krapp kurve R=8, 30 % stigning, sidebratt li (z=100+0,6y), maksFyllingshoyde 2, maksUtslag 4 → {stigning:13, utslag:11, geometri:6, fylling:10, kurvatur:1}. De fyres altså i høyeste grad — de er bare ikke kontrollert.

**Følge:** Dette er linjene entreprenøren leser før han priser. «Skråningen nådde ikke terrenget innenfor søkebredden» er den farligste: da er tverrsnittet klippet ved søkebredden og volumet for lavt, og uten merknaden ser tallet helt ferdig ut. I prøven over var utslaget 37-43 m mot en søkebredde på 45 m — akkurat der klippingen begynner å bite.

**Bevis:** Mutasjonsrunde 4: alle seks rapportert «SLAPP». Faktisk fyring bekreftet med kjøring som ga «utslag | Skråningen stikker 37.4 m ut fra vegkant, grensen er 4 m» og «geometri | Skraningen nadde ikke terrenget innenfor søkebredden». Grep viser at 'geometri' (masser.js:922) og 'utslag' ikke forekommer i noen av testfilene.

### Seksjon 8 svelger enhver feil og rapporterer «0 feil», exit 0

`test/selftest.js:1097` · etterprøvd

**Hva:** Hele kontrollen mot Kartverket sitt punkt-API ligger i try/catch der catch bare skriver «HOPPET OVER (ingen nettforbindelse?)». Fordi det er den ENESTE påstanden som knytter terrengmodellen til en uavhengig fasit, betyr det at den viktigste kontrollen i hele testsuiten er stilltiende valgfri. Catch-en skiller heller ikke mellom manglende nett og en virkelig feil i koden — begge deler ser like ut.

**Når:** To forsøk i sandkassen. (1) Byttet URL-en på linje 1085 til en vert som ikke finnes: utskrift «HOPPET OVER (ingen nettforbindelse?): fetch failed», deretter «253 tester ok, 0 feil», exit 0. (2) La inn en throw øverst i hentFlis i lib/hoydedata.js — altså en ekte kodefeil i flishentingen: utskrift «HOPPET OVER (ingen nettforbindelse?): tenkt feil i flishenting», «253 tester ok, 0 feil», exit 0.

**Følge:** En knekt terrengpipeline gir grønn test og exit 0. Eneste signal er at tallet gikk fra 254 til 253, og ingenting sammenligner det mot noe. Kjører man `npm test` i en byggekjede eller på en maskin uten nett, blir den eneste fasitkontrollen borte uten at noen får beskjed.

**Bevis:** Kjøring 1: «HOPPET OVER (ingen nettforbindelse?): fetch failed» / «253 tester ok, 0 feil» / EXIT=0. Kjøring 2 med throw i hentFlis: «HOPPET OVER (ingen nettforbindelse?): tenkt feil i flishenting» / «253 tester ok, 0 feil» / EXIT=0.

### Kartverket-kontrollen leser fra disk-cache — GeoTIFF-tolkningen er bare testet når cachen er kald

`test/selftest.js:1074` · etterprøvd

**Hva:** Seksjon 8 kaller H.hentFlis(...), og hentFlis (lib/hoydedata.js:232-237) returnerer den ferdigpakkede .bin-fila fra cache-mappa hvis den finnes, uten å røre nedlasting eller lesGeoTiff. Fila 25833_1m_171_25344.bin ligger i C:\Users\thoma\massekalk\cache. Om testen faktisk kontrollerer kjeden GeoTIFF → flis → høyde, avhenger dermed av om en fil tilfeldigvis ligger på disk. På utviklingsmaskinen (184 fliser i cache) gjør den det ikke.

**Når:** Sabotert lesGeoTiff i lib/hoydedata.js ved å legge 5 m til alle høyder rett før return-blokken (linje ~133). Med flisa i cache: «ok terrenghøydene stemmer med Kartverket (< 1 cm)», 254 tester ok, 0 feil. Med samme sabotasje og flisa slettet fra cache: «30 kontrollpunkt, snitt 5.0000 m, største 5.0000 m», «FEIL terrenghøydene stemmer med Kartverket», 253 ok, 1 feil.

**Følge:** En systematisk 5 m høydefeil i GeoTIFF-tolkningen er usynlig for testen på maskinen der den faktisk kjøres. 5 m feil i terrengmodellen på en 4,5 m bred veg er i størrelsesorden 40-60 m³ per løpemeter i skjæring eller fylling. Resultatet er ikke deterministisk: samme kode gir grønt eller rødt avhengig av diskinnhold.

**Bevis:** Varm cache: «254 tester ok, 0 feil» med sabotert lesGeoTiff. Kald cache, samme kode: «30 kontrollpunkt, snitt 5.0000 m, største 5.0000 m» og «253 tester ok, 1 feil». cache/ står i .gitignore, så tilstanden varierer per maskin.

### Eksport til KOF, LandXML, SOSI og DXF har null dekning i begge testene

`public/js/nettlesertest.js:321` · etterprøvd

**Hva:** public/js/eksport.js eksporterer punkter, kof, landxml, sosi, dxf, tekst og xml. Ingen av dem forekommer i selftest.js eller nettlesertest.js. Nettlesertesten kaller bare Rapport.eksportStikning(), Rapport.eksportMasser() og Rapport.eksportGeojson() (linje 321), som ligger i ui-rapport.js. De fire formatene går gjennom Rapport.eksporter(format) i ui-rapport.js:553-570, koblet til fire knapper i app.js:1711-1712. I tillegg pakker eksporter() kallet i try/catch som gjør enhver feil om til statuslinjen «Eksporten feilet: …» — så en ødelagt eksportør feiler stille.

**Når:** Grep på tvers av begge testfilene: kof=0, landxml=0, sosi=0, dxf=0, «Eksport»=0, omfang=0, lesFil=0, pakkUt=0. Brukeren trykker «Eksporter KOF» for å gi maskinføreren stikningsdata; hvis koordinatrekkefølgen (nord/øst mot øst/nord), punktnummereringen eller høydereferansen er feil, finnes det ingen test som fanger det.

**Følge:** KOF og SOSI er filene som går rett inn i maskinstyringen på gravemaskinen. En byttet koordinatakse eller en feil i punktkoding gir en veg som stikkes ut på feil sted i terrenget. Ingen automatisk kontroll finnes, og programmet melder feil bare som en statuslinje.

**Bevis:** Grep: `kof|landxml|sosi|dxf|Eksport\.` gir 0 treff i test/selftest.js og public/js/nettlesertest.js, men treff i public/js/ui-rapport.js:559-562 og public/js/app.js:1711-1712. nettlesertest.js:321 kaller bare de tre CSV/GeoJSON-eksportene.

### Veiklasse 5 sin veibredde er aldri kontrollert, og kommentaren i testen oppgir feil verdi

`test/selftest.js:777` · etterprøvd

**Hva:** Linje 777 sier «const mal = M.StandardMal; // klasse 5, veibredde 4,5 m», og hele seksjon 6 sine normalkontroller for klasse 5 kjøres mot StandardMal. Men Veiklasser.k5.vegbredde er 4,0 m (veiklasser.js:100), ikke 4,5. StandardMal.vegbredde er 4,5 mens StandardMal.veiklasse er 'k5' (masser.js:23). De to tabellene er identiske på alle andre felles felt — vegbredde er det eneste avviket, og det er nettopp det ingen test kontrollerer. Selftesten kontrollerer vegbredde for k2 (linje 810) og k3 (linje 804), men aldri for k5.

**Når:** Endret Veiklasser.k5.vegbredde fra 4.0 til 3.0 i veiklasser.js:100. Selftest: 254 tester ok, 0 feil, exit 0. Diffet også StandardMal mot Veiklasser.k5 i node: eneste ulike felt er «vegbredde StandardMal=4.5 k5=4».

**Følge:** Et nytt prosjekt får mal = Object.assign({}, StandardMal) (app.js:97) med vegbredde 4,5 m, samtidig som malen sier veiklasse 'k5'. Velger brukeren k5 fra listen, blir bredden 4,0 m. Samme prosjekt, samme klassemerkelapp, 0,5 m forskjell i vegbredde — det er 11 % av vegkroppen. På 1 km blir det 500 m² ekstra bære- og slitelag pluss tilsvarende bredere skjærings- og fyllingsfot. Ingen test sammenligner de to.

**Bevis:** Mutasjon k5.vegbredde 4.0 → 3.0 i sandkassen: «254 tester ok, 0 feil». Node-diff: «StandardMal.vegbredde = 4.5 Veiklasser.k5.vegbredde = 4» og «Felt der StandardMal og k5 er ULIKE: vegbredde».

### Faktorene kontrolleres bare for at negative verdier klemmes — aldri for at de brukes riktig

`test/selftest.js:654` · etterprøvd

**Hva:** Seksjon 4c (linje 654-659) prøver fjellIFylling, brukbarLosmasse og sprengningsfaktor med ugyldige verdier og kontrollerer at ingen post blir negativ og at det kommer en inngangsmerknad. Ingen test kontrollerer at faktorene faktisk får virke på riktig post. losmasseIFylling er ikke med i det hele tatt — verken i vaktprøven eller noe annet sted. Postene fjellSprengtLos, tilDeponi og overskuddLos har ingen verdikontroll noe sted.

**Når:** Tre mutasjoner i masser.js: (a) brukbarLos = losFast * brukbarLosmasse * losmasseIFylling → siste faktor fjernet (linje 875), altså komprimeringstapet fra fast løsmasse til ferdig fylling ignorert; (b) fjellSprengtLos: fjellFast * sprengningsfaktor → fjellFast (linje 1069), altså utlastet sprengsteinsvolum lik fast fjell; (c) tilDeponi = sum.rensk + losFast * (1 - brukbarLosmasse) → 0 (linje 887). Selftest: 254 tester ok, 0 feil i alle tre.

**Følge:** Mutasjon (b) er 50 % feil på volumet som faktisk skal kjøres bort med lastebil (standard sprengningsfaktor er 1,50). Mutasjon (a) er 5 % feil på hvor mye løsmasse som teller som fylling. Mutasjon (c) nuller ut deponiposten helt. Alle tre er poster entreprenøren priser direkte, og alle tre kan settes til hva som helst uten at noen test reagerer.

**Bevis:** Mutasjonsrunde 1: «balanse: losmasseIFylling ignorert → SLAPP», «balanse: sprengningsfaktor ignorert → SLAPP», «balanse: tilDeponi = 0 → SLAPP», «balanse: overskuddLos = 0 → SLAPP». Grep: losmasseIFylling forekommer ikke i selftest.js.


## Moderat (66)

### Merknadsteksten for faktorene oppgir feil verdi – den leser alltid StandardMal

`public/js/masser.js:724` · etterprøvd

**Hva:** Teksten bygges med `StandardMal[felt]`, uavhengig av om hva === 'mal' eller 'faktor', mens tilordningen på neste linje bruker riktig `hva === 'mal' ? StandardMal[felt] : StandardFaktorer[felt]`. Ingen faktornavn finnes i StandardMal, så uttrykket faller alltid til `lav` – den nedre grensen fra FAKTORGRENSER. Alle fem faktormeldingene oppgir dermed et annet tall enn det som faktisk regnes med.

**Når:** En prosjektfil eller et skjemafelt gir en ikke-numerisk faktor, for eksempel sprengningsfaktor = NaN eller "1,5" med komma.

**Følge:** Rapporten sier «Sprengningsfaktor er ikke et tall – bruker 1» mens 1,50 brukes; «Sprengstein i fylling ... bruker 0.5» mens 1,30 brukes; «Løsmasse i fylling ... bruker 0.5» mens 0,95 brukes; «Andel brukbar løsmasse ... bruker 0» mens 0,50 brukes. Tallet i regnestykket er riktig, men entreprenøren som leser merknaden for å vurdere om han kan stole på massebalansen får oppgitt feil forutsetning – og «brukbar løsmasse 0» mot 0,5 er forskjellen på om halve løsmasseskjæringen kan gjenbrukes eller må kjøres på deponi.

**Bevis:** Kjørt med alle fire faktorene satt til NaN: res.faktorer ble {sprengningsfaktor:1.5, fjellIFylling:1.3, losmasseIFylling:0.95, brukbarLosmasse:0.5}, mens merknadstekstene sa henholdsvis «bruker 1», «bruker 0.5», «bruker 0.5» og «bruker 0».

### Linjeskift-trimmingen kjøres også når /Length ga eksakt lengde, og ødelegger ca. 1 % av strømmene

`public/js/pdfimport.js:53` · etterprøvd

**Hva:** `while (slutt > start && (bytes[slutt-1] === 0x0a || bytes[slutt-1] === 0x0d)) slutt--;` er ment som reserveløsning for tilfellet der /Length ikke kunne brukes (se kommentaren linje 43-45), men den kjøres ubetinget — også etter at `slutt = start + n` har satt den nøyaktige lengden fra /Length. Siste byte i en zlib-strøm er siste byte av adler32-summen og er en vilkårlig verdi. Er den 0x0a eller 0x0d, blir en ekte databyte kastet.

**Når:** En hvilken som helst flate-komprimert innholdsstrøm med korrekt direkte /Length, der siste byte av adler32-summen tilfeldigvis er 0x0a eller 0x0d. Sannsynligheten er 2 av 256 = 0,78 % per strøm. Trimmingen kutter byten, zlib-strømmen blir ufullstendig, DecompressionStream kaster, og strømmen droppes stille.

**Følge:** Tegningen forsvinner uten spor. Målt på 2000 genererte strømmer endte 19 (0,95 %) på 0x0a/0x0d, og alle 19 gikk tapt i `lesStrommer` — 19 av 19. Feilen er tilfeldig og ikke reproduserbar for brukeren: samme program, samme framgangsmåte, én av hundre filer virker bare ikke. Har profilen bare én innholdsstrøm, betyr det at ca. 1 % av alle PDF-er ikke lar seg lese, med den samme misvisende «skannet fra papir»-meldingen. Trimmingen bør bare gjøres i tilbakefallsgrenen der /Length ikke kunne brukes.

**Bevis:** pdfimp-forsøk på 2000 strømmer: «Strømmer som ender pa 0x0a/0x0d: 19 av 2000 (0.9 %)», «Av disse tapt av lesStrommer: 19 av 19», eksempel {seed:14, sisteByte:13, len:1122}. Kontroll med en vanlig strøm: 1 strøm lest. Tilleggskontroll i pdfimp_pakk.js viser at én kappet byte gir null, aldri delvis innhold: «siste byte kappet -> null».

### tilHoyder sorterer blindt på s uten å sjekke at banen er entydig — lukkede flater gir blandede høyder

`public/js/pdfimport.js:188` · etterprøvd

**Hva:** `.sort((p, q) => p.s - q.s)` legger punktene i stigende profilnummer og `interpoler` behandler dem som en funksjon z(s). Ingenting sjekker at banen faktisk er entydig i s. Kombinert med at `kandidater` linje 160 teller loddrette segment som «framover» (`b[i].x >= b[i-1].x`, likhet teller), slipper lukkede figurer med bare ett steg tilbake gjennom 90 %-kravet på linje 163.

**Når:** Skravert/fylt flate under veglinjen, tegnet som: veglinjen fra venstre mot høyre (41 punkt), rett ned til grunnlinjen på høyre side (loddrett, teller som framover), tilbake til venstre langs grunnlinjen (ett steg bakover), og opp igjen. 43 av 44 steg er framover, altså 97,7 % — over grensen på 90 %. Flaten blir kandidat, og siden `kandidater` sorterer på `b.bredde - a.bredde || b.punkt - a.punkt` (linje 166) havner den FORAN den ekte veglinjen som har samme bredde men færre punkt. Den deler dessuten topplinje med veglinjen, så ui-pdf.js:158 (`if (d < bestD)`, streng ulikhet) velger den første i lista ved likt avstandstreff — flaten.

**Følge:** Grunnlinjepunktene blandes inn i høydeprofilen. I forsøket ga veglinjen 0:100.0 … 800:110.0, mens flaten ga 0:100.0 … 800:90.0 — 20 m for lavt i enden av vegen. Det gis ingen advarsel; tallrekka ser ut som en profil helt til siste punkt. Feilen treffer endene av strekket, som er nettopp der masseberegningen ekstrapolerer.

**Bevis:** pdfimp_geo.js seksjon C: «kandidater: punkt=44 bredde=800 | punkt=41 bredde=800», «forst i lista (bredest): FLATEN», «veglinje : 0:100.0 … 800:110.0» mot «flate : 0:100.0 … 800:90.0».

### Ukomprimerte innholdsstrømmer forkastes — /Filter leses aldri

`public/js/pdfimport.js:61` · etterprøvd

**Hva:** `pakkUt` prøver bare 'deflate' og 'deflate-raw' og returnerer null når begge feiler. `/Filter` i objektordboken leses aldri, verken her eller i `lesStrommer`. En strøm uten filter — altså ren, lesbar PostScript-lignende tekst — kastes derfor, selv om innholdet ligger der ferdig tolkbart.

**Når:** PDF med ufiltrert innholdsstrøm: «4 0 obj << /Length 1234 >> stream … 30 tegnede streker … endstream». Dette er vanlig fra enklere PDF-skrivere, fra filer som har vært gjennom «pdftk uncompress», og fra eldre CAD-eksport. `DecompressionStream('deflate')` kaster på ASCII-innholdet, 'deflate-raw' likeså (første byte 0x71 = 'q' gir BFINAL=1/BTYPE=00 lagret blokk, og LEN/NLEN stemmer ikke), og strømmen dropper ut.

**Følge:** `lesStrommer` gir 0 strømmer for en fullt lesbar PDF med 30 streker. Brukeren får «Fant ingen tegnede streker i filen. Er PDF-en skannet fra papir …» selv om innholdet var det enkleste tenkelige å tolke. En strøm som ikke har /Filter bør sendes rett videre som tekst.

**Bevis:** pdfimp_geo.js seksjon D: «strommer fra ukomprimert PDF: 0 (innholdet finnes, 30 streker)».

### Hver strøm tolkes som en egen tegning med enhetsmatrise — /Contents-array splitter profilen og mister CTM-en

`public/js/pdfimport.js:128` · etterprøvd

**Hva:** `for (const s of strommer)` i `lesFil` lager én `tegning` per strøm, og `tolkBaner` starter hver strøm med `m = [1,0,0,1,0,0]`. En PDF-side kan ha `/Contents [ 5 0 R 6 0 R ]`, der strømmene skal settes sammen til én før tolking. Grafikktilstanden — også CTM satt med `cm` — bæres over grensen mellom dem. Koden setter dem ikke sammen, og heller ikke `Do`/XObject-plassering håndteres.

**Når:** Tegningen har CTM «0.24 0 0 0.24 40 60 cm» satt i første strøm, og fortsetter å tegne profilen i andre strøm. Satt sammen slik en PDF-leser gjør det, går banen fra (40, 300) til (520, 331.92). Tolket hver for seg får del 2 enhetsmatrisen: første punkt (2100, 1133), siste (4000, 1266).

**Følge:** Profilen deles i to «tegninger» i nedtrekkslisten, og andre halvdel ligger 1/0,24 = 4,17 ganger for stort. `tegninger.sort` (linje 135) legger den med flest streker først, så brukeren velger normalt bare den ene halvparten, setter referansepunkt der og får en profil som dekker halve vegen. Siden referansepunktene og linjen kommer fra samme halvdel, blir høydene i seg selv riktige — men de dekker bare halve strekket, og `leggInn` melder bare «Leste inn N høyder fra PDF-en» uten å si at resten mangler. Resten av vegen prises på et VIP-sett som stopper midtveis.

**Bevis:** pdfimp_ctm.js: samlet tolking gir «forste punkt: {x:40, y:300} siste punkt: {x:520, y:331.92}»; hver strøm for seg gir «del1: forste={x:40,y:300} siste={x:520,y:331.92}» og «del2: forste={x:2100,y:1133} siste={x:4000,y:1266}».

### Baner tegnet fra høyre mot venstre forkastes, selv om omregningen håndterer dem perfekt

`public/js/pdfimport.js:163` · etterprøvd

**Hva:** `if (andel < 0.9 || maksX - minX < 50) continue;` krever at minst 90 % av stegene går mot høyre. Retningen en polylinje har i en CAD-fil er tilfeldig — den følger av hvilken vei brukeren tegnet den — og sier ingenting om linjen er en profillinje. `tilHoyder` sorterer uansett punktene på s (linje 188) og bryr seg ikke om tegnerekkefølgen.

**Når:** Samme profillinje, 41 punkt, 800 pt bred, lagt inn i motsatt rekkefølge (høyre mot venstre). `kandidater([fram])` gir 1 kandidat, `kandidater([bak])` gir 0. Kjører man begge gjennom `tilHoyder` med samme referansepunkt, kommer det identiske høyder ut — 17 punkt, største avvik 0 m.

**Følge:** Filteret gir null gevinst i nøyaktighet og kaster halvparten av gyldige profillinjer. Er veglinjen tegnet baklengs mens terrenglinjen er tegnet forlengs, står brukeren igjen med bare terrenglinjen som valgbar strek — det er samme sluttsituasjon som funnet om 15-punktsgrensen, og fører på samme måte til at et klikk på veglinjen enten ikke gir utslag eller snapper til terrenget.

**Bevis:** pdfimp_geo.js seksjon B: «kandidater(fram): 1», «kandidater(bak): 0», «tilHoyder handterer begge likt, storste avvik: 0 m -> 17 punkt».

### Vakten mot for tette referansepunkt står på rå PDF-enheter og fanger bare identiske klikk

`public/js/pdfimport.js:180` · etterprøvd

**Hva:** `if (Math.abs(dx) < 1e-6 || Math.abs(dy) < 1e-6) return null;` er tydelig ment å fange referansepunkt som ligger for tett (ui-pdf.js:175 svarer «Sett referansepunktene lenger fra hverandre»). Men 1e-6 er i PDF-punkt, altså ca. 3,5e-10 mm. Den fanger bare klikk som er bokstavelig talt identiske. Ingenting kontrollerer at den utledede målestokken `zPerY` er et fornuftig tall, og `zPerY` slår rett inn på ALLE høyder.

**Når:** To referansepunkt som ligger 2e-6 pt fra hverandre i y slipper gjennom vakten og gir zPerY = 2,000e+7 m per pt; `tilHoyder` returnerer høyder på 2 000 000 105 moh uten å klage. Det realistiske tilfellet er mildere og verre: brukeren setter de to punktene på to rutenettkryss som ligger 20 pt fra hverandre loddrett. Lerretet skalerer tegningen ned (ui-pdf.js:98), så ett skjermpiksel er under ett PDF-punkt, og et bomskudd på ±1,3 pt gir 1,3/20 = 6,5 % feil på zPerY.

**Følge:** 6,5 % feil på den loddrette målestokken forplanter seg proporsjonalt til hver eneste høyde. Over et høydespenn på 40 m er det ±2,6 m systematisk feil på hele profilen, i samme retning hele veien — altså en ren skalering av gravemengden. Ingenting i programmet kontrollerer at de to utledede målestokkene er plausible, verken mot hverandre eller mot en vanlig tegningsmålestokk, og advarselen i grensesnittet er bare en oppfordring om å sette punktene langt fra hverandre.

**Bevis:** pdfimp_strom.js seksjon H: «zPerY = 2.000e+7 m per pt» og «hoyder: 0:100 200:500000101.262 400:1000000102.525 600:1500000103.787 800:2000000105.05» — returnert som et gyldig svar, ikke null.

### Tegninger med færre enn fem streker forkastes, og en ren CAD-eksport har ofte tre

`public/js/pdfimport.js:131` · etterprøvd

**Hva:** `if (baner.length < 5) continue;` kaster hele strømmen. En lengdeprofil eksportert rent fra et tegneprogram kan bestå av svært få baner: ramme, terrenglinje og veglinje. Tekst (profilnummer, høydetall) er `Tj`-operatorer og teller ikke som baner, og et rutenett tegnet som ett sammenhengende polygon teller som én.

**Når:** Innholdsstrøm med ramme (`re`), terrenglinje (50 punkt) og veglinje (50 punkt) = 3 baner. `lesFil` hopper over strømmen.

**Følge:** Hele tegningen forsvinner fra nedtrekkslisten. Er dette den eneste innholdsstrømmen, får brukeren «Fant ingen tegnede streker i filen. Er PDF-en skannet fra papir …» for en PDF som er så ren og lettlest som den kan bli. Terskelen er ment å luke ut støy, men den luker ut den enkleste gyldige tegningen.

**Bevis:** pdfimp_strom.js seksjon F: «baner i tegningen: 3 -> lesFil krever >= 5, tegningen blir FORKASTET».

### De fargede skjærings-/fyllingsflatene deles ved rått terreng, ikke ved renskflaten – bildet er uenig med m²-tallet i etiketten rett over

`public/js/ui-tverrprofil.js:216` · etterprøvd

**Hva:** Klippet og de to fyllene (linje 213-218) bruker `terr` = pr.geometri.terreng = råterreng. Skillet mellom skjæringsfarge og fyllingsfarge blir derfor råterrenglinja, mens masseberegningen deler ved renskflaten 0,20 m lavere. Renskflaten tegnes som stiplet linje like ved (linje 235-238) og er i kommentaren kalt «grensen masseberegningen regnes fra», så feil flate er valgt.

**Når:** Flatt terreng 100,00, vegnivå 100,60: etiketten over lerretet skriver «skjær 0,0 m² · fyll 0,2 m²», mens tegningen maler 0,72 m² skjæringsfarge og 0,00 m² fyllingsfarge – et fyllingsprofil tegnet som rent skjæringsprofil. Flatt terreng med vegnivå 102,00 (2 m fylling): etiketten «fyll 9,4 m²», tegnet fyllingsflate 7,7 m² (18 % for lite). Skrående terreng 20 %, vegnivå 100: etiketten «skjær 5,2 m²», tegnet 6,8 m².

**Følge:** Tegnet flate = riktig flate ± renskDybde × snittbredde. Målt: +1,66 m² på et 8,3 m bredt profil, +2,79 m² på et 14 m bredt, −1,67 m² på fyllingssida. Brukeren kan ikke lese av bildet om et profil er skjæring eller fylling, og et øyemål av arealet mot m²-tallet i etiketten stemmer aldri.

**Bevis:** Integrasjon av det som males (mellom geometri.terreng og geometri.jord) mot pr.areal: 6,8 mot 5,2 m²; 0,7 mot 0,0 m² skjær og 0,0 mot 0,2 m² fyll; 7,7 mot 9,4 m² fyll; 28,9 mot 26,1 m². Differansen er hver gang nøyaktig 0,20 m × snittbredden.

### _helning bruker sentraldifferanse rundt NÆRMESTE punkt, ikke segmentet pekeren faktisk står i – gir helninger som ikke finnes i snittet

`public/js/ui-tverrprofil.js:61` · etterprøvd

**Hva:** Løkka på linje 60-62 finner punktet nærmest t, og linje 75 deler differansen mellom nabo-punktet under og nabo-punktet over. Står pekeren i et segment ved siden av et knekkpunkt, blandes to ulike helninger til et gjennomsnitt som ikke er helningen noe sted i snittet. Punktlista er integrasjonsrutenettet fra masser.js (~0,1 m), så feilbeltet er én rutenettcelle bredt rundt hvert knekkpunkt – og knekkpunktene er nettopp de stedene en maskinfører sikter på: senterlinjen (takfallet), vegkanten, grøftebunnen og skråningsfoten.

**Når:** Standardmal, takfall 5 %/5 %. Punktene rundt senterlinjen er t = −0,0327 (z 99,29837), t = 0 (z 99,30000) og t = 0,0662 (z 99,29669). For t i beltet −0,01 til +0,03 blir nærmeste punkt t=0, og avlesningen deler (99,29669 − 99,29837)/(0,0662 + 0,0327) = −0,0170. Boksen skriver «Helning på tvers 1,7 % 1:59,0» der malen sier 5,0 % / 1:20,0. Grøft: i et profil der grøfta bare er delvis utviklet (bunnen 0,0975 m bred, smalere enn rutenettsteget) viser den flate grøftebunnen «18,3 % 1:5,5» på høyre side og «34,9 % 1:2,9» på venstre, og den 1:1 bratte indre grøfteskråningen leses som «44,3 % 1:2,3».

**Følge:** Skann av hele snittet med 1 cm oppløsning: 24 av 827 avlesningspunkt (≈3 %) gir en helning som ikke stemmer med noen av de to tilstøtende, virkelige helningene. Verst: takfallet leses som en tredjedel av det virkelige (1,7 % mot 5,0 %, og med fortegnet fra høyre side selv når pekeren står til venstre for senterlinjen), og en flat grøftebunn leses som 18-35 % fall. Skråningshelningene ute i snittet (1:1,5 løsmasse, 1:0,2 fjell) leses derimot riktig – der er punktene tette nok.

**Bevis:** node-skann av _helning(pr.geometri.jord, t) mot ensidige deriverte av jordflaten fra sider[].knekk: t=−0,010..0,030 gir −0,0170 mot fasit ±0,0500; t=2,38..2,41 gir 0,1834 mot fasit 0,0000; t=−2,45..−2,43 gir 0,4432 mot fasit 1,0000. 24/827 punkt utenfor toleranse 0,02.

### maksStigningNormal har av-med-én i bandoppslaget og gir det lausere kravet

`public/js/veiklasser.js:250` · etterprøvd

**Hva:** Oppslaget er «if (radius <= r[0])». Radiusbandene i normalen er hele meter (10–14, 15–19, 20–29 …), så en radius mellom to band – f.eks. 14,5 m – hopper over det strenge bandet og lander på det neste, lausere. masser.js:180 gjør nøyaktig det samme oppslaget riktig med «if (R < r[0] + 1)», og selftest.js:857 sjekker den varianten. De to implementasjonene av samme normregel er ikke enige.

**Når:** Klasse 3, kurve med radius 14,5 m. Normalen: bandet 10–14 m gir 2 % med lass / 5 % i retur, bandet 15–19 m gir 4 % / 7 %. Veien har ikke nådd 15 m og kan ikke påberope seg 15-kravet.

**Følge:** veiklasser.js svarer 7 % der masser.js (og normalen) svarer 5 % – 40 % for slakt krav. Tilsvarende R=19,5: 8 % mot 7 %; R=29,5: 10 % mot 8 %; R=39,5: 11 % mot 10 %. Funksjonen er eksportert, men ingen kaller den i dag, så feilen er latent: den slår til den dagen noen kobler den til en rapport eller en kontroll, og da med en stille lempning av kurvekravet.

**Bevis:** node-prøve, klasse 3: V.maksStigningNormal(k3, 14.5, 0.05, -1) → 0.07 mot M.maksStigningFraRadius(k3, 14.5, 0.05, -1) → 0.05. Avvik også ved 19.5, 29.5 og 39.5.

### normalbreddeIKurve returnerer 0 både for radius mellom to band og for radius under tabellen

`public/js/veiklasser.js:226` · etterprøvd

**Hva:** Vilkåret «if (radius >= fra && radius <= til)» treffer bare inne i et band. En radius i gliperna mellom bandene, eller knappere enn det knappeste bandet, faller ut av løkken og gir 0. 0 er samtidig returverdien for «ingen krav» (radius over 60 m), så kalleren kan ikke skille «ikke noe krav» fra «fant ikke bandet». masser.js:150–160 håndterer begge tilfellene eksplisitt, med kommentar om nettopp denne fella.

**Når:** Klasse 3, veibredde 4,0 m. Radius 14,5 m: begge naboband (10–14 og 15–19) krever bredere vei, men funksjonen svarer 0. Radius 8 m: knappere enn tabellen rekker, svarer 0 – altså mindre krav enn en slakere sving på 12 m.

**Følge:** Kravet forsvinner stille i akkurat de kurvene der breddeutvidelsen er størst. Ved R=14,5 skal totalbredden være 7,0 m (3,0 m utvidelse på en 4,0 m vei); funksjonen sier 0. Samme for R=24,5 (skal være 6,0), R=29,5 (5,5) og R=59,5 (5,0). Ikke kalt fra noe sted i dag, så feilen er latent.

**Bevis:** node-prøve, klasse 3: V.normalbreddeIKurve(k3, R, 45) mot M.utvidelseFraRadius(k3, R, 45)+4.0 → R=8: 0,00 mot 7,00; R=14,5: 0,00 mot 7,00; R=24,5: 0,00 mot 6,00; R=29,5: 0,00 mot 5,50; R=59,5: 0,00 mot 5,00.

### Klasse 1 har ingen kurveutvidelse, ingen fyllingsregel og ingen dosering – den høyeste klassen får de lauseste kravene

`public/js/veiklasser.js:39` · etterprøvd

**Hva:** K1 har breddeIKurve: [], ingen ekstraBredde, ingen ensidigUnderRadius og ingen stigningsovergang. Det gjør at malFraVeiklasse setter ekstraBredde = null og ensidigUnderRadius = 0. Klassen er riktignok merket usikker: true, og grensesnittet viser «Kontroller kravene mot gjeldende vegnormal», men den advarselen sier ingenting om at tre konkrete regler er slått helt av. Kravet om ekstra bredde på fylling over 2 m gjelder i alle de sju andre klassene, K8 medregnet.

**Når:** Bruker velger «Klasse 1 – Bilvei, offentlig standard» for en adkomstvei med en kurve på R = 45 m (godt over K1 sin egen minsteradius på 40 m, altså en helt lovlig kurve i klassen) og en fyllingsstrekning på 3 m høyde.

**Følge:** I R=45-kurven gir K1 5,00 m total bredde, mens K2 – klassen under – krever 5,50 m. Den høyeste standarden regner altså med en smalere vei enn den nest høyeste, i samme kurve. Fyllingsregelen: målt på 200 m vei over en 3 m dyp senkning gir K1 2127 m³ fylling mot 2204 m³ med fyllingsregelen på – 76 m³ for lite, ca. 380 m³/km. I tillegg blir alle kurver under 60 m modellert med takfall i stedet for dosering, noe som gir feil vegkanthøyder i stikningsdata.

**Bevis:** node-prøve: K1 utvidelse ved R=45/135° = 0,00 m (total 5,00 m) mot K2 1,00 m (total 5,50 m), K3/K4/K6 5,50 m. malFraVeiklasse('k1').ekstraBredde = null, .ensidigUnderRadius = 0. Fylling 2127 mot 2204 m³ på 200 m.

### Klasse 4: infoboksen viser 18 % returstigning, men beregningen håndhever 16 % også på rettstrekk

`public/js/veiklasser.js:86` · etterprøvd

**Hva:** Normalen kap. 3.4.6 gir to ulike tall for K4: generelt «Maksimal stigning i returretningen … skal ikke overstige 18 %», og i kurvetabellen «I kurver med radius > 60 m: 12 % / 16 %». Begge tall står riktig i filen (maksStigningRetur: 0.18 og siste rad [1e9, 0.12, 0.16]). Problemet er at malFraVeiklasse aldri kopierer maksStigningLass/maksStigningRetur over i malen, så masser.js har bare stigningIKurve å gå på, og bruker siste rad – kurvekravet – også på rene rettstrekk der radius er uendelig. K4 er den eneste klassen der de to tallene spriker; alle de sju andre har identisk generelt krav og siste tabellrad.

**Når:** Klasse 4-vei, 300 m rettstrekk med 17 % fall i returretningen. Normalen tillater 18 % her.

**Følge:** Programmet gir 13 stigningsmerknader med teksten «Stigning 17.0 % overstiger 16 % i returretningen (rettstrekk)», samtidig som klasseinfoboksen (app.js:1167) viser «Maks stigning 12 / 18 %». Brukeren får motstridende tall fra samme program, og blir presset til å senke profilen for å bli kvitt merknader som normalen ikke krever – altså unødvendig graving lagt inn i prisen.

**Bevis:** node-prøve: for K1,K2,K3,K5,K6,K7,K8 er (maksStigningLass, maksStigningRetur) lik siste rad i stigningIKurve; for K4 er det 12/18 mot 12/16. malFraVeiklasse('k4').maksStigningRetur → undefined. beregnMasser på 17 % rettstrekk gir merknaden «overstiger 16 % i returretningen (rettstrekk)».

### 0,999-faktoren i _bygg mot «akkurat plass» i rettVertikalgeometri gir en merknad som ber om noe som allerede er gjort

`public/js/vertikalprofil.js:331` · etterprøvd

**Hva:** rettVertikalgeometri godtar en kurve når `kreves <= plass + 1e-9`, altså L = min(dFor, dEtter), og setter K = krav/100. _bygg tillater derimot bare `2 · min(grense) · 0,999` (linje 51). Når to nabokurver hver skal ha nøyaktig halve tangenten, er `forrigeGrense` nøyaktig L/2, og 0,999-faktoren korter kurven med 0,1 %. Kontrollen i masser.js:1004 slår ut på alt som er kortere enn `kreves - 1e-6`.

**Når:** 10 knekkpunkt med 18 m avstand, krav 150 m høybrekk, brekk på nøyaktig 12 % gir kreves = 18,00 m = plass. Etter 8 runder med den fulle rettesløyfen fra app.js (rettProfil + rettVertikalgeometri) står knekkpunktet på profil 126 igjen med bygd kurve 17,982 m mot kravet 17,9996 m.

**Følge:** Brukeren får merknaden «Vertikalkurve i høybrekk har radius 150 m, kravet er 150 m – øk K til 1.5» mens K allerede ER 1,5. Rettingen kan aldri fjerne den, og rettOpp melder «brudd står igjen» hver gang. Selve geometrien er bare 0,1 % feil og har ingen praktisk betydning for massene – skaden er en permanent, selvmotsigende advarsel som gjør at brukeren ikke stoler på merknadslisten. 86 av 400 tilfeldige profiler ender i akkurat denne tilstanden.

**Bevis:** Merknadsteksten hentet fra en faktisk M.beregnMasser-kjøring etter 8 rettrunder. Sveip: 291 av 400 profiler helt rene, 86 med denne 0,1 %-avrundingen, 23 med reelle brudd.

### laste telles per runde i stedet for per punkt, og tallet vises direkte til brukeren

`public/js/vertikalprofil.js:336` · etterprøvd

**Hva:** Begge `laste++` (linje 336 og linje 345) står inne i 60-rundersløkken. Så lenge et annet knekkpunkt holder `endret = true` – noe utglattingen alltid gjør, siden den bare går halvveis hver runde – telles det samme låste punktet på nytt hver runde. Det samme gjelder `glattet`. `satt` er derimot riktig, fordi linje 333 hopper over punktet etter at K er satt.

**Når:** 11 knekkpunkt med 10 m avstand, hvorav 2 er låst, krav 200/150. app.js:676 tar `Math.max` over verdien og skriver den ut i app.js:737 som del av statuslinjen.

**Følge:** Brukeren får «… brudd står igjen – 120 av dem sitter fast i låste høyder» når det finnes 2 låste høyder i hele profilen, og høyst 2 brudd kan sitte fast. Med 1 låst punkt returnerte funksjonen 37. Tallet er ikke bare litt feil, det er større enn antall brudd og gjør setningen meningsløs – og den er nettopp skrevet for at brukeren skal vite om hun skal låse opp en høyde eller endre linjen.

**Bevis:** rettVertikalgeometri på 11 punkt med 2 låste returnerer {satt: 2, glattet: 413, laste: 120}. Med 1 låst punkt: {satt: 0, glattet: 39, laste: 37}.

### Dublettvakten i konstruktøren er 1000× for slakk, og maksStigning ser ikke det som slipper gjennom

`public/js/vertikalprofil.js:26` · etterprøvd

**Hva:** Konstruktøren forkaster bare knekkpunkt som ligger nærmere hverandre enn 1e-6 m (én mikrometer), mens foreslaProfil bruker SAMME = 1e-3 (linje 173). Kommentaren over linje 26 beskriver nøyaktig hva som går galt – et loddrett sprang som ingen stigningskontroll ser – men terskelen er satt så lavt at den ikke fanger det. `maksStigning(steg = 1)` (linje 105) sampler med 1 m steg og lander aldri inne i et strekk som er kortere enn steget.

**Når:** Høydetabellen i app.js lagrer profilnummer med `toFixed(2)` (app.js:1367, 1386), så 1 cm er den minste avstanden grensesnittet kan lage, og settPunkthoyde slår sammen med toleranse 1e-6 (app.js:1241). To knekkpunkt på 100,00 (z = 110) og 100,01 (z = 104) overlever konstruktøren.

**Følge:** Stigningen på det ene strekket blir −60 000 %. h(99,9) = 109,990 og h(100,1) = 103,996 – nesten 6 m rett ned på 20 cm. «Største stigning» i sammendragspanelet (app.js:1338, som bruker maksStigning(1)) viser 10,0 % og ser helt normal ut. Massene i det området regnes mot en vei som stuper 6 m, uten en eneste advarsel.

**Bevis:** new Vertikalprofil([{s:0,z:100},{s:100.00,z:110},{s:100.01,z:104},{s:200,z:100}]) beholder alle 4 punkt, stigninger 10,0 % / −60 000,0 % / −4,0 %, maksStigning(1) = 10,0 %.

### Merknaden om ugyldig faktor oppgir en annen verdi enn den som faktisk brukes

`public/js/masser.js:724` · etterprøvd

**Hva:** Merknadsteksten slår opp `StandardMal[felt]`, mens verdien settes fra `StandardFaktorer[felt]` på linja under. Faktorene finnes ikke i StandardMal, så teksten faller alltid tilbake på grensens nedre verdi `lav`.

**Når:** faktorer.sprengningsfaktor = "to og en halv" og faktorer.fjellIFylling = NaN (f.eks. fra en prosjektfil eller et eksternt verktøy).

**Følge:** Merknaden sier «Sprengningsfaktor er ikke et tall – bruker 1», men beregningen bruker 1,50 – «Sprengt fjell på lass» blir 50 % høyere enn merknaden forteller. Og «Sprengstein i fylling er ikke et tall – bruker 0.5» mens 1,30 faktisk brukes, 160 % avvik på nettopp den faktoren som avgjør hvor mye stein som er tilgjengelig til fylling og bærelag. Brukeren som kontrollregner mot merknaden får et helt annet svar enn programmet.

**Bevis:** e1.js E2: merknader [«Sprengningsfaktor er ikke et tall – bruker 1», «Sprengstein i fylling er ikke et tall – bruker 0.5»], mens faktorer brukt: {sprengningsfaktor: 1.5, fjellIFylling: 1.3, ...}.

### Deponiposten og overskuddspostene er i ulike enheter, men legges sammen til ett tall

`public/js/masser.js:887` · etterprøvd

**Hva:** tilDeponi = sum.rensk + losFast·(1 − brukbarLosmasse) er fast masse uten noen faktor. overskuddFjell (linje 885) er fast fjell × 1,30 og overskuddLos (linje 886) er fast løsmasse × 0,50 × 0,95 – begge i ferdig komprimert fyllingsvolum, som er en meningsløs enhet for masse som per definisjon ikke skal i noen fylling. ui-rapport.js:101 summerer alle tre og skriver «Til sammen X m³ skal ut av anlegget». Samme kubikkmeter løsmasse teller som 1,00 m³ hvis den er ubrukbar og 0,95 m³ hvis den er brukbar, men til overs.

**Når:** 1 km veg i skjæring, 20 % sidefall, vegnivå 4 m under terreng, fjell 3 m ned, standardfaktorer.

**Følge:** Rapporten viser «Til sammen 42602 m³ skal ut av anlegget» (17713 + 13635 + 11254). Regnet konsekvent som fast masse er det 40723 m³; regnet løst på lass (rensk og løsmasse ×1,25, fjell ×1,50) er det 53067 m³. Tallet er verken det ene eller det andre – 4,6 % over fast masse og 20 % under lassvolumet, som er det transporten faktisk prises på. Enkeltposten «Overskudd av sprengstein» viser 36274 m³ for en steinmengde som er 27903 m³ fast og 41854 m³ på lass, altså 15,4 % under lassvolumet.

**Bevis:** e6.js E12 og e2.js E4: «Rapporten viser Til sammen 42602 m³», «Samme masse regnet konsekvent som fast masse: 40723 m³», «løst pa lass: 53067 m³»; «overskuddFjell (vises) 36274 -> tilsvarer fast fjell 27903 = løst pa lass 41854 (15,4 % mer enn det som vises)».

### beregningsbredde slår av maksUtslag-kontrollen

`public/js/masser.js:973` · etterprøvd

**Hva:** `const utslag = Math.max(-pr.fotVenstre, pr.fotHoyre) - pr.halvbredde;` måler fra fotVenstre/fotHoyre, som allerede er avkortet ved grensen hb + beregningsbredde (linje 484-485). Utslaget kan derfor aldri overstige beregningsbredde, og kontrollen kan ikke slå ut i det hele tatt når beregningsbredde ≤ maksUtslag.

**Når:** 200 m veg i 45 % sidefall, vegnivå 3 m over terreng, maksUtslag 15 m (standard), beregningsbredde satt til 10 m.

**Følge:** Uten beregningsbredde stikker skråningen 16,2 m ut og 11 profiler får utslagsmerknad. Med beregningsbredde 10 måler kontrollen nøyaktig 10,0 m, alle 11 merknadene forsvinner, og igjen står én «avkortet»-linje. Fyllingsvolumet faller samtidig fra 8231 til 7411 m³ (−10 %). Kommentaren på linje 63-69 sier at grensene skal hindre at optimaliseringa legger profilen der volumet «ser billig ut pa papiret» – med beregningsbredde satt fjernes både volumet og vakten mot det i samme grep, og optimaliseringa trekkes nettopp dit kommentaren advarer mot.

**Bevis:** e6.js E9: «beregningsbredde 0: fylling 8231, utslag 16.2 m, merknader {"utslag":11}» mot «beregningsbredde 10: fylling 7411, utslag 10.0 m, merknader {"avkortet":1}».

### Slitelaget står utenfor massebalansen, men manglerTotalt vises som «Må kjøres inn»

`public/js/masser.js:884` · etterprøvd

**Hva:** Massebalansen kjenner bare fyllingBehov og baerelagBehov. sum.slitelag – knust grus, som aldri kan komme fra egne masser – er ikke med i noen post i balansen, og manglerTotalt = manglerFylling + manglerBaerelag (linje 1074). ui-rapport.js:95, ui-rapport.js:413 og ui-pdfrapport.js:197 viser manglerTotalt under overskriften «Må kjøres inn».

**Når:** 1 km veg med standardmal (slitelag 0,10 m × 4,0 m = 0,4 m³/m).

**Følge:** sum.slitelag = 400 m³, men «Må kjøres inn» viser 0 m³ når resten av balansen går opp. Hjelpeteksten i samme rapportkort sier «Bærelag og slitelag er selve vegkroppen og kommer i tillegg til fyllingen. De må skaffes uansett». Det innkjørte volumet i pristallet er systematisk 400 m³ for lavt per km – 100 % av slitelagsposten.

**Bevis:** e5.js E7: «sum.slitelag = 400 m³», «manglerTotalt = 0». Feltlista i balanse-objektet inneholder ingen slitelagspost.

### Ett fjellpunkt overkjører hele strekningstabellen, med et hardt sprang ved rekkevidden

`public/js/masser.js:110` · etterprøvd

**Hva:** Fjellmodell.dybde() returnerer IDW-vektet snitt av punkter så snart ett eneste punkt ligger innenfor rekkevidde (linje 119), og ser da aldri på strekninger (linje 121-123). Utenfor rekkevidde faller den rett ned på strekningen, uten noen overgang. Det gir en trappekant i fjelloverflaten nøyaktig ved rekkevidde-avstanden.

**Når:** strekninger [{fra:0, til:200, dybde:6}] (f.eks. fra boring/sondering langs strekket), punkter [{x:0, y:0, dybde:0}] (én registrert fjellsyning i starten), rekkevidde 60 (standard).

**Følge:** dybde = 0 m for s = 0…59 og 6 m fra s = 61 – et sprang på 6 m i fjelloverflaten mellom to nabo-profiler, uten merknad. I skjæring blir det ene profilet 100 % fjell og nabo-profilet 100 % løsmasse, og midlere endeareal smører spranget jevnt utover intervallet. Den håndlagte strekningen brukeren la inn får ingen virkning i det hele tatt på de 60 første metrene, selv om den er den mer omfattende opplysningen.

**Bevis:** e6.js E11: s=0 → 0, s=50 → 0, s=59 → 0, s=61 → 6, s=100 → 6.

### radiusVed melder Infinity i en skarp knekk, så alle radiuskrav omgås

`public/js/linjeforing.js:167` · etterprøvd

**Hva:** En skarp knekk er bare to linjeelementer, så `radiusVed` returnerer Infinity og `kurveVed` returnerer null. Retningen hopper 90 grader i ett punkt, men API-et melder «rettstrekk».

**Når:** IP = [(0,0) r=0, (100,0) r=0, (100,100) r=0]: radiusVed(99,9) = radiusVed(100) = radiusVed(100,1) = Infinity og kurveVed(100) = null, mens punktVed(99,999).retning = 0 grader og punktVed(100,001).retning = 90 grader.

**Følge:** Hver eneste radiusavhengige kontroll faller bort: masser.js:951 krever isFinite(radius); veiklasser.js:224 returnerer 0 breddeutvidelse for !isFinite; maksStigningNormal treffer siste rad [1e9, 0.10, 0.12] og gir fullt stigningstak. For K3 betyr det 4,0 m vegbredde og 10 % stigning der den minste kurven som faktisk kunne bygges (R=10–14) ville krevd 8,25 m bredde og 2 % stigning med lass. I tillegg står tverrprofilene rett før og rett etter hjørnet vinkelrett på hverandre og overlapper, så massene i selve hjørnet regnes to ganger. Dette rammer både når brukeren bevisst setter r=0 og – verre – når kurven forsvant av seg selv (funn 3).

**Bevis:** Kjørt: radiusVed og kurveVed som over. veiklasser.normalbreddeIKurve(mal_k3, 30, 90) = 5,75 m mot Infinity → 0,00 m; maksStigningNormal(mal_k3, 30, 0.08, 1) = 8 % mot Infinity → 10 %.

### I en hårnål forsvinner mesteparten av linjelengden, mens advarselen bare snakker om radien

`public/js/linjeforing.js:46` · etterprøvd

**Hva:** T = R·tan(|avbøy|/2) vokser uten grense mot 180 grader. Når T klippes til 0,999·L, ligger tangentpunktet nesten helt tilbake ved forrige knekkpunkt, og hele strekket ut til hårnålen faller ut av linjeføringen. Den eneste meldingen er «Radien i knekkpunkt N er for stor for strekket – kurven er kortet inn».

**Når:** IP = [(0,0) r=0, (100,0) r=20, hårnålspunkt] med 165 graders avbøyning: R blir 13,15 m av bestilte 20, og linjelengden blir 38,1 m av de 200 m brukeren tegnet – 19 %. Ved 170 grader: 26,1 m (13 %). Ved 175 grader: 13,5 m (7 %).

**Følge:** Massene prises på 38 m veg i stedet for 200 m. Selve geometrien er riktig for en tangent-bue-konstruksjon (det finnes ingen R=20-løsning ved 165 grader på 100 m ben), men brukeren får bare vite at radien er kortet inn, ikke at fire femtedeler av vegen er borte. Merknaden får type 'linje' i masser.js:919, og kostnadsfunksjonen i app.js:856 straffer bare type 'kurvatur' – så optimaliseringen ser heller ikke noe galt.

**Bevis:** Kjørt for 120/150/165/170/175 grader med r=20 og 100 m ben: linjelengde 86 %, 52 %, 19 %, 13 %, 7 % av tegnet polylinje; R = 20,00 / 20,00 / 13,15 / 8,74 / 4,36.

### SOSI: VEGNAVN skrives uten anførselstegn – tekst med mellomrom er ugyldig SOSI

`public/js/eksport.js:151` · etterprøvd

**Hva:** `rader.push('..VEGNAVN ' + String(app.P.navn).replace(/[\r\n]+/g, ' ').slice(0, 60))`. Linjeskift fjernes, men verdien settes aldri i anførselstegn. SOSI del 1: «Anførselstegn, " eller ', omkring en tekst kan sløyfes dersom teksten ikke inneholder mellomromstegn (blank etc.)», og «/krav/tekst: Egenskaper av type CharacterString der teksten inneholder skilletegn eller punktum eller utropstegn skal omsluttes av anførselstegn. Ellers vil disse delene kunne oppfattes som separate tekster eller SOSI-elementnavn eller kommentarer.»

**Når:** Standardnavnet i app.js er «Nytt prosjekt» (reservenavnet er «Uten navn», og eneste prosjektfil i repoet heter «Ydestad demo») – alle med mellomrom. Filen får linjen `..VEGNAVN Nytt prosjekt`.

**Følge:** En SOSI-parser leser verdien som «Nytt» og «prosjekt» som to tekster, eller avviser linjen. Verre: SOSI bruker `!` som kommentartegn, så et navn som «Veg til Bakken! 2» stryker resten av linjen, og et navn med punktum kan tolkes som starten på et SOSI-elementnavn. Vegnavnet er metadata, ikke geometri, så massene påvirkes ikke – men filen blir formelt ugyldig med standardnavnet, altså i praksis alltid.

**Bevis:** Kjørt eksporten med navn = 'Nytt prosjekt' (standardverdien fra app.js linje 93): utdata er nøyaktig `..VEGNAVN Nytt prosjekt`. Sitatene er hentet ordrett fra SOSI del 1 v5.0 kap. 8.4 og syntaksvedlegget.

### KOF: punktnavn avrundes til heltall, så to profiler kan få samme navn

`public/js/eksport.js:52` · etterprøvd

**Hva:** `const nr = Math.round(pt.s)` gir navnene S<nr>/V<nr>/H<nr>. Siste profil ligger alltid på s = linje.lengde (masser.js linje 802), og profilen før på nærmeste multiplum av profilavstanden under. Når lengden ligger mindre enn 0,5 m over den forrige stasjonen, runder begge til samme heltall og tre punktnavn går igjen med ulike koordinater.

**Når:** Vei på 387,124 m med profilavstand 1 m (tillatt: input har min=1). Stasjonene ender på 387,000 og 387,124 → begge blir 387.

**Følge:** Filen inneholder S387, V387 og H387 to ganger med koordinater 12 cm fra hverandre. Totalstasjon/maskinstyring overskriver det første punktet eller avviser importen. Sannsynligheten er lengde mod profilavstand < 0,5 – ca. 50 % ved 1 m profilavstand og ca. 10 % ved 5 m (standardverdien). Volumene er upåvirket; det er stikningspunktet som blir feil eller borte. I tillegg merkes sluttprofilen som «387» selv om den ligger på 387,12.

**Bevis:** Kjørt eksporten for profilavstand 1, 2, 5 og 10 m på samme 387,124 m lange linje. Ved 1 m: duplikate punktnavn [["S387",2],["V387",2],["H387",2]]. Ved 2/5/10 m: ingen duplikater på akkurat denne lengden.

### LandXML leser app.P.vip rått, ikke app.vprofil – filtreringen Vertikalprofil gjør omgås

`public/js/eksport.js:93` · etterprøvd

**Hva:** Alle andre eksporter og hele masseberegningen bruker `app.vprofil` (= new Vertikalprofil(P.vip)), som sorterer på s, kaster punkter uten endelig s/z og fjerner knekkpunkter som ligger nærmere enn 1e-6 fra hverandre (siste vinner). LandXML-eksporten går utenom og itererer direkte over `app.P.vip`, så ingen av disse rettelsene gjelder utskriften.

**Når:** limInnHoyder (app.js linje 1407) klemmer alle innlimte rader med `Math.min(r.s, L)` etter å ha sluppet gjennom rader opptil L + 0,5. To rader like forbi veislutten – f.eks. 387,2 og 387,5 på en 387,124 m lang vei – blir begge til stasjon 387,12. Vertikalprofil beholder bare den siste; LandXML skriver begge.

**Følge:** Prøvd med P.vip = [0/100, 200/112, 200/95, 400/100]: Vertikalprofil bygger veien på [0/100, 200/95, 400/100] og gir vegnivå 95,031 i profil 200, mens LandXML-filen inneholder både <PVI>200.0000 112.0000</PVI> og <PVI>200.0000 95.0000</PVI>. Mottakeren får en loddrett vegg på 17 m i profil 200 og feil tangent inn mot den – 17 m fra det KOF, SOSI, DXF og massetallene sier. Ikke-endelige z-verdier ville på samme måte havnet i filen som «NaN».

**Bevis:** Kjørt mot ekte moduler: profil.vip = [[0,100],[200,95],[400,100]], profil.hoyde(200) = 95.031, mens landxml-utdata har begge PVI-linjene.

### WinAnsi-kodingen mangler blokka 0x80–0x9F, så «…» blir til «?» i hver avkortet merknad

`public/js/pdfeksport.js:90` · etterprøvd

**Hva:** `_tekstbytes` slår opp `bytt` og bruker ellers `codePointAt(0)` direkte, med `if (k > 255) k = 63`. WinAnsi (CP1252) er ikke Latin-1 i området 0x80–0x9F: ellipse er 0x85 (133), emdash 0x97 (151), «bullet» 0x95 (149), krøllete anførselstegn 0x91–0x94. Ingen av dem finnes i `bytt`, så alle havner over 255 og blir spørsmålstegn. `_kort` (ui-pdfrapport.js:421-422) setter nettopp «…» bak avkortet tekst. I tillegg mappes «—» til 150 (endash) i stedet for 151 (emdash), så em-streken blir kortere enn den skal.

**Når:** En merknad som er for bred for merknadskolonnen kortes av `_kort` og får «…» bak. I den ferdige PDF-en står det «… brattere enn veiklassen tillater for tømmertransport nedover og?»

**Følge:** Avkortingsmerket forsvinner og teksten ser i stedet ut som et spørsmål eller som ødelagt utskrift. Leseren får ingen beskjed om at merknaden er kuttet, og en merknad om for bratt stigning kan avsluttes midt i setningen uten at det er synlig hvorfor. æøå, ÆØÅ, ³, °, · og – er derimot riktig kodet.

**Bevis:** Bygde rapporten i node og leste den med poppler: linje 291 i pdftotext-utskriften er «120 stigning Stigningen er 11,4 % … nedover og?». I innholdsstrømmen står tegnet som «?» (0x3F), ikke som \205.

### tellBrudd teller ett brudd for mye på oppsummeringslinjen

`public/js/app.js:615` · etterprøvd

**Hva:** `const antall = flere ? 1 + parseInt(flere[1], 10) : 1;` Oppsummeringslinjen fra masser.js:1045 lyder «N vertikalkurver til er under kravet. De fem skarpeste står over.» Den representerer N brudd, ikke N+1 – de fem første er egne merknader som telles hver for seg. «+1» legger på ett ekstra. (Alternativet «profiler til» i regexen på linje 614 finnes ikke i noen merknadstekst i kodebasen.)

**Når:** Sagtakket profil, 600 m, VIP hver 30 m, K=0: masser.js finner 19 vertikalkurvebrudd og skriver 5 enkeltmerknader + «14 vertikalkurver til er under kravet». tellBrudd melder 5 + (1+14) = 20.

**Følge:** Alle bruddtall rettOpp viser er ett for høyt når det er mer enn fem vertikalkurvebrudd: «rettet N brudd», «N brudd står igjen» og «alle N brudd er borte». Tallet stemmer ikke med det brukeren teller i merknadslisten ved siden av – og hele poenget med kommentaren over funksjonen er at de to skal stemme.

**Bevis:** t4_tellbrudd.js: «FASIT vertikalkurvebrudd : 19 / tellBrudd per.vertikalkurve: 20 / avvik: 1».

### «N av dem sitter fast i låste høyder» er ikke antall låste høyder

`public/js/app.js:676` · etterprøvd

**Hva:** `laasteIVeien = Math.max(laasteIVeien, v.laste)`. `v.laste` fra rettVertikalgeometri er ikke antall låste knekkpunkt, men antall ganger telleren `laste++` (vertikalprofil.js:336 og 345) ble truffet – og den ligger inne i en løkke som kjører opptil 60 runder. Så lenge et annet knekkpunkt blir glattet hver runde (`endret = true`), telles det samme låste punktet om igjen for hver runde.

**Når:** Profil med 6 VIP-er, ett av dem låst og for skarpt for plassen. rettVertikalgeometri returnerer laste = 36. Statuslinjen på app.js:737 skriver da «– 36 av dem sitter fast i låste høyder», i et prosjekt med én låst høyde.

**Følge:** Tallet kan bli langt større enn både antall brudd og antall låste høyder i prosjektet. «3 brudd står igjen – 36 av dem sitter fast i låste høyder» er meningsløst, og setningen er nettopp den som skal fortelle brukeren om han må låse opp en høyde eller endre linjen.

**Bevis:** t12_laste_nan.js: «antall laste knekkpunkt i profilen : 1 / rettVertikalgeometri melder laste : 36».

### Sluttrettingen bruker terrengprofilen fra før linjen ble flyttet sidelengs

`public/js/app.js:660` · etterprøvd

**Hva:** `terrengVed` lages én gang på linje 660 og fanger arrayene i `this.terrengProfil`. Når `sideforskyvning > 0` bytter optimaliseringen (linje 951) ut `this.terrengProfil` med et helt nytt objekt for den flyttede linjen. Lukningen `terrengVed` peker fortsatt på de gamle arrayene, så den siste rettingen på linje 701 håndhever maksFyllingshoyde og maksSkjaeringsdybde mot terrenghøyder som gjelder et annet sted.

**Når:** Prosjekt med sideforskyvning = 10 m i 10 % li: optimaliseringen flyttet knekkpunkt 1 med 2,62 m og knekkpunkt 2 med 1,88 m. Terrenghøyden sluttrettingen brukte avvek i snitt 0,30 m og opptil 1,07 m fra den som gjelder etter flyttingen. Linjelengden endret seg samtidig fra 599,90 til 600,50 m, så den siste delen av profilen får `lagTerrengoppslag` sin konstante forlengelse av siste gamle verdi.

**Følge:** Grensene for fyllingshøyde og skjæringsdybde håndheves mot feil bakke. Feilen er lik sidefallet ganget med forskyvningen – i en 1:2-li med de 50 m grensesnittet tillater blir det flere meter. Bare når «Kan flytte linjen inntil» er større enn 0; standard er 0.

**Bevis:** t11_side.js: «flyttet knekkpunkt: [{nr:1, meter:2.62}, ...] / linjelengde før: 599.90 etter: 600.50 / snitt 0.30 m, største 1.07 m ved profil 601».

### tillattStigning sjekker bare ni punkt uansett hvor langt strekket er

`public/js/app.js:408` · etterprøvd

**Hva:** `const steg = Math.max(1, Math.abs(sB - sA) / 8)` gir alltid ni prøvepunkt. `effektivRadius` ser ±`utflatingForKurve` (10 m for K5) rundt hvert punkt, så dekningen er hull-fri bare så lenge steg <= 2 × utflating, altså strekk under 160 m. Er VIP-ene lenger fra hverandre, er det ubesøkte hull mellom prøvepunktene, og en kort knapp kurve som ligger i et hull blir aldri sett. Funksjonen er den eneste stigningsregelen rettProfil kjenner.

**Når:** 605 m veg med to knappe 12 m kurver, og høydene lagt inn som bare to VIP-er (0 og 605) – slik en profil fra innlimt høydetabell eller PDF-import ser ut. steg blir 75,7 m. tillattStigning(0, 605, +0,19) returnerer 20,0 %, mens det strengeste kravet langs strekket er 12,0 % ved profil 239. rettProfil legger seg på 19,0 % og rapporten melder 5 stigningsbrudd: «Stigning 19.0 % overstiger 12 % i returretningen (radius 12 m)».

**Følge:** Rettingen tror den er ferdig med et profil som ligger 58 % over kravet i kurven. Slår inn når VIP-avstanden er over ca. 160 m (K5) eller 320 m (K2), som er innenfor det grensesnittet tillater (VIP-avstand opptil 200 m) og vanlig når høydene kommer fra tabell eller PDF.

**Bevis:** t16_steg.js: «tillattStigning(0, L, +0.19) = 20.0% (steg = 75.7 m) / strengaste krav langs heile strekket: 12.0% ved profil 239 / etter rettProfil: stigning = 19.00% / stigningsmerknader som star igjen: 5».

### Sideforskyvningssøket sammenligner kandidatene på et kostnadstall der det tyngste leddet er konstant

`public/js/app.js:921` · etterprøvd

**Hva:** `const kk = kostnad(best, linje2)` – `best` (høydelisten) holdes fast mens linjen varieres. Terrengfølgingsleddet på app.js:838-850 regnes fra `vpKost` (bygd av `best`) og `this.terrengProfil` (fortsatt den gamle linjen sin). Ingen av dem avhenger av `linje`-argumentet, så leddet er tallmessig identisk for alle kandidatlinjene og forsvinner ut av sammenligningen.

**Når:** Typisk prosjekt i 30 % sidefall: terrengleddet er 28 276 av 42 466 kostnadsenheter i «Billigst» (67 %) og 113 105 av 130 648 i «Minst inngrep» (87 %).

**Følge:** Sideforskyvningen – som ifølge kommentaren på app.js:897-901 nettopp skal legge veien inn i skråningen i stedet for ut på fylling – velges uten det leddet som måler hvor tett veien ligger på bakken. I «Minst inngrep» avgjøres flyttingen på 13 % av kostnadsfunksjonen. Bare når «Kan flytte linjen inntil» er større enn 0.

**Bevis:** t18_kostledd.js: «billigst volumledd 14190 terrengledd 28276 = 42466 terrengleddets andel 67% / minst inngrep volumledd 17543 terrengledd 113105 = 130648 terrengleddets andel 87%».

### Ett manglende terrengpunkt nuller renskvolumet for hele tverrprofilet

`public/js/masser.js:610` · etterprøvd

**Hva:** arealRensk og vRensk settes til 0 så snart manglerData er sann, og manglerData settes hvis ETT eneste av integrasjonspunktene i snittet mangler terrengdata (linje 514–518). Skjæring og fylling regnes derimot videre for de delene som har data. Renskbredden (tR1−tR0) blir altså ikke redusert forholdsmessig – hele posten forsvinner.

**Når:** 200 m rett veg, standardmal, terreng i kote 100, vegen i kote 98. Terrengmodellen har et hull på 0,5 m bredde helt ute i kanten av tverrsnittet (offset 6,0–6,5 m, skjæringstoppen ligger på 6,97 m).

**Følge:** Renskvolumet faller fra 637,5 m³ til 0,0 m³ (−100 %), mens skjæringen bare faller fra 5 228,2 til 5 159,3 m³ (−1,3 %). Rensken er posten som går til deponi og til transport, så den forsvinner helt ut av kalkylen. Profilene får riktignok merknaden «Terrengmodellen har hull i dette tverrsnittet – volumet er ufullstendig», men den sier ikke at akkurat rensken er satt til null mens alt annet er delvis med. Et lite hull i laserdekningen (vann, skygge) ute i skråningskanten er vanlig i DTM1.

**Bevis:** beregnMasser kjørt med terreng.z = (x,y) => (y < −6 && y > −6.5 ? NaN : 100), sammenlignet med full dekning. sum.rensk: 637,5 → 0,0. sum.skjaering: 5228,2 → 5159,3.

### Ett oppmålt tverrsnitt slår av doseringen på hele vegen

`public/js/masser.js:284` · etterprøvd

**Hva:** tverrfallVed ekstrapolerer overstyringslisten konstant utenfor endepunktene (linje 284–288). Så snart listen har minst ett element, returneres aldri «standard» for noe profilnummer, og dermed er både takfallet fra malen og den ensidige doseringen i kurver under 60 m radius (linje 271–280) satt ut av spill på hele strekningen – ikke bare der brukeren målte.

**Når:** Veg med en venstresving på R = 15 m (sBC 85,0 – sEC 108,6). Brukeren måler opp ett tverrsnitt på profil 0 og skriver inn venstre vegkanthøyde; app.js settPunkthoyde legger da inn ett punkt {s: 0, venstre: 0,03, hoyre: 0,05} i P.tverrfall.

**Følge:** Uten overstyring gir profil 96,8 (midt i kurven) {venstre: 0,05, hoyre: −0,05} – ensidig dosering inn mot kurvesenteret, slik normalen krever. Med det ene punktet på profil 0 gir samme profil {venstre: 0,03, hoyre: 0,05} – takfall, altså fall utover i svingen. Vegkantshøyden på innersiden blir 2 · 0,05 · 2,25 = 0,225 m feil i stikningstabellen og i eksporten. Volumeffekten er liten (middelplanum er uendret), men vegen bygges galt, og grensesnittet merker bare det ene profilet som «overstyrt» – de øvrige gir ingen antydning om at de også er overstyrt. To målte snitt hjelper ikke: da interpoleres det mellom dem, og doseringen er fortsatt borte.

**Bevis:** M.tverrfallVed(StandardMal, [], 96.8, 0.06667) → {venstre:0.05, hoyre:−0.05}. M.tverrfallVed(StandardMal, [{s:0,venstre:0.03,hoyre:0.05}], 96.8, 0.06667) → {venstre:0.03, hoyre:0.05}. Samme med to punkt i endene → {venstre:0.04, hoyre:0.05}.

### Merknaden sier at skråningen er rettet til 0,02 – i virkeligheten blir hele massebalansen NaN

`public/js/masser.js:745` · etterprøvd

**Hva:** rettInngang (linje 741–747) kontrollerer skjaeringLosmasse, skjaeringFjell og fylling, men RETTER dem ikke – den skriver bare merknaden «… var NaN – regnet med 0.02 (nesten loddrett)». Kommentaren over sier at «skraningene normaliseres allerede», og viser til Math.max(0.02, m) på linje 384 og 428. Men Math.max(0.02, NaN) er NaN, ikke 0,02. Klemmen virker for 0 og for negative tall, men ikke for NaN eller undefined – nettopp de tilfellene merknaden er skrevet for.

**Når:** En prosjektfil som er redigert for hånd (eller et felt som ikke er tall) gir mal.skjaeringLosmasse = NaN. Kjørt på 200 m veg, terreng med 15 % sidefall, veg 2 m under terreng.

**Følge:** sum.skjaering, skjaeringFjell, skjaeringLosmasse og fylling blir alle NaN, og med dem hele balansen (manglerTotalt, tilDeponi, overskuddFjell = NaN). Samtidig er sum.rensk = 3 692 m³, sum.baerelag = 550 m³ og sum.slitelag = 80 m³ helt ordinære tall, så rapporten ser halvveis normal ut. I tillegg drukner de 42 følgemerknadene («Skråningen nådde ikke terrenget…») den ene merknaden som forklarer hva som er galt – og den merknaden sier feil ting: at det er regnet med 0,02. Samme for mal.fylling = NaN, som i tillegg gir stille null fylling uten NaN i det hele tatt.

**Bevis:** beregnMasser med mal {skjaeringLosmasse: NaN}: sum = {skjaering: NaN, skjaeringFjell: NaN, skjaeringLosmasse: NaN, fylling: NaN, rensk: 3700.0, slitelag: 80.0, baerelag: 550.0}, merknad «Skjæring i løsmasse var NaN – regnet med 0.02 (nesten loddrett)». Kontroll: Math.max(0.02, NaN) === NaN.

### Endring og sletting av fjellobservasjon er ikke dekket av Angre

`public/js/ui-kart.js:262` · ikke etterprøvd

**Hva:** Dybdefeltet (262) og Slett-knappen (265) i fjellpopupen kaller bare app.grunnEndret(), aldri app.merk(). Knekkpunktpopupen rett over gjør det riktig på 235 og 241, og klikk() gjør det på 184. Fordi merk() hopper over merket når JSON.stringify(P) er lik historikk._sist (app.js:34), blir tilstanden med observasjonen liggende som _sist. Neste merk legger da inn den ALLEREDE endrede tilstanden på angre-stabelen.

**Når:** Bruker taster 1,5 m i stedet for 4,0 m i dybdefeltet på en fjellobservasjon, oppdager feilen og trykker Ctrl+Z. Angre tar tilbake en helt annen, tidligere handling; dybden står fortsatt på 1,5. Samme for Slett: observasjonen kommer aldri tilbake.

**Følge:** Fjelldybden går rett inn i Fjellmodell og bestemmer fordelingen mellom løsmasse og sprengning – den dyreste enkeltposten i prisingen. En feiltastet eller feilslettet observasjon kan ikke rulles tilbake, og angre-stabelen gir feil inntrykk av at den ble det.

**Bevis:** d.querySelector('input').onchange = ev => { pt.dybde = parseFloat(ev.target.value) || 0; app.grunnEndret(); }; // ingen app.merk(...)

### Båndoppslaget for stigningskrav treffer feil bånd på grunn av flyttallsstøv i radien (utenfor mitt område, men verifisert)

`public/js/masser.js:180` · etterprøvd

**Hva:** maksStigningFraRadius velger bånd med if (R < r[0] + 1). Båndgrensene i stigningIKurve ligger på 14/19/29/39/…, altså akkurat på runde radier som 20, 30 og 40 m. Linjeforing regner R = T/tan(|avbøy|/2) og treffer 30 m med noen få 1e-15 i slingring, så en prosjektert 30-metersradius havner tilfeldig over eller under grensen.

**Når:** Én og samme veg, fire knekkpunkt, alle med r=30 tastet inn: IP1 får R = 30.000000000000000000 -> maks stigning 14 %. IP2 får R = 29.999999999999996 -> maks stigning 12 %. To identiske svinger på samme veg får ulikt krav.

**Følge:** Kurven som havner i feil bånd får merknaden «Stigning X % overstiger 12 %» der den egentlig skulle tålt 14 %. Trykker brukeren «Rett opp», flater programmet ut høydeprofilen der det ikke er nødvendig, og både skjæring og fylling endrer seg – uten at noe i tallene forteller hvorfor.

**Bevis:** for (const r of tab) { if (R < r[0] + 1) { rad = r; break; } } // R = 29.999999999999996 for en prosjektert 30 m radius

### «Masser per 20 meter» gir overlappende strekninger når profilavstanden ikke går opp i 20

`public/js/ui-rapport.js:317` · etterprøvd

**Hva:** Bolken velges med `Math.floor(iv.fra / bolk) * bolk`, men sluttverdien settes med `gjeldende.til = iv.til` (linje 330) og overstyrer `start + bolk`. Når profilavstanden ikke er en divisor av 20, strekker raden seg forbi neste bolkstart, og neste rad begynner likevel på sin egen bolkgrense. Overskriften «Masser per 20 meter» og kolonnen «Fra–til» beskriver da noe annet enn det som faktisk står i raden.

**Når:** Profilavstand 15 m (lovlig – feltet i index.html:232 tillater 1–100 i steg på 1). Rapporten får radene 0–30, 20–45, 40–60, 60–90, 80–105, 100–120 … Ved profilavstand 25 m: 0–25, 20–50, 40–75, 60–100. Ved 30 m: 0–30, 20–60, 60–90, 80–120.

**Følge:** Sumraden er riktig – hvert intervall telles nøyaktig én gang – men de enkelte radene kan ikke brukes til det de er laget for. Prises delstrekninger etter tabellen, blir 20–30 m regnet med i både «0–30» og «20–45». På eksemplet over betyr det at strekningen 20–30 m faktureres to ganger. Med profilavstand 5, 10 eller 20 m (standard er 5) er tabellen riktig, så feilen viser seg bare når noen setter opp profilavstanden.

**Bevis:** Prøveskript som kjører den nøyaktige løkken fra apneRapport() på ekte beregnMasser-resultater. dS=5/10/20: ingen overlapp. dS=3/7/15/25/30: 3–8 overlapp per tabell. Sum tabell = res.sum.skjaering i alle tilfeller.

### Stikningstabellen i utskriftsrapporten dropper profiler stille når avstanden ikke er et multiplum av steget

`public/js/ui-rapport.js:292` · etterprøvd

**Hva:** Filteret `Math.abs(p.s % steg) > 1e-6` slipper bare gjennom profiler som ligger nøyaktig på et multiplum av steg (5 m, eller 10 m når lengdeKart > 600). Er profilavstanden ikke en divisor av steget, faller de fleste profilene ut, og det som står igjen ligger med intervallet minste felles multiplum(dS, steg) – ikke med steg. Notisen under tabellen (linje 463-465) opplyser bare om CSV-ens oppløsning, ikke om tabellens.

**Når:** Veg på 200 m med profilavstand 7 m gir steg 5. Av 30 profiler kommer 7 med: 0, 35, 70, 105, 140, 175, 200 – altså hver 35. meter. Profilavstand 3 m gir 15 av 68 profiler, hver 15. meter. Veg på 700 m med profilavstand 15 m gir steg 10 og 25 av 48 profiler, hver 30. meter.

**Følge:** Rapporten som tas med ut i felt for utsetting har opptil 5 ganger færre punkter enn beregnet, uten at noe sier fra. Koordinatene som står der er riktige, så feilen oppdages først ute på anlegget når punktene mangler.

**Bevis:** Prøveskript med den nøyaktige filterlinjen mot ekte res.profiler: (200 m, dS 7, steg 5) → 7 av 30; (200 m, dS 3, steg 5) → 15 av 68; (700 m, dS 15, steg 10) → 25 av 48; (700 m, dS 25, steg 10) → 15 av 29.

### Raden «Sprengning ved 0,5 m grunnere fjell» er ikke et halvmetersbom når standarddybden er under 0,5 m

`public/js/ui-rapport.js:190` · etterprøvd

**Hva:** app.js:451 klemmer med Math.max(0, standarddybde + tillegg), så «grunnere»-kjøringen kan ikke gå under 0 m. Rapportlinjen påstår likevel «0,5 m grunnere» uansett. Ved standarddybde under 0,5 m er den faktiske endringen mindre enn 0,5 m, og ved 0 m er den ingen endring i det hele tatt.

**Når:** Standarddybde 0,2 m – helt vanlig på grunnlendt skogsmark. Rapporten viser «Sprengning ved 0,5 m grunnere fjell 3 271 m³» og «Sprengning nå 3 271 m³»: to rader med nøyaktig samme tall, der etiketten sier at de skal være forskjellige. Ved standarddybde 0,3 m er «grunnere»-raden i virkeligheten et bom på 0,3 m, mens «dypere»-raden er 0,5 m – spennet blander to ulike størrelser.

**Følge:** Usikkerhetsboksen ser ut som om sprengningsvolumet er sikrere enn det er nettopp der fjellet ligger grunt og risikoen er størst. Med standarddybde 0,2 m blir det viste spennet 696 m³ mot 1 073 m³ ved 0,5 m, selv om den fysiske usikkerheten er den samme.

**Bevis:** Prøveskript: standarddybde 0,2 → grunnere 3271, na 3271, dypere 2575 (spenn 696). Standarddybde 0,3 → grunnere 3271 (faktisk endring 0,30 m), na 3126, dypere 2447. Standarddybde 0,5 → grunnere 3271, na 2845, dypere 2199 (symmetrisk).

### «Eksporter alle» legger null i sikkerhetskopien for prosjekter som ikke lot seg hente, og teller dem likevel med

`public/js/lager.js:145` · etterprøvd

**Hva:** eksporterAlle() gjør `alle.push(await this.hent(p.navn))` uten å sjekke returverdien, og returnerer `alle.length`. Et prosjekt hent() ikke får tak i blir til null i JSON-en, og tellingen som vises brukeren er antall rader i listen, ikke antall prosjekter som faktisk kom med. Ved gjeninnlesing hopper importer() over null uten et ord (linje 166).

**Når:** To prosjekter i lageret, ett av dem uleselig (ødelagt rad, eller feilkombinasjonen i funn 2/3 der hent() bommer). app.js:1553 skriver «Eksporterte 2 prosjekt», mens fila inneholder [null, {…}]. Leses den inn igjen senere, kommer bare det ene tilbake – uten feilmelding.

**Følge:** Brukeren tror han har en fullstendig sikkerhetskopi. En sikkerhetskopi som stille mangler et prosjekt er verre enn en som feiler høylytt, fordi originalen kan bli slettet i tillit til den.

**Bevis:** Prøveskript: hent() stubbet til å gi null for «To». Statusmelding «Eksporterte 2 prosjekt», fil-innhold prosjekter = [null,"En"], gjeninnlesing ga ['En'] uten varsel.

### CSV-ene får BOM for Excel, men bruker punktum som desimalskilletegn – i norsk Excel går de ikke opp

`public/js/ui-rapport.js:507` · ikke etterprøvd

**Hva:** BOM-valget i seg selv er riktig per format (se dekningsnotatet). Men BOM-en er der utelukkende for at fila skal kunne åpnes rett i Excel, og både eksportStikning() (linje 519-532) og eksportMasser() (linje 538-550) skriver semikolon som feltskilletegn sammen med toFixed(), altså punktum som desimaltegn. På et norsk Windows er semikolon riktig listeskilletegn, men desimaltegnet er komma – kombinasjonen er selvmotsigende.

**Når:** Brukeren dobbeltklikker Skogsveg_masser.csv. Kolonnene deler seg riktig på semikolon, æ/ø/å er riktige takket være BOM-en, men tallkolonnene kommer inn som tekst i stedet for tall – de kan ikke summeres eller sorteres. Korte verdier på formen d.mm, som A_fylling «3.05» eller Fjelldybde «1.20», treffer i tillegg norsk kortdatoformat (dd.MM) og blir konvertert til datoer.

**Følge:** Masseoppsettet – det man faktisk priser jobben ut fra i regneark – må renses manuelt før det kan regnes på, og enkelttall kan komme inn som datoer uten at det er lett å se. Nettlesertesten sementerer formatet: nettlesertest.js:328 krever nettopp /\d{6}\.\d{3};\d{6}\.\d{3}/.

**Bevis:** Verifisert i kildekoden og i prosjektets egen nettlesertest: BOM = U+FEFF (bekreftet ved kodepunktdump av ui-rapport.js:508), skilletegn = ';', desimaler = toFixed(). Selve Excel-oppførselen (tekst-import og dd.MM-konvertering) er ikke kjørt her.

### Slett-knappen i linjetabellen bruker et foreldet radnummer, og kan ikke angres

`public/js/app.js:1425` · etterprøvd

**Hva:** onclick = () => { this.P.ip.splice(i, 1); this.linjeEndret(); } – i er fanget da raden ble tegnet, og linjeEndret() er bare planlegg(120), så tabellen tegnes først 120 ms senere. Raden blir stående i DOM-en og er klikkbar hele tiden. De tilsvarende slette-knappene i høydetabellen (1327) og strekningstabellen (1122) tegner tabellen om synkront og er derfor trygge. Knappen kaller heller ikke merk(), mens den samme handlingen i kartet (ui-kart.js:241) gjør det.

**Når:** Linjen har 5 knekkpunkt. Bruker dobbeltklikker på × i rad 2 – eller klikker × i to ulike rader innenfor 120 ms.

**Følge:** To knekkpunkt forsvinner i stedet for ett (5 → 3), eventuelt feil knekkpunkt ved klikk i to rader. Ingen bekreftelse, og fordi merk() ikke kalles svarer Ctrl+Z «Ingenting å angre». Traseen må tegnes opp igjen.

**Bevis:** Kjørt mot ekte app.js (p13): knekkpunkt (lon) 7.209 7.2098 7.2124 7.214 7.2149 → etter et dobbeltklikk 7.209 7.214 7.2149; «angre-stabelen: 0 steg · Ingenting å angre».

### «Nytt prosjekt» lagrer ikke først, og lar _lagretSom peke på det forrige prosjektet

`public/js/app.js:1620` · etterprøvd

**Hva:** Knappen bekrefter bare («Det du har tegnet nå forsvinner hvis det ikke er lagret»), men kaller aldri autolagre() slik apne() gjør på linje 1584, og nullstiller aldri this._lagretSom. Den venteklokka planleggAutolagring satte, blir heller ikke ryddet – og når den ringer, er navnet «Nytt prosjekt» og autolagre() går ut på linje 1498.

**Når:** Bruker flytter et knekkpunkt i «Vei A» og klikker «Ny» innen to sekunder, og bekrefter.

**Følge:** Endringen er borte: «Vei A» på disk står med lat 58.296800, mens arbeidet var 58.297700. Samme handling via «Åpne» ville blitt lagret først. I tillegg regnes det nye, tomme prosjektet straks som ulagret, fordi _lagretSom fortsatt inneholder «Vei A» – merket på Lagre-knappen står på og hjelpeteksten sier «Det er endringer som ikke er lagret» før brukeren har gjort noe. Det merket er den eneste beskjeden brukeren har om hvorvidt arbeidet er trygt.

**Bevis:** Kjørt mot ekte app.js (p2 pkt. 3): «lagret underveis: [] · «Vei A» på disk har lat 58.296800 – arbeidet var 58.297700 · endringen er tapt: true · _lagretSom … regnes som «ulagret»: true · lagre-knappen sier: Det er endringer som ikke er lagret».

### Autolagringen plukker prosjektnavnet rett ut av skrivefeltet, også midt i innskrivingen

`public/js/app.js:1497` · etterprøvd

**Hva:** autolagre() leser «document.getElementById('prosjektnavn').value», setter this.P.navn = navn og lagrer under det. Klokka ble satt av forrige beregn()/merk(), og tasting i navnefeltet nullstiller den ikke. Dermed kan navnet være halvskrevet når klokka ringer.

**Når:** Bruker gjør en endring (klokka settes), klikker straks i navnefeltet og begynner å skrive «Vei Austre». To sekunder senere står det «Vei» i feltet når autolagringen slår til.

**Følge:** Det opprettes et prosjekt som heter «Vei», og this.P.navn blir «Vei». Når brukeren skriver ferdig og forlater feltet, lagres arbeidet videre under «Vei Austre», slik at listen sitter igjen med både «Vei A» (gammel), «Vei» (halvskrevet, uferdig innhold) og «Vei Austre». Det er lett å åpne feil av dem senere og prise jobben på et foreldet grunnlag.

**Bevis:** Kjørt mot ekte app.js (p2 pkt. 4): «lagret som: ['Vei A','Vei'] · P.navn er nå: Vei · prosjekt i lageret: Vei A, Vei B, Vei».

### Sletter du prosjektet som står åpent, kommer det tilbake ved neste autolagring

`public/js/app.js:1545` · etterprøvd

**Hva:** Slettingen i apneDialog fjerner raden i lageret, men rører ikke this.P, this.P.navn, navnefeltet eller _lagretSom. Neste beregn() planlegger autolagring, og autolagre() (1493-1506) skriver prosjektet inn igjen under samme navn. Bekreftelsesteksten er «Slette prosjektet «X»? Dette kan ikke angres.»

**Når:** Bruker har «Vei A» åpen, sletter den fra «Åpne»-dialogen for å rydde, og fortsetter å jobbe i det som fortsatt står på skjermen.

**Følge:** Listen er tom rett etter slettingen, men to sekunder etter neste redigering står «Vei A» der igjen. En handling som er merket som endelig blir stille omgjort, og brukeren har ingen måte å se om et prosjekt faktisk er borte.

**Bevis:** Kjørt mot ekte app.js (p6): «etter Slett: prosjekt i lageret: [] … etter neste redigering + autolagring: prosjekt i lageret: ["Vei A"] → det slettede prosjektet er tilbake: true».

### Bare det å åpne et prosjekt merker det som ulagret og skriver det om på disk

`public/js/app.js:1600` · etterprøvd

**Hva:** _lagretSom settes på linje 1600, men oppdater() på linje 1605 endrer this.P etterpå: justerProfilTilLengde() legger til et endepunkt når siste høyde ligger mer enn 0,5 m fra veglengden, og lagProfilforslag() lager en helt ny høydeliste når prosjektet har færre enn to høyder. Deretter kaller beregn() planleggAutolagring() (linje 393), som skriver fila om.

**Når:** a) Bruker åpner «Vei A» og rører ingenting. b) Bruker åpner et prosjekt der bare senterlinjen er tegnet og høydene skal komme fra innmåling senere.

**Følge:** a) harUlagret() er sann og «ulagret»-merket på Lagre-knappen tennes straks, uten at brukeren har gjort noe – merket slutter å bety noe. Fila skrives om (11 → 12 høydepunkt) og «endret»-datoen settes til nå, så sorteringen i prosjektlisten slutter å vise når man faktisk jobbet med hva. b) Fila får 11 maskingenererte høydepunkt skrevet inn i seg bare av å bli åpnet. Av samme grunn gir ikke Angre nøyaktig tilbake den lagrede tilstanden heller (11 → 12 høydepunkt etter ett Ctrl+Z, volumet uendret).

**Bevis:** Kjørt mot ekte app.js (p8): «harUlagret(): true · «ulagret»-merket på Lagre: true · _lagretSom == det som ble hentet: true · autolagringen skrev ['Vei A'] · fila er endret av det: true · vip 11 -> 12». Og: «etter åpning har prosjektet 11 høydepunkt (fila hadde 0) … fila har nå 11 høydepunkt».

### skjemaTilMal sin vakt mot tomme felt treffer ikke profilavstanden

`public/js/app.js:1072` · etterprøvd

**Hva:** tall() henter reserveverdien med «m[id.replace(/^m_/,'')] ?? f[…] ?? g[…]». profilAvstand ligger ikke i mal, faktorer eller fjell, men rett på this.P, så oppslaget for 'm_profilAvstand' gir undefined i alle tre. Vakten faller da gjennom til «felt.value = 0; return 0», og linje 1099 gjør «Math.max(1, 0)» = 1. Alle andre felt i skjemaet beholder den gamle verdien slik kommentaren på linje 1064-1067 lover.

**Når:** Bruker markerer innholdet i «Profilavstand» for å skrive et nytt tall og forlater feltet før det nye tallet er skrevet – eller taster noe som ikke er et tall.

**Følge:** Profilavstanden faller fra 5 m til 1 m uten beskjed, mens feltet viser 0 – verken det brukeren satte eller det programmet regner med. Beregningen kjøres med fem ganger så mange tverrsnitt (tregere), og profilavstanden som følger med i rapporten og i stikningsuttrekket blir 1 m. Selve massetallene endrer seg lite (målt 0,2 % på et 400 m strekk), men tallet som vises er feil.

**Bevis:** Kjørt mot ekte app.js (t1): «P.profilAvstand = 5, felt = 5» → tømt felt → «P.profilAvstand = 1, felt m_profilAvstand = "0"». Til sammenlikning beholder m_vegbredde 4.5 og f_sprengningsfaktor 1.5.

### rettOpp og balanser tar angre-merket før de sjekker om de har noe å gjøre

`public/js/app.js:637` · etterprøvd

**Hva:** rettOpp() kaller this.merk(...) på linje 637, før kontrollene på 638-645 som kan returnere uten å endre noe. balanser() gjør det samme på linje 757, før «if (!this.terreng || !this.linje) return» og før låskontrollen. Siden merk() lagrer tilstanden slik den er FØR endringen, blir et fullgodt angre-steg lagt inn selv om ingenting skjedde.

**Når:** Bruker flytter et knekkpunkt, og trykker så «Rett opp» før det finnes en profil (statuslinjen svarer «Ingen profil å rette ennå»). Deretter trykker han Angre for å ta tilbake flyttingen.

**Følge:** Angre-knappens hjelpetekst sier «Angre «rett opp»», og første trykk gjør ingenting synlig – statuslinjen sier «Angret «rett opp»» mens prosjektet står helt likt. Brukeren må trykke to ganger for å angre én handling, og har ingen måte å vite det på. I en travel prising er det lett å tro at Angre ikke virker, og å trykke flere ganger enn man skulle.

**Bevis:** Kjørt mot ekte app.js (p1 pkt. 3): «prosjektet er urørt: true · angre-steg før/etter: 1 -> 2 · knappen lover: Angre «rett opp» · etter ett trykk på Angre – endret prosjektet seg? false».

### «Fyll inn» kaster innmålte, låste høyder som ligger midt mellom to steg

`public/js/app.js:1383` · etterprøvd

**Hva:** fyllHoyder beholder en låst høyde bare når «Math.abs(v.s - ss) < steg / 2» for en av rutestasjonene. En låst høyde som ligger nøyaktig steg/2 fra begge nabostasjonene faller utenfor begge vinduene, og ligger heller aldri i den nye listen – bare rutestasjonene og eventuelt sluttpunktet pushes. Ligger to låste høyder innenfor samme vindu, tar find() bare den første. Doc-kommentaren på 1375 sier at funksjonen skal fylle «med terrenghøyde der det ikke finnes noe fra før».

**Når:** Innmålte veghøyder hver 5 m er limt inn som låste høyder. Bruker klikker «Fyll inn hver 20 m» for å få jevn profilavstand i tabellen.

**Følge:** 45 av 61 innmålte høyder (74 %) forsvinner uten en eneste melding – statuslinjen viser fortsatt «La inn 61 låste høyder» fra forrige handling. Med innmåling hver 10 m og fyll hver 20 m forsvinner 15 av 31. Volumvirkningen målt på en bølget innmålt veglinje var beskjeden (skjæring -192 m³, -1 %), men selve innmålingsdataene er borte, og fordi fyllHoyder ikke kaller merk() kan de ikke hentes tilbake med Ctrl+Z.

**Bevis:** Kjørt mot ekte app.js (p13/p14/p15): «innmålt hver 5 m, «Fyll inn hver 20 m»: 61 → 16 låste høyder · 45 kastet»; «innmålte høyder som er borte: 10 → 10 30 50 70 90 110 130 150 170 190»; statuslinjen: «La inn 21 låste høyder».

### Reservefallet i z() tar gjennomsnittet av hjørnene i stedet for å bruke interpolasjonsvektene

`public/js/terreng.js:150` · etterprøvd

**Hva:** Når ett av de fire hjørnene mangler, forkastes hele den bilineære vektingen og det returneres et uvektet gjennomsnitt av de gyldige hjørnene. Kommentaren på linje 149 sier «fall tilbake pa naermeste gyldige nabo», men koden gjør noe annet. Konsekvensen er at et hjørne med vekt 0 — altså et hjørne som matematisk ikke skal telle i det hele tatt — likevel ødelegger et ellers eksakt svar, og at resultatet blir en flat platå-verdi som er uavhengig av hvor i cellen man spør.

**Når:** Én flis lastet (171_25344, ekte DTM1 fra Lyngdal-området). Spør i nøyaktig pikselsenter i nederste rad (j=255), der dx = dy = 0 og korrekt svar er selve rasterverdien. De to nedre hjørnene ligger i naboflisen og er NaN, med vekt 0. Verste treff: i=7, rasterverdi 255.010 m, z() svarer 255.480 m.

**Følge:** 0.470 m feil i et punkt der svaret skulle vært eksakt. Langs kanten av et datahull (eller en flis som ikke ble hentet) blir høyden konstant over et 1 m bredt belte: målt 254.955 m der fasit varierer fra 254.868 til 254.944 m. Feilen er begrenset til ett pikselbelte, så volumutslaget er lite, men den ser ut som ekte terreng og gir ingen merknad.

**Bevis:** Med alle fire naboflisene lastet er z() i pikselsenter eksakt (største avvik 0.000 m over 400 prøver, og en syntetisk lineær flate treffes til 3.7e-6 m for res = 1, 2 og 4 over 200 000 punkt, også ved negative flisindekser). Avviket oppstår bare når reservefallet slår inn. Målt maks 0.275 m over 200 punkt langs kanten av en manglende flis, 0.470 m i pikselsenter.

### min stemmer ikke med step på fem talfelt – pilene gir verdier på feil rutenett

`public/index.html:190` · etterprøvd

**Hva:** HTML regner step fra min som utgangspunkt. m_skjaeringLosmasse har min=0.02 og step=0.1 (index.html:190), m_skjaeringFjell min=0.02 og step=0.05 (191), m_fylling min=0.02 og step=0.1 (192), m_maksSokebredde min=1 og step=5 (233), g_rekkevidde min=1 og step=10 (249). Startverdiene ligger ikke på det rutenettet, så alle fem rapporterer validity.stepMismatch = true fra første sekund, og pilene snapper til rutenettet i stedet for å legge til ett steg.

**Når:** Brukeren står på 1:0,2 for fjellskjæring og trykker pil opp én gang for å prøve 1:0,25. Feltet viser 1:0,22. Trykker han pil ned fra 1:1,5 på løsmasseskjæringen, får han 1:1,42 og ikke 1:1,4. Verdiene er synlige i feltet, så dette lyver ikke – men brukeren får en annen skråning enn han ba om, og det er lett å ikke se på et 78 px felt.

**Følge:** Målt: 1.5 → 1.52 / 1.42 (ventet 1.6 / 1.4), 0.2 → 0.22 / 0.17 (ventet 0.25 / 0.15), 45 → 46 / 41 (ventet 50 / 40), 60 → 61 / 51 (ventet 70 / 50). På en 8 m dyp fjellskjæring er 1:0,22 mot 1:0,25 om lag 0,24 m smalere topp per side; utslaget på volumet er noen få prosent, ikke katastrofalt, men det er ikke det brukeren valgte. Enten bør min settes til et tall som ligger på step-rutenettet, eller step settes slik at startverdien treffer.

**Bevis:** Kjørte stepUp/stepDown på alle 34 number-felt i den lastede siden og sammenlignet med verdi ± step. Åtte felt avvek; to av dem (m_beregningsbredde og m_sideforskyvning ned fra 0) er korrekt stoppet av min=0, ett er m_tverrfall (eget funn), de fem øvrige er disse.

### Skyveren for tverrprofil har max="100" og når derfor ikke alle profilene på lange veier

`public/index.html:89` · etterprøvd

**Hva:** tverrSkyver er min=0 max=100 med standard step=1, altså 101 mulige stillinger. ui-tverrprofil.js:16 regner om til profilindeks med Math.round(skyver.value / 100 * (res.profiler.length - 1)). Har veien flere enn 101 tverrprofil, finnes det profiler ingen skyverstilling treffer. Skyveren burde hatt max = antall profiler − 1.

**Når:** En 2 km skogsbilveg med standard profilavstand 5 m gir 401 tverrprofil. Brukeren drar i skyveren for å lete opp den dyreste fjellskjæringen og kommer aldri til tre av fire profiler. De er bare tilgjengelige via ◀/▶-knappene ett steg av gangen, eller ved å klikke i lengdeprofilen.

**Følge:** Regnet ut: 600 m veg → 121 profil, skyveren når 101 (83 %). 1000 m → 201 profil, når 101 (50 %). 2000 m → 401 profil, når 101 (25 %). 1000 m med 1 m profilavstand → 1001 profil, når 101 (10 %). I tillegg skriver vis() (ui-tverrprofil.js:116) posisjonen tilbake avrundet, så etter et steg med ◀/▶ vil neste nudge på skyveren hoppe til et annet profil enn nabo­profilet. Ingen tall blir feil – men profiler brukeren skal kontrollere før han priser, er ikke til å komme til.

**Bevis:** Talte opp hvor mange ulike indekser Math.round(v/100*(n-1)) gir for v = 0..100, for realistiske veglengder. Bekreftet mot det åpne prosjektet i nettleseren (87 profil – der når skyveren alle 87).

### 27 talfelt i sidepanelet har label uten kobling – ingen tilgjengelig navn, og labelen er ikke klikkbar

`public/index.html:176` · etterprøvd

**Hva:** Oppsettet .felt (app.css:329-337) legger <label>, <input> og en enhet-<span> som tre søsken i et grid. Labelen har verken for-attributt, og inputen ligger ikke inni labelen. Dermed er de ikke koblet. Det gjelder alle 25 feltene i Vegmal-fanen (index.html:176-240), begge i Grunnforhold (248-249), samt de fem nedtrekkene m_veiklasse, m_tverrfallType, m_lassretning, bakgrunnskart og pdfTegning, og prosjektnavn-feltet (22). Enheten i span-en («%», «m», «1:x») er heller ikke del av det tilgjengelige navnet. Til sammenligning er tp_venstre/tp_senter/tp_hoyre, vipAvstand, kVerdi, h_steg, h_nyS, h_nyZ og avkryssingsboksene riktig pakket inn i <label>.

**Når:** En bruker med skjermleser tabber gjennom Vegmal-fanen og hører «spinknapp, 4,5» tjuefem ganger uten å få vite hva noen av feltene er, eller hvilken enhet de er i – akkurat de feltene der forskjellen på prosent og forhold er poenget (jf. tverrfallsfunnet over). Uten skjermleser: å klikke på teksten «Tverrfall (kuv)» fokuserer ikke feltet, slik man forventer, og treffflaten blir bare de 78 pikslene.

**Følge:** Bryter WCAG 2.1 SC 1.3.1 og 4.1.2 for det panelet som styrer hele beregningen. I tillegg: knappene tverrForrige og tverrNeste (index.html:88 og 90) har bare tegnene ◀ og ▶ som innhold og verken title eller aria-label – de er de eneste symbolknappene i grensesnittet uten noen av delene (alle andre, ⤢ ◧ ↶ ↷ ↺ ? ×, har title). Og statuslinja (index.html:31), som er stedet programmet melder «Lagret», «Leste inn 120 høyder fra PDF-en» og «Angret «flyttet punkt»», har verken aria-live eller role=status, så ingenting av det blir annonsert.

**Bevis:** Gikk gjennom alle input/select/textarea i den lastede siden og sjekket label[for], nærmeste <label>-forelder, aria-label og aria-labelledby: 82 kontroller uten kobling, 13 med. Tilsvarende sjekk på alle <button> uten bokstaver i teksten: bare tverrForrige og tverrNeste manglet både title og aria-label. statuslinje: aria-live=null, role=null.

### px skrives i MKT1-hodet, men leses aldri – en flis med feil oppløsning blir lest som gyldig terreng

`lib/hoydedata.js:170` · etterprøvd

**Hva:** pakkFlis legger antall piksler i byte 6-7 av hodet, men public/js/terreng.js pakkOppFlis (linje 38-48) hopper over feltet og bruker sin egen P = Math.round(256/res). Serverens pakkOpp leser det, men bare testene bruker den. Ingen sammenligner hodets px med det klienten forventer, og ingen sammenligner filstørrelsen med px*px. Formatet bærer altså akkurat den opplysningen som ville avslørt en feiltolket flis, og kaster den.

**Når:** En flis pakket med px=128 (res=2) leses av en klient som tror den har res=1 og P=256. Ingen unntak, ingen advarsel: 38 av 200 oppslag ga tall, 162 ble NaN, og største høydefeil på de tallene som kom ut var 57,20 m. Utløsere som faktisk finnes i dag: (a) den stille klemmingen av res i api/dtm/flis.js – res=-3 gir 200 OK med en 1 m-flis, (b) en gammel cache-fil fra en versjon der Math.round(TILE_M/res) ga et annet px for samme filnavn, (c) en avkortet cache-fil.

**Følge:** Terreng med titalls meters feil presenteres som gyldige høyder i stedet for å bli avvist. Ikke nåbart fra dagens grensesnitt, som bare bruker res 1 og 2, men det er ingenting i formatet eller i lesingen som stopper det – kontrollen finnes bare i at avsender og mottaker tilfeldigvis regner likt.

**Bevis:** Kjørt med en ekte res=2-flis fra tjenesten matet inn i en Terreng med res=1.

### res klemmes stille, NaN slipper gjennom valideringen, og res 3/5/6/7 ødelegger fliskoordinatene

`api/dtm/flis.js:17` · etterprøvd

**Hva:** Math.max(1, Math.min(8, parseInt(q.res || '1', 10))) har tre problemer. (1) parseInt('abc') gir NaN, og både Math.min og Math.max forplanter NaN – valideringen på linje 20 sjekker bare sr, tx og ty, så NaN slipper videre til hentFlis. (2) Klemmingen endrer stille svaret i stedet for å avvise: res=-3 gir 200 OK med en 1 m-flis, res=16 gir en 8 m-flis, og klienten får ingen beskjed om at den fikk noe annet enn den ba om. (3) Området 1..8 tillater res der Math.round(256/res)*res != 256: res=3 gir px=85 (cellestørrelse 3,0118 m), res=5 gir 51, res=6 gir 43, res=7 gir 37.

**Når:** For res=3: lastKorridor i terreng.js henter flisen med Math.floor(x/256), mens _celle finner flisen med Math.floor(gi/P). For punktet (43786, 6488310) henter lastKorridor tx=171/ty=25344, mens _celle slår opp i tx=171/ty=25444 – 100 fliser, altså 25,6 km, for langt nord. For res=abc blir cache-filnavnet 25833_NaNm_171_25344.bin og svaret blir HTTP 502 med den villedende meldingen «Fikk ikke terrengdata: Ikke en TIFF-fil».

**Følge:** res 3, 5, 6 og 7 gir enten NaN over hele traseen eller, dersom nabofliсen tilfeldigvis er lastet, terreng fra et helt annet sted – uten feilmelding. Nåes ikke fra grensesnittet i dag (app.js linje 272 velger bare 1 eller 2), men API-et er dokumentert i toppkommentaren som res=1..8 og har CORS åpnet for alle i vercel.json, så det er en publisert kontrakt som ikke holder.

**Bevis:** Klemmingen og NaN-veien kjørt direkte gjennom api/dtm/flis.js sin handler; flisavviket regnet ut med de faktiske formlene fra terreng.js.

### Feilsvar får lang hurtigbuffer, og api/sok.js gjør total tjenestesvikt om til «ingen treff»

`api/punkt.js:16` · etterprøvd

**Hva:** svar()-hjelperen i begge filene setter Cache-Control på alle svar, også 400 og 502: max-age=86400 i api/punkt.js og max-age=3600 i api/sok.js. I tillegg svelger api/sok.js linje 31 og 43 alle feil fra Geonorge med .catch(() => {}) og svarer 200 med { treff: [] }.

**Når:** Geonorge har et kort avbrudd mens brukeren søker etter «Ydestad». Begge oppslagene feiler, catch-blokkene svelger dem, og api/sok.js svarer 200 { treff: [] } med Cache-Control: public, max-age=3600. Nettleseren og Vercel-kanten lagrer «dette stedet finnes ikke» i en time. Tilsvarende for api/punkt.js: et 502 fra kontrolloppslaget mot punkt-API-et blir bufret i et døgn.

**Følge:** Brukeren får «fant ingenting» for et gyldig stedsnavn og har ingen måte å komme forbi det på annet enn å tømme nettleserbufferen – tjenesten kan være oppe igjen etter ti sekunder uten at det hjelper. For api/punkt.js betyr det at kontrollen mot Kartverket, som er den eneste uavhengige sjekken programmet har på at høydene stemmer, kan være låst i feiltilstand i 24 timer.

**Bevis:** Begge handlerne kalt direkte med en falsk response; hodene lest av: 400 med «Cache-Control: public, max-age=86400» fra api/punkt.js og 400 med «max-age=3600» fra api/sok.js.

### «Massebalanse flytter balansen mot null» er sann for en funksjon som ikke gjør noe

`public/js/nettlesertest.js:171` · ikke etterprøvd

**Hva:** Påstanden er Math.abs(App.resultat.balanse.balanse) <= Math.abs(forBalanse) + 1 der forBalanse ble lest rett før kallet. Blir verdien uendret, er den oppfylt. Blir den 1 m³ verre, er den også oppfylt. App.balanser() (app.js:756-762) returnerer tidlig uten å regne om noe hvis !this.terreng, !this.linje eller alle VIP-er er låst — i alle disse tilfellene passerer påstanden. Testens navn lover at balansen flyttes mot null; det den faktisk kontrollerer er at den ikke blir mer enn 1 m³ verre.

**Når:** App.balanser() erstattet med en tom funksjon: forBalanse og den nye verdien er identiske, |x| <= |x| + 1 er sann, testen står grønn. Samme resultat hvis den tidlige returneringen på app.js:759 slår inn fordi høydene er låst — da skrives det en statuslinje og påstanden passerer likevel.

**Følge:** Massebalanseringen er en av de fire knappene som lager selve veglinja, og den eneste testen av den kan ikke skille «virker» fra «gjør ingenting». En regresjon som gjør balanseringen til en no-op ville gitt grønn test.

**Bevis:** nettlesertest.js:169-172. Kodelesing av app.js:756-762 viser tre tidligreturneringer som ikke rører App.resultat. Slingringen er ensidig og tillater at resultatet blir dårligere.

### «Optimaliser kjører uten feil» er en påstand som ikke kan bli usann

`public/js/nettlesertest.js:219` · ikke etterprøvd

**Hva:** Linje 218-219: await App.optimaliser(); this.sjekk('«Optimaliser» kjører uten feil', !!App.resultat). App.resultat er allerede satt av App.beregn() i fra() på linje 186 og av App.rettOpp på linje 196, og optimaliser() setter den aldri til null. Kaster den, fanges det av det ytre try/catch i kjor() og rapporteres som «testen kom seg gjennom uten å kaste» — ikke som at optimaliseringen feilet. Returnerer den tidlig (app.js:796, 800, 801-804), passerer påstanden. Det finnes ingen kontroll av at optimaliseringen faktisk forbedret noe.

**Når:** App.optimaliser() erstattet med en funksjon som bare returnerer: App.resultat er uendret og sann, påstanden passerer. Merk også at kallet skjer uten argumenter — App.optimaliser(stille, modus) får stille=undefined og modus=undefined, så «billigst»-grenen kjøres, og «inngrep»-grenen er ikke dekket av dette kallet.

**Følge:** Programmets tyngste funksjon — den som søker fram en billigere vertikalprofil — har én test, og den kan ikke feile. En optimalisering som stopper med det første forslaget eller returnerer et dårligere resultat ville aldri blitt oppdaget.

**Bevis:** nettlesertest.js:186 (App.beregn() setter App.resultat), 196 (App.rettOpp), 218-219. app.js:795-804 viser tre tidligreturneringer i optimaliser().

### «Minst inngrep» og «Billigst» sammenlignes toveis med samme slingring — en rettOpp som ignorerer modus passerer

`public/js/nettlesertest.js:205` · ikke etterprøvd

**Hva:** Begge påstandene bruker slingring = (a, b) => a <= b * 1.03 + 1, én i hver retning (linje 205-210). Er de to resultatene identiske, er begge oppfylt. En rettOpp(modus) som ignorerer modus-argumentet fullstendig og alltid kjører «billigst» ville derfor bestå. Kommentaren over (linje 199-203) sier selv at «en streng sammenligning sier mer om støyen enn om modusene», men følgen er at ingen påstand i det hele tatt kontrollerer at modus-argumentet har effekt.

**Når:** App.rettOpp(modus) endret slik at modus-argumentet forkastes og «billigst» alltid brukes: inngrep.rensk === billigst.rensk og inngrep.fjell === billigst.fjell, begge slingringspåstandene sanne. Påstandene på linje 211-216 («Minst inngrep flytter mindre masse enn utgangspunktet», «krymper fotavtrykket», «gyldige tall og færre brudd») måler mot det saboterte utgangspunktet, ikke mot billigst, og passerer også.

**Følge:** To knapper i grensesnittet lover to ulike ting til brukeren: minst mulig sprengning mot minst mulig inngrep i terrenget. Testen kan ikke skille dem. Velger entreprenøren «Minst inngrep» for å holde seg innenfor et arealkrav, finnes det ingen test som bekrefter at knappen gjør noe annet enn den andre.

**Bevis:** nettlesertest.js:204-216. Slingringen er symmetrisk anvendt (linje 206 og 209), så a === b oppfyller begge. Ingen påstand kontrollerer at inngrep- og billigst-resultatene er forskjellige.

### Modulkontrollen kan aldri rapportere «ikke lastet» — den avbryter i stedet hele testen

`public/js/nettlesertest.js:107` · etterprøvd

**Hva:** Påstanden er typeof window[n] !== 'undefined' || typeof eval(n) !== 'undefined'. typeof beskytter bare et bart navn; typeof eval(n) kjører eval først, og eval på et udefinert navn kaster ReferenceError. Påstanden kan derfor bare bli sann eller kaste — sjekk(..., false) er uoppnåelig. Kastet fanges av det ytre try/catch i kjor() (linje 72-74), som avbryter modulene() og de 16 gjenstående seksjonene og rapporterer én linje: «testen kom seg gjennom uten å kaste».

**Når:** Verifisert i node: typeof (0,eval)('Math') → true; typeof (0,eval)('IkkjeDefinert') → kaster ReferenceError. Mangler for eksempel Tverrprofil-modulen i index.html, får operatøren ikke «modulen Tverrprofil er ikke lastet», men en enkelt generisk feillinje — og lagring, tegning, høyder, veiklasser, tverrprofil, grenser, eksport, PDF-rapport, PDF-avlesning, rapport og paneler blir aldri kjørt.

**Følge:** Et resultat som «14 ok, 1 feil» ser i boksen nesten like bra ut som «250 ok, 0 feil», og ingenting kontrollerer at forventet antall påstander faktisk ble kjørt. Én tidlig kastet feil skjuler at 90 % av testen aldri gikk. Det samme gjelder enhver annen seksjon som kaster.

**Bevis:** node -e-kjøring: «finst : true» / «manglar: KASTA: ReferenceError». nettlesertest.js:72-74 viser at kjor() fanger kastet og avslutter alle gjenstående seksjoner; rapporter() (linje 743-761) viser ingen kontroll av totalt antall påstander.

### Geo.bakkefaktor har ingen test i det hele tatt — både fortegnsbytte og k mot 1/k slipper gjennom

`public/js/geo.js:127` · etterprøvd

**Hva:** Geo.bakkefaktor(x, y, sonenr, hoyde) er den eneste eksporterte geo-funksjonen som ingen test kaller. Selftesten kontrollerer sone, epsg, soneFraEpsg, midtmeridian, tilUtm, fraUtm og malestokk, men ikke bakkefaktor. De 27 treffene på «bakkefaktor» i selftest.js er alle o.bakkefaktor-parameteren til beregnMasser, aldri Geo-funksjonen. Faktoren går inn i masser.js:798 som volumFaktor = bf * bf og ganger dermed hvert eneste volum.

**Når:** To mutasjoner i geo.js:132: (1) return (1 / k) * (1 + h / R) → (1 - h / R), altså feil fortegn på høydeleddet; (2) → k * (1 + h / R), altså malestokken brukt rett i stedet for invers. Selftest: 254 tester ok, 0 feil i begge tilfellene. Målt utslag ved Lyngdal (sone 32, x=395089, 300 moh): fortegnsbytte -0,0094 %, k i stedet for 1/k -0,053 %.

**Følge:** Utslaget for disse to konkrete feilene er lite (under 0,1 % av volumet, altså rundt 100 m³ på 100 000 m³). Men funksjonen har ingen forankring i noe som helst: en enhetsforveksling — for eksempel 1 + h i stedet for 1 + h/R — ville gitt bakkefaktor 301 ved 300 moh og volumFaktor 90 601, og heller ikke det ville blitt fanget av en eneste påstand. Dette er nøyaktig den klassen feil (meter mot forhold) det er verdt å ha et anker mot.

**Bevis:** Mutasjonsrunde 1: «geo: bakkefaktor hoydeledd snudd → SLAPP» og «geo: bakkefaktor bruker k i stedet for 1/k → SLAPP». Grep viser at Geo.bakkefaktor bare kalles fra app.js:265, aldri fra en test. Utslag beregnet i node.

### Overgangsrampen for breddeutvidelse er utestet — den kan slås av uten at noe reagerer

`test/selftest.js:476` · etterprøvd

**Hva:** Selftesten kontrollerer at utvidelseOvergang har riktig VERDI i tabellene (linje 824-828: k2=20, k3=20, k5=15 osv.) og at en kort kurve i det hele tatt får utvidelse (linje 483-484). Men ingen test kontrollerer at rampen i lagUtvidelsesprofil (masser.js:232-248) faktisk trapper utvidelsen inn og ut over den lengden. Normalen krever at breddeutvidelsen jevnes ut mot tangentpunktene; testene kontrollerer tallet i tabellen, ikke at det brukes.

**Når:** Erstattet mal.utvidelseOvergang med 0 * mal.utvidelseOvergang i masser.js (begge bruksstedene, linje 196 og 232). Selftest: 254 tester ok, 0 feil. Målt effekt på en 90-graders kurve med R=12: integrert utvidelse med rampe 37,5 m², uten rampe 25,0 m². Forskjell 12,5 m² vegflate per kurve, som med 0,70 m overbygning er 8,8 m³ bære- og slitelag per kurve.

**Følge:** En skogsbilveg har typisk 15-25 kurver per kilometer. Med rampen borte blir det rundt 130-220 m³ overbygning for lite per kilometer, pluss tilsvarende for lite skjæring og fylling i overgangssonene — og vegen bygges med et sprang i bredden ved hvert tangentpunkt i stedet for en jevn innkjøring.

**Bevis:** Mutasjonsrunde 5: «utvidelse: overgangsrampe fjernet → SLAPP». Måling i node: «integrert utvidelse med rampe : 37.5 m*m / uten rampe: 25.0 m*m / skilnad: 12.5 m2 = 8.8 m3 overbygning per kurve».

### Massetransportdiagrammet (Bruckner) er utestet — den kumulative summen kan snus

`test/selftest.js:892` · etterprøvd

**Hva:** bruckner-kurven i masser.js:892-899 akkumulerer inn - iv.volum.fylling per intervall. Ordet «bruckner» finnes ikke i selftest.js eller nettlesertest.js. Ingen påstand ser på kurven, verken form, fortegn eller endeverdi.

**Når:** Snudde fortegnet i akkumuleringen: kum += inn - iv.volum.fylling → kum += iv.volum.fylling - inn (masser.js:897). Selftest: 254 tester ok, 0 feil, exit 0.

**Følge:** Bruckner-kurven leses av for å bestemme transportretning og transportlengde — altså hvor mange kubikk som skal kjøres hvor langt. Et snudd fortegn betyr at overskudd leses som underskudd og at massen skulle vært kjørt motsatt vei. Det slår rett ut i transportkostnaden, og ingen test ser det.

**Bevis:** Mutasjonsrunde 1: «bruckner: kumulativ sum snudd → SLAPP» (exit 0, 0 feil). Grep: «bruckner» gir 0 treff i begge testfilene.

### Ingen ende-til-ende talregresjon på virkelig terreng

`test/demo-ydestad.js:1` · etterprøvd

**Hva:** demo-ydestad.js kjører hele kjeden terrengdata → linjeføring → lengdeprofil → masser på virkelig terreng ved Ydestad, men inneholder ingen eneste påstand — den skriver ut en tabell og lagrer en demofil (grep på assert/sjekk/paastand/process.exit gir 0 treff). package.json sitt test-skript kjører bare selftest.js, ikke denne. Nettlesertesten kontrollerer massepostene bare med isFinite(v) && v >= 0 (linje 155-156). Ingen sted finnes en påstand av typen «demoprosjektet gir 12 400 m³ skjæring ± 1 %».

**Når:** En endring som forskyver alle volumer med 10 % — for eksempel en feil i profilavstand, i gjennomsnittlig endeareal eller i bakkefaktoren — gir fortsatt endelige, positive tall. Selftesten kontrollerer syntetiske snitt mot håndregning, og nettlesertesten kontrollerer bare at tallene er tall. Ingen av dem ville sett de 10 prosentene.

**Følge:** Det finnes ingen vaktpost mot systematisk drift i sluttallene. Selftestens håndregninger er utmerkede for enkeltsnitt på flatt terreng, men bindingen mellom dem og et helt prosjekt på virkelig DTM1-terreng er ikke låst av noe.

**Bevis:** grep -n "assert|sjekk|paastand|process.exit|FEIL" test/demo-ydestad.js gir null treff. package.json: "test": "node test/selftest.js". nettlesertest.js:154-156 kontrollerer bare isFinite og v >= 0.


## Liten (36)

### Bakkefaktoren har ingen øvre grense, og går inn i annen potens på alle volum

`public/js/masser.js:777` · etterprøvd

**Hva:** Vakten avviser bare ikke-endelige verdier og verdier <= 0. Det finnes ingen øvre grense, mens bf brukes som volumFaktor = bf*bf (linje 798) på samtlige poster og som lengdefaktor på veglengden. En lengdekorreksjon UTM→bakke ligger fysisk i området 0,999–1,002.

**Når:** o.bakkefaktor = 12 (for eksempel et tall skrevet inn med feil desimalskilletegn, eller en fremtidig felt-innmating). I dag kommer verdien bare fra Geo.bakkefaktor (app.js:257–266), som gir ca. 1,0004, så feilen er latent – men rettInngang er stedet der «alle veiene inn møtes», og gulvet er allerede der.

**Følge:** bf = 12 gir skjæring 63 564 m³ mot 441 m³, altså 144 ganger for mye, og veglengde 1200 m for en 100 m veg – uten en eneste merknad. Rapporten viser bakkefaktoren, men bare med seks desimaler i en fotnote.

**Bevis:** Kjørt: bf=12 → sum.skjaering 63 564,3 (fasit 441,4), lengde 1200, ingen inngangsmerknad. bf=-3/0/NaN fanges riktig med merknad.

### FAKTORGRENSER inneholder et felt som ikke finnes, og som ved feilretting settes til undefined

`public/js/masser.js:701` · etterprøvd

**Hva:** losmasseFaktor står i FAKTORGRENSER, men finnes verken i StandardFaktorer eller noe annet sted i prosjektet. Ved en ikke-numerisk verdi utfører klem `obj[felt] = StandardFaktorer['losmasseFaktor']`, altså undefined, og skriver samtidig en merknad om at «Løsmassefaktor» ble rettet til 1.

**Når:** En eldre eller håndredigert prosjektfil med "faktorer": {"losmasseFaktor": "1,3"} åpnes.

**Følge:** Ingen volumfeil – feltet brukes ikke. Men brukeren får en merknad om et felt som ikke eksisterer, og faktorobjektet får en undefined-nøkkel som følger med når prosjektet lagres igjen. Verdt å rydde bort så merknadslisten forblir troverdig.

**Bevis:** grep -rn losmasseFaktor over hele repoet gir bare masser.js:701. StandardFaktorer (83–88) har ikke feltet.

### tverrfallRetning og ensidigMaks mangler i MALGRENSER og kan snu eller nulle tverrfallet

`public/js/masser.js:683` · etterprøvd

**Hva:** MALGRENSER dekker tverrfall, men ikke tverrfallRetning (brukt på linje 264) eller ensidigMaks (brukt på 274). Ingen av dem leses fra skjemaet – de kommer bare fra veiklassen eller fra prosjektfilen – og ingen av dem valideres i rettInngang. ensidigMaks brukes i Math.min(mal.tverrfall, mal.ensidigMaks), som ikke har noe gulv på null.

**Når:** Prosjektfil med "tverrfallType":"ensidig" og "tverrfallRetning": null eller NaN. Eller "ensidigMaks": -0.05 i en kurve under 60 m radius.

**Følge:** tverrfallRetning = NaN gir NaN tverrsnittsareal helt stille. tverrfallRetning = null gir flat veg (0 % tverrfall) i stedet for ensidig fall. ensidigMaks = -0,05 snur doseringen: i en venstresving faller vegen ut av svingen i stedet for inn i den. Massevirkningen er liten (målt 3,94 mot 4,29 m²/profil for retning 1 mot null), men tverrfallet er en byggeforutsetning som står i rapporten.

**Bevis:** Kjørt: tverrfallType='ensidig' med tverrfallRetning 1 → areal 3,9448; med null → 4,2925 (flat veg); med NaN → NaN. tverrfallVed med ensidigMaks=-0,05 og krumning 1/30 gir {venstre:-0.05, hoyre:0.05}, motsatt av {venstre:0.05, hoyre:-0.05} med 0,05.

### _somForhold skriver bratte fjellskjæringer som «1:0,20» – ikke formen kommentaren lover

`public/js/ui-tverrprofil.js:99` · etterprøvd

**Hva:** For |helning| mellom 1 og 20 skrives forholdet fortsatt som 1:n med n < 1. Kommentaren på linje 94 begrunner hele funksjonen med at 1:n er «det målet en maskinfører kjenner», og masser.js:33 skriver selv den samme helningen som 5:1 («skjaeringFjell: 0.2 // H:V (5:1)»).

**Når:** Skjæring som treffer fjell med standardmalen (skjaeringFjell = 0,2). Pekeren i fjellskråningen gir helning −5,0, og boksen skriver «Helning på tvers 500,0 % 1:0,20». Verifisert med node: _somForhold(-5) === '1:0,20'.

**Følge:** Ingen tallfeil, men den ene raden som skal være lettlest for en maskinfører blir det motsatte: «1:0,20» der vegmalen og bransjen sier 5:1. Gjelder alle fjellskjæringer, altså den dyreste posten i beregningen.

**Bevis:** _somForhold(-5) → '1:0,20'; _somForhold(-1/0.2) samme. masser.js linje 33 kaller samme verdi «(5:1)».

### kortStrekkTillegg blir aldri lest – unntaket for korte rette strekk inntil 60 m er ikke i bruk

`public/js/veiklasser.js:53` · etterprøvd

**Hva:** Feltet står på K2, K3, K4, K5 og K6 (linje 53, 70, 87, 106, 124) med verdien 0.02, men malFraVeiklasse kopierer det ikke inn i malen, og ingen andre filer refererer det. Normalens unntak – K2 8→10 %, K3 10→12 %, K4 12→14 %, K6 8→10 % i lassretningen, og K5 20→22 % i RETURretningen – blir dermed aldri anvendt. I tillegg kan ikke en enkelt skalar uttrykke at unntaket gjelder lassretningen i fire av klassene og returretningen i K5; det står ingen retning i feltet.

**Når:** Klasse 3-vei med et 45 m langt rett strekk på 11,5 % i lassretningen. Normalen kap. 3.3.6: «Over korte rette strekninger inntil 60 m lengde, kan stigningen i lassretningen økes til 12 %.» Strekket er lovlig.

**Følge:** Programmet merker hver profil på strekket som brudd på 10 %-kravet. Brukeren senker profilen for å bli kvitt merknadene og legger inn skjæringsmasse som ikke trengs. Feilen går i retning for mye masse, men den er like dyr i praksis: den flytter linjeføringen bort fra det normalen faktisk tillater.

**Bevis:** Grep over hele prosjektet: kortStrekkTillegg forekommer bare på linje 53, 70, 87, 106 og 124 i veiklasser.js. node-prøve: V.malFraVeiklasse('k4', …).kortStrekkTillegg → undefined.

### Klasse 7 mangler stigningsvilkåret for ensidig tverrfall, og ensidigMaks 10 % får aldri virkning

`public/js/veiklasser.js:143` · etterprøvd

**Hva:** Normalen kap. 5.1 sier: «I kurver med mindre radius enn 20 m, OG I STIGNINGER OVER 15 %, skal kjørebanen ha 5-10 % helning, ensidig tverrfall inn mot grøft og skjærskråning.» Bare radiusvilkåret er modellert (ensidigUnderRadius: 20). Det finnes ikke noe felt for stigningsvilkåret, og masser.js sin tverrfallVed tar bare imot krumning. Dessuten er ensidigMaks: 0.10 uten virkning: masser.js:274 regner fall = Math.min(mal.tverrfall, mal.ensidigMaks) = min(0,05; 0,10) = 0,05, så den høyere grensen for traktorvei kan aldri slå gjennom. selftest.js:844 sjekker at verdien er 0.10, men verdien når aldri fram til beregningen.

**Når:** Klasse 7 traktorvei, 3,5 m bred, rettstrekk på 18 % stigning. Normalen krever ensidig tverrfall inn mot grøft; programmet bygger takfall.

**Følge:** Vegkanthøydene blir feil i stikningstabellen og i alt som eksporteres derfra. Med takfall ligger begge kanter 0,05 × 1,75 = 8,75 cm under senter; med ensidig fall skal den ene ligge 8,75 cm over og den andre 8,75 cm under – 17,5 cm forskjell mellom de to kantene. Massevirkningen er liten, men utstikkingen blir gal.

**Bevis:** Normaltekst kap. 5.1.8/5.1 hentet fra veiklasse-7-8.pdf. node-prøve: k7.tverrfall = 0.05, k7.ensidigMaks = 0.1, Math.min(0.05, 0.1) = 0.05 – ensidigMaks har ingen effekt.

### Dreiningsvinkelen klemmes til 135°, mens normalens diagram går til 180°

`public/js/veiklasser.js:227` · ikke etterprøvd

**Hva:** Math.max(45, Math.min(135, dreiningGrader || 45)) – samme klemme finnes i masser.js:162. Normalens tabeller gir bare de to kolonnene 45° og 135°, men figurene (3.1 for K2, 3.6 for K3, 3.11 for K4, 3.16 for K5, 3.21 for K6) har x-aksen «Kurvelengde (Kl) i grader» med merkene 45, 90, 135 og 180, og teksten sier uttrykkelig at kurven skal leses av i diagrammet. Normalen behandler altså 135–180° som et eget område; koden gjør det ikke.

**Når:** En hårnålssving på 180° dreining – helt vanlig på skogsbilvei i bratt terreng – får nøyaktig samme breddekrav som en 135° kurve med samme radius.

**Følge:** For K3 og K4 ser dette ut til å være ufarlig: 135°-verdien (9,5 m ved R = 10–14 m) er samtidig toppen av breddeaksen i figuren, så kurven er trolig flat der. For K5 går breddeaksen i figur 3.16 høyere enn tabellens 135°-verdi på 6,0 m, og da vil en hårnål få for smal vei. Jeg har lest av aksemerkene, ikke selve kurvene, så størrelsen på avviket er ikke etterprøvd – bare at klemmen finnes og at normalen skiller på området over 135°.

**Bevis:** Aksemerkene «45 90 135 180» under «Kurvelengde (Kl) i grader» er hentet ut av tre uavhengige kapittel-PDF-er (veiklasse-3, veiklasse-5, veiklasse-6). Koden: Math.min(135, …) i veiklasser.js:227 og masser.js:162.

### rettProfil fordeler et umulig stigningskrav ujevnt, og fordelingen er et stabilt fastpunkt

`public/js/vertikalprofil.js:262` · etterprøvd

**Hva:** Sveipet går fra indeks 0 og oppover og retter hvert strekk helt (Gauss-Seidel). Når to låste høyder ligger lenger fra hverandre i høyde enn stigningskravet tillater, låser sveipet seg i en stabil syklus: strekket foran rettes helt ned til grensen, neste strekk blir da for bratt og deler bruddet med naboen, som skyver det tilbake. Hele overskuddet blir liggende på de første strekkene.

**Når:** 7 knekkpunkt med 40 m avstand, begge ender låst, 33,83 m fall over 240 m (14,09 % i snitt) mot et krav på 10 %. Kravet er reelt umulig, og det er dokumentert at det da ender i et kompromiss – men kompromisset er skjevt.

**Følge:** Resultatet blir fem strekk på 14,913 % og ett på nøyaktig 10,000 %, i stedet for 14,094 % overalt. Det er et fastpunkt: 10 kall etter hverandre (20 000 runder) endrer det ikke. Veien ligger 0,327 m fra den jevne løsningen ved profil 40, og merknaden melder 14,9 % der geometrien bare tvinger fram 14,1 % – brukeren tror bruddet er verre enn det er, og på 5 av 6 strekk bygges veien brattere enn nødvendig.

**Bevis:** Stigninger etter 10 × rettProfil: −14,912 / −14,913 / −14,913 / −14,913 / −14,913 / −10,000 %. Jevn fordeling ville gitt −14,094 % overalt.

### losmasseFaktor er en død grense som gir merknad om en beregning som ikke finnes

`public/js/masser.js:701` · etterprøvd

**Hva:** FAKTORGRENSER validerer losmasseFaktor, men faktoren finnes verken i StandardFaktorer (linje 83-88) eller i noen formel i massebalansen. Den eneste treffet i hele kodebasen er selve grenselinja.

**Når:** faktorer.losmasseFaktor = 99 i en prosjektfil.

**Følge:** Merknaden sier «Løsmassefaktor var 99 – utenfor 1 til 3, regnet med 3», men verdiene 1 og 3 gir bit for bit identiske volumer og identisk balanse. Merknaden forteller om en retting som ikke har hatt noen virkning – falsk trygghet i den lista brukeren bruker til å kontrollere grunnlaget. Er verdien ikke et tall, settes den til undefined, siden StandardFaktorer ikke har nøkkelen.

**Bevis:** e7.js E14: «losmasseFaktor 1 vs 3 gir samme svar: true», merknad «Løsmassefaktor var 99 – utenfor 1 til 3, regnet med 3»; ved "x" forsvinner nøkkelen helt fra faktorobjektet.

### Hull i terrengmodellen gir to merknader om det samme, på samme profil og samme type

`public/js/masser.js:957` · etterprøvd

**Hva:** pr.advarsel (linje 659-661) gir allerede «Terrengmodellen har hull i dette tverrsnittet – volumet er ufullstendig» via linje 922 med type 'data'. Linje 957-959 legger i tillegg til «Mangler terrengdata» på samme profilnummer og samme type.

**Når:** terreng.z returnerer NaN, 20 m veg, profilavstand 10 m (3 profiler).

**Følge:** 6 merknader på 3 profiler. Merknadslista er det brukeren teller antall problemer i (app.js grupperer på type), og antallet blir dobbelt så høyt som antall profiler som faktisk mangler data.

**Bevis:** e5.js E8: 6 linjer, alle med type 'data', to per profilnummer (0, 10, 20).

### Fjell/løsmasse-delingen er ikke helt uavhengig av integrasjonssteget, tross kommentaren

`public/js/masser.js:568` · etterprøvd

**Hva:** Nullpunktet finnes med u = forrige.dFjell / (forrige.dFjell − naa.dFjell), men dFjell er allerede klemt til 0 med Math.max på linje 523. Der den underliggende verdien egentlig var negativ, blir u = 0 (eller 1), og trekanten legges over hele intervallet i stedet for over den delen der fjellet faktisk finnes. Feilen går alltid samme vei: for mye fjell. Kommentaren på linje 562-565 sier nettopp at delingen ikke skal henge på hvor fint man deler opp.

**Når:** 1 km veg i skjæring, fjell 1,5 m ned, identisk geometri, bare ulikt integrasjonssteg.

**Følge:** sum.skjaering er identisk 23717,86 m³ i alle kjøringene, men skjaeringFjell blir 13973,33 (steg 0,02), 13976,77 (0,1 – standard) og 14042,10 (0,5) m³. +0,02 % ved standardsteget, +0,5 % ved steget optimaliseringa bruker (app.js:554). Liten i kroner, men den går systematisk i favør av den dyre posten, og delingen skal etter kommentaren være steguavhengig.

**Bevis:** e5.js E6: steg 0.02 → fjell 13973.33, steg 0.1 → 13976.77, steg 0.5 → 14042.10, med skj 23717.86 i alle.

### Én tverrfallsoverstyring gjelder hele vegen og slår av doseringsregelen i kurver

`public/js/masser.js:283` · etterprøvd

**Hva:** Er overstyringslista ikke tom, returnerer tverrfallVed() nærmeste endepunktverdi konstant utenfor overstyringenes utstrekning (linje 284-288), og standard-grenen – inkludert normalens krav om ensidig dosering i kurver med radius under 60 m (linje 271-280) – nås aldri noe sted på vegen.

**Når:** tverrfallOverstyring = [{s:100, venstre:-0.08, hoyre:0.08}] på en 200 m veg, ellers standardmal med takfall 5 %.

**Følge:** tverrfallVed(...) ved s = 0 gir {venstre −0,08, høyre +0,08} – ensidig 8 % fall helt fra profil 0, selv om brukeren bare la inn ett oppmålt tverrsnitt på profil 100. Fyllingsvolumet endres fra 8231 til 8136 m³ (−1,2 %) i testen, og doseringsregelen for krappe kurver blir ikke regnet noe sted på vegen. En brukbar oppførsel ville vært å la standarden gjelde utenfor det området overstyringene dekker.

**Bevis:** e6.js E10: «tverrfall ved s=0 uten: {venstre:0.05, hoyre:0.05} med overstyring pa s=100: {venstre:-0.08, hoyre:0.08}»; sum.fylling 8231 → 8136.

### Eksakt 180 graders avbøyning brettes stille over seg selv

`public/js/linjeforing.js:45` · etterprøvd

**Hva:** `Math.abs(Math.abs(avbøy) - Math.PI) < 1e-6` hopper over kurven, og til forskjell fra innkortingstilfellet legges det ikke inn noen advarsel. Linja går ut til knekkpunktet og rett tilbake samme vei.

**Når:** IP = [(0,0) r=0, (100,0) r=40, (0,0) r=0]: to linjeelementer på 100 m hver, kurver=0, advarsler=0. punktVed(50) = (50, 0) og punktVed(150) = (50, 6,1e-15).

**Følge:** To profiler 100 m fra hverandre i profilnummer ligger på nøyaktig samme punkt i terrenget, så samme skjæring og fylling regnes to ganger. Ingen merknad noe sted i kjeden. Krever at brukeren treffer eksakt tilbakevending, så det er sjeldent – men det er helt taust når det skjer.

**Bevis:** Kjørt: elementer = linje:100.00 linje:100.00, kurver=0, advarsler=0, punktVed(50) og punktVed(150) gir samme x og y.

### Advarsel om et knekkpunkt som ikke fikk kurve havner på profil 0

`public/js/linjeforing.js:62` · etterprøvd

**Hva:** Skaleres tangenten under 1e-9, faller knekkpunktet inn i skarp-knekk-grenen på linje 79 og legges aldri i `kurver`, men advarselen med `ip: nr` blir stående. masser.js:918 slår opp `kurver.find(k => k.ip === a.ip)` og faller tilbake til s = 0 når oppslaget er tomt.

**Når:** IP = [(0,0) r=0, (100,0) r=30, (100,1e-9) r=30, (100,100) r=0]: advarsler = [{ip:1}], kurver.length = 0. Merknaden plasseres på profil 0,0 i stedet for ved profil 100 der problemet er.

**Følge:** Merknaden peker på feil sted i rapporten, og i en lang merknadsliste er den vanskelig å knytte til rett sving. Ingen tallfeil i massene.

**Bevis:** Kjørt: advarsler=[{ip:1,...}], kurver=0. Kodelesing av masser.js:917–920 bekrefter s=0-fallbacken.

### Falsk advarsel om innkorting for kurver som faktisk fikk plass

`public/js/linjeforing.js:56` · etterprøvd

**Hva:** Marginen `L * 0.999` gjør at en kurve som passer akkurat, eller passer med opptil 0,1 % margin, merkes som innkortet selv om radien i praksis er uendret.

**Når:** 90 graders sving, r=50, ben = 50,05 m: R blir 50,0000 (uendret på fire desimaler) men advarsler=1. Ved ben = 50,00 m: R = 49,95 og advarsler=1.

**Følge:** Falske advarsler i en liste der ekte innkortinger mangler (funn 1). Brukeren lærer å se bort fra advarslene, og da er den ene som betyr noe også borte.

**Bevis:** Kjørt for ben = 50 / 50,05 / 50,1 / 51 / 60: advarsler 1, 1, 0, 0, 0 med R = 49,95 / 50,00 / 50,00 / 50,00 / 50,00.

### DXF: fotavtrykket legges på kote 0 og polylinjen lukkes aldri

`public/js/eksport.js:198` · etterprøvd

**Hva:** `polylinje('FOTAVTRYKK', 2, fot.map(q => ({ n: q.y, o: q.x, z: 0 })), false)` sender medHoyde = false og setter z = 0 på hvert punkt, mens senterlinje og vegkanter skrives med ekte høyder. I tillegg er alle fire polylinjene skrevet med `par(70, 8)` – bit 3 (3D-polylinje) uten bit 1 (lukket), så ringen rundt fotavtrykket står åpen mellom venstre og høyre skråningsfot i profil 0.

**Når:** Åpne DXF-en i AutoCAD eller et maskinstyringsprogram og se på tegningen i 3D, eller les av kote i skråningsfoten.

**Følge:** Fotavtrykket ligger ca. 100 m under veien i modellrommet (senterlinjen er på z ≈ 100–108 i prøven), så 3D-visning og enhver høydeavlesning i skråningsfoten gir 0. Ringen er dessuten åpen, så den kan ikke brukes til arealuttak uten å lukkes manuelt. Ingen mengder blir feil av dette – det er tegningen som er misvisende.

**Bevis:** Kjørt eksporten: alle fire POLYLINE-entiteter har gruppe 70 = 8, og siste FOTAVTRYKK-vertex har gruppe 30 = 0.0000. Koordinatrekkefølgen er derimot riktig for DXF: gruppe 10 = øst, gruppe 20 = nord.

### DXF: profilnummer merkes bare der stasjonen er et eksakt multiplum av 50

`public/js/eksport.js:202` · etterprøvd

**Hva:** `if (Math.round(q.s) % 50 !== 0) continue;` filtrerer på stasjonsverdien i stedet for å merke hver n-te profil. Stasjonene er multipler av profilavstanden, så bare de som tilfeldigvis også deler 50 får tekst.

**Når:** Samme 387 m lange vei eksportert med ulike profilavstander.

**Følge:** Antall merkelapper i tegningen: 3 ved profilavstand 3 m, 2 ved 7 m, 1 ved 9 m og 1 ved 13 m – altså bare stasjon 0. Tegningen blir uleselig som stikningsgrunnlag fordi ingen vet hvilken profil man ser på. Rene tall er upåvirket.

**Bevis:** Kjørt eksporten for profilavstand 3, 7, 9 og 13 m og telt TEXT-entiteter: 3, 2, 1, 1.

### Kommentaren over sosi() beskriver et innhold filen ikke har

`public/js/eksport.js:121` · etterprøvd

**Hva:** Doc-kommentaren sier «Filen far senterlinjen som en kurve og fotavtrykket som en flate». Funksjonen skriver tre .KURVE-objekter (senterlinje + to vegkanter) og ingen .FLATE i det hele tatt. Fotavtrykket finnes bare i DXF og GeoJSON.

**Når:** Noen leser kommentaren og regner med å finne veiens fotavtrykk som flate i SOSI-filen – for eksempel til arealberegning mot grunneier eller kommunen.

**Følge:** Ingen tallfeil, men beskrivelsen er direkte gal og kan få noen til å bygge på en flate som ikke finnes. Vegkantene, som faktisk er der, er ikke nevnt.

**Bevis:** Kjørt eksporten: utdata inneholder .KURVE 1: (Vegsenterlinje), .KURVE 2: og .KURVE 3: (Vegkant), og ingen .FLATE.

### Pilen i «Lengdekorreksjon UTM → bakke» skrives ut som «?»

`public/js/ui-pdfrapport.js:215` · etterprøvd

**Hva:** Etiketten bruker «→» (U+2192). Tegnet finnes ikke i WinAnsi i det hele tatt, og `_tekstbytes` (pdfeksport.js:94) bytter alt over 255 mot 63 = «?».

**Når:** Enhver rapport der «Forutsetninger»-tabellen skrives ut. Raden får teksten «Lengdekorreksjon UTM ? bakke».

**Følge:** Kosmetisk, men det står i forutsetningstabellen – den delen av rapporten en byggherre leser for å kontrollere grunnlaget – og et «?» midt i en forutsetning ser ut som at programmet ikke vet svaret. Verdien ved siden av («× 0.999660») er riktig.

**Bevis:** pdftotext-utskrift av den genererte rapporten: «Lengdekorreksjon UTM ? bakke». Kildesøk viser at U+2192 forekommer nøyaktig ett sted i alle rapport-strengene.

### Overskriften blir stående alene nederst når neste blokk er en tegning

`public/js/ui-pdfrapport.js:95` · etterprøvd

**Hva:** `overskrift()` reserverer en fast høyde på 46 pt med `plass(46)`. Det holder for en overskrift (28 pt) pluss én tabellrad, men tegningsblokkene ber om `hoyde + 6` (lengdeprofil, ca. 175 pt) og `hoyde + 20` (tverrsnittspar, ca. 150 pt) etterpå. Er det plass til overskriften, men ikke til tegningen, brytes siden mellom dem. Doc-kommentaren på linje 10-12 lover det motsatte.

**Når:** Rapport med lengdeprofil og seks tverrsnitt: «TVERRSNITT» settes på side 1 med grunnlinje 740,8 pt fra toppen, og første tverrsnittstegning havner øverst på side 2, 70 pt fra toppen. Side 1 slutter med en overskrift og en strek uten noe under.

**Følge:** Rent kosmetisk – ingen data går tapt, og bildetekstene under hvert snitt oppgir profilnummer. Men side 2 begynner med umerkede tegninger, og siste side i seksjonen ser ut som en feil. Samme vindu finnes for tabeller: `hode()` ber om `radhoyde*2` = 23 pt mens overskriften bare har 18 pt igjen av sine 46.

**Bevis:** Genererte rapport med bilder og pakket ut innholdsstrømmene: side 1 har overskriftene SAMMENDRAG@94, MASSEBALANSE@226, FORUTSETNINGER@358, LENGDEPROFIL@540, TVERRSNITT@740.8; side 2 har ingen overskrift og første bilde med topp = 70,0 pt.

### Reservebredden 556 er feil for «²» og «×», som begge brukes i rapporten

`public/js/pdfeksport.js:114` · etterprøvd

**Hva:** Alle oppføringene som står i HELVETICA_BREDDER og HELVETICA_FET_BREDDER er riktige – jeg sammenlignet samtlige mot Adobe sine AFM-tall for Helvetica og Helvetica-Bold og fikk null avvik i begge tabellene. Problemet er reserven `: 556` for koder som mangler. To av de manglende brukes faktisk: 178 «²» (riktig 333) i tverrsnittstekstene, og 215 «×» (riktig 584) i «Bærelag 0,3 m × 4 m», «(× 1,5)» og bunnteksten «1×1 m».

**Når:** Bildeteksten «Profil 320 · skjæring 12.8 m² (fjell 7.4) · fylling 0.0 m²» måles til 155,5 pt, mens den settes som 153,3 pt – 2,2 pt for bredt fordi de to «²» hver overvurderes med 223/1000 em.

**Følge:** Ingen synlig skade i dagens rapport: begge tegnene står bare i venstrestilt tekst, og feilen er under 1,5 pt. Alle høyrestilte tallceller består av sifre, komma, mellomrom, «m³», «p.f.»/«p.a.» og «–», og alle disse står med riktig bredde i tabellen – høyrestillingen er derfor korrekt. NB: `bytt` mapper hardt mellomrom (U+00A0, som toLocaleString('nb-NO') bruker som tusenskille) til 32, så tusenskillet måles riktig til 278 og ikke til reserven.

**Bevis:** Diffet begge bredetabellene mot Adobe-AFM for alle WinAnsi-koder: 0 gale oppføringer i begge. 80 (Helvetica) og 88 (Bold) manglende koder der 556 er feil reserve; av dem forekommer 178 og 215 i rapporten. bredteAv('m²',6.6) = 9,17 pt mot riktig 8,07 pt.

### Prosjektnavnet i brevhodet blir aldri avkortet og kan gå inn i veiklasse-linjen

`public/js/ui-pdfrapport.js:82` · etterprøvd

**Hva:** `P.tekst(xTekst, 40, String(app.P.navn), { storrelse: 9, ... })` skriver navnet uten `_kort`, mens veiklassenavnet på linje 85 høyrestilles mot innmargen på grunnlinje 44. De to grunnlinjene ligger bare 4 pt fra hverandre med 9 pt og 8 pt tekst, så bokstavboksene overlapper vertikalt uansett – det eneste som skiller dem er at de vanligvis ikke møtes vannrett.

**Når:** Med logo starter navnet på x = 152. Veiklassen «Veiklasse 3 – Bilveg for tømmerbil med henger» starter på x = 391,4. Et navn bredere enn 239,4 pt (rundt 55 tegn) skriver seg inn i den. Filnavnet på linje 41 kuttes ved 60 tegn, så navn i den lengden er åpenbart forventet.

**Følge:** Bokstavene legger seg oppå hverandre øverst på hver eneste side i rapporten. Testet navn på 56 tegn slutter på x = 385,1 – 6 pt klaring igjen.

**Bevis:** Målte med PdfSkriver.bredteAv: klassenavn starter x=391,4; navn på 42 tegn slutter x=323,1; navn på 56 tegn slutter x=385,1.

### Blandede desimalskilletegn i samme tabell

`public/js/ui-pdfrapport.js:181` · etterprøvd

**Hva:** Verdier som går gjennom `Rapport.tall` får norsk komma og hardt mellomrom som tusenskille, mens malverdier og areal skrives rått eller med `toFixed` og får engelsk punktum. De to formene står side om side i samme tabell.

**Når:** «Sammendrag» viser «Rensk / avdekking (0.2 m + 0.5 m utenfor)» og «Bærelag 0.3 m × 4 m» over «1 234 567 m³». «Forutsetninger» viser «3.0 % (tosidig)», «0.35 m / 0.3 m», «1:1.5 · 1:5 · 1:1.5» ved siden av «5,0 m». Tverrsnittstekstene skriver «skjæring 12.8 m²», stikningstabellen «6743210.123».

**Følge:** Rent formmessig, men i et norsk anbudsdokument der tusenskillet allerede er mellomrom, er punktum et fremmedelement, og en rapport som blander «0,35» og «0.35» i samme kolonne ser uferdig ut for en byggherre.

**Bevis:** pdftotext-utskrift av den genererte rapporten viser «Rensk / avdekking (0.2 m + 0.5 m utenfor)», «Overbygning … 3.0 % (tosidig)» og «Veglengde 600,0 m» i samme dokument.

### Fjell/løsmasse-splitten deler aldri intervallet – u blir alltid 0 eller 1

`public/js/masser.js:568` · etterprøvd

**Hva:** dFjell klemmes til null på linje 523 (Math.max(0, …)) FØR den brukes til å finne kryssingspunktet på linje 568. Når fjellet slipper taket inne i et intervall, er derfor den ene enden alltid nøyaktig 0, og u = dFjell0/(dFjell0 − dFjell1) blir alltid 0 eller 1. Grenene på linje 570–578 regner da over hele intervallet, og resultatet er identisk med et vanlig vektet trapes. Kommentaren på linje 562–565 lover det motsatte («fjellet slipper taket et sted inne i intervallet – del der» / «ble splitten … avhengig av hvor fint man delte opp»). Skjæring/fylling-kryssingen på linje 543–560 er derimot helt riktig – der er d ikke klemt, og både arealet og Pappus-vekten er eksakte (kontrollregnet for hånd).

**Når:** Intervall t = 3,8 → 4,2 der jordarbeidsflaten krysser fjelloverflaten ved t = 4,0. dFjell er 0,100 ved 3,8 og 0 ved 4,0 og videre. Riktig u er 0,5; koden regner u = 1,0 og tar hele intervallet som trekantgrunnflate.

**Følge:** Fjellandelen – den dyre posten – blir systematisk overvurdert, og løsmassen tilsvarende undervurdert. Målt på et helt prosjekt (200 m, 15 % sidefall, fjelldybde 0,8 m, standardmal): sum.skjaeringFjell er 1 786,41 m³ ved integrasjonssteg 0,5 mot 1 771,05 m³ konvergert (+0,87 %), og 1 771,96 m³ ved rapportens standardsteg 0,1 (+0,05 %). I et annet oppsett +0,67 % ved steg 0,5 og +0,13 % ved 0,1. Total skjæring er upåvirket – det er bare fordelingen mellom fjell og løsmasse som forskyves. Utslaget er lite ved rapportoppløsningen, men steg 0,5 er nettopp det app.js bruker til «Optimaliser»/«Massebalanse» (raskt-modus), så optimaliseringen jobber mot en litt fjelltyngre modell enn rapporten.

**Bevis:** Reprodusert uttrykket direkte: dFjell(3,8)=0,1000, dFjell(4,2)=0,0000, u = 1,0000 mot sant 0,5000, areal 0,02000 mot sant 0,01000. Konvergensmåling gjennom beregnMasser ved steg 0,5 / 0,2 / 0,1 / 0,05 / 0,01 / 0,002 gir monotont synkende fjellvolum: 1786,41 / 1776,23 / 1771,96 / 1771,53 / 1771,07 / 1771,05.

### Bakkefaktoren brukes i andre potens på volumet, men tverrsnittsarealet er allerede i virkelige meter

`public/js/masser.js:798` · etterprøvd

**Hva:** volumFaktor = bf * bf med begrunnelsen «to vannrette mal i volumet». Det ville stemt hvis både bredden og lengden i tverrsnittet var kartmål. Men bredden i tverrsnittet kommer fra malens prosjekterte mål (vegbredde, grøftebunn, skråningshelninger) og fra virkelige høydeforskjeller – ikke fra UTM-koordinater. Arealet er derfor allerede i virkelige m². Bare senterlinjelengden er et kartmål, og den korrigeres allerede med bf på linje 1063 (lengde: linje.lengde * bf). Volumet blir dermed ganget med bf én gang for mye.

**Når:** Geo.bakkefaktor for et prosjekt nær midtmeridianen i sone 33 på kote 300 gir bf = 1,000447.

**Følge:** Volumene blir (bf − 1) for høye – 22 m³ for mye på 50 000 m³ ved bf = 1,000447, 14 m³ midt i sonen, og 16 m³ for lite ved sonekanten (bf = 0,999681). Feilen er altså under 0,05 % og betyr lite i praksis, men den er systematisk og går motsatt vei på hver side av sonen. Merk at arealFaktor (linje 797) ikke brukes noe sted i prosjektet.

**Bevis:** Geo.bakkefaktor(500000, 6700000, 33, 300) = 1,000447; (bf² / bf − 1) = 0,000447 → 22 m³ på 50 000 m³. Selftesten på linje 340–342 fastslår bf² som forventet oppførsel, så dette er en bevisst, men etter min vurdering feil, tolkning.

### Skyggelinja spiser halvparten av klikkflaten på senterlinja

`public/js/ui-kart.js:36` · ikke etterprøvd

**Hva:** lag.linjeSkygge (weight 6) legges til før lag.linje (weight 3), så den ligger under visuelt, men er dobbelt så bred og like interaktiv. Et klikk 1,5–3 px fra senterlinja treffer skyggen. Skyggen har ingen click-lytter og ingen event-parent (den er lagt rett på kartet, ikke i en FeatureGroup), så listens('click', true) er false i Leaflets _findEventTargets, og hendelsen faller gjennom til kartet.

**Når:** Bruker i Rediger sikter på den svarte streken og treffer 2 px fra midten. I Rediger gjør kartklikket ingenting, så det skjer bokstavelig talt ingen ting – ingen status, ingen tilbakemelding. Brukeren klikker igjen, og treffer kanskje innenfor 1,5 px denne gangen.

**Følge:** Bare den innerste halvparten av den synlige linjebredden setter inn knekkpunkt. Ingen gale tall, men det ser ut som funksjonen er upålitelig, og det inviterer til de raske gjentatte klikkene som utløser funn nr. 1.

**Bevis:** this.lag.linjeSkygge = L.polyline([], { color: '#0b0b0c', weight: 6, ... }).addTo(kart); this.lag.linje = L.polyline([], { ..., weight: 3 }).addTo(kart);

### Løpenummeret ved navnekollisjon bygges på det utrimmede navnet

`public/js/lager.js:169` · etterprøvd

**Hva:** Linje 167 setter navn til den trimmede varianten, men løkken på linje 169 setter sammen et nytt navn av `p.navn` – uten trim. Ved kollisjon får det importerte prosjektet mellomrommene tilbake.

**Når:** Prosjektet «Vegen» finnes. Det importeres en fil der navn er " Vegen ". Første sjekk gjøres mot «Vegen» (trimmet), som finnes, og det nye navnet blir " Vegen (2)" – med ledende mellomrom og to mellomrom før parentesen.

**Følge:** Nøkkelen i databasen får usynlige mellomrom i begge ender. Prosjektet står feil innrykket i Åpne-dialogen, det sorterer annerledes enn navnet tilsier, og filnavnet ved eksport blir «__Vegen___2_.massekalk.json». Ingen tall blir gale.

**Bevis:** Prøveskript: importer() av et prosjekt med navn " Vegen " når «Vegen» fantes fra før ga [" Vegen (2)"], og nøklene i butikken ble ['"Vegen"', '" Vegen (2)"'].

### Sidepanelet viser profilavstanden brukeren skrev inn, utskriftsrapporten viser den som faktisk ble brukt

`public/js/ui-rapport.js:48` · etterprøvd

**Hva:** Sidepanelet bruker `res.mal.profilAvstand || (res.stasjoner[1] - res.stasjoner[0])`. app.js:379 legger brukerens ubeskårne verdi inn i res.mal.profilAvstand ETTER beregningen, mens masser.js:771-773 klemmer alt over 100 m ned til 100. Utskriftsrapporten (linje 431) regner derimot avstanden ut fra res.stasjoner og får riktig verdi.

**Når:** Brukeren skriver 150 i feltet Profilavstand (index.html:232 har max=100, men nettleseren stopper ikke tastede verdier, og app.js:1099 gjør bare Math.max(1, …)). Beregningen kjører med 100 m. Sidepanelet skriver «11 profiler hver 150 m», utskriftsrapporten skriver «Profilavstand 100,0 m» for nøyaktig samme beregning.

**Følge:** To tall for samme forutsetning i samme prosjekt. Beregningen er riktig, og merknadslisten sier «Profilavstanden var 150 m – regnet med 100 m», men den som bare ser sidepanelet tror volumene er regnet på en finere oppløsning enn de er.

**Bevis:** Kjørt beregnMasser med profilAvstand 150 på en 1000 m veg: stasjoner[1]-stasjoner[0] = 100, merknad «Profilavstanden var 150 m – regnet med 100 m», uttrykket på linje 48 ga 150.

### _kjør() returnerer selve IDBRequest-objektet når resultatet er undefined, så hent() gir undefined i stedet for null

`public/js/lager.js:60` · etterprøvd

**Hva:** Uttrykket `svar && svar.result !== undefined ? svar.result : svar` faller tilbake på forespørselsobjektet når request.result er undefined – som er nøyaktig det IndexedDB gir for en get() på en nøkkel som ikke finnes, og for delete(). hent() gjør så `rad ? rad.data : null` på et sant IDBRequest og returnerer request.data, altså undefined. Kommentaren på linje 94 sier uttrykkelig at en manglende oppføring skal gi null.

**Når:** await Lager.hent('Finnes ikke') gir undefined, ikke null. Alle nåværende kallere (app.js:1574 `if (!d)`, lager.js:141 `if (!data)`, kollisjonsløkken på linje 169) bruker sannhetstest, så ingen tall blir gale i dag.

**Følge:** Ingen feil i dagens kode, men kontrakten som står i kommentaren holder ikke. En framtidig `=== null`-sjekk – den naturligste måten å skille «finnes ikke» fra «finnes, men er tom» – vil oppføre seg motsatt av det som er dokumentert.

**Bevis:** Prøveskript: etter lagre('Vegen', …) ga hent('Vegen') objektet, mens hent('Finnes ikke') ga typeof 'undefined' og (mangler === null) === false.

### Utskriftsrapporten setter «profil 0» på merknader som gjelder hele linjen

`public/js/ui-rapport.js:334` · ikke etterprøvd

**Hva:** Sidepanelet har utenSted() på linje 35 nettopp for å slippe å sette et profilnummer på merknader som ikke hører til noe sted – kommentaren på linje 33-34 sier hvorfor. Utskriftsrapporten har ikke den sjekken: den skriver `v.type === 'inngang' ? '–' : v.s.toFixed(0)`, så alt annet enn 'inngang' får et tall. Merknader av typen 'linje' (masser.js:908) og 'avkortet' (masser.js:1052) settes begge med s: 0 og gjelder hele vegen.

**Når:** Beregningen avkorter profiler ved beregningsbredden. Merknaden «N profiler er avkortet ved beregningsbredden på X m fra vegkant» får kolonnen Profil = «0» i utskriftsrapporten, som om den bare gjaldt starten av vegen. Sidepanelet skriver «prof 0 – …» for samme merknad, mens 'linje'-merknader der får ingen stedsangivelse.

**Følge:** Mottakeren av rapporten leter etter et problem ved profil 0 som i virkeligheten gjelder hele traseen, eller avfeier den som en enkeltstående merknad i starten. Samme merknad får dessuten to ulike stedsangivelser i sidepanelet og på papiret.

**Bevis:** Lest ut av koden: utenSted() finnes bare i visSammendrag (linje 35), ikke i merknadstabellen i apneRapport (linje 333-334). masser.js:908, 919 og 1052 setter alle s: 0 på merknader som gjelder hele linjen.

### lastKorridor henter ikke alle flisene den bilineære interpolasjonen faktisk slår opp i

`public/js/terreng.js:71` · etterprøvd

**Hva:** Flisutvalget legger til flisen som *inneholder* hvert prøvepunkt, men z() trenger også naboflisen når punktet ligger nærmere enn en halv piksel (res 1) / tre meter (res 2) fra en fliskant. I tillegg er prøvenettet 16 m på tvers og opptil 16 m langsetter, mens en flis er 256 m — klipper korridoren et fliskjørne i en kile smalere enn 16 m, blir flisen aldri bedt om. Margen (marg = 2 m) ligger bare på tvers; i lengderetningen er det ingen margin i det hele tatt ved profil 0 og ved siste profil.

**Når:** 120 slumpvise traseer (300–2 000 m, korridor ±57 m, prøvd i masser sitt eget område ±45 m): 1 av 120 traff en flis som aldri blir hentet — trasé med IP (401191.2, 6900455.4) → … i sone 33, der flis 1567_26955 gir 260 oppslag som aldri får data. 49 punkt får NaN, 32 får gjennomsnitt av naboene. Kjørt for ekte på Ydestad (sone 32, 726 m, IP 394988.7/6462981.2 …): flis 1540_25248 blir aldri hentet, 11 terrengoppslag blir NaN som skulle vært tall, 187 får gjennomsnittsverdi (største avvik 0.333 m).

**Følge:** På Ydestad-kjøringen: rensk 10 289 mot 10 292 m³ (−0.03 %), skjæring 35 408 mot 35 409 m³, og én falsk merknad «Terrengmodellen har hull i dette tverrsnittet – volumet er ufullstendig» på siste profil, selv om Kartverket har dataene. Utslaget er lite, men rensk nullstilles for hele tverrsnittet når manglerData settes (masser.js:610–611), og skråningssøket avbrytes ved første NaN (masser.js:386), så volumet blir systematisk for lavt — aldri for høyt — på de profilene det gjelder.

**Bevis:** Ren geometrisimulering av flisutvalget i lastKorridor mot flisene _celle/z faktisk slår opp i, pluss to fulle beregnMasser-kjøringer med og uten de manglende flisene.

### Punkthøydefeltene har step="0.01" mens koden skriver tre desimaler inn i dem

`public/index.html:92` · etterprøvd

**Hva:** tp_venstre, tp_senter og tp_hoyre har step="0.01", men visPunkthoyder (app.js:1221-1223) fyller dem med .toFixed(3). Uten min-attributt er step-grunnlaget 0, så en verdi som 270.278 er stepMismatch, og pil opp snapper til nærmeste hele centimeter i stedet for å legge til én.

**Når:** Brukeren har målt inn vegkanten i felt og vil justere SL-høyden ett hakk opp fra 270,391. Pil opp gir 270,40 – altså +0,9 cm, ikke +1 cm. På VK: 270,278 → 270,28, altså +0,2 cm.

**Følge:** Selve avviket er millimeter og betyr lite for volumet. Men på SL-feltet fører hver eneste endring gjennom settPunkthoyde('senter') (app.js:1240-1247) til at knekkpunktet blir satt til laast=true med k=0. Et utilsiktet piltrykk låser altså senterlinjehøyden i det profilet permanent, slik at «Foreslå profil», «Massebalanse» og «Optimaliser» hopper over det for godt – uten at noe sier fra. Enten bør step være 0.001 for å stemme med visningen, eller visningen rundes til to desimaler.

**Bevis:** I nettleseren med et prosjekt åpent: tp_venstre value="270.278" stepMismatch=true, pil opp → 270.28; tp_senter value="270.391" stepMismatch=true, pil opp → 270.4.

### Tre CSS-regler uten motstykke i markupen

`public/css/app.css:132` · etterprøvd

**Hva:** .hm-display (app.css:132-138) og .hm-varselstriper (app.css:448-451) finnes ikke i index.html og settes ikke av noen JS-fil – de er merkevareelement overført fra de andre appene. .felt input[type=text] (app.css:336) treffer ingenting, fordi ingen .felt inneholder et tekstfelt; feltet som faktisk trenger å spenne to kolonner, m_veiklasse, gjør det med style="grid-column: 2 / 4" rett i markupen (index.html:172).

**Når:** Ingen feilberegning. Men neste gang noen skal gi et felt full bredde, ser regelen på linje 336 ut som mekanismen som allerede finnes, mens den i praksis er død – og løsningen som virker ligger som inline-stil i HTML-en.

**Følge:** Rent vedlikehold. Tas med fordi spørsmålet var om det finnes ubrukte koblinger. Motsatt vei er alt i orden: alle element-ID-ene i index.html blir brukt (fane-masser/-hoyder/-linje via 'fane-' + f.dataset.fane i app.js:1758, stor-kart/-profil/-tverr via 'stor-' + navn i app.js:1725-1727), og alle ID-er koden slår opp finnes – de sju som ikke står i index.html (bekreftJa, bekreftNei, angreFlytting, dlgFil, dlgImport, dlgEksportAlle, sjekkSkog) lages av innerHTML i samme funksjon som slår dem opp.

**Bevis:** Skript som trekker ut alle id= fra index.html og alle getElementById/querySelector('#..')/id('..') fra samtlige filer i public/js, og som krysser CSS-klasser mot HTML + JS begge veier. Null brutte referanser; kun de tre reglene over er uten motstykke, i tillegg til PDF-dialogens klasser som er dekket av eget funn.

### startsWith-vakten mot filsti-rømming slipper gjennom søskenmapper med samme prefiks

`server.js:55` · etterprøvd

**Hva:** path.resolve(filsti).startsWith(path.resolve(PUBLIC_DIR)) sammenligner rene strenger uten skilletegn til slutt. En sti som løser opp til en søskenmappe hvis navn begynner med «public» består testen.

**Når:** GET /../public-sikkerhetskopi/hemmelig.txt gir path.join(PUBLIC_DIR, '/../public-sikkerhetskopi/hemmelig.txt') = C:\Users\thoma\massekalk\public-sikkerhetskopi\hemmelig.txt, som starter med C:\Users\thoma\massekalk\public og dermed serveres. Til sammenligning blir /../prosjekter/x.json korrekt avvist med 403.

**Følge:** Filer utenfor public/ kan leses av den lokale utviklingsserveren. Ingen slik mappe finnes i dag, og serveren lytter bare lokalt, så det er ikke utnyttbart nå – men vakten gjør ikke det den ser ut til å gjøre. Sammenligningen mangler path.sep på slutten.

**Bevis:** Kjørt med de faktiske path-kallene fra server.js mot prosjektets egen PUBLIC_DIR.

### paastand() forkaster det tredje argumentet — 15 diagnosetekster blir aldri skrevet ut

`test/selftest.js:26` · etterprøvd

**Hva:** Signaturen er function paastand(navn, sant) på linje 26, men 15 av de 84 kallene sender et tredje argument med diagnosetall, for eksempel «verste sprang ' + verstHopp.toFixed(4)» (linje 406), «${vm.length} merknader» (linje 468), «0,1 m: ${standard.toFixed(1)} 0,02 m: ${fin.toFixed(1)}» (linje 419) og «${for_.length} brudd» (linje 574). Argumentet blir stille forkastet. Til sammenligning gjør sjekk() det riktig og skriver ut faktisk og ventet verdi. Nettlesertestens sjekk(navn, sant, detalj) tar imot detaljen og skriver den ut — bare node-varianten mister den.

**Når:** Feiler for eksempel påstanden på linje 406 («overgangen skjæring/fylling er sammenhengende»), skriver testen bare «FEIL overgangen skjæring/fylling er sammenhengende». Tallet forfatteren skrev ned nettopp for å kunne diagnostisere — hvor stort spranget var — kommer aldri fram, og man må instrumentere testen på nytt for å se det.

**Følge:** Ikke feil i beregningen, men diagnosen forsvinner nøyaktig i det øyeblikket den trengs. Det gjør det dyrere å finne ut om et brudd er en marginal grensesak eller en grov feil, og øker sjansen for at en feilende test blir avfeid som støy.

**Bevis:** selftest.js:26-29 viser signaturen paastand(navn, sant) uten tredje parameter. Skriptet som teller kall med minst tre argumenter på toppnivå ga: «paastand-kall med >=3 argument: 15» av totalt 84 kall.

### «Ingen feil i konsollen underveis» fanger bare uncaught window.onerror

`public/js/nettlesertest.js:98` · ikke etterprøvd

**Hva:** Linje 44 setter window.onerror og linje 98 kontrollerer at listen er tom. window.onerror fyres bare på ubehandlede synkrone feil. console.error(...) fanges ikke, og ubehandlede promise-avvisninger (unhandledrejection) fanges heller ikke — og programmet er gjennomgående asynkront: App.oppdater, App.balanser, App.rettOpp, Lager.hent og terrenghentingen er alle promiser.

**Når:** En feil i en asynkron kjede som ikke ventes på — for eksempel en avvist promise fra flishenting inne i App.oppdater — havner som unhandledrejection i konsollen, ikke som window.onerror. Påstanden «ingen feil i konsollen underveis» står grønn selv om konsollen er full av røde linjer.

**Følge:** Påstanden lover mer enn den holder. Nettopp asynkron terrenghenting og lagring er der stille feil oppstår, og det er den delen påstandens navn dekker i brukerens øyne, men ikke i koden.

**Bevis:** nettlesertest.js:43-44 (bare window.onerror settes) og linje 98. Ingen addEventListener('unhandledrejection', …) og ingen overstyring av console.error noe sted i filen.
