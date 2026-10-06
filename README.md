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

Tjeneren svarer bare på maskinen selv. Skal andre på samme nett nå den (et
nettbrett på plassen), startes den med `MASSEKALK_VERT=0.0.0.0 node server.js`;
`PORT=…` velger en annen port.

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
| Massebalanse | Løfter/senker hele profilen dit minst masse må kjøres inn og ut av anlegget |
| Optimaliser | Finjusterer hvert knekkpunkt for billigst mulig løsning |

## Stikkrenner

Trykk **⊖ Stikkrenne** i kartet og klikk der renna skal krysse vegen. Den
settes i stasjonen nærmest klikket, med diameter og minste fall fra malen, og
står i lista under **Vegmal**:

* **Lengden** regnes av rennas eget tverrsnitt: fra fyllingsfoten – eller midt
  i grøftebunnen der vegen ligger i skjæring – på den ene siden til den andre,
  og et tillegg forbi foten (0,5 m). En skjev renne (vinkel mot normalen) blir
  1 / cos lengre. Snittet står utenfor massene: en renne flytter ikke volumene.
* **Høydene** er bunn innvendig. Innløpet ligger på bakken (renska, der enden
  ligger) eller i grøftebunnen på siden vannet kommer fra (auto: siden som
  ligger høyest). Utløpet følger terrenget når det faller minst minstefallet;
  ellers gir fallet høyden.
* **Overdekningen** prøves under vegen fra kant til kant, fra vegoverflaten til
  topp rør (bunnen, det innvendige og én vegg – ytre diameter 1,15 ×
  innvendig). Er den under kravet (0,5 m), senkes innløpet først, så langt
  minstefallet tåler, og hele renna med det som mangler etter det. Merknaden
  sier hvor mye.
* **Låste høyder:** skriver du bunnen i innløpet eller utløpet i lista, står den
  – den endres aldri av seg selv, og merknadene sier fra om overdekning, fall
  og et utløp som henger over bakken. Står innløpet på auto, låses siden med.

Hver renne har et nummer: `SR1`, `SR2` … er navnene i KOF-en (`SR1I` og `SR1U`
for innløp og utløp), og nummeret står i lista, kartet og rapporten. Det endres
ikke når en annen renne slettes.

Renna tegnes i kartet, i tverrsnittet i stasjonen sin («snitt» i lista, «Vis
snittet» i kartet) og i lengdeprofilen, og står i rapporten, PDF-en, KOF-en
(`STIKKINN`/`STIKKUT`, bunn innvendig) og DXF-en (laget `STIKKRENNE`). Massene
for selve renna – fundament og omfylling – telles ikke.

## Rør fra maskinstyringen

Innmålte rør kan hentes inn fra en LandXML-fil – eksporten «as-built» fra Xsite
Manage og liknende. Velg **⌀ Nye rør (fra fil)** i anleggslista, «Rør (fra fil)»
i førstevalget, eller slipp fila på kartet.

* **Punktene blir rør av seg selv.** Fila har bare punkter, og operatøren måler
  fram og tilbake og hopper mellom rørene i samme grøft – målerekkefølgen kan
  ikke brukes. Programmet trekker linjene etter hvor punktene ligger: punkt med
  samme kode som ligger høyst 25 m fra hverandre, henger sammen (minste
  spenntre). Avstanden kan endres i Rør-fanen.
* **Punktene er toppen av røret, målt midt over senterlinja.** Sett ovenfra ligger
  de i senter av røret; i høyden er de topp rør. Senter er en halv diameter lenger
  ned, bunnen en hel.
  Diameteren leses av koden («180 PE», «SP 160PE») og kan rettes i Koder-fanen.
* **Overdekningen måles mot Kartverkets terreng (DTM1)** – slik marka var da
  den ble skannet.
* **Koordinatsystemet** står sjelden i fila. Programmet bruker det fila oppgir,
  ellers sonen som legger rørene ved de andre anleggene i prosjektet, ellers
  UTM 32 – og dialogen sier hva den valgte og hvorfor. Legges en fil i en annen
  sone til et røranlegg, regnes de nye punktene om til anleggets sone.
