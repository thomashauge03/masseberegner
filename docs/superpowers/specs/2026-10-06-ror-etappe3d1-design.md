# Rør, etappe 3d-1: kummer i 3D, trykkrør med høybrekk og fallkrav, grøftekasse og spunt

Dato: 2026-10-06 · Gren: `ror-etappe3d1`

Det som står igjen av «Utenfor 3a» (FORTSETTELSE.md) er fem ting. De er delt i to.

- 3d-1, dette: kummer i 3D, fallkrav for trykkrør, grøftekasse og spunt.
- 3d-2: import av traseer fra DXF/KOF, og optimalisering av høydene på knapp.

Brukeren har gitt fullmakt til å ta valgene. **Alt som endrer høyder, ligger
på knapper. Innmålte høyder endres aldri automatisk.** Ingenting her endrer
høyder.

## 1. Kummer i 3D

Kummene står i dag som en firkant i kartet, en boks i profilen og en grop i
grøfta. I 3D finnes de ikke, og der rørene møtes, mangler det man ser først
på plassen.

- **Tegnede kummer** (`res.kummer`) står som sylindre:
  - fra bunnen av kumgropa (bunnløp − 0,25 m) opp til terrenget;
  - diameteren er kummens;
  - mørk ring øverst og nederst, fire loddrette sider.
- **Innmålte kum-punkt** (koder med «KUM» i `res.bygg.objekter`): høyden
  er det som ble målt, så de står som en ring på 1 m der.
- **Laget «Kummer»** i 3D-verktøylinja er på fra start.
- **Kameraet** rammer inn også kumbunnen (`lav`), så en dyp kum ikke kappes.

## 2. Trykkrør: høybrekk, lavbrekk og fallkrav

Selvfallsrør har minste og største fall. Trykkrør har ingenting: de følger
terrenget med overdekningen, og kontrollen hopper over dem.

Det som teller for et trykkrør, er der luft samler seg og der det må tømmes:
- **Høybrekk:** et høyeste punkt som ligger minst `brekk` meter over
  lavpunktene på begge sider. Standard er 0,3 m, lagret i `mal.plan.brekk`.
  Det gir merknaden «høybrekk ved X m – luft samler seg».
- **Lavbrekk** gjøres likt og gir merknaden «lavbrekk ved X m – tømming».
- Endene teller ikke.
- Brekkene finnes med terskel, ikke punkt for punkt. Profilen følger
  terrenget meter for meter, og hver tue ville ellers blitt et brekk.
- Et flatt topp eller en flat dal er et brekk midt på.

**Fallkravet:**
- Mellom to brekk, eller mellom et brekk og en ende, er fallet
  høydeforskjellen delt på lengden.
- Ligger fallet under kravet, kommer merknaden «flatt: X ‰ på a–b m – under
  Y ‰».
- Kravet er kodens `minFall` når koden er et trykkrør, ellers anleggets
  `mal.plan.trykkMinFall`. Standard er 0, som slår kravet av.
- Feltene i Koder-fanen gjelder da også trykkrør. Fallet er avstand og
  høyde langs røret – retningen spiller ingen rolle for trykk.

**Hvor det vises:**
- Merknadene får typene `hoybrekk`, `lavbrekk` og `fall`.
- Profilen markerer brekkene.
- Kartet har ringene som for andre merknader.
- Rapporten og PDF-en lister dem som de andre.

**Innstillingene** står i Rør-fanen for et tegnet anlegg: «Høybrekk fra
(m)» og «Minste fall for trykkrør (‰)». De lagres, valideres
(`GRENSER.brekk` 0,05–5, `trykkMinFall` 0–1000) og kan angres.

## 3. Grøftekasse og spunt

Grøfta graves i dag med skråning, eller loddrett når helningen settes til 0.
Med kasse eller spunt står veggene loddrett, og det som skal faktureres, er
noe annet.

**Strekningen** («⊓ Grøft på strekning») får et nytt valg, «Avstiving»:
- **Ingen** – som nå.
- **Grøftekasse:**
  - loddrette vegger i kassebredden, som brukeren setter (standard 1,2 m
    innvendig);
  - er røret med arbeidsrom bredere enn kassa, er det den bredden som
    gjelder, med en merknad;
  - mengden er meter grøft med kasse.
- **Spunt:**
  - loddrette vegger i bunnbredden (D + 2 × bunntillegget);
  - mengden er spuntareal, to sider × dybden fra terreng til gravebunn, i
    m².

**Graving:** veggene er loddrette, så ingenting graves utenfor bredden.

**Avstivingssonen:** rundt en strekning med kasse eller spunt ligger en
sone. Sonen er den naturlige gropa: der grøfta ville gått med skråning, fra
bunnbredden uten avstiving. I sonen graver ingen skråning fra samme grøft:
- røret selv – enden av den åpne grøfta før kassa graver ikke en halv kjegle
  inn langs kassa;
- kummene og tverrstrekene røret har;
- naboen i felles grøft, som skråner ikke inn over kassa.

