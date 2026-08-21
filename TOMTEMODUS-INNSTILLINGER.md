# Tomtemodus – hvilke innstillinger og moduser som trengs

Gjennomtenking av hva en tomtemodus faktisk må kunne stilles inn på, før noe bygges.
Navnene følger konvensjonen i `StandardMal` i [masser.js](public/js/masser.js): norsk,
camelCase, uten æøå i nøklene, skråninger som H:V-forhold og prosenter som desimaltall.

> Tall merket **?** er anslag jeg ikke har kildebelagt ennå. De må sjekkes mot NS 3420
> og mot hva firmaet faktisk bruker før de settes som standardverdier.

---

## 1. Hvor skillet mellom modusene går

Et prosjekt får et felt `type: 'veg' | 'tomt'`. Gamle prosjektfiler mangler feltet og
skal leses som `'veg'` – da åpner alt som finnes fra før uendret.

Spørsmålet som må avgjøres først: **skal ett prosjekt kunne inneholde både en veg og en
tomt?** Det er ikke akademisk. En skogsbilveg ender ofte i en snuplass eller et velteplass,
og en tomt har nesten alltid en adkomstveg. Ligger de i hvert sitt prosjekt, kan ikke
massene balanseres mot hverandre – og det er nettopp der pengene ligger: sprengsteinen fra
tomta skal i vegfyllinga.

Tre mulige svar:

| | Beskrivelse | Konsekvens |
|---|---|---|
| A | Ett prosjekt = én ting, `type` avgjør | Enklest. Ingen felles massebalanse. |
| B | Ett prosjekt kan ha én veg **og** flere tomter | Felles massebalanse. Mer arbeid i UI og rapport. |
| C | Ett prosjekt = liste med «anlegg», hvert med egen type | Mest fleksibelt, størst omskriving. |

Jeg mener **B** er riktig: det speiler virkeligheten (veg + snuplass + tomt er ett
oppdrag), og den felles massebalansen er hovedgrunnen til at noen bruker programmet.
Men det er ditt valg – se avsnitt 14.

---

## 2. Arbeidstype – «modusene inni tomtemodusen»

Du sa «det er forskjellige ting her og». Dette er de forskjellige tingene. De styrer
hvilke felt som vises og hvilke standardverdier som settes, ikke hvordan volumet regnes.

| `arbeidstype` | Hva det er | Kjennetegn |
|---|---|---|
| `planering` | Opparbeide et areal til ferdig nivå | Både kutt og fylling. Vanligste tilfellet. |
| `byggegrop` | Grave ut for bygg, kjeller, basseng | Bare kutt. Arbeidsbredde utenfor bygglivet. Bratte eller vertikale sider. |
| `masseutskifting` | Fjerne dårlig masse, fylle tilbake med god | Graves ut til fast grunn, fylles opp igjen. **To volum, ikke ett.** |
| `oppfylling` | Bygge opp et areal | Bare fylling. Ofte over myr eller bløt grunn. |
| `uttak` | Ta ut masse (massetak, steinbrudd, lånetak) | Bare kutt. Volumet er produktet, ikke en kostnad. |
| `deponi` | Plass til overskuddsmasse | Spørsmålet er kapasitet: hvor mye får det plass til? |

De to som skiller seg mest:

**Masseutskifting** trenger to nivåer: utgravingsnivå (til fast grunn / under
telefarlig lag) og tilbakefyllingsnivå. Massen som graves ut er som regel ubrukbar
(`brukbarLosmasse` nær 0), og alt som fylles tilbake må kjøres inn. Regnestykket er
«hvor mye ut» + «hvor mye inn», ikke «netto».

**Deponi** snur spørsmålet: i stedet for «hvilket volum gir dette nivået», er det
«hvilket nivå gir dette volumet». Det er samme regnestykke baklengs, og programmet har
allerede maskineriet – `balanser()` i vegmodus finner koten som gir massebalanse.