* **Punkt med koordinater utenfor UTM i Norge** – en måling uten fix som ble
  skrevet som 0 0 0 – hoppes over og telles. Er halvparten eller mer utenfor,
  er fila i et annet system (NTM, lokalt), og den avvises med en forklaring.
* **Kobler programmet feil**, rettes det i kartet: slå av et punkt, bryt en
  strek, koble to ender. Rettingene står seg når en nyere fil importeres –
  punktene kjennes igjen på id-en i fila, og ingenting slettes stille.

Rørene vises i kart, lengdeprofil og 3D (piltastene blar mellom dem), og får
sin egen del i rapporten og PDF-en. I 3D står kummene: en tegnet kum som en
sylinder fra bunnen av kumgropa opp til terrenget, en innmålt som en ring på
1 m der den ble målt (laget «Kummer»). De eksporteres som rør – se «Eksport» under.
Nye rør tegnes i et eget anlegg – se «Planlagte rør» under.

### Oversiktskart

**🗺 Oversiktskart** i kartverktøyet (og «Oversiktskart over rørene (PDF)» under
Eksport) lager kartet som skal ut på plassen. Det er én PDF:
* Første side er et samlekart med alle rørtypene du krysser av, innmålte og
  planlagte, fra alle røranleggene i prosjektet.
* Hver rørkode har sin farge, i systemets fargefamilie: vann blå, spillvann
  brun/rød, overvann grønn.
* Tegnforklaringen i siden har lengden, antall rør og om de er innmålt eller
  planlagt. Innmålte rør er heltrukne, planlagte stiplet, og kummene er
  sirkler.
* Med «Ett kart per type» følger én side per type, med de andre rørene i grått
  under.

Bakgrunnen er Kartverkets gråtone- eller topografiske kart, hentet i UTM så
rørene ligger der de er målt. Arket er A3 eller A4 liggende, med målestokk,
linjal og nordpil. Ingenting i prosjektet endres.

**Terrenget**, så de som skal grave vet hvor det skal. Begge valgene er på fra
start:
* **Høydekoter fra terrengmodellen** (Kartverkets DTM). Avstanden mellom dem
  følger målestokken: 0,5 m i 1:500, 1 m i 1:1000 osv. Hver femte er tykkere
  og har høyden skrevet på.
* **En lengdeprofil for hvert rør** etter kartene. Den viser terrenglinja,
  røret fra topp til bunn innvendig og kummene. Under står et tallbånd med
  profil, terreng, topp rør, bunn innvendig og overdekning.
* Rørene er nummerert i kartet med det samme tallet som står over profilen.

### Grøftemasser

Grøfta regnes med rørene, mot et teoretisk grøfteprofil og Kartverkets terreng
slik det var før graving.

* **Normalgrøfta:** skråning 1:1, bunnbredde D + 2 × 0,3 m, fundament 0,15 m
  under røret, omfylling til 0,3 m over topp rør, gjenfylling med stedlige
  masser. Målene settes for hele anlegget i Rør-fanen, per kode i Koder-fanen og
  på en strekning med **⊓ Grøft på strekning** i kartet (klikk to målte punkt
  på samme rør).
* **Fjell** bare der det er markert på en strekning (dybde til fjell) eller
  sondert i fjellmodellen – ellers er alt løsmasse. I fjell står veggene
  loddrett; løsmassen over graves med vanlig skråning fra fjellkanten.
* **Felles grøft.** Hver rute på 0,2 m graves ned til den dypeste grøfta som når
  den. Rør som ligger så tett at grøftene overlapper, får dermed én grøft, og
  hver kubikk telles én gang – på det dypeste røret. Lengden likeså: ligger et
  rør inne i grøfta til et annet som går langs det, telles meteren bare på det
  dypeste. Rør som krysser eller greiner av, beholder sine meter. **⊔ Felles
  grøft** i kartet gir flat bunn mellom to rør opptil 10 m fra hverandre, og
  «egen grøft» på en strekning graves – og telles – for seg.
