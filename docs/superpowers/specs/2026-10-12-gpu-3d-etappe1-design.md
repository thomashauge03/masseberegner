# 3D på skjermkortet, etappe 1: motoren

Dato: 2026-10-12 · Gren: `gpu-3d`

Ønsker fra brukeren, om knappene Ovenfra, Fly og Gå:

- «jeg vil at alle disse skal bruke skjermkort til å få d smud og bra»
- «altså ikke hakkete og loade»
- «kan sikkert fikse litt på dem og til å få dem til å se enda bedre ut»
- «enda mer realistisk og "som et spill" grafikker som ser dritekte ut»

Valgt i dialogen:

- Gjelder de tre 3D-visningene. Snitt er 2D og står som det er.
- Egen WebGL-tegner uten bibliotek. Dagens tegner blir reserve når
  skjermkortet ikke er tilgjengelig.
- Tre etapper: **1 motoren** (denne), **2 lys og luft** (himmel, dis,
  slagskygger, omgivelseslys), **3 materialer og trær** (gress, skog, myr og
  vann fra arealdekket, asfalt, grus, fjell, naken jord; ekte trær i skogen,
  aldri der det graves eller fylles). Hver etappe får egen spec og plan.
- I etappe 3: «Før» og «Etter» blir realistiske; i massebildet ligger
  teksturene under, men skjæring og fylling beholder rødt og grønt.

## Hvorfor det hakker i dag

`Tegner3d.tegn()` (`public/js/ui-3d.js`) rasteriserer hvert bilde i
JavaScript inn i en `Uint32Array`, og kaller fargefunksjonen og lyset
(`_lys`) for hver celle i hvert bilde.

- For å holde 28 ms senkes oppløsningen til 40–70 % mens man drar eller går.
  Det er det uskarpe bildet.
- Dra, hjul og knip kaller `tegn()` synkront på hver hendelse
  (`_musKobling`), ikke én gang per skjermoppdatering.
- Når man slipper, kommer et skarpt bilde 120 ms etterpå (90 ms etter gange),
  og nabo-anleggenes nodebudsjett hopper fra 18 000 til 45 000 noder.
  Detaljen popper inn: det er «lastingen».
- Tomt3d og Ror3d bygger gitteret på nytt når kvaliteten endrer `steg`, og
  da bygges terrengmaskene på nytt også.
- Nabo-anlegg i full detalj (`_planleggFullDetalj`, etter 1,5 s) og
  arealdekket rammer bildet inn på nytt når de kommer (`_skalaSatt = false`).
  Da hopper kameraet.

## 1. Oppbygging

**Ny fil `public/js/gl3d.js`**, lastet rett før `ui-3d.js`, med objektet
`Gl3d`. Som `Tegner3d` kjenner den bare gitre, lerreter og kameraer, ikke tomt
eller veg. Den kan:

- lage og holde en WebGL2-kontekst for et lerret;
- bygge en mesh av (gitter, høydetabell, lag, `krev`, steg);
- tegne en liste meshes med et kamera;
- lese ut bilde, dybde og celle-ID når noen spør.

Uten bibliotek, uten bildefiler og uten modulskript: begrunnelsen øverst i
`ui-3d.js` (felt med dårlig dekning) gjelder fortsatt.

**Geometrien bygges én gang, kameraet sendes hvert bilde.** I GPU-modus fyller
`_raster(...)` ikke piksler. Den ber om en mesh og bygger bare når nøkkelen er
ny. Nøkkelen er gitterets identitet, høydetabellen, laget, visningen
(`vanlig | foer | etter`), `fyldig`, fargetemaet, felles `maksAvvik`,
arealdekkets versjon og steget. Mens man drar, flyr eller går, sendes bare
kameraet som uniformer.

Lagene fra `_lagliste` i Tomt3d, Veg3d og Ror3d brukes **uendret**, og det
samme gjelder overstyringen for «Før» og «Etter».

**Farge og lys skilles.**

- Fargen per celle hentes fra de samme `farge`-funksjonene med lyset satt til
  1, slik prøvene allerede gjør det. Fargen er flat per celle, så rød og grønn
  betyr det samme som før, og `0` (hopp over) gjelder fortsatt.
- Celler bygges som egne trekanter (seks hjørner), så fargen ikke glir mellom
  naboceller.
- Lyset regnes i shaderen fra en **utjevnet normal per node**: gjennomsnittet
  av normalene til cellene rundt, regnet med de virkelige avstandene i `wx/wy`
  og rå `z`, som `_lys` gjør i dag. Det gir myk skyggelegging.
- Lysretningen er den samme (−0,4, 0,4, 0,82), og spennet 0,55–1,00.
  Baksider får 0,45 på bakken, som før.
- Uthevingen av rutelinjene (0,72) og usikre celler (0,82) ligger i fargen og
  følger med.