---

## 3. Arealet – hvordan det defineres

```js
tomt: {
  navn: 'Tomt 1',
  form: 'polygon',        // 'polygon' | 'rektangel' | 'sirkel'
  punkter: [{lat, lon}, …],   // ytterkant, med klokka
  hull: [[{lat, lon}, …], …], // valgfrie utsparinger: fjellknaus som ikke røres,
                              // eksisterende bygg, et tre som skal stå
  // for 'rektangel':
  bredde: 40, lengde: 60, retning: 127,   // grader fra nord
  // for 'sirkel' (snuplass!):
  radius: 12
}
```

Innstillinger som hører til tegningen:

- **`form`** – rektangel og sirkel er ikke bare bekvemmelighet. En snuplass på en
  skogsbilveg er en sirkel, og en industritomt er ofte et rektangel som skal ligge
  rettvinklet på noe. Å tvinge brukeren til å klikke seg gjennom et polygon der ville
  vært tungvint og unøyaktig.
- **`retning`** for rektangel – i grader fra nord, eller «lås til denne kanten».
- **`hull`** – et fjellknaus midt på tomta som ikke skal sprenges bort, eller et
  eksisterende bygg. Uten dette blir volumet for stort.
- **Rettvinkelhjelp / snap** – når to kanter skal stå 90° på hverandre.
- **Minsteareal** – en vakt mot at et feilklikk gir et polygon på 2 m².

---

## 4. Ferdig nivå – ni måter, og du trenger flere enn du tror

Dette er den innstillingen som har flest varianter, og der en for enkel løsning gjør
programmet ubrukelig. En tomt er nesten aldri helt flat: vann skal renne av.

```js
nivaa: {
  modus: 'fall',          // se tabellen under
  kote: 264.50,           // referansehøyde, m
  fall: 0.02,             // 2 %
  fallretning: 210,       // grader fra nord, dit vannet renner
  punkt: {lat, lon},      // for 'sluk' og 'punktfall'
  linje: [{lat, lon}, …], // for 'rennelinje'
  offset: -0.60,          // for 'terreng'
  hoydepunkter: [{lat, lon, z}, …]   // for 'fri'
}
```

| `modus` | Beskrivelse | Når |
|---|---|---|
| `flat` | Én kote over hele | Sjelden alene. Gulv i et bygg, betongplate. |
| `fall` | Plan med fall i én retning | Vanligst. Parkering, lagerplass, snuplass. |
| `trePunkt` | Plan gjennom tre valgte punkter | Når nivået skal møte tre eksisterende ting: en veg, en dør, en nabotomt. |
| `sluk` | Faller mot ett punkt | Tett dekke med sluk. Konisk flate. |
| `rennelinje` | Faller mot en linje | Grøft eller renne tvers over plassen. |
| `takfall` | Faller til begge sider fra en rygg | Stor plass der vann ikke skal krysse hele. |
| `terreng` | Følger terrenget med et fast offset | Masseutskifting, matjordavtaking, avdekking. |
| `balansert` | Programmet finner koten som gir massebalanse | Når du vil vite «hva blir det billigst på». |
| `fri` | Brukeren setter høydepunkter, resten interpoleres | Terrasser, komplisert tomt. |

Tilhørende innstillinger:

- **`minstefall`** – under dette blir det stående vann. **?** 1:100 (1 %) på tett dekke,
  1:50 (2 %) på grus. Programmet bør merke flater som er slakere.
- **`maksfall`** – over dette blir plassen ubehagelig eller farlig å bruke. **?** 1:20
  (5 %) på parkering, 1:50 (2 %) på HC-plass.
- **`fallFraBygg`** – TEK17 krever fall bort fra bygning. **?** 1:50 over minst 3 m.
  Relevant hvis tomta har et bygg definert.
- **`avrundingsnivaa`** – skal ferdig kote rundes til hele centimeter? Maskinstyringer
  liker runde tall.

