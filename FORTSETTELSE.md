# Hvor arbeidet står

Denne fila finnes for at arbeidet skal kunne tas opp igjen nøyaktig der det ble
lagt fra seg. Alt som er gjort ligger i git og er pushet til
`github.com/thomashauge03/masseberegner`. Ingenting er bare i en nettleser eller
en samtale.

## Ta det opp igjen

Åpne en ny økt i `C:\Users\thoma\massekalk` og si: **«fortsett fra
FORTSETTELSE.md»**. Alt som trengs står her og i `GJENNOMGANG.md`.

Kjør testene først, så du vet du starter fra noe som virker:

```bash
npm test
```

(selvtesten, rørprøven, grøfteprøven, planprøven, eksportprøven og avviksprøven
etter hverandre)

Nettlesertesten kjøres ved å åpne programmet med `?test=1`, eller fra konsollen
med `Nettlesertest.kjor()`. Utviklingstjeneren startes med `node server.js`
(port 5178). Programmet ligger også på https://masseberegner.vercel.app.

Ved siste lagring: **894 prøver i selvtesten, 194 i rørprøven
(`test/rorprove.js`), 219 i grøfteprøven (`test/groftprove.js`), 124 i
planprøven (`test/rorplanprove.js`), 63 i eksportprøven
(`test/roreksportprove.js`), 77 i avviksprøven (`test/roravvikprove.js`), 53 i
anleggsprøven og 258 i tomteprøven, alle grønne; 1434 av 1434 i nettlesertesten.** «Klikk i modellen flytter snittet
dit» i `veg3d` kan feile når vinduet emuleres 1440 × 900 i en mindre rute –
klikket lander én rad ved siden av; det gjør den likt på `main`. «og merknaden
sier det som gjelder nå» i `flereAnlegg` feilet én gang i hele runden og aldri
alene: merknaden velger naboene etter `_mittOmraade`, som leser resultatet som
står, mens prøven sammenligner med hurtiglageret. `test/demo-ydestad.js` skriver
demoen på nytt; den holder demoens bredde (4,5 m) fast, så fila blir lik. 3D-prøvene
må ha fanen framme; i en bakgrunnsfane tegnes ingen rammer. Nettlesertesten
må kjøres i et vindu som er minst 1000 px bredt – under det legger
sidepanelet seg oppå, og tre panelprøver blir røde uten at noe er galt. Last
siden på nytt før en ny runde: står resultatet fra forrige runde åpent, måler
fingerprøven «Lukk»-knappen dets (54×29) og blir rød. Massene på demoen: 1 397 m³ skjæring, 1 397 m³ fjell og 778 m³ fylling,
med masseutskifting. De er uendret gjennom veg-restfunnene.

## Det som skal gjøres nå

Brukeren ba 2026-10-06 om at «alt» gjøres ferdig, i denne rekkefølgen: rør 3b,
rør 3c (med de to restpunktene fra 3a), restfunnene i veg-delen fra
`GJENNOMGANG.md`, resten av «Utenfor 3a» (import av traseer fra DXF/KOF, kummer
i 3D, fallkrav for trykkrør, grøftekasse/spunt, optimalisering av høydene) og
stikkrenner. Designvalgene tas underveis og står i spesifikasjonen for hver del;
hver del flettes inn i `main` og pushes når den er gjennomgått og grønn.
**Alt som endrer høyder, skal ligge på knapper – innmålte høyder endres aldri
automatisk.** Delte prosjekt (database og innlogging) er holdt utenfor.
Underveis ba brukeren om et **oversiktskart for rørene** – ett kart med alle
typene i hver sin farge og tegnforklaring, og ett kart per type. Det kom foran
resten av «Utenfor 3a».

### Rør, etappe 3d-1 – kummer i 3D, trykkrør, grøftekasse og spunt

Spec: `docs/superpowers/specs/2026-10-06-ror-etappe3d1-design.md`.
Plan: `docs/superpowers/plans/2026-10-06-ror-etappe3d1.md`.

Tre av de fem tingene i «Utenfor 3a». De to siste – traseer fra DXF/KOF og
høydene lagt på knapp – er 3d-2.