* **Sideterrenget** avgjør hvor langt skråningen når: programmet går ut fra røret
  til veggen møter terrenget. Er lia brattere enn skråningen, kappes gropa 30 m
  ut, og merknadene sier fra.
* **Rør uten dimensjon får ingen grøft**, og merknadene sier hvor mye det gjelder.
* **Grøftekasse og spunt** velges på en strekning («Avstiving»). Veggene står da
  loddrett: kassa i kassebredden (standard 1,2 m innvendig, aldri smalere enn
  røret med arbeidsrom), spunten i bunnbredden. Ingen skråning fra samme grøft
  graver inn der den ellers ville skrånet – ikke enden av den åpne grøfta før
  kassa, og ikke naboen i felles grøft; i felles grøft avstives hele grøfta,
  og det gjør den også for et rør som går så tett langs kassa at det ligger i
  samme grøft. Et rør som krysser eller ligger i en egen grøft ved siden av, er
  sin egen grøft og beholder skråningen; ender det inne i kassa (en T, en grein
  fra en kum med kasse), graver enden ikke bak veggen. Overlapper to
  strekninger, går spunt foran kasse. Mengdene er meter grøft med kasse og
  spuntareal (to vegger fra terreng til gravebunn, eller til fjellet, der
  spunten stopper), telt én gang per meter grøft.
* **Tallene:** kubikk per lag (graving løsmasse, sprengning, fundament,
  omfylling uten røret, gjenfylling), løpemeter grøft per dybdeklasse
  (0–1, 1–2, 2–3, 3–4 og over 4 m), kasse og spunt, alt per kode, og
  massebalansen med prosjektets faktorer. Lengder og volum er på bakken, som
  for vegen.

Grøftekanten står i kartet, fundament, omfylling, gravebunn og fjell i
lengdeprofilen (gravedybden under musa), og laget «Grøft» viser den som åpen
grop i 3D. Rapporten og PDF-en får delen «Grøftemasser» med normalgrøfta tegnet.

### Planlagte rør

Nye rør tegnes før jobben – til kalkylen, til høydeføringen og for å se dem mot
det som ligger der. Velg **✎ Rør (tegn)** i førstevalget eller **Planlagte rør
(tegn)** i anleggslista; anlegget er et røranlegg som regnes, tegnes og
rapporteres som et innmålt, med grøft og alt.

* **✎ Ny trase:** klikk punktene langs traseen, dobbeltklikk eller Enter
  avslutter (tilbaketasten tar bort det siste, Esc avbryter). I «Rør i traseen»
  velges ett eller flere rør – kode, sideavstand fra traseen (positiv til høyre
  i tegneretningen) og regel. Rør i samme trase blir én grøft.
* **📂 Trase fra fil:** traseene i en VA-plan (DXF) eller en stikningsfil (KOF)
  hentes inn. DXF: linjer og buer (løse streker kjedes, men ikke gjennom et
  kryss), polylinjer med buer, 2D- og 3D-polylinjer; papirrommet og flatenett
  hoppes over. KOF: `09_91`–`09_99`-linjer, punkt med samme kode etter
  hverandre, og programmets egen stikningsfil (bunn, topp og gravebunn per
  rør). Velg linjene og rørkoden for hver; koordinatsystemet leses av
  KOF-hodet, ellers gjettes det som for rørene. Høydene i fila brukes bare om
  det velges – som bunn innvendig eller topp rør, låst. En ende kobles på et
  innmålt rør med samme kode innen en halv meter, og blir en grein av en annen
  trase i samme system bare på samme sted (5 cm) – der flere ender møtes, er
  røret som renner ut, roten. Alt er ett angresteg.
* **Feste:** en ende som klikkes nær et målt punkt på et innmålt rør, blir en
  påkobling med høyden derfra (låst, med kilden – merknadene sier fra om
  punktet endres). En ende på en annen trase blir en grein som følger den.
