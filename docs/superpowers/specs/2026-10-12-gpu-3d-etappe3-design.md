# 3D på skjermkortet, etappe 3: materialer og trær

Dato: 2026-10-12 · Bygger på etappe 1 og 2 (`2026-10-12-gpu-3d-etappe1/2-design.md`)

Brukerens ønsker og valg fra dialogen:

- Grafikk «som et spill» som «ser dritekte ut».
- Valgt: «Før» og «Etter» blir realistiske. I massebildet ligger teksturene
  under, men skjæring og fylling beholder rødt og grønt.
- Valgt: ekte trær i skogen, men aldri der det graves eller fylles.
- «1 og fortsett med 3 etter du er ferdig med alt push til main».

Bare skjermkortet får dette. Prosessorveien er reserven og står uendret, og
det samme gjelder id- og dybdepassene. Ingen bildefiler: alt er prosedyrisk i
shaderen.

## 1. Materialer

**Materialet følger cella.** Hver celle får et materialnummer ved siden av
fargen. Det ligger i fjerde byte i id-attributtet, som før var ubrukt. Hvert lag
kan oppgi `materiale(k00) → nummer`. Mangler det, er nummeret 0, og cella
tegnes som før.

| Nr | Materiale | Hvor |
|---|---|---|
| 1 | gress | AR5 dyrka mark, beite, åpen fastmark; terreng uten AR5 |
| 2 | skogbunn | AR5 skog |
| 3 | myr | AR5 myr |
| 4 | vann | AR5 ferskvann og hav |
| 6 | grus | vegbanen i «Etter» (landbruksveg = grusdekke), ferdig tomteflate |
| 7 | jord | skjæringsskråning i «Etter» |
| 8 | fjell | skjæring der fjellet står over ferdig flate (`zF > zP`) |
| 9 | fyllmasse | fyllingsskråning i «Etter» |
| 10 | bebygd | AR5 bebygd og samferdsel |
| 11 | snø | AR5 snø og isbre |
| 20 | masse | gravflaten i massebildet (bare detalj) |

**I «Før» og «Etter»** (`R.virkelig`) erstattes fargen av materialets egen,
variert med støy i to skalaer i verdenskoordinater. Støyen står derfor stille
når man beveger seg. Bratt naturmark (gress, skogbunn, myr med n·z < 0,75)
glir over i stein og jord. Vann speiler himmelen med fresnel når man står i
modellen, og ellers er det mørkt blått.

**I massebildet** beholdes fargen, og støyen endrer bare lysstyrken (±8 %).
Rødt er fortsatt rødt og grønt fortsatt grønt, men flaten ser ut som jord og
ikke som plast.

Hvilket materiale som gjelder hvor:

- **«Før»:** arealdekket overalt.
- **«Etter»:** vegbane, så ferdig tomt, så skjæring og fylling (fjell der fjellet
  står over), og arealdekket utenfor inngrepet.

Det gjelder også naboanlegg i full detalj.

## 2. Trær

- **Hvor:** der AR5 sier skog (kode 30), og bare når arealdekket er på.
  Arealdekket er en lagbryter, så trærne slås av med den.
- **Ikke på arbeidet:** i massebildet og «Etter» står det ingen trær der
  gitteret har gravflate, vegbane eller ferdig tomt. Det holdes også 3 m
  avstand. I «Før» står skogen også der det skal graves, fordi den står der i
  dag.
- **Plassering:** fast og tilfeldig, ett tre per ca. 30 m² skog, fra en hash av
  nodenummeret. Det samme treet står på samme sted hver gang. Høyde 9–20 m.
  70 % gran (tre kjegler), 30 % løvtre (ujevn krone). Hvert tre har sin egen
  dreining og fargetone.
- **Tegning:** instansiert, én mesh per tretype og én post per tre, høyst
  20 000 trær. Trærne kaster skygge i skyggekartet og får lys, dis og
  omgivelseslys som terrenget.
- **Ikke med i id- og dybdepassene:** avlesningen og strekene svarer om
  bakken, ikke om et tre. Strekene gjemmer seg ikke bak trær.
- **Overdrivning:** trærne står på bakken der den er overdrevet, men selve
  treet overdrives ikke.
- **Bare det aktive anleggets gitter** får trær. Naboene er dempet og
  skissert, og trær der ville doblet tettheten der ringene overlapper.

## 3. Prøver og ferdig

**Prøver** (ny `gpuMaterialer`):

- **Syntetisk mesh:** gress, grus og vann i «virkelig» gir tre klart ulike
  farger. Vann er blått, grus lysere enn gress, og gress grønnere enn grus.
- **Massebildet:** cella med materialet «masse» beholder kuløren. Rødt er
  rødt, og fargeavstanden til uten materiale er liten.
- **Trær:** et gitter med bare skog gir trær. Det samme gitteret med gravflate
  midt på gir ingen trær der. I «Før» står det trær også der.
- **Trærne står når bare kameraet endres:** de bygges ikke på nytt.
- **Uendret:** `gpuSammeBilde`, `gpuGlatt`, `gpuLysOgLuft` og `gpuReserve`.
  Fart: dra og gå ≤ 16 ms.

**Ferdig når:**

- hele nettleserprøven er grønn med og uten skjermkort;
- `npm test` er grønn;
- brukeren har fått skjermbilder av «Før», «Etter» og massebildet, ovenfra og
  fra bakken;
- `main` er pushet, som brukeren ba om.