- **Kummer i 3D** (`ui-ror3d.js`): en tegnet kum står som en sylinder fra
  bunnen av kumgropa (bunnløp − 0,25 m) opp til terrenget. En innmålt
  KUM-kode står som en ring på 1 m i målt høyde. Laget «Kummer» står i
  verktøylinja, og kameraet rammer inn kumbunnen.
- **Trykkrør** (`RorPlan.brekk` og `kontroller`): høybrekk og lavbrekk finnes
  med terskel (`mal.plan.brekk`, 0,3 m), så en tue ikke blir et brekk; endene
  teller ikke. Mellom brekkene kan et minste fall kreves
  (`mal.plan.trykkMinFall`, 0 = av). Det er kodens minste fall når koden selv
  er et trykkrør. Begge står i Rør-fanen. Brekkene står i merknadene, i kartet
  og i profilen (▲/▼).
- **Grøftekasse og spunt** (`groft.js`): «Avstiving» på en strekning.
  - Veggene står loddrett: kassa i kassebredden (1,2 m, aldri smalere enn
    røret med arbeidsrom; da kommer en merknad), spunten i bunnbredden.
  - Rundt strekningen ligger en avstivingssone: den naturlige gropa, der
    grøfta ellers ville skrånet. Ingen skråning fra samme grøft graver inn i
    den – verken enden av den åpne grøfta før kassa eller naboen i felles
    grøft. Naboen har sonen langs den delen som går langs kassa. Andre rør er
    sin egen grøft og beholder skråningen.
  - Hvilke rør som ligger i samme grøft, avgjøres som uten avstiving.
  - `kasseLengde` og `spuntAreal` telles én gang per meter grøft. De står i
    fanen, rapporten, PDF-en og CSV-en (`Kasse_m;Spunt_m2` til sist).
  - Spunten stopper på fjell, og der veggen er fjell hele veien opp, telles
    verken kasse eller spunt.
  - Uten avstiving er tallene uendret. Segmentene har nå alle de samme
    feltene: ett felt for mye gjorde grøfta nesten fire ganger så treg, og
    selvtesten passer på det.

En kodegjennomgang fant ingen kritiske feil og tre alvorlige, alle rettet med
prøver:
- Sonen var søkeradiusen og gjaldt alle rør. En egen grøft 8 m unna mistet
  9 % av gravingen.
- En nabo i felles grøft som bøyde av, fikk kassa langs hele segmentet. Det
  ga 130 m kasse for 100 m.
- Spunten ble regnet gjennom fjellet.

Av de mindre er disse rettet:
- dobbeltpunkt i overgangen;
- den naturlige gropa gikk ut fra kasseveggen;
- en ugyldig kassebredde ble byttet stille mot standarden;
- merknaden om smal kasse viste bare den første bredden;
- kasse og spunt mot samme nabo hang på rekkefølgen;
- flatt topp ble meldt i enden;
- terskel 0;
- navnene i profilen sto oppå hverandre.

En andre gjennomgang av rettingene fant at de holdt, og ingen kritiske feil.
To nye alvorlige ble rettet med prøver:
- Langs en akse fant ikke to rør 0,9 m fra hverandre hverandre. Kassa var bare
  registrert med det den selv når, så grøfta og kassa ble talt to ganger.
- Et annet rør gravde bak kasseveggen:
  - enden av en T eller en grein fra en kum med kasse;
  - et rør i samme grøft uten «felles grøft».

  Nå avstives samme grøft som en felles grøft, og enden graver ikke bak veggen.

Ellers rettet:
- et stykke uten lengde i overgangen gjorde naboens retning avgjørende;
- overlappende strekninger der den siste vant;
- dialogen som klemte tall over grensen stille.

En tredje gjennomgang fant at rettingene holdt og ikke var avhengige av
rekkefølge eller retning, og to ting til, begge rettet:
- Steg 4c prøvde hver meter mot alle kassene. Med 40 km rør og 40 kasser tok
  det to minutter, og det regnes ved hver endring. Kassene ligger nå i et
  rutenett på 30 m, og det tar 0,6 s.
- Enden av en grein gravde fortsatt bak veggen i tre tilfeller:
  - når den sluttet like utenfor kassa (nå: inne er der bunnen dens når
    veggen);
  - med et dobbeltpunkt i enden;
  - på den flate bunnen i en felles grøft.

