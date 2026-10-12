# 3D på skjermkortet, etappe 2: lys og luft

Dato: 2026-10-12 · Bygger på etappe 1 (`2026-10-12-gpu-3d-etappe1-design.md`)

Brukerens ønsker:

- «Himmel og dis»
- «Slagskygger fra sola»
- Fra etappe 1-dialogen: grafikk «som et spill» som «ser dritekte ut».
- «1 og fortsett med 2»: etappe 1 flettet inn, og så videre hit.

Bare skjermkortet får dette. Prosessorveien er reserven og står uendret.

## 1. Himmel (Fly og Gå)

I dag er himmelen én flat tone over horisontlinja (`horisont` i `tegn()`).
Den byttes ut med en himmel som tegnes per piksel av blikkretningen:

- **Farger:** lys dis nede ved horisonten, dyp blå oppe i senit, og en myk
  solglød der blikket peker mot sola.
- **Uavhengig av temaet:** himmelen er en dagshimmel i både lyst og mørkt
  tema. Den fjerne bakken under horisonten bruker samme dis-farge som
  terrenget tones mot (se 2).
- **Tegnes bare når man står i modellen** (`kam.oye`). Ovenfra beholder
  bakgrunnen: der er det ingen horisont, og modellen og rapportbildene skal
  se ut som før.

Himmelen er en fullskjermstrekant som tegnes først i bildet, uten dybde. Retningen
per piksel regnes av den samme rotasjonen som kameraet (yaw, blikkets pitch,
brennvidde).

## 2. Dis (Fly og Gå)

Flatene tones mot himmelens horisontfarge med avstanden, som luftperspektiv:
`f = 1 − exp(−(w / L)^1,3)`.

- **L, avstanden der disen tar:** ca. 2,5 km når man går. Den vokser med
  øyehøyden når man flyr: `L = 2500 + 6·kamH` meter, så det man ser ovenfra
  ikke drukner.
- **Ovenfra:** ingen dis.
- **Bare bildet:** id- og dybdepassene er uendret.

## 3. Slagskygger (alle visninger)

Sola står der lyset alltid har stått: retning (−0,4, 0,4, 0,82), fra nordvest
og 55° opp. Det er kartografiens hellingsskygge, og det er derfor fyllinger og
skjæringer leses riktig vei. Skyggene faller bort fra den.

- **Skyggekart:** et dybdebilde av scenen sett fra sola, ortografisk og rammet
  inn rundt alle meshene i bildet. Det er 2048² eller 4096² etter scenens
  størrelse, og maks ca. 0,5 m per teksel.
- **Bygges bare når scenen endrer seg:** sola står fast i verden, så kartet
  avhenger ikke av kameraet. Å dra, fly eller gå koster ingenting ekstra.
- **Kastere:** bare ugjennomsiktige flater. Halvgjennomsiktig terreng over
  gravflaten er et røntgenbilde, ikke en flate som skal kaste skygge.
- **Mottakere:** alle flater i bildet. Kanten mykes med maskinvarens PCF
  (`sampler2DShadow`) over 3×3 tekster.
- **Hvor mørkt:** i skygge fjernes bare det direkte sollyset. Lyset blir
  `0,55` i stedet for `0,55 + 0,45·(n·l)`, altså aldri mørkere enn en
  skråning som vender bort fra sola. Rødt og grønt leses like godt i skygge.
  Ingen ny bunn.

## 4. Omgivelseslys (Fly og Gå)

Skyggene og baksidene får et svakt blått stikk fra himmelen (6 % mot
himmelfargen). Da ser skygge ut som skygge og ikke som skitt. Fargen på selve
massen endres ikke merkbart.

## 5. Ytelse og prøver

**Ytelse:**

- Himmelen er én trekant, og disen er noen få linjer i shaderen.
- Skyggekartet bygges på nytt bare når meshene i bildet endrer seg.
- Bildetiden i `gpuGlatt` skal fortsatt være ≤ 16 ms ved dragning og gange.

**Prøver** (ny `gpuLysOgLuft` i `nettlesertest.js`):

- **Skygge:** et syntetisk gitter med en høy søyle midt på en flate. Bakken
  på solsiden av søylen er lysere enn bakken bak den, i skyggen. Kontroll:
  uten skygger er de like.
- **Ikke for mørkt:** skyggen er aldri mørkere enn 0,55 av fargen.
- **Himmel:** i Gå er en piksel øverst i bildet blå (b > r + 20), og
  horisonten er lysere enn senit.
- **Dis:** fjernt terreng ligger nærmere himmelfargen enn nært terreng.
- **Ovenfra uendret:** ingen himmel og ingen dis. Bakgrunnspikselen er
  temaets bakgrunn som før.
- **Uendret fra etappe 1:** `gpuSammeBilde`, `gpuGlatt` og `gpuReserve`
  holder seg grønne.

**Ferdig når** hele nettleserprøven er grønn på begge tegnerne, node-prøvene
er grønne, og brukeren har fått skjermbilder av Ovenfra, Fly og Gå.