* **Høydene er bunn innvendig**, som på VA-tegningene; programmet regner
  topp rør = bunn − gods + diameter (godset fra koden, ellers SDR 11 for PE og
  SN8 for resten). Kontrollpunktene er endene, kummene og de låste høydene. Et
  fritt kontrollpunkt ligger med overdekningen under terrenget (standard 2,0 m).
* **Selvfall og trykk:** spillvann, felles, overvann og drens går rett mellom
  kontrollpunktene; vann og kabel følger terrenget meter for meter. Fallet går i
  tegneretningen – **⇄ Snu fallretning** snur det.
* **⤓ Legg høydene** (Rør-fanen og punktfeltet, per selvfallsrør) finner
  høydene i kummene og de frie endene som gir minst graving: overdekningen
  holdes langs hele røret – prøvd der kontrollen prøver – og fallet er minst
  kodens minste fall og høyst det største. Låste høyder, påkoblinger og
  greiner står. Greiner som renner inn, får plass – med greinene sine, hele
  veien opp: røret holdes lavt nok der de kommer inn, så et nett legges fra
  utløpet og oppover i én runde. Svaret låses, merket «lagt» – et nytt trykk
  legger dem på nytt, og punktfeltet viser det. Det er ett angresteg. Går det
  ikke, endres ingenting, og statuslinja sier hvorfor: dybden, greina,
  påkoblingen eller de låste høydene.
* **◯ Kum** setter en kum i et punkt (velg rør når traseen har flere). Kummen
  får egen grop i grøfta, og volumet står for seg i massetabellen.
* **Kontrollene:** overdekning under grensen, motfall og for lite eller for mye
  fall (med toleranse for millimeteravrundingen), kryss med for liten klaring
  mot alle andre rør i prosjektet – og fjell i grøfta. Rødt i kartet og
  profilen, og i merknadene.
* **Trykkrør:** høybrekk (lufting) og lavbrekk (tømming) der røret stiger eller
  faller minst 0,3 m og snur – med terskel, så en tue ikke blir et brekk; endene
  teller ikke. Mellom brekkene kan et minste fall kreves (av som standard; kodens
  minste fall gjelder for en trykkode). Begge settes i Rør-fanen, og brekkene står
  i profilen.
* **I profilen** klikkes et kontrollpunkt for punktfeltet (bunn innvendig, lås,
  fall videre, hent påkoblingen på nytt), det dras for å låse en ny høyde, og et
  klikk på røret mellom kontrollpunktene setter inn et punkt.

Punktene i kartet dras i Rediger, et klikk på traseen setter inn et punkt, og
Delete tar bort det valgte. Rør-fanen viser traseene med rørene, fallet og
kumlista; Koder-fanen har gods, regel, overdekning og fall per kode. Til
maskinstyring og stikning går de gjennom Eksport-fanen (se «Eksport»).

**Avvik mot innmålt.** Når rørene er lagt og målt inn, importeres de innmålte
som et eget anlegg i prosjektet. **Vis avvik mot innmålt** i Rør-fanen knytter
hvert målte punkt til nærmeste planlagte rør med samme kode (eller samme system
og dimensjon) innenfor søkebredden, og viser avviket i plan (+ til høyre i
tegneretningen) og i høyde (bunn innvendig, + over planen): en tabell per rør
med hvor mye som er innmålt, de største avvikene, ringer i kartet (grønne
innenfor, røde utenfor), punktene i profilen, merknadene og et eget avsnitt i
rapporten og PDF-en. Toleransene settes i fanen – standard 0,10 m i plan,
0,03 m i høyde for selvfall og 0,10 m for trykk, søkebredde 1,0 m. Knappen
endrer ingenting: verken planen eller de innmålte høydene.

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

| Format | Til hva |
|---|---|
| **KOF** | Stikningsdata til totalstasjon og maskinstyring |
| **LandXML** | Linjeføring med kurveelementer og lengdeprofil – leses av de fleste maskinstyringer |
| **SOSI** | Kartdata til kommune og Kartverket |
| **DXF** | Tegning til AutoCAD og liknende |
| **CSV** | Stikningsdata og masseoppsett per profil, til regneark |
| **GeoJSON** | Senterlinje, fotavtrykk og fjellobservasjoner |