En skjøt midt i naboens meter avgjøres nå uten å avhenge av retningen på
kasserøret.

Mutasjonsprøvd fire ganger: 24 mutanter, så 12, 12 og 9 for rettingene.
- To grener i `brekk` kunne aldri nås, og de ble fjernet.
- To mutanter står igjen, og begge er likeverdige med koden i praksis:
  - den ene grenen i skjøtregelen, som bare nås ved avrunding;
  - t-sjekken for en ende i naboens sone.

### Rør – oversiktskart

Spec: `docs/superpowers/specs/2026-10-06-ror-oversiktskart-design.md`.
Plan: `docs/superpowers/plans/2026-10-06-ror-oversiktskart.md`.

**🗺 Oversiktskart** (kartverktøyet for rør, og under Eksport) lager én PDF:
samlekartet med de avkryssede rørtypene fra alle røranleggene, og én side per
type. Ren modul `public/js/rorkart.js`: fargetabell per kode (familie etter
system, nyanse etter dimensjon), utsnitt med fast målestokkrekke, flisplan i
Kartverkets UTM-cache (`utm32n/33n/35n`, ingen omprojisering), og tegningen på
`PdfSkriver`, som har fått `sti`, `sirkel` og `klipp`. `public/js/ui-rorkart.js`
samler rørene uten å bytte anlegg, viser valget, henter flisene (fetch, CORS) og
laster ned. Mangler flisene, lages PDF-en uten bakgrunn, og det står på siden.
Visuelt sjekket mot appens eget kart: bakgrunnen ligger der den skal.

**Med terreng** (spec `docs/superpowers/specs/2026-10-06-ror-kart-terreng-design.md`),
etter at brukeren ba om «tegning med terreng så de som jobber vet hvor det
skal»:
- **Høydekoter i kartet:** `Rorkart.lagKoter` prøver terrenget i et rutenett
  over kartflaten og legger kotene med marsjerende kvadrater, kjeding og
  Douglas–Peucker. Ekvidistansen følger målestokken.
- **En lengdeprofil per rør:** ny ren modul `public/js/rorlengde.js` med
  striper i fast målestokk-rekke, terrenglinje, rørbånd, kummer og tallbånd.
- **Terrengmodellene:** `ui-rorkart.js` henter terrenget i egne modeller,
  ikke i appens. Tegnede rør regnes med terrenget så de får høyder.
- **Numrene** i kartet er de samme som over profilene.

### Veg – restfunnene fra GJENNOMGANG.md

Spec: `docs/superpowers/specs/2026-10-06-veg-restfunn-design.md`. Åtte puljer på
grenen `veg-restfunn`, hver gjennomgått av en egen granskning og rettet etterpå:

1. **Høyder uten knapp.** En omregning endrer aldri `P.vip`: beregningen får en
   kopi (`vipTilLengde`), der det første punktet bak linjeslutt er med som det
   er, så vegen som er igjen blir den samme når linja kortes. «Rett opp» og
   «Optimaliser» flytter bare høyder på linja. Knappene gjør det de sier.
   Massebalansen sikter mot minst kjøring.
2. **Lagring og angre.** Angreposter for alle endringer, ingen tomme poster,
   og navnet angres ikke. Lesefeil skilles fra «finnes ikke».
3. **Rapport, PDF og eksport.** Bolker, stikningstabell, desimalkomma,
   slitelag og brukt profilavstand.
4. **PDF-avlesningen.** Strømlengder, sider, skjemaer per side, lukkede og
   fylte flater, og klikkforskyvningen.
5. **Regler og beregning.** Kurver som konkurrerer om et strekk, deler
   plassen likt (`plassdeling.js`), for både planlinja og lengdeprofilen.
   Skarpe hjørner regnes med kurven de minst ville trengt. Normalens unntak
   for korte rettstrekk er i bruk. Bakkefaktoren går inn én gang på volumet.
   Fjellmodellen toner ut mot rekkevidden. Ellers: radiusbånd, K4, K5,
   inngangsvakter, utslag mot hel fot og hårnål/180°.
6. **Grensesnittet.** Etiketter, skyveren, tverrsnittsavlesningen, kartklikk
   og dobbeltklikk.
7. **Tjeneren.** Flisene kontrolleres. Feilsvar mellomlagres ikke. Stien
   holdes innenfor `public/`, og tjeneren lytter på 127.0.0.1.