---

## 5. Kantbehandling – kjernen i det du ba om

> «av og til sprenger du en rett vegg av og til planere skråning»

Hver kant i polygonet får sin egen innstilling. Standard arves fra tomta, men kan
overstyres kant for kant.

```js
kanter: [
  { fra: 0, til: 1, type: 'fjellvegg', … },   // kant mellom punkt 0 og 1
  { fra: 1, til: 2, type: 'skraning',  … },
  …
]
```

### 5.1 `skraning` – planert skråning

Dette er det vegmodusen gjør i dag, og [skråningsmarsjen i masser.js:396](public/js/masser.js:396)
kan brukes uendret: den marsjerer utover, bytter helning når den passerer
fjelloverflaten, og halverer seg inn på treffpunktet mot terrenget.

| Felt | Standard | Merknad |
|---|---|---|
| `skjaeringLosmasse` | 1.5 | H:V. Arves fra malen. Slakere i bløt/sandig masse. **?** 1:2 |
| `skjaeringFjell` | 0.2 | H:V (5:1). Som i vegnormalen. |
| `fylling` | 1.5 | H:V. **?** 1:2 ved høy fylling eller dårlig grunn. |
| `toppavrunding` | 0 | Radius i topp av skjæring, m. Gir et mykere uttrykk og mindre erosjon. |
| `bunnavrunding` | 0 | Radius i bunn av fylling. |
| `avskjaeringsgroft` | false | Grøft i topp av skjæring som tar overvann. Har eget volum. |
| `groftDybde` / `groftBredde` | 0.4 / 0.5 | **?** hvis avskjæringsgrøft. |
| `maksUtslag` | 15 | Hvor langt skråningen får stikke ut. Finnes i malen alt. |

### 5.2 `fjellvegg` – sprengt rett vegg

**Det viktigste å få riktig:** en «rett vegg» er nesten aldri rett hele veien opp.
Den er vertikal *i fjellet*, men løsmassen som ligger over fjellet kan ikke stå
vertikalt – den raser ut. Så en fjellvegg har to deler:

```
          terreng
             ╲
              ╲  ← løsmassen over fjellet: skråning 1:1,5
               ╲
    ────────────┤  ← fjelloverflaten
                │
                │  ← fjellet: vertikal eller 1:0,1
                │
    ────────────┴──── planum
```

Regner man hele veggen vertikal, blir løsmassevolumet for lite og skjæringstoppen havner
på feil sted i kartet. Det er en feil som ikke synes i tallene – summen ser rimelig ut.

| Felt | Standard | Merknad |
|---|---|---|
| `veggHelning` | 0.1 | H:V. 0 = loddrett, 0.1 = 10:1, 0.2 = 5:1. **?** hva firmaet bruker |
| `losmasseOverFjell` | 1.5 | H:V for den delen som ligger over fjelloverflaten |
| `maksVeggHoyde` | 8.0 | **?** Over dette kreves berme/pall |
| `bermeBredde` | 3.0 | **?** Bredde på avsatsen mellom paller |
| `bermeFall` | 0.05 | Fall innover på berma så vann ikke renner utfor |
| `overberg` | 0.3 | **?** Meter fjell som sprenges ut *utover* teoretisk profil. Dette er ekte masse som må kjøres – den skal med i volumet. |
| `kontursprengning` | false | Reduserer overberg. **?** til 0,1–0,2 m |
| `sikringssone` | 2.0 | **?** Meter fra veggtopp til tomtegrense/bygg |
| `rekkverk` | false | Påvirker ikke masser, men skal i rapporten |

**Overberg fortjener en egen tanke.** Det er differansen mellom det du regner og det du
faktisk sprenger. På en 6 m høy og 40 m lang vegg er 0,3 m overberg = 72 m³ fjell som
skal sprenges, lastes og kjøres, men som ikke står i den teoretiske beregningen. Det bør
være en egen linje i rapporten – «teoretisk profil» mot «antatt uttak» – ikke bakt inn,
så du ser hva som er hva når du priser.

