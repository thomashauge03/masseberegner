# Stikkrenner

Dato: 2026-10-07 · Gren: `stikkrenner`

Den siste delen av «gjør alt ferdig». Fra «Videre arbeid» i README: «Veiplanene
har stikkrenner med plassering, dimensjon og lengde. Disse kan legges inn som
punkt langs linjen med automatisk lengde ut fra fyllingshøyden.»
Brukeren har gitt fullmakt til å ta valgene.

**Høydene.** En stikkrenne er prosjektert, ikke innmålt. Lengden og høydene
regnes av vegen og terrenget, og følger vegen når den endres, som skråningene
gjør. Låser brukeren bunnen i innløpet eller utløpet, står den, og den endres
aldri av seg selv.

## 1. Dataene

Per veganlegg, i `a.stikkrenner` – som snuplassene i `a.plasser`, og et vindu
i `Prosjektform.FELT`:

```
{ id, navn, s, dim, vinkel, innlop, fall, bunnInn?, bunnUt? }
```

- `s`: profilet der renna krysser senterlinja (m);
- `dim`: innvendig diameter (mm);
- `vinkel`: skjevhet mot normalen på vegen (grader, −60 til 60). 0 er rett på
  tvers, og positiv vinkel dreier høyre ende framover i stasjoneringen;
- `innlop`: siden vannet kommer fra – `'auto'`, `'venstre'` eller `'hoyre'`.
  Auto er siden der enden ligger høyest;
- `fall`: minste fall (‰);
- `bunnInn`, `bunnUt`: bunn innvendig låst av brukeren (moh), valgfritt.

**Malen** (veg) får forvalgene for en ny renne og kravene:
- `stikkrenneDim`: 600 mm;
- `stikkrenneFall`: 10 ‰;
- `stikkrenneOverdekning`: 0,5 m fra vegoverflaten til topp rør;
- `stikkrenneTillegg`: 0,5 m forbi fyllingsfoten.

Alle står i `MALGRENSER` og klemmes der de leses. `moderniserMal` gir gamle
filer forvalgene.

## 2. Regnestykket

Ny ren modul `public/js/stikkrenner.js` (`Stikkrenner`):
`beregn(renne, profil, mal, { stigning, lengde, terreng }) → svar`. `profil`
er tverrsnittet i stasjonen til renna, med sidene (`sider`), fra
`res.snittVed(s)`: det regnes av de samme dataene som profilene i massene,
men står **utenfor volumsummen**. En renne flytter ikke massene. (Første
utkast la stasjonen i `ekstraStasjoner`; ved en kolle mellom to profiler ga
det 10 % mer fylling bare av at en renne ble satt ut.) Utenfor linja svarer
`snittVed` med `null`, og renna får en feil – også om et profil er gitt.

**Endene**, per side:
- **I fylling** er enden fyllingsfoten pluss `stikkrenneTillegg`. Overflaten
  er terrenget lest der enden faktisk ligger (`terreng(x, y)`), minus
  renskedybden når tillegget ligger innenfor rensken (`renskUtenfor`).
- **I skjæring** er enden midt i grøftebunnen, og overflaten er
  grøftebunnen. Der renner vannet inn. Er renna skjev, ligger enden
  `t · tan(vinkel)` fram eller tilbake langs vegen, og grøfta følger vegens
  stigning dit.

**Lengden** er avstanden mellom endene langs renna:
`(tV + tH) / cos(vinkel)`.

**Høydene** (bunn innvendig):
- Innløpet er overflaten i innløpsenden – eller `bunnInn` når den er låst.
- Utløpet følger terrenget når det faller minst `fall` – ellers gir det minste
  fallet høyden: `min(overflaten i utløpet, innløpet − fall · L)`. Er
  `bunnUt` låst, står den.

**Overdekningen** prøves under vegen, fra kant til kant, hver 0,25 m:
vegoverflaten minus topp rør. Topp rør er bunn + innvendig diameter + én
vegg; ytre diameter er 1,15 × innvendig (korrugert plastrør), så veggen er
0,075 × innvendig. En skjev renne krysser vegen på skrå, og vegens stigning
er med i flaten over den.

Er den minste dekningen under kravet og ingen høyde er låst:
1. **Innløpet senkes først**, og renna dreies om utløpet – utløpet ligger på
   bakken, og der skal det bli. Innløpet kan senkes til fallet er nede i
   minstefallet.
2. **Mangler det fortsatt**, senkes hele renna med resten. Utløpet havner da
   under bakken, men ikke dypere enn det må.

Merknaden sier hvor mye, og hvor innløpet da ligger. Er en høyde låst, er det
bare merknaden: overdekningen, med hvor mye og hvor.

**Merknadene** for en renne:
- for lite overdekning, med hvor mye og hvor (låst høyde);
- renna er senket for overdekningen, og innløpet for seg;
- utløpet ligger under bakken: det trengs en grøft ut;
- utløpet henger over bakken: det må sikres mot utgraving;
- innløpet ligger over bakken: vannet når ikke inn;
- for lite fall mellom låste høyder;
- fyllingen når ikke terrenget innenfor søkebredden, eller terrenget har hull
  i profilet;