8. **Prøvene.** Detaljer ved feil, en TIFF bygd i prøven, console.error i
   nettleserprøven, og en tallregresjon.
9. **Den siste gjennomgangen.**
   - LandXML skriver linjeslutt én gang og i rekkefølge.
   - `GET //` tar ikke ned tjeneren.
   - Angre: et merke som slippes, legger tilbake det det tok – «Gjør om» og
     den eldste posten. Navnet er ikke med i angrepostene.
   - Plassdelingen deles opp der strekket har plass til begge, og er lineær i
     praksis. Hjørnet regner med det naboens kurve lar ligge.
   - PDF-leseren:
     - tekst i ordbøker teller ikke med;
     - den nyeste utgaven vinner, også i objektstrømmer;
     - `h`/`s` lukker riktig;
     - et tilbakesteg måles mot det lengste linja har nådd.
   - Halve søketreff mellomlagres ikke.
   - Et kort bratt strekk mellom profilene vurderes med alle profilene rundt.
   - Etiketter uten id får en.
   - Prøver for alle mutantene som overlevde. Det var 23 i selvtesten og 18 i
     nettleseren; nettleserprøven `vegRettelser` er ny. Mutasjonslistene er
     kjørt igjen, og alle blir drept.

**Tall som kan flytte seg i et lagret prosjekt, med vilje:**
- Bakkefaktoren på volum: en gang, ikke i annen potens. Utslaget er om lag
  0,04 %.
- Sprengningen der sonderingene ligger glissent: standarddybden eller
  strekningen veier nå med mellom sonderingene.
- Vegnivå og planlinje der kurver ble kortet inn for å få plass: nå deler de
  likt, før ble begge skalert med samme faktor.
- Bredde og stigningskrav ved skarpe hjørner. Uten kurve ble hjørnet regnet
  som rettstrekk.
- Færre stigningsmerknader på korte rettstrekk (+2 %, inntil 60 m).
- En tverrfallsoverstyring gjelder fra den forrige til den neste, med 10 m
  overgang. Før gjaldt den hele vegen.
- Nye prosjekt får klasse 5 sine tall: 4,0 m veg og 3,5 m slitelag. Lagrede
  prosjekter beholder sin bredde.
- Et skarpt hjørne ved siden av en kurve får det en kurve der ville fått: det
  naboen lar ligge, når det er mer enn halve benet. Den blir aldri mindre enn
  før.
- Et kort bratt strekk inne i et langt bratt stykke får ikke lenger tillegget
  for korte rettstrekk.

Demoen er uendret: 1 397 m³ skjæring, 1 397 m³ fjell og 778 m³ fylling, med
masseutskifting. Det er det samme som på `main` før grenen.

**Ikke gjort, eller bør sjekkes:**
- K4 sin returstigning er satt til 16 %, det tabellen håndhevet. K5 sitt
  unntak for korte rettstrekk gjelder returretningen. Begge bør sjekkes mot
  normalen (kap. 3.4 og 3.5).
- K7 sitt stigningsvilkår for ensidig tverrfall (L6) og breddekravet over
  135° dreining (L7) krever normalens figurer. Infoboksen sier at de ikke er
  med.
- «Rett opp» er strengere enn kontrollen der vertikalkurvene gjør det bratte
  stykket kortere enn 60 m. Den kan rette noe kontrollen godtar, men aldri
  omvendt.
- Tallregresjonen (selvtesten 6h) bruker et syntetisk terreng. Ekte fliser er
  ikke lagt inn i repoet som fast grunnlag.
- LandXML skriver et høydepunkt bak linjeslutt når en vertikalkurve går over
  slutten. Det er ikke prøvd i en mottaker.

### Rør, etappe 3c – planlagt mot innmålt

Spec: `docs/superpowers/specs/2026-10-06-ror-etappe3c-design.md`.
Plan: `docs/superpowers/plans/2026-10-06-ror-etappe3c.md`.