### 5.3 `mur` – støttemur

| Felt | Standard | Merknad |
|---|---|---|
| `murtype` | 'naturstein' | `'naturstein'` \| `'betongL'` \| `'gabion'` \| `'torrmur'` |
| `murHoyde` | – | Regnes av geometrien, men trenger en maksgrense |
| `maksMurHoyde` | 3.0 | **?** Over dette kreves prosjektering |
| `murAnlegg` | 0.15 | Muren står ikke loddrett – den heller innover. **?** 10–15 % for natursteinsmur |
| `fundamentDybde` | 0.6 | **?** Graves ut under muren – eget volum |
| `fundamentBredde` | 0.8 | **?** |
| `bakfylling` | 0.5 | **?** Drenerende masse bak muren. **Eget volum som må kjøres inn** – den er ikke gratis. |

Mur er den kanttypen som er lettest å glemme volumet på. Både fundamentgrøfta og
bakfyllinga er masse som må håndteres, og ingen av dem kommer fram hvis man bare regner
«vegg i stedet for skråning».

### 5.4 `apen` – ingen behandling

Kanten er en ren grense. Ingen skråning, ingen vegg, ingenting regnes utenfor. Brukes
mot en eksisterende veg, mot en tomt som er opparbeidet fra før, eller der arbeidet
stopper og noen andre tar over.

### 5.5 `overgang` – kobler til noe annet

Kanten møter en veg eller en annen tomt i samme prosjekt. Nivået tas derfra i stedet for
fra tomtas eget plan. Dette er det som gjør at en snuplass kan sitte på enden av en veg
uten et sprang i høyden.

---

## 6. Hjørner – det som ingen tenker på før det ser rart ut

Der to kanter møtes må skråningene knyttes sammen. Dette er den vanskeligste geometrien
i hele tomtemodusen, og det finnes ingen kode i programmet i dag som gjør noe tilsvarende.

**Konvekst hjørne** (tomta stikker ut): skråningene fra de to kantene møtes ikke – det
blir et gap. Tre løsninger:

- `vifte` – skråningsretningen dreies jevnt rundt hjørnepunktet. Gir en kjegleflate.
  Dette er det som ser riktigst ut og er det andre programmer gjør.
- `avrunding` – hjørnet rundes av med en radius før skråningen bygges. Krever ett tall
  til: `hjorneradius`.
- `skjaer` – de to skråningsplanene forlenges til de skjærer hverandre. Gir en skarp
  kant utover. Riktig for en sprengt vegg, feil for en jordskråning.

**Konkavt hjørne** (tomta går innover): skråningene overlapper. Da må de trimmes mot
hverandre, ellers telles volumet to ganger. Det er en ren geometrioppgave, men den må
gjøres – uten trimming blir volumet for stort.

**Hjørne mellom to ulike typer** – dette er tilfellet du beskrev: sprengt vegg på én
side, planert skråning på den andre. Overgangen kan ikke være et sprang. Alternativer:

- En overgangslengde der veggen gradvis legger seg ned til skråningshelningen.
  Trenger `overgangslengde` (**?** 3–5 m).
- Et rett snitt der de to møtes, og veggen bare slutter.

Jeg mener overgangslengde er riktig – det er slik det bygges i praksis, og et rett snitt
gir en fjellnabb som står igjen.

---

## 7. Lagene – over og under ferdig nivå

Samme tanke som overbygningen i vegmodus, men en tomt har flere lag og de varierer over
arealet.