**Andre rør** – et som krysser, slutter like ved eller ligger i en egen grøft
ved siden av – er sin egen grøft og beholder skråningen. Skal den avstives,
settes avstiving på den strekningen også.

Formen på sonen:
- langs strekningen er den et bånd som slutter rett av endene. Grøfta før
  kassa beholder dermed skråningen sin helt fram;
- der sonen går videre fra ett segment til det neste, er skjøten rund, så
  yttersida av en knekk er med;
- rundt en kum med kasse er den en sirkel. Et segment uten lengde (to punkt
  på samme sted) har ingen sone.

**Fjell:** i fjell står veggene loddrett fra før.

**Felles grøft:** står flere rør i samme grøft, og ett av dem har kasse på
strekningen, får hele grøfta kasse der. Det er grøfta som avstives, ikke
røret. Naboen får sonen langs den delen som går langs kassa, med sin egen
rekkevidde, så også yttersida dens står loddrett.
- Langs er der tverrstrekene går, meter for meter, og en meter på naboen
  avgjøres midt i den.
- En nabo som bøyer av, er med til den er lenger unna enn felles grøft
  rekker (10 m).
- Står kasse og spunt mot samme nabo, gjelder spunten.
- Har det ene røret kasse og det andre spunt, telles det som står på røret
  som har meteren.

**Samme grøft eller ikke:** hvilke rør som ligger i samme grøft, avgjøres
som om det ikke var noen avstiving. Kassa gjør veggene loddrette, men det er
fortsatt den samme grøfta. Uten denne regelen nådde ingen av to rør side om
side inn til det andre, og kassa doblet grøftelengden.

**Kummene:** en kumgrop med kasse eller spunt på begge sider får loddrette
vegger. Arbeidsrommet rundt kummen er det samme. Står kummen i overgangen,
hører den til den åpne grøfta, og sonen til kassa tar skråningen på den
siden.

**Mengdene telles én gang per meter grøft:**
- på røret som har meteren, når grøfta er avstivet der – også om det er
  naboen til kassa i en felles grøft;
- har et rør med kasse gitt meteren til et dypere rør uten, telles kassa på
  røret som har kassa.

**Avstivingen holder løsmassen:**
- spunten går fra terrenget ned til gravebunnen, eller ned til fjellet, der
  den stopper;
- står veggen i fjell hele veien opp, telles verken kasse eller spunt.

**Dialogen** sier fra om et tall den ikke kan bruke, for eksempel en
kassebredde under 0,3 m. Den lagrer ikke, og tallet byttes ikke stille mot
standarden.

**Mengdene står** i:
- grøftesummen (`kasseLengde`, `spuntAreal`);
- tabellen per kode;
- rapporten, PDF-en og CSV-en «Grøftemasser per kode». I CSV-en står
  kolonnene `Kasse_m` og `Spunt_m2` til sist, så kolonnene foran står der de
  alltid har stått.

**Lagringen:** strekningens `avstiving: 'kasse'|'spunt'` og `kassebredde`
valideres i `_rettGroft`. Ukjente verdier faller bort.

## Prøver

- **Groft** (test/groftprove.js):
  - kasse gir loddrette vegger og bredde lik kassa;
  - volumet blir mindre enn med skråning;
  - kasselengden er lik strekningen;
  - spuntarealet er 2 × dybde × lengde på flat mark;
  - grøfta før kassa skråner helt fram, men ikke inn langs kassa;
  - en nabo i felles grøft står loddrett også på yttersida, og kassa telles
    én gang;
  - en nabo som bøyer av, får kassa bare der den går langs;
  - to rør i samme grøft uten «felles grøft»: kassa på det grunne telles
    der, og én gang også når begge har kasse;
  - yttersida av naboens hjørne er med i sonen;
  - det som ikke hører til grøfta, er urørt: en egen grøft ved siden av, og
    et rør som slutter like ved;
  - et dobbeltpunkt i overgangen gir samme grøft fra hvilket av punktene;
  - spunt og fjell;
  - ulike kassebredder gir hver sin merknad;
  - alle segmentene har de samme feltene, så grøfta ikke blir treg;
  - kumgropa i kassa står loddrett, og kummen i overgangen hører til den
    åpne grøfta;
  - et rør bredere enn kassa gir en merknad;
  - prosjektfila: ukjent avstiving og kassebredde utenfor grensene faller
    bort.
- **RorPlan** (test/rorplanprove.js):
  - et trykkrør over en kolle gir ett høybrekk, ikke ett per tue;
  - en dal gir et lavbrekk;
  - et flatt strekk under kravet gir en merknad;
  - kravet 0 gir ingen;
  - endene teller ikke;
  - et selvfallsrør får ingen brekk;
  - en selvfallskode satt til trykk tar ikke med seg selvfallskravet.
- **Nettleseren:**
  - kummene tegnes i 3D, og laget kan slås av;
  - avstivingen i strekningsdialogen lagres og kan angres;
  - mengdene står i rapporten;
  - innstillingene for trykk i Rør-fanen lagres og kan angres;
  - brekkene står i profilen.