**Vis avvik mot innmålt** i Rør-fanen for et tegnet anlegg sammenligner planen
med de innmålte røranleggene i prosjektet. Ny ren modul `public/js/roravvik.js`:
hvert målte punkt knyttes til nærmeste planlagte rør med samme kode (eller
samme system og dimensjon) innenfor søkebredden; sideavvik med fortegn (+ til
høyre), høydeavvik bunn mot bunn med godset til hver sin kode, dekningen av de
innmålte linjene (hull på 2 m eller mer står som «ikke innmålt») og punkt nær
men utenfor søkebredden. Toleransene (0,10 m i plan, 0,03/0,10 m i høyde for
selvfall/trykk, søkebredde 1,0 m) står i `mal.plan.avvik`, lagres og kan
angres. Vises i fanen (tabell per rør og de største avvikene), kartet (ringer),
profilen (punktene, antallet i tittelen, avviket i avlesningen), merknadene,
rapporten og PDF-en. Knappen endrer ingenting.

De to restpunktene fra 3a er tatt: andre tegnede anlegg i nærheten får
terrenget sitt hentet med det aktive (kryssingskontrollen fikk høyder lånt fra
et annet sted langs røret, eller ingen linjer), og statuslinja sier «ved 90PE,
kobles på om det blir en ende» i stedet for «festet til» for hvert punkt – og
hvilke ender som ble koblet når traseen lagres.

En kodegjennomgang fant ingen kritiske feil og to alvorlige, begge rettet med
prøver: et T-punkt i det innmålte ble telt opptil tre ganger (importen deler
rørnettet i knuten), og fortegnet på utsiden av en knekk skarpere enn 90° kom
fra feil strekk – nå er det svingens. Av de mindre er disse rettet: en innmålt
kode uten materiale bruker planens gods, toleransene skrives med tre desimaler
når de trenger det, steget i feltene, rørnummeret i «De største avvikene», og
de innmålte rørene bygges én gang per beregning.

### Rør, etappe 3b – eksport til maskinstyring og stikning, flettet inn i `main`

Spec: `docs/superpowers/specs/2026-10-06-ror-etappe3b-design.md`.
Plan: `docs/superpowers/plans/2026-10-06-ror-etappe3b.md`.

Røranleggene – tegnede og innmålte – går ut i KOF, LandXML, SOSI, DXF, GeoJSON
og CSV, med bunn innvendig, topp rør og gravebunn som egne lag (brukerens valg).
Ny ren modul `public/js/roreksport.js`; Eksport-fanen vises for rør, og
samlefilene tar rørene med. Stikningspunktene er knekkpunktene, hver 10. meter
og enden; kummene har bunnløp og lokk.

En kodegjennomgang av grenen fant ingen kritiske feil, to alvorlige og seks
mindre, alle rettet med prøver. De alvorlige: det som ikke kom med (rør uten
dimensjon, rør uten terreng, grøft som ikke er regnet) sto ingen steder – nå
står det i hver fil og i svaret under knappene, og grøftemassene skrives ikke
som nuller; og samlefila kunne få to røranlegg på hver side av en sonegrense
under ett hode – nå har fila én sone, og et anlegg i en annen står utenfor med
grunnen. De mindre: DXF-lagene i samlefila får anleggsbokstaven (navnet ble for
langt for R12), knekkpunkt stikkes med sin egen høyde, tekst som kunne bli en
formel i et regneark nøytraliseres, anlegg uten noe tegnet hoppes over uten å
vente 45 s, og rutenettet tar bare tomtene.

### Rør, etappe 3a – planlagte rør, flettet inn i `main`

Spec: `docs/superpowers/specs/2026-10-05-ror-etappe3a-design.md`.
Plan: `docs/superpowers/plans/2026-10-05-ror-etappe3a.md`.

Nye rør tegnes i et eget anlegg: et røranlegg med `ror.plan` (traseer, rør med
sideavstand, kummer, låste høyder, greiner) som regnes, tegnes og rapporteres
som et innmålt – med grøft. Høydene settes som bunn innvendig og regnes om til
topp rør med godset; frie kontrollpunkt ligger med overdekningen under
terrenget, selvfall går rett mellom kontrollpunktene og trykk følger terrenget.
Endene festes til innmålte rør (påkobling med kilde) eller til andre traseer
(grein). Kummene får egen grop i `groft.js`. Kontrollene i `RorPlan.kontroller`:
overdekning, fall og motfall (med toleranse for millimeteravrundingen),
kryssing mot alle rør i prosjektet, og fjell fra grøfta.

