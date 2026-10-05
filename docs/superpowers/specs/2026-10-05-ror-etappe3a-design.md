# Rør, etappe 3a – planlegge nye rør: tegne, høydeføre og regne grøfta

Dato: 2026-10-05 · Gren: `ror-etappe3a`

Etappe 1 henter inn innmålte rør, etappe 2 regner grøfta de ligger i. Etappe 3 er rør som
ikke er gravd ennå, og er delt i tre, hver med egen spesifikasjon, plan og fletting:

1. **3a – tegne, høydeføre og regne grøfta** (denne fila): datamodellen for planlagte rør,
   tegning i kartet, høyder med overdekning, fall og kummer, kontrollene og massene.
2. **3b – eksport til maskinstyring og stikning** av det som er tegnet i 3a.
3. **3c – planlagt mot innmålt:** avvik i plan og høyde når røret er gravd.

3b og 3c bygger på datamodellen i 3a, ikke på hverandre.

---

## 1. Avklart med brukeren

| Spørsmål | Svar |
|---|---|
| Hva skal planlagte rør brukes til? | Kalkyle før jobben, høydeføring med fall, maskinstyring/stikning og sammenligning med innmålt – delt i 3a, 3b og 3c |
| Hvor ligger de? | **Eget anlegg** – «⌀ Planlagte rør (tegn)» i anleggslista, ved siden av «fra fil». Hvert anlegg har én grøft og én rad i rapporten; innmålte rør i andre anlegg vises dempet i bakgrunnen |
| Hvordan settes høydene? | **Overdekning + låste høyder.** Røret legges med valgt overdekning; høyden kan låses i et punkt (kum, påkobling, kryssing), og mellom låste punkt går selvfall med fast fall |
| Hvilken høyde skrives inn? | **Bunn innvendig** (bunnløp), slik VA-tegninger og lengdeprofiler oppgir den. Godstykkelsen har standard per materiale og kan rettes per kode |
| Kummer? | **Med egen grop:** et punkt på røret med diameter og bunnløp, rund grop med arbeidsrom og skråning i massene, og en kumliste med dybder |
| Kan et nytt rør festes til det som finnes? | **Ja, til innmålt og planlagt.** Høyden i en påkobling til et innmålt rør hentes og låses; en trase kan greine av en annen og følger høyden der |
| Kontroller | **Alle fire:** minste overdekning, fall og motfall, kryssing med andre rør, fjell i traseen |
| Rør i samme grøft | **Én trase, flere rør:** traseen tegnes én gang, rørene legges på den med sideavstand og hver sin høyderegel. Rør kan også tegnes alene |
| Løsning | **A – røranlegg med en plandel** (se 2) |

## 2. Løsninger som ble vurdert

- **A – røranlegg med en plandel (valgt).** Det tegnede anlegget er `type: 'ror'` med
  `ror.plan`. En ny ren modul gjør planen om til de samme linjene som importen gir. Profil,
  3D, grøftemotor og rapport tar linjene som før; det nye er tegning, høyder, kummer og
  kontroller.
- **B – ny anleggstype `rorplan`.** Renere skille, men hele integrasjonen gjennom app, kart,
  profil, 3D og rapport måtte gjøres én gang til – den største jobben i etappe 1.
- **C – tegningen som innmålte punkter.** Minst kode, men linjetrekkingen (minste
  spenntre) kan koble parallelle rør feil, og kummer, låste høyder og høyderegler passer
  ikke i punktmodellen.

---

## 3. Datamodell

```js
{
  id, type: 'ror', navn,
  mal: { …StandardRormal, groft: { … },                     // grøftemalen fra etappe 2
         plan: { overdekning: 2.0, kryssKlaring: 0.3,
                 kum: { diameter: 1000, arbeidsrom: 0.5 } } },
  ror: {
    sone,                     // regnesonen da den første traseen ble tegnet
    kilder: [], punkter: [],  // tomme – de hører til innmålte rør
    koder: { 'SP 160PE': { …som før, gods?, regel?, overdekning?, minFall?, maksFall? } },
    retting: { av: [], brudd: [], koble: [] },
    groft: { strekninger: [], sammen: [] },
    plan: {
      traseer: [{ id: 't1', punkter: [{ id: 'p1', lat, lon }, …] }],
      ror:     [{ id: 'r1', trase: 't1', kode: 'SP 160PE', side: 0.4, regel: 'selvfall'|'trykk'|null,
                  motsatt: false }],
      kummer:  [{ id: 'k1', ror: 'r1', punkt: 'p3', diameter: 1000 }],
      laast:   [{ ror: 'r1', punkt: 'p3', bunn: 47.85, kilde?: { anlegg, punkt, topp } }],
      greiner: [{ trase: 't2', ende: 'start'|'slutt', til: { trase: 't1', punkt: 'p4' } }]
    }
  }
}
```

