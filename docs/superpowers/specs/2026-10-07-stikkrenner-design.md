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
`beregn(renne, profil, mal) → svar`. `profil` er tverrsnittet i renna sitt
profil, med sidene (`sider`). Det tverrsnittet regnes som et eget profil:
stasjonen legges i `ekstraStasjoner`, og det hentes med `res.geometriFor(s)`.
Lengden leses da av det samme tverrsnittet som massene.

**Endene**, per side:
- **I fylling** er enden fyllingsfoten (den uklippede, `fotVenstreHel` /
  `fotHoyreHel`), pluss `stikkrenneTillegg`. Overflaten der er terrenget.
- **I skjæring** er enden midt i grøftebunnen, og overflaten er
  grøftebunnen. Der renner vannet inn.

**Lengden** er avstanden mellom endene langs renna:
`(tV + tH) / cos(vinkel)`.

**Høydene** (bunn innvendig):
- Innløpet er overflaten i innløpsenden – eller `bunnInn` når den er låst.
- Utløpet følger terrenget når det faller minst `fall` – ellers gir det minste
  fallet høyden: `min(overflaten i utløpet, innløpet − fall · L)`. Er
  `bunnUt` låst, står den.

**Overdekningen** prøves under vegen, fra kant til kant, hver 0,25 m:
vegoverflaten minus topp rør. Topp rør er bunn + ytre diameter, og ytre
diameter er 1,15 × innvendig (korrugert plastrør). Er den minste dekningen
under kravet og ingen høyde er låst, senkes hele renna med det som mangler, og
merknaden sier at innløpet og utløpet da ligger under bakken. Er en høyde
låst, er det bare merknaden.

**Merknadene** for en renne:
- for lite overdekning, med hvor mye og hvor;
- renna er senket for overdekningen;
- utløpet ligger under bakken: det trengs en grøft ut;
- utløpet henger over bakken: det må sikres mot utgraving;
- innløpet ligger over bakken: vannet når ikke inn;
- for lite fall mellom låste høyder;
- profilet er utenfor linja, eller terrenget mangler.

**Svaret** har endene (plan og høyde), innløpssiden, lengden, bunn i innløp
og utløp, det faktiske fallet, den minste overdekningen, hvor mye renna er
senket, og merknadene.

## 3. Beregningen

`App` legger stasjonene til rennene i `ekstraStasjoner` for vegen som regnes.
Etter `beregnMasser` blir `res.stikkrenner` = svaret for hver renne.
Merknadene går i vegens merknadsliste med typen `stikkrenne`.

## 4. Skjermen

- **⊖ Stikkrenne** i kartet (bare veg): et klikk ved linja setter en renne i
  det nærmeste profilet, med forvalgene fra malen. Ett angresteg.
- **Kartet:** renna tegnes som en strek fra ende til ende, med en pil i
  innløpet. Et merke i krysset har navn, mål og «Slett».
- **Lista** «Stikkrenner» i Vegmal-fanen, som snuplassene: navn, profil,
  Ø, vinkel, innløp, fall og låste høyder. Regnet ut står lengden, bunn i
  innløp og utløp, overdekningen og ⚠ for en merknad. Hver endring er ett
  angresteg.
- **Tverrsnittet** i profilet til en renne tegner renna på tvers: bunn og
  topp, med lengden langs snittet.
- **Lengdeprofilet** har et merke for hver renne, i høyden der den krysser
  senterlinja.

## 5. Rapport og eksport

- **Rapporten og PDF-en** får tabellen «Stikkrenner»: navn, profil, Ø,
  vinkel, lengde, bunn innløp, bunn utløp, fall, overdekning og merknad.
- **KOF:** to punkt per renne, bunn innvendig i innløpet og utløpet, med
  kodene `STIKKINN` og `STIKKUT` og navnene `SR<nr>I` og `SR<nr>U`.
- **DXF:** laget `STIKKRENNE` med en 3D-linje fra innløp til utløp.

## Utenfor

- Massene for selve renna (fundament og omfylling) telles ikke. Renna ligger
  i fyllingen eller i grøfta, og volumet er lite mot vegens.
- Innløps- og utløpskonstruksjoner, og erosjonssikring.
- Renna i 3D.

## Prøver

- **test/stikkrenneprove.js** (ny), mot fasit regnet for hånd på en rett veg
  med `beregnMasser`:
  - ren fylling på flatt terreng: fot til fot pluss tillegget, med høydene
    fra terrenget og minste fall;
  - skjev renne: lengden er 1/cos lengre;
  - sidebratt terreng: innløpet midt i grøftebunnen på skjæringssiden og
    utløpet ved fyllingsfoten; auto velger siden;
  - overdekning: en lav veg senker renna, og merknaden sier det;
  - låste høyder står, og fallet mellom dem prøves;
  - utløpet under og over bakken;
  - profilet utenfor linja, og terrenget som mangler.
- **Selvtesten:** massene uten renner er uendret.
- **Nettleseren:** verktøyet setter en renne, lista endrer den med angre,
  merknaden kommer, og rapporten og KOF-en har den.