**Rør** – innmålte og planlagte – går ut i de samme formatene, med **tre høyder som
egne lag**: bunn innvendig (bunnløpet), topp rør og gravebunn (bunnen av grøfta, brutt
der det ikke graves). Den som setter opp maskina, velger laget.

| Format | Rørene |
|---|---|
| **KOF** | Stikningspunkt i hvert knekkpunkt, hver 10. meter og enden: `RORBUNN`, `RORTOPP`, `GRAVBUNN`; kummene `KUMBUNN` (bunnløp) og `KUMTOPP` (lokk). Hodet sier hva rørnumrene er |
| **LandXML** | En 3D-linje (`PlanFeature`) per rør og høyde, og kummene som punkt (`CgPoint`) |
| **SOSI** | `Rørledning` (bunn og topp) og `Grøftebunn` som kurver, med høydereferanse og diameter; kummene som `Kum` |
| **DXF** | 3D-polylinjer på lagene `<KODE>_BUNN`, `_TOPP` og `_GRAVEBUNN`; kummene som sirkler på bunnløpet |
| **CSV** | Stikningsliste med alle tre høydene, terreng og overdekning per punkt; grøftemassene per kode |
| **GeoJSON** | Rørene som linjer med egenskapene, kummene som punkt |

Formatene er skrevet etter spesifikasjonene, men er **ikke prøvd mot hvert enkelt
mottakersystem**. Ta en prøveimport av én fil før dere baserer en jobb på dem.

**Rapport** gir en utskriftsklar side med lengdeprofilen, et utvalg tverrsnitt og
full stikningstabell med koordinater og høyder for senterlinje og begge vegkanter.
Profilene tegnes på nytt i lys palett for papir. Lagres som PDF fra nettleseren.

## Test

To testsett, som dekker hver sin del:

```bash
node test/selftest.js
```

154 kontroller uten nettleser: koordinatregning mot kjente referanser, linjeføring
mot geometri regnet for hånd, lengdeprofil mot parabelformlene, masseberegning mot
et tverrsnitt regnet ut for hånd med sju siffer, veiklassene mot tallene i normalen,
kurvereglene, innlesing av høydetabeller, eget tverrfall per profil, avkortet
beregningsbredde, grensene mot terrenget, massebalansen mot bokføringsreglene,
avlesning av PDF, pakkingen av terrengfliser, og terrengmodellen mot Kartverket.

Åpne programmet med **`?test=1`** bakerst i adressen for den andre halvparten:
134 kontroller av selve grensesnittet – lagring, tegning av linje, alle
profilverktøyene, høydetabellen, alle ni veiklassene, tverrprofilet, grensene,
eksportene, rapporten og panelene. Den lager sitt eget prosjekt og rydder opp
etter seg, så den er trygg å kjøre på en maskin med ekte prosjekter.

```bash
node test/rorprove.js
```

Rørene: innlesing av LandXML, kodetolkingen, linjene mot punkter med kjent fasit
(fram og tilbake, rør om hverandre, stikkledninger i sikksakk), brudd, kobling,
sone, sammenslåing av en ny fil og overdekningen mot et kunstig terreng.

```bash
node test/groftprove.js
```

Grøfta mot fasit regnet for hånd: én grøft per meter (graving, fundament,
omfylling, gjenfylling, endene), fjellgrøft fra strekninger og sonderinger,
loddrette vegger, sidehelling, hull i terrenget, felles og egen grøft (også midt
på et rør og i en knekk), sammenslåing med fall, ulike lengder og fjell, et
T-kryss bygd som programmet bygger det, mål per kode og strekning,
grøftekasse og spunt (sonen, felles grøft, kummer og tellingen),
dybdeklassene, massebalansen og bakkefaktoren. Med `ROR_FIL=<sti til en xml>` kjøres
en ekte fil i tillegg i begge rørprøvene – kundens filer ligger ikke i repoet.