- **Grader, ikke UTM.** Traseene lagres i lat/lon, som vegens knekkpunkt og tomtas hjørner –
  de er tegnet i kartet, ikke målt i en sone. `ror.sone` settes til regnesonen ved første
  trase, og `App._settRorsone` bruker første tracepunkt når anlegget ikke har innmålte
  punkt (her ville `r.punkter[0]` vært `undefined`).
- **Id-ene** er korte og unike i anlegget (`t`, `p`, `r`, `k` + løpenummer) og endres aldri;
  justeringene, kummene og de låste høydene peker på dem.
- **`side`** er sideavstanden fra traseen i meter, positiv til høyre i tegneretningen.
- **`regel` null** betyr regelen til koden, og kodens `regel` null betyr standarden for
  systemet (4.4).
- **`motsatt`** snur fallretningen for røret i forhold til tegneretningen.
- **`laast.kilde`** er satt når høyden ble hentet fra et annet rør (4.6).
- **Kodefeltene** er valgfrie; tomt felt betyr anleggets verdi eller standarden.
  `gods` i mm, `overdekning` i m, `minFall` og `maksFall` i ‰.

## 4. Høydene

### 4.1 Bunn innvendig og topp

Alt nedstrøms – profil, grøft, 3D, kontroller – regner med **topp rør**, som de innmålte
punktene. Det som skrives inn og vises ved kummer og låste punkt, er **bunn innvendig**:

    topp = bunn − gods + D        (D = utvendig diameter fra koden)
    gods = kodens gods, ellers D/11 for PE (SDR 11) og D/34 for alle andre (SN8)

Godset rundes til 0,1 mm. Et rør uten dimensjon kan tegnes, men får verken høyder eller
grøft før dimensjonen er satt – som i etappe 2.

### 4.2 Rørets geometri

Hvert rør er traseen forskjøvet `side` meter sidelengs. I et knekkpunkt ligger det
forskjøvne punktet på halveringslinja, `side / cos(θ/2)` ut, der θ er knekkvinkelen; i
knekker skarpere enn 120° kappes det ved `2 · side`. Stasjoneringen (`s`) er langs rørets
egen linje.

### 4.3 Kontrollpunkt

Kontrollpunktene er rørets to ender, kummene på røret og punktene med låst høyde.

- **Låst:** høyden er den låste.
- **Fritt:** toppen ligger med rørets overdekning under terrenget:
  `topp = T − overdekning`, der overdekningen er kodens, ellers anleggets (2,0 m).

### 4.4 Selvfall og trykk

Standarden for regelen kommer av systemet i koden: **selvfall** for spillvann, overvann,
drens og felles; **trykk** for vann, kabel og ukjent system.

- **Selvfall:** rett linje – fast fall – mellom kontrollpunktene. Knekkpunkt som ikke er
  kontrollpunkt, ligger på linja. Fallet regnes i fallretningen (tegneretningen, eller
  motsatt):

      fall (‰) = 1000 · (bunn oppstrøms − bunn nedstrøms) / lengden mellom dem

- **Trykk:** røret følger terrenget meter for meter. Overdekningen går lineært langs røret
  fra kontrollpunkt til kontrollpunkt – den frie er målet, den låste er det den låste
  høyden gir – så røret møter en påkobling uten sprang:

      topp(s) = T(s) − c(s),  c lineær mellom kontrollpunktene

  Mangler terrenget et stykke, går toppen rett over hullet.

Endres terrenget eller overdekningen, flytter de frie høydene seg; de låste står.

### 4.5 Linjene ut

`RorPlan.bygg(plan, koder, mal, tilXY, terrengZ)` gir det samme som `Ror.byggLinjer`:

```js
{ linjer: [{ id: 'r1', kode, xy: [{x, y}], punkter: [{ id, z, mellom? }], lengde }],
  objekter: [], enslige: [],
  kummer: [{ id, ror, x, y, bunnlop, terreng, diameter }],
  kontroll: [{ ror, s, punkt, bunn, laast, kum, fra? }],   // per rør, til profilen
  utenHoyde: [{ id, kode, xy, punkter, grunn }],           // tegnes i kartet, ellers ikke med
  moter: [{ x, y, r }] }                                   // greininger og påkoblinger
```

