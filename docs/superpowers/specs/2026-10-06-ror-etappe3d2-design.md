# Rør, etappe 3d-2: traseer fra DXF og KOF, og høydene lagt på knapp

Dato: 2026-10-06 · Gren: `ror-etappe3d2`

Det siste av «Utenfor 3a». Brukeren har gitt fullmakt til å ta valgene.
**Alt som endrer høyder, ligger på knapper. Innmålte høyder endres aldri
automatisk.**
- Importen tar høyder fra fila bare når brukeren velger det i dialogen.
- Høydene legges bare når brukeren trykker på knappen.
- Begge er ett steg i angrelista.

## 1. Traseer fra DXF og KOF

Traseen tegnes i dag punkt for punkt i kartet. Ofte finnes den fra før, i en
VA-plan fra konsulenten (DXF) eller en stikningsfil (KOF).

**Lesingen** skjer i en ny ren modul, `public/js/traseimport.js`
(`TraseImport`). Begge leserne gir det samme svaret:
`{ linjer: [{ navn, lag, punkter: [{ o, n, z }] }], sone, merknader }`.

**KOF** (`les­Kof(tekst)`):
- `05`-postene er punkt. Kolonnene leses som `Eksport.kofPunkt` skriver dem,
  med mellomrom som reserve: navn, kode, nord, øst, høyde.
- `09_91` begynner en linje, og `09_99` avslutter den. `09_96` lukker den
  (første punkt legges til igjen).
- Utenfor linjeblokker blir punkt med samme kode etter hverandre én linje.
  Det er slik stikningsfiler, også programmets egne, er skrevet.
- Sonen leses av `01`-posten: koordinatsystemkoden 22/23/25 er UTM32/33/35.

**DXF** (`lesDxf(tekst)`), ENTITIES:
- `LINE`, `LWPOLYLINE` (høyden i 38) og `POLYLINE` med `VERTEX`/`SEQEND`
  (3D-polylinjer).
- Laget (8) er navnet.
- `LINE`-er på samme lag som deler endepunkt, kjedes til én linje. CAD-filer
  har ofte en trase som løse streker.
- Blokker (INSERT) og tekst hoppes over og telles i merknadene.

**Kontrollene:**
- Punkt utenfor UTM i Norge hoppes over og telles. Er halvparten eller mer
  utenfor, avvises fila med en forklaring: den er i et annet system (NTM,
  lokalt).
- Punkt nærmere enn 1 cm etter hverandre slås sammen.
- Linjer med under to punkt faller bort.

**Dialogen** heter «Trase fra fil». Den har:
- lista over linjene: et avkrysningsfelt, laget, antall punkt og lengden;
  alle er krysset av fra start;
- sonen: fila sin, ellers prosjektets, med valg;
- røret som legges i hver trase: kode, sideavstand 0 og regel som standard.
  Koden foreslås av laget når det kan tolkes som en rørkode, ellers den
  første koden i anlegget;
- høydene i fila: «Bruk ikke» (standard), «Bunn innvendig» eller «Topp rør».
  Med høyder låses hvert punkt med høyde i fila, som en låst høyde (bunn
  innvendig, regnet om fra topp med godset).

**Knappen** heter «📂 Trase fra fil». Den står ved «✎ Ny trase» i kartet for et
tegnet anlegg, og som valg i fil-dialogen. Det legges inn ett angresteg. Har
punkt samme sted som en ende på et innmålt rør, gjelder det som når
traseen tegnes: endene festes som påkobling, og høyden derfra er låst med
kilden.

## 2. Høydene lagt på knapp

Et selvfallsrør går rett mellom kontrollpunktene: endene, kummene og de låste
høydene. Høyden i et fritt kontrollpunkt er overdekningen under terrenget,
og fallet blir det det blir – motfall også, med merknad.

**«⤓ Legg høydene»** står i Rør-fanen per selvfallsrør, og i punktfeltet. Den
finner høydene i de frie kontrollpunktene som gir minst graving, innenfor
kravene:
- overdekningen er minst grensen langs hele røret, prøvd hver meter som i
  kontrollen;
- fallet mellom kontrollpunktene er minst kodens minste fall og høyst kodens
  største, når det er satt;
- låste høyder, påkoblinger og greiner står som de er.

Rørene går rett mellom kontrollpunktene som før. Selvfallsrør skifter fall i
kummene, ikke i en knekk i plan. Svaret låses i de frie kontrollpunktene som
låste høyder. Det synes, det kan endres for hånd, og det er ett angresteg.

**Lagt eller låst:**
- En høyde knappen har lagt, er merket `lagt`.
- Et nytt trykk legger de merkede på nytt, for eksempel etter at terrenget
  er hentet bedre eller en kum er flyttet.
- En høyde brukeren låser eller drar selv, mister merket og står fast, som
  påkoblingene og greinene.

**Metoden** er dynamisk programmering over kontrollpunktene, med høyder i
hele centimeter:
- Høyden i et punkt kan ligge fra terrenget minus overdekningen og ned til
  6 m under det.
- For hvert par av naboverdier er strekket lovlig når fallet er innenfor
  kravene og linja holder seg under terrenget minus overdekningen i alle
  prøvepunkt.
- Det beste er det som gir minst sum av dybder langs røret. Vekten er
  lengden, så det er gravedybden i snitt.
- Den høyeste lovlige verdien for neste punkt regnes én gang per verdi i
  punktet før. Da blir arbeidet antall verdier × prøvepunkt, ikke antall
  verdier i andre potens.

**Finnes ingen lovlig profil** (for lite fall mellom to låste høyder, eller
terrenget krever mer enn 6 m), endres ingenting. Statuslinja sier hvor det
stopper: «Ingen profil oppfyller kravene mellom 120 og 160 m – fallet ned til
den låste høyden er for lite».

## Prøver

- **TraseImport** (test/traseimportprove.js, ny):
  - KOF med `09_91`/`09_99`, lukket linje og punkt med samme kode;
  - programmets egen KOF fra roreksport leses tilbake;
  - sonen fra `01`;
  - DXF: LINE-kjeding, LWPOLYLINE med høyde og 3D-POLYLINE;
  - lag, punkt utenfor UTM, og sammenslåing av punkt på samme sted.
- **RorPlan** (rorplanprove.js): `leggHoyder` på et kjent terreng gir fasiten
  regnet for hånd:
  - en jevn li: minste fall og overdekningen i den høye enden;
  - en rygg midt på: dypere der;
  - låste høyder står;
  - ingen lovlig profil gir null og grunnen;
  - største fall.
- **Nettleseren:**
  - «Trase fra fil» med en KOF og en DXF laget i prøven: linjene, valget,
    høydene låst eller ikke, og angre;
  - «⤓ Legg høydene»: de låste høydene, kontrollene uten merknad om
    overdekning og fall, og angre.