```js
lag: {
  matjordDybde: 0.25,        // tas av først, mellomlagres ofte på tomta
  matjordMellomlagres: true, // hvis ja: trenger den plass? Eget areal?
  renskDybde: 0.20,          // avdekking av fjell, som i vegmodus
  frostsikring: 0.60,        // ? avhenger av sted og F10-verdi
  forsterkningslag: 0.40,    // ?
  baerelag: 0.10,
  slitelag: 0.05,            // grus, asfalt eller betong
  avrettingslag: 0.03,       // ?
  fiberduk: true             // ikke volum, men skal i rapporten
}
```

To ting som skiller seg fra vegmodus:

**Ferdig nivå kontra planum.** I vegmodus er `vegnivaa` overflaten og planum ligger
`ob` under. På en tomt trenger du begge eksplisitt: ferdig nivå er det som er prosjektert
(kote på asfalten), planum er der jordarbeidet slutter. Det er planum skråningene starter
fra, og det er ferdig nivå fallet gjelder for.

**Lagene kan variere over arealet.** En tomt har gjerne asfalt på innkjøringen, grus på
lagerplassen og betongplate under bygget. Enten må lagene kunne settes per delareal, eller
så må tomta kunne deles i flere tomter med hver sin oppbygning. Det siste er enklere og
antakelig godt nok.

---

## 8. Grunnforhold

Fjellmodellen finnes alt og virker på koordinater, ikke på stasjoner – den kan brukes rett
fram. Men `strekninger` (fra–til langs en veglinje) gir ingen mening på en tomt.

| Felt | Merknad |
|---|---|
| `standarddybde` | Som i dag |
| `rekkevidde` | Som i dag |
| `punkter` | Sonderinger, som i dag – disse er det viktigste |
| **`soner`** | **Nytt.** Polygoner med egen fjelldybde, i stedet for `strekninger`. «Her er fjell i dagen», «her er 4 m løsmasse». |
| `losmassetype` | **Nytt?** morene / leire / sand / myr. Styrer skråningshelning og `brukbarLosmasse`. |
| `grunnvannskote` | **Nytt.** Under den må det pumpes eller spuntes. Utløser en merknad, ikke et volum. |
| `kvikkleire` | **Nytt.** Utløser helt andre helninger og krever geotekniker. Bør være en ren advarsel. |

Fjelldybden er allerede den største usikkerheten i vegmodus. På en tomt er den verre,
fordi et areal har mye mer fjelloverflate enn en linje. Usikkerhetskortet som finnes i
rapporten i dag (`usikkerhetKort`) blir viktigere, ikke mindre viktig.

---

## 9. Faktorer

Uendret fra vegmodus – `sprengningsfaktor`, `fjellIFylling`, `losmasseIFylling`,
`brukbarLosmasse`. De er egenskaper ved massen, ikke ved geometrien.

Mulig tillegg: **komprimeringsgrad** per lag, hvis rapporten skal si hvor mye som må
kjøres inn i løs tilstand kontra ferdig utlagt.

---

## 10. Grenser og kontroller

Vegmodus har `Veiklasser` som setter grenser fra normalen. Tomtemodus har ikke en
tilsvarende norm, men trenger grenser likevel:

| Felt | Hva den fanger |
|---|---|
| `maksFyllingshoyde` | Finnes alt |
| `maksSkjaeringsdybde` | Finnes alt |
| `maksVeggHoyde` | Ny – utløser krav om berme |
| `minstefall` / `maksfall` | Ny – vann som blir stående, eller for bratt plass |
| `maksUtslag` | Finnes alt |
| **`holdInnenforGrense`** | **Ny og viktig.** Skråningen må ikke gå utenfor eiendomsgrensen. Dette er en juridisk grense, ikke en teknisk. |
| `grensepolygon` | Eiendomsgrensen, som kan hentes fra matrikkelen |
| `avstandTilNabo` | Minsteavstand fra veggtopp/skråningstopp til grense |

`holdInnenforGrense` er den som betyr mest i praksis. En skråning som stikker fem meter
inn på naboen er ikke et masseproblem, det er en tvist. Programmet bør merke hver kant der
utslaget krysser grensen, og «Gjør lovlig»-tanken fra vegmodus kan brukes igjen: senk
eller hev nivået til alt ligger innenfor.

