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
`{ linjer: [{ navn, lag, punkter: [{ o, n, z }] }], sone, hoppet, merknader }`.
`hoppet` teller det som ikke ble linjer, etter type.

**KOF** (`lesKof(tekst)`):
- `05`-postene er punkt. Kolonnene leses som `Eksport.kofPunkt` skriver dem.
  En fil skrevet for hånd leses fra tallene bakerst: navnet er det første
  ordet, koden alt mellom det og tallene («SP 160» og «SP 110» er to koder).
- `09_91` begynner en linje, og `09_99` avslutter den. `09_96` lukker den
  (første punkt legges til igjen). En ny `09_91` uten `09_99` foran
  avslutter den åpne.
- Utenfor linjeblokker blir punkt med samme kode etter hverandre én linje.
  Det er slik stikningsfiler er skrevet.
- **Programmets egen stikningsfil** (roreksport.js) skriver bunn, topp og
  gravebunn om hverandre for hvert punkt, med navnet `<rørnr>-<løpenr><B|T|G>`.
  Punkt med det navnet samles per kode og rør: tre linjer per rør. Kummene
  (`K<nr><B|T>`, KUMBUNN/KUMTOPP) er punkt, ikke linjer, og telles.
- Sonen leses av `01`-posten: koordinatsystemkoden 22–26 er UTM32–36.

**DXF** (`lesDxf(tekst)`), ENTITIES:
- `LINE`, `ARC`, `LWPOLYLINE` (høyden i 38) og `POLYLINE` med
  `VERTEX`/`SEQEND` – 3D, eller 2D med høyden i hodet (30).
- Buer i polylinjene (42) og `ARC` legges inn som punkt hver meter, og
  merknaden sier hvor mange. Ellers ble en bue en rett korde.
- Laget (8) er navnet.
- `LINE` og `ARC` på samme lag som deler endepunkt, kjedes til én linje. CAD-
  filer har ofte en trase som løse streker. Endepunktene slås opp i et
  rutenett, og kjeden går bare gjennom et punkt der nøyaktig to streker
  møtes: i en T stopper den, uansett rekkefølge i fila.
- Hoppes over og telles: blokker (INSERT), tekst og annet; papirrommet
  (67 = 1 – rammen og tittelfeltet); flatenett (polyface og mesh).
- En flate med normalen ned (230 = −1) er speilet: x snus.
- Er alle høydene i en linje 0, har den ingen høyde. Er noen 0 og resten mer
  enn en meter unna null, er nullene høyder som mangler.

**Kontrollene:**
- Punkt utenfor UTM i Norge hoppes over og telles, per linje. Fila avvises
  med en forklaring (NTM, lokalt system) bare når ingen linje står igjen.
- Punkt nærmere enn 1 cm etter hverandre slås sammen.
- Linjer med under to punkt faller bort.

**Dialogen** heter «Trase fra fil». Den har:
- lista over linjene: et avkrysningsfelt, laget, antall punkt og lengden;
  alle er krysset av fra start;
- det som er hoppet over, og merknadene fra lesingen;
- sonen: fila sin (også UTM34/36), ellers prosjektets, med valg;
- røret som legges i hver trase: kode, sideavstand 0 og regel som standard.
  Koden foreslås av laget når det kan tolkes som en rørkode med dimensjon,
  eller anlegget har den. Ellers står feltet tomt – en feil kode som ser
  riktig ut, er verre enn ingen;
- høydene i fila: «Bruk ikke» (standard), «Bunn innvendig» eller «Topp rør».
  Med høyder låses hvert punkt med høyde i fila, som en låst høyde (bunn
  innvendig, regnet om fra topp med godset).

**Knappen** heter «📂 Trase fra fil» og står ved «✎ Ny trase» i kartet for et
tegnet anlegg. Fila leses som UTF-8, ellers Windows-1252. Alt er ett
angresteg.

**Endene festes strengere enn når en trase tegnes** – fila er målt, ikke
klikket:
- en påkobling bare på et innmålt punkt med samme kode, eller samme system
  og dimensjon, innen en halv meter. Høyden derfra låses med kilden;
- en grein bare på et punkt på en annen trase med rør i samme system, på
  samme sted (5 cm). Det avgjøres etter at alle linjene er lagret, så en
  grein finner hovedrøret også når det står etter den i fila. Et punkt som
  selv er en grein-ende, tar ikke imot: der tre linjer møtes, blir det en
  kjede, ikke en sirkel;
- ellers står enden der fila sier.

## 2. Høydene lagt på knapp

Et selvfallsrør går rett mellom kontrollpunktene: endene, kummene og de låste
høydene. Høyden i et fritt kontrollpunkt er overdekningen under terrenget,
og fallet blir det det blir – motfall også, med merknad.

**«⤓ Legg høydene»** står i Rør-fanen per selvfallsrør, og i punktfeltet. Den
finner høydene i de frie kontrollpunktene som gir minst graving, innenfor
kravene:
- overdekningen er minst grensen langs hele røret – prøvd der kontrollen
  prøver: hvert knekkpunkt, hver meter fra det, og enden;