- Punktene har `z` = topp rør, i regnesonen.
- Rør uten høyder er ikke med i linjene – ingen profil, ingen grøft – men tegnes i
  kartet fra `utenHoyde`. `grunn` er `'dimensjon'` (koden mangler dimensjon; merknaden
  sier hvilke koder) eller `'terreng'` – før terrenget er hentet, har ingen rør høyder,
  men de skal tegnes.
- `moter` er greiningene og påkoblingene, der rørene skal møtes; kryssingskontrollen
  hopper over dem (7).
- Selvfall har ett punkt per knekkpunkt; trykk i tillegg ett per meter mellom dem, merket
  `mellom: true`.
- Punkt-id-ene er `rør:punkt` i knekkpunktene og `rør:punkt+meter` i mellompunktene.
  Verktøyene fra etappe 2 («Grøft på strekning», «Felles grøft») bruker bare knekkpunktene,
  så justeringene står seg når terrenget endrer mellompunktene.
- `App.byggRor()` velger `RorPlan.bygg` når anlegget har en plan, ellers `Ror.byggLinjer`.

### 4.6 Påkobling og greining

- **Mot et innmålt rør** (et annet anlegg): begynner eller slutter en trase innen 1 m fra
  et punkt på en innmålt linje, festes den der. Høyden i påkoblingen hentes fra punktet –
  topp rør, gjort om til bunn innvendig med dimensjonen og godset til det innmålte røret –
  og lagres som en låst høyde med `kilde`. Endres kilden senere (ny import), sier
  merknadene fra; «Hent på nytt» i punktfeltet oppdaterer.
- **Mot en annen planlagt trase:** endepunktet festes til punktet på den andre traseen
  (`greiner`), og det følger punktet når det flyttes. Rør med samme kode på begge
  traseene kobles i høyden: greinas ende er et kontrollpunkt med høyden til det andre
  røret i punktet (`fra` i `kontroll`), regnet hver gang – så greina følger med når
  hovedrøret endres. En låst høyde i enden går foran. Rør uten samme kode på den andre
  traseen kobles ikke i høyden; enden er et vanlig kontrollpunkt.
- **Rekkefølgen:** et rør regnes før greinene som er festet til det. Går festene i
  sirkel, slippes det siste, og merknadene sier fra.

## 5. Komponenter

| Fil | Ansvar | Avhenger av |
|---|---|---|
| `public/js/rorplan.js` (ny) – `RorPlan` | Ren logikk: forskyvning, kontrollpunkt, høyderegler, linjene ut, kummene, bunn ↔ topp, kontrollene (overdekning, fall, kryssing) | `Ror` (koder) – alt annet som argumenter |
| `public/js/ui-rorplan.js` (ny) – `RorPlanUI` | Verktøyene i kartet, dialogene (rør i traseen, kum, punktfeltet), Rør-fanen for planlagte rør, redigeringen i profilen | `RorPlan`, `App`, `Kart`, `Rorprofil` |
| `groft.js` | Kummene: rund grop, fundament, kummens volum | – |
| `app.js` | Nytt anlegg, `byggRor`, `_settRorsone`, `beregnRor` (kontrollene, kummene inn i grøfta), knappene | `RorPlan` |
| `ui-kart.js` | Modusene, klikk og dra, tegning av traseer, kummer, låste punkt og varsler | `RorPlanUI` |
| `ui-rorprofil.js` | Kontrollpunkt, bunnløp og fall i profilen, varsler, klikk og dra | `RorPlanUI` |
| `ui-ror.js` | Rør-fanen viser plandelen for planlagte anlegg | `RorPlanUI` |
| `ui-rapport.js`, `ui-pdfrapport.js` | Rørtabellen med regel, fall og overdekning, kumlista, kontrollene | `RorPlan` |
| `prosjektform.js` | `_rettPlan`: rydder `ror.plan` og plan-feltene i koder og mal | `RorPlan` |
| `ui-forklaring.js`, `index.html`, `app.css` | Ordene, knappene, fargene | – |
| `test/rorplanprove.js` (ny) | Høydene, geometrien, påkoblingen og kontrollene mot fasit | `RorPlan` |

## 6. Brukerflate

- **Nytt anlegg:** «⌀ Planlagte rør (tegn)» i anleggslista og «✎ Rør (tegn)» i
  førstevalget. Anlegget får navnet «Planlagte rør» og står i tegnemodus for «Ny trase».