---

## 11. Beregningsinnstillinger

| Felt | Standard | Merknad |
|---|---|---|
| `rutestorrelse` | 1.0 | Terrenget kommer som 1 m rutenett fra Kartverket. Finere gir ikke mer informasjon, bare mer regning. |
| `maksSokebredde` | 45 | Finnes alt – hvor langt skråningsmarsjen går |
| `beregningsbredde` | 0 | Finnes alt – avkorting |
| `bakkekorreksjon` | true | **Obs:** areal skalerer med *kvadratet* av målestokkfaktoren, ikke med faktoren. Dette må sjekkes eksplisitt – det er en stille feil hvis den brukes lineært. |

---

## 12. Objekter på tomta

Kan vente, men bør være tenkt på så datamodellen ikke stenger for det:

- **Bygg** – polygon med egen fundamentdybde. Utløser byggegrop med arbeidsbredde
  (**?** 0,8–1,0 m utenfor bygglivet), og fall bort fra veggen.
- **Ledningsgrøfter** – linjer med bredde og dybde. Egen masse.
- **Kummer og sluk** – punkter. Definerer hvor fallet går.
- **Adkomstveg inn på tomta** – kan være en veg i samme prosjekt.

---

## 13. Hva som arves fra vegmalen, og hva som skjules

**Arves uendret:** `skjaeringLosmasse`, `skjaeringFjell`, `fylling`, `renskDybde`,
`renskUtenfor`, `maksSokebredde`, `maksFyllingshoyde`, `maksSkjaeringsdybde`,
`maksUtslag`, `beregningsbredde`, alle fire faktorene, hele fjellmodellen,
`bakkekorreksjon`.

**Skjules i tomtemodus** – de gir ingen mening uten en senterlinje:
`veiklasse`, `vegbredde`, `tverrfall`, `tverrfallType`, `tverrfallRetning`,
`slitelagBredde`, `grofteDybdePlanum`, `grofteBunn`, `grofteInnerHelning`,
`breddeIKurve`, `utvidelseOvergang`, `utflatingForKurve`, `stigningIKurve`,
`lassretning`, `minRadius`, `minVertikalLavbrekk`, `minVertikalHoybrekk`,
`ensidigUnderRadius`, `ensidigMaks`, `ekstraBredde`, `sideforskyvning`.

Det er 20 felt som skal bort og omtrent 40 nye som kommer. Det taler for at tomtemalen
er en **egen** mal som *låner* de generelle feltene, ikke en vegmal med halvparten
skjult. Ellers ender skjemaet med å være fullt av felt som ikke gjelder.

---

## 14. Åpne spørsmål jeg trenger svar på

1. **Skal ett prosjekt kunne ha både veg og tomt** (alternativ B i avsnitt 1), så massene
   kan balanseres mot hverandre? Det er den avgjørelsen som styrer mest av resten.
2. **Hvilken helning setter dere på en sprengt vegg?** Loddrett, 10:1 eller 5:1? Og
   hvor høy lar dere den stå før dere legger inn en berme?
3. **Hvor mye overberg regner dere med?** Og vil dere ha det som egen linje i rapporten,
   eller bakt inn i fjellvolumet?
4. **Tar dere av matjord som egen post**, og mellomlagres den på tomta?
5. **Hvilke lag ligger under et ferdig areal hos dere** – og varierer de innenfor samme
   tomt, eller deler dere opp i flere?
6. **Har dere eiendomsgrensen tilgjengelig** når dere regner, eller er det noe som
   sjekkes etterpå? Hvis dere har den, er `holdInnenforGrense` verdt å bygge tidlig.
7. **Er masseutskifting noe dere gjør ofte nok** til at det skal være en egen arbeidstype
   fra starten, eller kan det komme senere?