I skjermen (`ui-rorplan.js`): «✎ Ny trase» med «Rør i traseen», redigering i
kartet (dra, sett inn, Delete, «◯ Kum», «⇄ Snu fallretning»), Rør-fanen og
planfeltene i Koder-fanen, og profilen med punktfeltet, «fall videre», klikk og
dra. Rapporten og PDF-en har regel, fall og kumlista; forklaringen har ordene.

Underveis, utenfor planen: grøfteverktøyene måtte få linjene fra planen (de
bygde dem av målte punkt, og et tegnet anlegg har ingen); PDF-skriveren kjente
ikke ‰; rapportbunnen sa «innmålte punkt … topp rør» også om tegnede rør; og
anleggslista la et nytt anlegg ved siden av det tomme når førstevalget sto oppe.

En kodegjennomgang av hele grenen fant ingen kritiske feil og seks alvorlige,
alle rettet med prøver: kumgropa overså fjellet og «egen grøft» på strekningen
den står på (sprengningen ble mindre med en kum); en ny id kunne overta en
gammel grøftejustering; en ødelagt plan i fila veltet åpningen; en påkobling
mistet kilden når høyden ble låst på nytt (falske «treffer»); påkoblingen
gjaldt bare rørets eget punkt, ikke hele traseen; og et punkt satt inn fra
profilen fikk tom høyde og «fall videre» som aldri virket. Av de mindre er
disse rettet: sletting uten spørsmål, rør med annen kode låst på en påkobling,
dobbeltpunkt, traseen over rørene i kartet, dialoger som skrev i et angret
prosjekt, ugyldige tall som ble stående, rør oppå hverandre uten varsel,
terrengnøkkelen og en svak greinprøve.

Ikke gjort i 3a, tatt i 3c: andre tegnede anlegg regnes mot terrenget til det
aktive i kryssingskontrollen, og statuslinja sa «festet» om midtpunkt nær et
innmålt rør (bare endene kobles).

### Rør, etappe 2 – grøftemasser, ferdig og flettet inn i `main`

Spec: `docs/superpowers/specs/2026-10-05-ror-etappe2-design.md`.
Plan: `docs/superpowers/plans/2026-10-05-ror-etappe2.md`.

Grøfta regnes med rørene i `public/js/groft.js`: et rutenett på 0,2 m der hver
rute graves ned til den dypeste grøfta som når den, så en felles grøft telles
én gang og står på det dypeste røret. Normalgrøft 1:1, D + 2 × 0,3 m, fundament
0,15 m, omfylling 0,3 m; mål per anlegg, kode og strekning; felles grøft med
flat bunn og egen grøft; fjell fra strekninger og sonderinger, loddrett i
fjell; rør uten dimensjon får ingen grøft og meldes. Tallene: kubikk per lag,
løpemeter per dybdeklasse, per kode og massebalanse – på bakken, med
bakkefaktoren, som vegen. Grøfta står i Rør-fanen, kartet (grøftekanten,
«Grøft på strekning», «Felles grøft»), lengdeprofilen, 3D (laget «Grøft») og
rapporten og PDF-en, med normalgrøfta tegnet.

En kodegjennomgang av hele grenen fant én kritisk og seks alvorlige feil, alle
i justeringene og i bratt terreng, og alle er rettet med prøver: løpemeteren
for sammenslåtte rør ble avgjort av avrundingsstøy (nå: én grøft, én lengde, på
det dypeste røret – se spesifikasjonen 4.5); knutepunkt hørte bare til ett av
rørene som møtes; «egen grøft» midt på et rør talte endene to ganger; felles
grøft laget en vifte forbi enden av det korte røret og var avhengig av
klikkrekkefølgen; fjell på strekningene gjaldt ikke i bunnen mellom
sammenslåtte rør; grøfta ble kappet i lia uten merknad; og grøfta kunne bli
stående med gamle hull etter at terrenget var lastet på nytt. I samme runde:
hull ved siden av grøfta gir ikke lenger falske merknader, et rør som stikker
litt opp får lengden sin, sonderingene slås opp én gang per meter (1000 av dem:
fra 10 s til 0,5 s), og bakkefaktoren ganges inn én gang, som for vegen.