**Koordinatene.** Et fast origo (gitterets midte, i dobbel presisjon) trekkes
fra før `Float32` lastes opp. UTM-tall på 6,7 millioner meter ville ellers
skjelve i skjermkortets 32-biters tall.

**Kameraet.** `_kamera` og `_bakkeKamera` får hver en matrise som gir nøyaktig
det samme som `kam.punkt()`: yaw, pitch, fokus, `z0`, overdrivning, `dist`,
`F`, `cx/cy` og nærplanet (`naer`). Overdrivningen gjøres i shaderen, så den
krever ingen ombygging. `kam.punkt()` beholdes for overlegget. Skjermkortet og
strekene havner da på de samme pikslene.

**Gjennomsiktige lag** (terreng over gravflaten 0,45, fjell 0,5, overbygning
0,6) oppfører seg som nå. Bare laget sin **nærmeste** flate blandes inn, og
bare der den ligger foran det ugjennomsiktige. Hvert lag tegnes i en egen
rammebuffer med egen dybde. Shaderen forkaster fragmenter bak dybden fra de
ugjennomsiktige lagene, som leses som tekstur. Etterpå blandes resultatet inn
med lagets `blanding`.

For nabo-anlegg skriver gjennomsiktige lag dybde, som i
`_tegnFulltAnlegg` i dag.

**Nabo-anlegg.** Skisser, dempede farger (`_dempet` og `_dempetDer`) og
terrengmasker er de samme. Forskjellene fra i dag:

- Meshene bygges én gang med et budsjett på 600 000 noder, mot 18 000/45 000
  i dag. Steget avhenger ikke av om man drar.
- Nøkkelen i `_bakgrunnsgitre` og `_terrengmasker` er som i dag.

**Reserve.** Dagens kode står urørt bak `brukGpu`:

```js
Tegner3d.brukGpu       // null = prøv WebGL2; false = alltid prosessoren
```

Prosessoren tar over:

- hvis `getContext('webgl2', { antialias: true })` gir `null`;
- ved `webglcontextlost`, frem til `webglcontextrestored`, da meshene bygges
  på nytt.

Det blir aldri en hvit flate.

## 2. Det som leser pikslene

**Avlesning, klikk og fart under dragning** (`_slaOpp`, `_dybdeUnder`,
`_id`).

- En egen ID-pass tegner cellenummeret (`k00 + 1`) som farge i en
  `RGBA8`-rammebuffer, bare for lag som skriver ID: aktivt anlegg,
  ugjennomsiktig.
- Passen tegnes **bare når noen spør**, og bare når kameraet eller scenen har
  endret seg siden sist.
- `_id` blir en lat egenskap på prototypen. Leses den, hentes hele bufferet
  (`readPixels`) og snus. Hver visning har sitt eget, som i dag.
- `_slaOpp` leser fortsatt `this._id[...]`. Det virker uendret, også i
  prøvene som går gjennom `_id` piksel for piksel.

**Dybden** (`_dyp`) brukes av `_verdensstrek` når man står på bakken, og av
`_dybdeUnder`.

- En dybdepass skriver lineær `w` kodet i `RGBA8`, i **kvart oppløsning**.
  Den tegnes bare når man står på bakken, eller når `_dyp` leses.
- `_dyp` blir lat på samme måte og har full størrelse, men hver verdi slås
  opp i kvart oppløsning.
- Toleransen i `_verdensstrek` (2 % + 0,5 m) dekker forskjellen.
- Ror3d setter fortsatt `_dyp = null` under røntgen-strekene. Settes
  egenskapen, overstyrer det den late verdien.

**Overlegget** blir på 2D-lerretet (`…over`): streker, tekst, nordpil og
avlesning. `_tegnOverlegg` er uendret.

**Tegnetakten.** I GPU-modus:

- Dra, hjul og knip går gjennom `tegnSnart` (én gang per skjermoppdatering).
- Kvalitetsnedskaleringen er borte: alltid `dpr` (maks 2) og kantutjevning.
- Det forsinkede skarpe bildet (120 ms og 90 ms) og byttet mellom nodebudsjett
  under dragning er også borte.

Prosessor-veien beholder alt dette.

**Ingen hopp.**

- Når arealdekket eller nabo-anlegg i full detalj kommer, byttes meshene ut
  uten ny innramming hvis brukeren har dratt, zoomet eller dreid siden 3D ble
  slått på. Det bruker et nytt flagg, `_kameraRort`.
- Fremdriften «Regner ut … i/n» står som før, fordi det er en ekte utregning.
- Tomt3d og Ror3d velger `steg` bare ut fra zoomen, med 25 % hysterese, ikke
  ut fra kvaliteten.

**Rapportbildene** (`Rapport._modell3d`, `ui-rapport.js`).