- **Verktøyene** over kartet når et planlagt anlegg er aktivt:
  - **Ny trase:** klikk punktene; dobbeltklikk eller Enter avslutter, Esc avbryter, og
    tilbaketasten tar bort siste punkt. Så kommer dialogen *Rør i traseen*: ett eller
    flere rør med kode (de som finnes i prosjektet, eller en ny), sideavstand og regel
    (foreslått av koden). Ett rør midt i traseen er standard.
  - **Kum:** klikk et punkt på traseen; har traseen flere rør, velges røret (selvfall
    foreslås først). Kummen får diameteren fra anlegget og er et kontrollpunkt: bunnløpet
    følger overdekningen til det låses.
  - **Snu fallretning:** klikk en trase – alle rørene på den snus.
- **Redigering** i vanlig modus: dra et tracepunkt for å flytte det, klikk på en
  tracestrek for å sette inn et punkt, velg et punkt og trykk Delete for å ta det bort
  (ikke under to punkt). Kummer og låste høyder på et punkt som tas bort, tas bort med
  det – meldt i statuslinja.
- **I kartet:** traseen som tynn midtlinje, rørene med sin sideavstand i kodens farge,
  kummer som sirkler i riktig størrelse, låste høyder og påkoblinger med egne merker, og
  røde merker der kontrollene varsler. Innmålte rør i andre anlegg dempet i bakgrunnen.
- **Rør-fanen** for planlagte anlegg: traseene med rørene (kode, lengde, regel,
  sideavstand, fall fra–til, overdekning fra–til, *Endre*, *Snu*, *Slett*), kumlista
  (kum, rør, diameter, terreng, bunnløp, dybde), anleggets overdekning og kryssklaring,
  kumstandarden, kontrollene, og grøftedelen fra etappe 2.
- **Koder-fanen** som før, med feltene gods, regel, overdekning, minste og største fall.
- **Profilen**, som alt viser grøfta fra etappe 2, får kontrollpunktene som merker,
  bunnløpet ved hvert og fallet mellom dem, en stiplet linje der overdekningen er lik
  grensen, og røde felt der kontrollene varsler.
  - **Klikk** et kontrollpunkt: punktfeltet med *bunn innvendig*, *Lås / Lås opp*, for
    selvfall *fall ‰ videre* (regner ut og låser neste kontrollpunkt), og *Hent på nytt*
    for en påkobling.
  - **Klikk på røret mellom kontrollpunkt:** et punkt settes inn i traseen der (på
    linja, så geometrien er den samme), og punktfeltet åpnes for det.
  - **Dra** et kontrollpunkt opp eller ned: det låses der, på hel centimeter.
  - **Avlesningen** under musa: profil, terreng, bunn innvendig, topp, overdekning, fall og
    gravedybde.
- Alt går gjennom `App.merk()`, så angre og gjør om virker.

## 7. Kontrollene

| Kontroll | Varsler når | Grense |
|---|---|---|
| Overdekning | `T − topp` er under grensen (1 cm å gå på), slått sammen til strekk | Rørets overdekning – det samme tallet de frie punktene legges på |
| Fall | Selvfall: motfall, fall under `minFall`, eller over `maksFall` når den er satt – med toleransen max(0,05 ‰, 1 mm / L), siden høydene låses på hel millimeter | Standard `minFall`: spillvann og felles 10 ‰, overvann og drens 5 ‰. Trykk sjekkes ikke |
| Kryssing | Et planlagt rør krysser et annet – innmålt i et annet anlegg, eller planlagt – med klaring under grensen, eller treffer det | `kryssKlaring`, 0,3 m; klaringen er avstanden mellom utsidene i krysset |
| Fjell | Grøfta går i fjell (fra etappe 2: strekninger og sonderinger) | Ingen – en opplysning: rør, lengde i fjell og sprengning |

- **Kryssing** finnes i plan: hvert segment av et planlagt rør mot hvert segment av de
  andre. I krysset regnes topp og bunn (utvendig) for begge; klaringen er
  `max(bunn₁ − topp₂, bunn₂ − topp₁)`, og under null er treff. Kryss innen 0,5 m pluss
  største sideavstand på traseene som møtes, fra en påkobling eller greining, er ikke
  kryss – der skal rørene møtes, også rørene som ligger ved siden av traseen.
- Varslene står i `res.merknader` med `type` (`overdekning`, `fall`, `motfall`, `kryss`,
  `fjell`), røret og strekket, så profilen og kartet kan merke stedet.

## 8. Kummene i grøfta

`Groft.beregn` får `kummer: [{ id, x, y, bunnlop, diameter, eier }]` (eier = id-en til
linja kummen hører til) og lager en grop per kum:

- **Kummen:** ytre diameter `diameter + 0,2 m`; bunnen av kummen 0,25 m under bunnløpet.
- **Gropa:** flat bunn med radius `ytre/2 + arbeidsrom` (0,5 m), fundamentet under kummen
  (samme tykkelse som for rørene, fra malen), og skråning som grøfta. Gropa er en grop som
  de andre – den slås sammen med grøfta og telles én gang.
- **Lagene:** fundament fra gropbunnen opp til kumbunnen; kummens eget volum (sylinder med
  ytre radius fra kumbunnen til terrenget) trekkes fra – det går foran omfylling og
  gjenfylling der de overlapper; resten er gjenfylling. Kontrollen:
  graving + sprengning = fundament + omfylling + gjenfylling + rørvolum + kumvolum.
- **Kumlista:** kum, rør, diameter, terreng (lokk), bunnløp og dybde (terreng − bunnløp).

## 9. Rapport og PDF

Den samme rørdelen som for innmålte rør, med:
- kilde: «Tegnet i Massekalk» og antall traseer;
- rørtabellen med regel, fall fra–til og overdekning fra–til;
- kumlista;
- lengdeprofilene med kontrollpunkt, bunnløp og fall;
- grøftemassene fra etappe 2, med kummene og kumvolumet;
- kontrollene som merknader.

Prosjektraden viser lengde, graving og sprengning, som for innmålte rør.

## 10. Prosjektfila

`_rettPlan` i `prosjektform.js`, som `_rettGroft` i etappe 2:

- Traseer uten minst to punkt med gyldige grader, og punkt utenfor [−90, 90] / [−180, 180],
  tas bort.
- Rør uten trase eller kode, kummer og låste høyder som ikke treffer et rør og et punkt på
  traseen, og greiner som ikke treffer, tas bort.
- `side` klemmes til [−10, 10] m, `diameter` til [400, 3000] mm, `bunn` må være et tall,
  `regel` er `'selvfall'`, `'trykk'` eller null, `motsatt` er sann eller usann.
- Kodefeltene (`gods` [0,5, 100] mm, `overdekning` [0, 10] m, `minFall` og `maksFall`
  [0, 1000] ‰) og `mal.plan` klemmes eller får standarden.
- Et røranlegg uten plan får ingen.

## 11. Feil og merknader

- Rør uten dimensjon: tegnes, men får ingen høyder eller grøft – merknad med koden, som i
  etappe 2.
- Terreng som mangler under et fritt kontrollpunkt: høyden hentes langs røret fra
  nærmeste punkt med terreng; mangler det hele veien, får røret ingen høyder og en
  merknad.
- En påkobling der kilden er borte eller endret: merknad; den låste høyden står.
- En trase som er festet til et punkt som er tatt bort: festet slippes, punktet blir
  stående der det var, og statuslinja sier fra.

## 12. Prøver

`test/rorplanprove.js` (ny, med i `npm test`):
- bunn innvendig ↔ topp med godset for PE og PVC, og kodens gods;
- forskyvning: rette strekk, knekk på 90° og skarp knekk (kappet);
- selvfall: rett mellom to låste punkt, fritt endepunkt på overdekningen, knekkpunkt som
  ikke er kontrollpunkt ligger på linja, fallet i ‰ og fallretning snudd;
- trykk: følger et kjent terreng meter for meter, lineær overdekning mot en låst
  påkobling, rett over et hull i terrenget;
- påkobling mot et innmålt rør: topp → bunn innvendig;
- kontrollene mot regnede tilfeller: overdekning i en kul, motfall, fall under grensen,
  klaring i et kryss (og treff), og ingen kryss ved en greining;
- linjene ut har samme form som `Ror.byggLinjer` og gir en grøft i `Groft.beregn`.

`test/groftprove.js`: kumgropa på flat mark mot fasit – avkortet kjegle, fundamentet,
kumvolumet – og regnestykket som går opp.

Nettlesertesten: nytt planlagt anlegg, en trase tegnet med klikk, to rør i den, en kum,
en låst høyde i profilen, et varsel om overdekning og ett om kryss, Rør-fanen, rapporten,
PDF-en, angre og lagring/åpning.

## 13. Utenfor 3a

Eksport til maskinstyring og stikning (3b). Planlagt mot innmålt (3c). Import av traseer
fra DXF eller KOF. Automatisk optimalisering av høydene. Kummer i 3D. Fallkrav for
trykkrør. Grøftekasse og spunt, som i etappe 2.