- fallet mellom kontrollpunktene er minst kodens minste fall og høyst kodens
  største, når det er satt (0 er flatt, som i kontrollen);
- låste høyder, påkoblinger og greiner står som de er.

Rørene går rett mellom kontrollpunktene som før. Selvfallsrør skifter fall i
kummene, ikke i en knekk i plan. Svaret låses i de frie kontrollpunktene som
låste høyder, rundet ned til hel millimeter. Det synes, det kan endres for
hånd, og det er ett angresteg. Endrer et trykk ingenting, sier statuslinja
det, og det blir ingen angrepost.

**Lagt eller låst:**
- En høyde knappen har lagt, er merket `lagt`. Punktfeltet sier det.
- Et nytt trykk legger de merkede på nytt, for eksempel etter at terrenget
  er hentet bedre eller en kum er flyttet.
- En høyde brukeren låser eller drar selv, mister merket og står fast, som
  påkoblingene og greinene.
- Det knappen la, gjelder bare der knappen legger: i en kum, og i en ende
  som ikke er en grein. Tas kummen bort, går høyden med den; en som står
  igjen fra før, tar neste trykk bort.

**Faste punkt over taket.** En påkobling på et grunt rør bryter
overdekningen der den står. Taket ved siden av løftes da med overskuddet,
rett ned til null i neste kontrollpunkt – ellers måtte linja under taket en
meter unna, og neste punkt havnet langt for dypt. To faste punkt etter
hverandre gir linja mellom seg selv; kontrollen sier fra om den bryter et
krav, og den hindrer ikke resten.

**Greinene som renner inn.** En grein henter høyden fra hovedrøret der den
er festet. Lagt rett under taket ble hovedrøret liggende så høyt der at en
grein på flatt terreng aldri fikk fall. Den høyeste høyden hver grein kan
møte hovedrøret i, finnes med greinas egen programmering, og hovedrøret
holdes under den. Går ikke det med det som står fast på hovedrøret, legges
det uten, og statuslinja sier fra. Legg hovedrøret først, så greinene.

**Metoden** er dynamisk programmering over kontrollpunktene, med høyder i
hele centimeter:
- Høyden i et punkt kan ligge fra terrenget minus overdekningen og ned til
  6 m under det.
- For hvert par av naboverdier er strekket lovlig når fallet er innenfor
  kravene og linja holder seg under taket i alle prøvepunkt.
- Det beste er det som gir minst sum av dybder langs røret. Vekten er
  lengden, så det er gravedybden i snitt.
- Den høyeste lovlige verdien for neste punkt regnes én gang per verdi i
  punktet før, så prøvepunktene går gjennom verdier × prøvepunkt ganger.
  Parene er verdier × verdier per strekk (600 × 600); 6 km med 300 kummer
  tar under et halvt sekund.

**Finnes ingen lovlig profil**, endres ingenting. Statuslinja sier hvorfor og
hvor:
- røret må ligge mer enn 6 m dypere enn overdekningen krever (prøvd med
  dobbel dybde, eller uten faste punkt i strekket);
- greina får ikke fall fra høyden den henter – legg hovedrøret først;
- påkoblingen gir ikke fallet uten å komme over overdekningen;
- de låste høydene gir ikke fallet;
- et rør uten dimensjon eller uten terreng sier det, i stedet for «prøv
  igjen».

## Prøver

- **TraseImport** (test/traseimportprove.js, ny):
  - KOF med `09_91`/`09_99`, lukket linje, åpne blokker og punkt med samme
    kode; koder med mellomrom; sonen fra `01`;
  - stikningsfila RorEksport faktisk skriver, leses tilbake: tre linjer per
    rør, punktene der stikningen står, kummene telt;
  - DXF: LINE-kjeding, en T i tre rekkefølger, LWPOLYLINE med høyde,
    3D- og 2D-POLYLINE, buer og ARC, papirrom, flatenett, speiling, en 0 i en
    3D-kjede, og 20 000 streker på under et sekund.
- **RorPlan** (rorplanprove.js): `leggHoyder` på et kjent terreng gir fasiten
  regnet for hånd:
  - en jevn li: minste fall og overdekningen i den høye enden;
  - en dump midt på: dypere der;
  - låste høyder står; to på samme sted; største fall, også 0;
  - et fast punkt over taket; to faste etter hverandre;
  - kummen tatt bort, og en lagt høyde i en grein-ende;
  - greina som renner inn i hovedrøret, med fasit;
  - hvorfor det ikke går: dybden, greina, påkoblingen, de låste;
  - 150 rør på tilfeldig terreng: ingen merknad om fall eller overdekning
    etter knappen.
- **Nettleseren:**
  - «Trase fra fil» med en KOF og en DXF laget i prøven: linjene, valget,
    høydene låst eller ikke, angre, festene (grein, ikke grein, annet
    system, greina før hovedrøret), papirrommet og UTM34;
  - «⤓ Legg høydene»: de låste høydene, kontrollene uten merknad om
    overdekning og fall, et nytt trykk uten endring, punktfeltet, kummen
    tatt bort, en lagt høyde uten kontrollpunkt, hvorfor det ikke går, og
    angre.