Prøvd mot fasit regnet for hånd (`test/groftprove.js`, fire–fem siffer), og på
den ekte fila: alle rørene regnes på under ett sekund, og grøfta er mye kortere
enn rørene til sammen fordi de felles grøftene telles én gang
(`ROR_FIL=<sti> node test/groftprove.js`).

Etappe 3 – planlegge nye rør – kan bruke `Groft.beregn` som den er: den bryr
seg ikke om røret er innmålt eller tegnet, bare om linjene (`id`, `kode`,
`xy`, `punkter` med `z` = topp rør) og kodene med `dim`.

### Rør, etappe 1 – ferdig og flettet inn i `main`

Spec: `docs/superpowers/specs/2026-10-05-ror-etappe1-design.md`.
Plan: `docs/superpowers/plans/2026-10-05-ror-etappe1.md`.

Import av innmålte rør fra LandXML (Xsite Manage), linjene trukket etter
geometri, kart, lengdeprofil, 3D, rørfane, koder, retting, rapport og PDF.
Prøvd på den ekte fila: 90PE blir ett rør på 734 m, 40 FIBER tre på
891 m, alle 24 punktobjektene kommer med, ingen enslige punkt
(`ROR_FIL=<sti> node test/rorprove.js`).

En kodegjennomgang av hele grenen fant én kritisk feil og fem alvorlige, og
alle er rettet med en prøve hver: rør i en gren fikk samme id og samme
profil; kartet sto i tegnemodus etter import i et nytt prosjekt, så neste
klikk ble et vegpunkt; regnesonen fulgte ikke med når sonen ble rettet;
ett punkt utenfor UTM stoppet hele fila; en gammel beregning kunne skrive
over en ny; og feltene i en prosjektfil ble brukt uten kontroll. I samme
runde: «Legg til» av en fil i en annen sone regnes om i stedet for å flytte
hele anlegget, eksportknappene skriver ikke lenger en veg-fil av et
røranlegg, og en retting synes i kartet med en gang.

En andre gjennomgang av rettingene fant ingen kritiske feil, men to hull da
to beregninger gikk over hverandre: framdriftsboksen kunne bli stående over
hele skjermen (gjaldt alle fire terrenghenterne, også veg og tomt – nå én
hjelper, `medHenteboks`), og et sonebytte fram og tilbake kunne gi et tomt
terreng med en nøkkel som sa at alt var lastet. Begge er rettet, sammen med
de mindre funnene. Ikke gjort: id-en bruker `~` mellom endene, og to
punktnavn som selv inneholder `~` kunne i teorien gi samme id. Neste:

- **Etappe 2 – grøftemasser.** Ferdig – se over.
- **Etappe 3 – planlegge nye rør.** 3a (tegne, høydene, kummer, kontrollene,
  grøfta), 3b (eksport) og 3c (planlagt mot innmålt) er ferdige – se over.

`GJENNOMGANG.md` er lista. 18 uavhengige granskere gikk gjennom hver sin del av
programmet, og hvert funn ble forsøkt motbevist av to andre — én som skulle
vise at det var feil, én som skulle avgjøre om det kan skje i praksis. **70 funn
overlevde begge: 12 kritiske, 31 alvorlige, 23 moderate, 4 små.** 16 ble felt.

### Rettet så langt

Hver retting har en prøve som ville vært rød før, og hver ligger i sin egen
commit med målingen som bekreftet den.

- **Et hull i terrengmodellen ble lest som havflaten.** Høydetjenesten svarer
  0,00 m for hver eneste piksel utenfor dekningen. En veg på kote 260 ville
  fått 260 m skjæring uten en eneste merknad. *(kritisk)*
- **`isFinite(null)` er sant** — en tom fjelldybde gjorde hele skjæringen til
  fjell: 2 991 m³ sprengning i stedet for 1. Samme hull traff hele
  klem-vakten. *(tre kritiske, ett alvorlig)*
- **Et hull i terrenget la hele veien på kote null** — NaN spredte seg fra
  glattingen gjennom `rettProfil` til hvert eneste knekkpunkt. *(kritisk)*
- **LandXML kastet vertikalkurvene** — 1,0 m avvik i høybrekket mot det
  maskinstyringen får. SOSI manglet `VERT-DATUM`. *(kritisk + alvorlig)*