```bash
node test/rorplanprove.js
```

De planlagte rørene: bunn ↔ topp med godset, sideavstanden i knekker, høydene
for selvfall og trykk mellom kontrollpunktene, kummer, greiner og påkoblinger,
kontrollene (overdekning, fall og motfall med millimeteravrundingen, kryssing,
høybrekk, lavbrekk og fall for trykkrør), høydene lagt på knapp mot fasit regnet
for hånd – faste punkt over taket, greiner som renner inn og nett av greiner,
hvorfor det ikke går, og 150 rør og 120 nett på tilfeldig terreng uten
uforklart merknad etterpå –
fallet mellom kontrollpunktene og ryddingen av plandelen når prosjektfila åpnes.

```bash
node test/roreksportprove.js
```

Eksporten av rør: stikningspunktene (knekk, hver 10. meter, enden og kummene),
de tre høydene mot grøftemotoren – også bruddet der røret ligger over terrenget –
og hvert format: KOF-navn og koder, LandXML-linjer og kummer, SOSI-kurver i
centimeter, DXF-lag og GeoJSON.

```bash
node test/roravvikprove.js
```

Avviket mot innmålt: kodelikheten, sideavviket med fortegn (også i en knekk og
forbi enden), høydeavviket med godset til hver sin kode, toleransene for
selvfall og trykk, knytningen til nærmeste rør, dekningen og hullene, punkt nær
men utenfor søkebredden og merknadene.

```bash
node test/traseimportprove.js
```

Traseer fra fil: KOF med linjeblokker, lukkede og åpne linjer, punkt med samme
kode og koder med mellomrom, sonen fra hodet, stikningsfila røreksporten skriver
lest tilbake; DXF med løse streker som kjedes (ikke gjennom en T, og med
3D-høyden i skjøtene), LWPOLYLINE med høyde, 2D- og 3D-polylinjer, buer, sirkler
og ARC, papirrom, flatenett, speiling med høyden og 20 000 streker på tid.

```bash
node test/stikkrenneprove.js
```

Stikkrennene mot fasit regnet for hånd på en rett veg: fylling på flatt terreng
(fot til fot pluss tillegget, minstefallet, overdekningen i vegkanten), massene
uendret av en renne, en skjev renne (også i en stigning), sidebratt terreng med
innløpet i grøftebunnen og renna dreid om utløpet for overdekningen, senking
uten og med fall å gi, låste høyder, og det som ikke går. `npm test` kjører
alle åtte.

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
public/js/stikkrenner.js stikkrennene: endene, lengden, høydene og overdekningen av tverrsnittet
public/js/veiklasser.js  veiklassene fra landbruksveinormalen
public/js/lager.js       prosjektlager i nettleseren, import og eksport
public/js/eksport.js     KOF, LandXML, SOSI og DXF
public/js/pdfimport.js   avlesning av tegnede kurver i en PDF
public/js/ror.js         rørene: LandXML, koder, linjer, sone, profil
public/js/groft.js       grøfta: rutenett, felles grøft, kummer, fjell, lag, dybdeklasser, balanse
public/js/rorplan.js     planlagte rør: høydene, kummer, greiner, påkoblinger og kontrollene
public/js/roreksport.js  rørene til KOF, LandXML, SOSI, DXF og GeoJSON – bunn, topp og gravebunn
public/js/roravvik.js    planlagte rør mot innmålte: avvik i plan og høyde, dekning og toleranser
public/js/traseimport.js traseer fra KOF og DXF
public/js/ui-ror*.js     rørene i skjermen: import, faner, profil, 3D
public/js/ui-rorplan.js  planlagte rør i skjermen: tegning, redigering, Rør-fanen, punktfeltet
public/js/ui-groft.js    grøfta i skjermen: Rør-fanen, verktøyene i kartet, normalgrøfta
public/js/farger.js      tegnefargene, hentet fra CSS-variablene
public/js/nettlesertest.js  gjennomgang av grensesnittet (?test=1)
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