- Ett skjult, delt WebGL-lerret (`Gl3d.utskrift`) brukes til alle
  rapportbilder, i stedet for nye lerreter per bilde. Grunnen: hver nye
  kontekst koster, og nettlesere har et tak på 16.
- Det tegner i ønsket størrelse med utskriftstemaet, leser pikslene og kopierer
  dem til det 2D-lerretet rapporten lager i dag.
- Overlegget og sammensetningen er uendret.
- Uten WebGL brukes dagens vei.

## 3. Prøver, og når det er ferdig

**Bryteren.** Nettleserprøven kjøres to ganger: `brukGpu = null` og
`brukGpu = false`. Begge skal være grønne.

**De sju pikselprøvene** i `nettlesertest.js` leser i dag lerretet med
`getContext('2d')`, som gir `null` på et WebGL-lerret. Det gjelder linjene
3531, 5712, 6340, 6615, 6693, 7078 og 7164. De bytter til
`Tegner3d._lesBilde(vis)`, som gir `ImageData` fra begge tegnerne.

- Påstandene står: dekning, rødt er skjæring, grønt er fylling, «Før» har null
  massefarger, «Etter» har null massefarger, og jevn dekning når man går.
- Prøven av `_skjermboks` (3531) gjelder prosessor-veien og kjører med
  `brukGpu = false`.

**Nye prøver:**

- **Samme bilde.** Samme scene og lerretsstørrelse på begge tegnerne: under
  minst 97 % av pikslene med en celle i ett av `_id`-bufferne er det samme
  celle i begge. Det gjøres for tomt, veg og rør, ovenfra og på bakken.
- **Ingen ombygging under bevegelse.** En teller (`Gl3d.bygget`) står stille
  mens man drar, zoomer, dreier og går.
- **Fart.** Median bildetid under 60 bilder med dragning og 60 med gange på
  demoen (Ydestad, med nabo-anlegg). Den skrives ut og kreves ≤ 16 ms.
- **Avlesning og klikk.** `_slaOpp` midt i bildet gir samme celle på begge.
- **Rapportbilder.** `_modell3d` gir et bilde med over 1,5 % innhold fra
  WebGL-veien, og bare ett WebGL-lerret er laget etter tre rapporter.
- **Mistet kontekst.** `WEBGL_lose_context.loseContext()` gir et bilde fra
  prosessoren uten unntak. `restoreContext()` gir skjermkortet tilbake.

**Ferdig når:**

1. Median bildetid er ≤ 16 ms under dragning og gange på demoen i
   nettleserruta.
2. Første bilde etter at 3D slås på kommer på ≤ 300 ms.
3. Nettleserprøven er grønn med og uten skjermkort.
4. `selftest` og de andre prøvene i `test/` er uendret grønne.
5. Brukeren har fått skjermbilder av Ovenfra, Fly og Gå, før og etter.

**Utenfor etappe 1:** himmel, dis, skygger og omgivelseslys (etappe 2);
teksturer, vann og trær (etappe 3); Snitt; ny funksjonalitet i overlegget.

## Endret i planlegging og bygging

- **Ett delt WebGL-lerret, kopiert inn i 2D-lerretet.** Ikke en kontekst på
  hver visnings lerret og ingen `_lesBilde()`. Skjermkortet tegner i
  `Gl3d.lerret`, og bildet kopieres med `drawImage`. Pikselprøvene,
  rapportbildene og `_tomMelding` virker uendret. Det finnes én kontekst i
  hele programmet, også for rapportene, så det trengs ingen egen
  `Gl3d.utskrift`.
- **Steget på skjermkortet er 1.** Ingen ombygging når man zoomer. Det blir
  grovere bare når gitteret passerer `Tegner3d.GPU_NODER` = 1 500 000 noder.
  Steget huskes per resultat.
- **`_dyp` er ikke en lat egenskap.** De to leserne, `_verdensstrek` og
  `_dybdeUnder`, går gjennom `_dybdeOppslag()`. Ror3d slår prøven av med
  `_utenDybdeprove`.
- **Dybden er perspektivriktig.** Prosessoren interpolerer w rett over
  skjermen. Over en fem meter lang celle like ved øyet gir det 4,5 m helt
  nederst i bildet, der bakken er nærmest. Prøven måler derfor mot hjørnene
  i cella, ikke mot prosessoren.
- **Strekene leser dybden asynkront mens man beveger seg.** Synkron
  utlesing kostet 11 av 12 ms per bilde når man gikk. Mens `_farer` eller
  `_drar` står på, brukes forrige bildes dybde (`Gl3d.dybdeOppslagRask`).
  Når man stopper, tegnes ett bilde med den eksakte.

Målt i nettleserruta (median per bilde):

| | Dra | Gå | Første bilde |
|---|---|---|---|
| Prosessoren | – | 88 ms | – |
| Skjermkortet | 1,4 ms | 3,1 ms | 76 ms |