- **Lagring skrev over andre prosjekter uten å spørre**, reservelageret ble
  skrevet til men aldri lest fra, og demoprosjektet kunne overskrive ditt
  eget. *(kritisk + tre alvorlige)*
- **«Angre» på sidelengs flytting slettet arbeid du gjorde etterpå.**
  *(kritisk)*
- **Sju funn i grensesnittet** — tverrfallsfeltet kunne ikke settes, «Skjæring
  her» målte fra feil flate, hull ga oppdiktede tall, K skrev over låste
  høyder, innsatt punkt kollapset kurver, dobbeltklikk la inn et punkt for
  mye, veiklassen hang på rekkefølgen. *(alvorlige)*
- **Fjelldybden måles nå der man står**, ikke bare i senterlinja. Ikke et funn,
  men det kom fram under etterprøvingen, og det angår den største usikkerheten
  i hele regnestykket.
- **Eksporten hadde ingen prøver i det hele tatt.** Tjue nye.
- **Veglinja falt ut av PDF-avlesningen** fordi den hadde færre enn femten
  punkt, og Bézier-kurver ble lest som rette korder. *(to kritiske)*

Ett meldt funn holdt ikke: skjæringsskråningen marsjerer *ikke* forbi
fjelloverflaten. Prøvd tre ganger; 1120 av 1120 steg bruker riktig helning.

**Alle femten kritiske funn er nå gjennomgått**, og de fleste alvorlige.

De fire funnene som aldri fikk dom fordi motprøveren stanset på bruksgrensen,
er etterprøvd for hånd. To var alt rettet; de to andre — sonedekningen og
fliser i endene av linja — er rettet nå.

### Igjen på lista

Restfunnene i `GJENNOMGANG.md` er tatt i veg-delen over, unntatt det som står
under «Ikke gjort, eller bør sjekkes» der. Sonevalget (`public/js/geo.js:60`)
er fortsatt synlig i stedet for stille, siden manglende dekning blir oppdaget.

## Kjør gjennomgangen på nytt

Granskningen kjørte som en arbeidsflyt med 228 agenter. Skriptet ligger i
`.claude/projects/.../workflows/scripts/massekalk-gjennomgang-wf_55bff05e-ae3.js`
og kan kjøres igjen — ferdige agenter svarer fra mellomlageret, så bare det som
er endret koster noe:

```
Workflow({scriptPath: "<stien over>", resumeFromRunId: "wf_55bff05e-ae3"})
```

Journalen med alle svarene ligger ved siden av, i `journal.jsonl`.

## Det som ble gjort i denne runden

Kort, så konteksten ikke går tapt:

- Vertikalgeometrien kontrolleres nå også når høydene er lagt inn for hånd, og
  «Rett opp» løser alle bruddene den kan løse — 81 → 0 på en prøve med
  strammede grenser.
- PDF-avlesningen hadde aldri virket på en ekte PDF. Strømlengden ble målt til
  `endstream` i stedet for å tas fra `/Length`. Ydestad-planen gir nå 11
  strømmer og 5556 kurver mot 0 før.
- Ny PDF-eksport, skrevet fra grunnen uten bibliotek. Kontrollert med Poppler.
- Knekkpunkt kan settes inn midt på linja (klikk på linja i Rediger), og
  «Angre» angrer virkelig — hele prosjektet, seksti steg bakover.
- Autolagring to sekunder etter siste endring.
- Avlesning i tverrsnittet: helning på tvers og langs under musepekeren.
- Rettet at tegning kunne legge et punkt midt i rekken, som fikk linja til å gå
  i sikksakk. Det var en feil jeg selv innførte dagen før.

## Det som fortsatt ikke er avklart

- **Eksportfilene er aldri prøvd i et mottakersystem.** KOF, LandXML, SOSI og
  DXF er skrevet etter spesifikasjonen og strukturen er kontrollert, men ingen
  har importert en av dem i en maskinstyring eller hos kommunen.
- **Dybden til fjell er den største usikkerheten i tallene.** En halvmeter feil
  flytter sprengningen 109 % på demoen — mer enn hele volumet. Det er ikke
  programmet som er upresist; det er at ingen vet hvor fjellet ligger uten
  sondering.
- **Ingen har brukt programmet på en ekte jobb ennå.**