- profilet er utenfor linja, eller terrenget mangler der renna går ut (da er
  det ingen høyder – ikke tall som ser riktige ut).

**Svaret** har endene (plan og høyde), innløpssiden, lengden, bunn i innløp
og utløp, det faktiske fallet, den minste overdekningen og hvor, hvor mye
renna og innløpet er senket, veggen, og merknadene.

## 3. Beregningen

Etter `beregnMasser` regner `App` hver renne i vegen som regnes, med
`res.snittVed(s)`, vegens stigning i stasjonen og prosjektterrenget:
`res.stikkrenner` = svaret for hver renne. Merknadene går i vegens
merknadsliste med typen `stikkrenne`.

**Nummeret** `nr` kommer fra id-en (`sr<n>`): `SR<nr>` er navnet punktene
har i KOF-en, og det står i lista, rapporten og kartet. Det er fast – sletter
man en renne, får ikke de andre nye nummer.

Snittet henger på svaret (ikke-tellbart, så det lagres ikke), og
tverrsnittet viser det når det står i stasjonen til en renne.

## 4. Skjermen

- **⊖ Stikkrenne** i kartet (bare veg): et klikk ved linja setter en renne i
  stasjonen nærmest klikket, med forvalgene fra malen. Ett angresteg. Lista
  finnes fra start, også i en veg lagt til med «+ Veg».
- **Kartet:** renna tegnes som en strek fra ende til ende, med en ring i
  innløpet. Et merke i krysset har navn og SR-nummer, mål, «Vis snittet» og
  «Slett». Merkene kommer fra lista, strekene fra resultatet – og bare for
  vegen som står oppe.
- **Lista** «Stikkrenner» i Vegmal-fanen, som snuplassene: navn, profil,
  Ø, vinkel, innløp, fall og låste høyder. Regnet ut står SR-nummeret,
  lengden, bunn i innløp og utløp, overdekningen og ⚠ for en merknad.
  «snitt» viser tverrsnittet. Hver endring er ett angresteg. Låses en høyde
  med «innløp auto», låses siden med i det samme steget – ellers kunne siden
  snu seg når vegen endret seg, og høyden flyttet seg til den andre enden.
  Etter en beregning skrives bare svaret inn; feltet man står i, beholder
  markøren.
- **Tverrsnittet** i stasjonen til en renne er rennas eget snitt, og renna
  tegnes på tvers: fylt, med mørk kant, fra bunn minus veggen til topp rør.
- **Lengdeprofilet** har et merke for hver renne, i høyden der den krysser
  senterlinja.

## 5. Rapport og eksport

- **Rapporten og PDF-en** får tabellen «Stikkrenner»: navn med SR-nummer,
  profil, Ø, vinkel, lengde, bunn innløp, bunn utløp, fall, overdekning og
  merknad.
- **KOF:** to punkt per renne, bunn innvendig i innløpet og utløpet, med
  kodene `STIKKINN` og `STIKKUT` og navnene `SR<nr>I` og `SR<nr>U`. En renne
  uten høyder (feil) gir ingen punkt.
- **DXF:** laget `STIKKRENNE` med en 3D-linje fra innløp til utløp.
- Navnene på vegens egne KOF-punkt får to eller tre desimaler i stasjonen når
  to profiler ellers ville fått samme navn.

## Utenfor

- Massene for selve renna (fundament og omfylling) telles ikke. Renna ligger
  i fyllingen eller i grøfta, og volumet er lite mot vegens.
- Innløps- og utløpskonstruksjoner, og erosjonssikring.
- Renna i 3D.

## Prøver

- **test/stikkrenneprove.js** (ny, 58 prøver), mot fasit regnet for hånd på
  en rett veg med `beregnMasser`:
  - ren fylling på flatt terreng: fot til fot pluss tillegget, med høydene
    fra det renskede terrenget og minste fall;
  - massene er de samme med og uten en renne, også ved en kolle mellom to
    profiler;
  - skjev renne: lengden er 1/cos lengre, endene dreid riktig vei, og i en
    stigning ligger grøfta i endene høyere og lavere;
  - sidebratt terreng: innløpet midt i grøftebunnen på skjæringssiden og
    utløpet ved fyllingsfoten pluss tillegget, med bakken der enden ligger;
    auto velger siden; innløpet senkes og renna dreies om utløpet;
  - overdekning uten fall å gi: hele renna senkes; med litt fall: innløpet
    ned til minstefallet, så hele renna med resten;
  - låste høyder står, og fallet og overdekningen mellom dem prøves;
  - utløpet under og over bakken;
  - profilet utenfor linja, terrenget som mangler, fyllingen som ikke når
    bakken og hull under vegen.
- **Selvtesten:** massene uten renner er uendret.
- **Nettleseren:** verktøyet setter en renne, også i en veg lagt til med
  «+ Veg»; massene er de samme; lista endrer den med angre, og en låst høyde
  låser siden; merknaden kommer; rapporten, KOF-en og DXF-en har den; og
  tverrsnittet i stasjonen er rennas eget.
