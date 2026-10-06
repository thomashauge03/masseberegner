# Rør – oversiktskart for utsetting

Dato: 2026-10-06 · Gren: `ror-oversiktskart`

## Hva brukeren ba om

> «etter vi har tatt filen inn skal vi kunne bare ta ut 1 kart med alle på og
> fargekoder i siden hva som er hvilket rør slik at dem kan se hvor det skal
> legges»
>
> «evt når du har flere typer rør kan du velge hvilke du skal ha å få samlet
> kart og i tillegg kart for hver for seg»

Brukeren har gitt fullmakt til å ta designvalgene. De står under.

## Valgene

1. **Én PDF.** Side 1 er samlekartet med alle valgte rørtyper. Deretter kommer
   én side per valgt type. Avkryssingen «Ett kart per type i tillegg» er på når
   mer enn én type er valgt.
2. **Papir:**
   - A3 liggende er standard; A4 liggende kan velges.
   - Alle sidene i en fil har samme format, slik PDF-skriveren har det.
3. **Hvilke rør:** alle røranlegg i prosjektet, både innmålte og planlagte.
   - Det aktive anlegget byttes ikke.
   - En «type» er en rørkode, som `SP 160PE` eller `VL 110PE`.
   - Kodetabellens «vis» styrer bare hva som er krysset av først. Alle koder
     står i lista.
4. **Fargene, én tabell for hele prosjektet:**
   - Hver kode får sin farge, i systemets fargefamilie:
     - spillvann brun/rød;
     - vann blå;
     - overvann grønn;
     - drens oransje;
     - felles lilla.
   - Koder uten kjent system får nøytrale, tydelig ulike farger.
   - Flere koder i samme system får ulike nyanser. Rekkefølgen er etter
     dimensjon, så samme prosjekt gir samme farger hver gang.
   - Appens egen fargetabell, som går per system og per anlegg, røres ikke.
5. **Strekene:**
   - Innmålte rør er heltrukne, planlagte er stiplet.
   - Tykkelsen følger dimensjonen, som i kartet.
   - Kummer er sirkler.
   - På typesidene står de andre rørene tynt i lys grå under, så man ser
     sammenhengen.
6. **Utsnittet:**
   - Samlekartet viser alle de valgte rørene.
   - Hver typeside viser sin type, så detaljene kommer fram.
   - Målestokken rundes til en fast rekke: 1:100, 200, 250, 500, 1000,
     2000, 2500, 5000, 10 000 og 20 000.
   - Et utsnitt er aldri mindre enn 40 m.
7. **Bakgrunnskartet:**
   - Kilden er Kartverkets åpne kartcache (`cache.kartverket.no`, WMTS) med
     UTM-flisene for sonen prosjektet regnes i (`utm32n`, `utm33n`, `utm35n`).
     Rørene ligger da i sine egne koordinater, uten omprojisering.
   - Lagene er «Gråtone» (`topograatone`, standard – fargede rør står best
     på grått), «Topografisk» (`topo`) og «Uten».
   - Flisene hentes med `fetch` (tjenesten svarer
     `Access-Control-Allow-Origin: *`), settes sammen på et lerret, og legges
     inn som JPEG.
   - Oppløsningen er om lag 150 dpi på papiret. Er det mer enn 300 fliser,
     tas nivået under.
   - Kan flisene ikke hentes, lages PDF-en uten bakgrunn. Det står på siden og
     i statuslinja.
   - «Kartgrunnlag © Kartverket» står på hver side med bakgrunn.
8. **Tegnforklaringen**, i en kolonne til høyre (95 mm på A3, 75 mm på A4):
   - For hver kode: fargestrek, koden, samlet lengde i meter, antall rør og
     om de er innmålt, planlagt eller begge.
   - Under: kum, «innmålt» heltrukken og «planlagt» stiplet.
   - Ellers: målestokk, målestokklinjal, nordpil, koordinatsystem
     (EUREF89 UTM 32/33/35), prosjektnavn, dato og sidetall.
9. **Knappen** «Oversiktskart (PDF)» står i Rør-fanen, der man er etter
   importen, og i Eksport-fanen når prosjektet har røranlegg.
   - Den åpner et valg: rørtypene med farge, lengde og avkryssing («Alle» og
     «Ingen»), «Ett kart per type i tillegg», bakgrunnskart og papir.
   - Fila heter `<prosjekt>_oversiktskart.pdf`.
10. **Ingenting endres:** ingen høyder, ingen koder, ingen farger i prosjektet.
    Kartet krever ingen ny beregning, men rørene må ha koordinater.
    - Planlagte rør uten høyde er med; de har plass, bare ikke høyde.

## Oppbygging

- **`public/js/rorkart.js` (ny, ren):**
  - `fargetabell(koder)` gir kode → `{ rgb, system, nyanse }`.
  - `utsnitt(linjer, flate)` gir omfang, målestokk og omregning til papir.
  - `velgMalestokk(spenn, flate)` velger målestokken.
  - `flisplan(utsnitt, sone, lag, dpi)` gir nivå, fliser og pikselmål.
  - `tegnSide(P, side)` tegner én side på `PdfSkriver`: ramme, bakgrunn,
    rør, kummer, tegnforklaring, linjal og nordpil.
  - `sider(data, valg)` bestemmer hvilke sider som lages.
  - Alt kan prøves i node.
- **`public/js/pdfeksport.js`:**
  - `sti(punkter, { farge, tykkelse, stiplet, rund })`: en sammenhengende
    strek med runde ledd og ender, uten hull i knekkene.
  - `sirkel(x, y, r, { fyll, strek, tykkelse })`.
  - `klipp(x, y, b, h, tegn)`: q/re/W n … Q, så bakgrunn og rør holder seg
    innenfor kartflaten.
- **`public/js/ui-rorkart.js` (ny):**
  - Samler rørene fra alle røranlegg uten å bytte aktivt:
    `byggPlan(a)` for planlagte, og
    `Ror.byggLinjer(a.ror, mal, Ror.lagTilXY(a.ror.sone, sone))` for
    innmålte, med alle koder synlige.
  - Lager dialogen, henter flisene, bygger PDF-en og laster den ned.
- **`index.html`:** knappene og skriptene.

## Prøver

- **Selvtesten:**
  - Fargetabellen: samme system gir samme familie med ulike nyanser, og
    resultatet er stabilt.
  - Målestokk og utsnitt.
  - Flisplanen: rad og kolonne for et kjent punkt i utm32n og utm33n, og
    taket på antall fliser.
  - `sti`/`sirkel`/`klipp` i PDF-skriveren gir gyldige operatorer.
  - En hel PDF med samleside og to typesider, uten bakgrunn: antall sider,
    tegnforklaringens tekster og fargene.
- **Nettleserprøven `rorOversiktskart`:**
  - Dialogen viser kodene fra to anlegg, ett innmålt og ett planlagt.
  - «Ingen» og «Alle» virker.
  - PDF-en har 1 + n sider, og typesidene har sin kode i tittelen.
  - `fetch` mot flisene er stubbet med et lite PNG, så det blir ett bilde, og
    ingen nett trengs.
  - Prosjektet er urørt etterpå: `P` og angrelista er de samme.

## Etter gjennomgangen

- **Tegnforklaringen tar med alle kodene.**
  - Er det ikke plass til to linjer hver, får hver kode én linje. Så kommer
    to kolonner.
  - Først når heller ikke det holder, står «+ N rørtyper til». På A3 skjer
    det etter 60–70 koder, på A4 etter 30–40.
  - Lange navn kortes med «...».
- **Hver kode har sin farge.** Når en familie er brukt opp, lages nye nyanser
  av den, lysere og så mørkere.
- **Bakgrunnen:**
  - Hver side har én frist, 40 s for alle flisene.
  - «Avbryt» i framdriftsboksen stopper hele hentingen.
  - Svikter én side, prøves ikke de neste.
  - En flis som svikter, prøves én gang til.
  - Hvor mange fliser som manglet, står i kartet og i statuslinja.
  - Lerretet slippes etter hver side.
- **Én henting om gangen.**
- **En innmålt kum uten rør innen 2 m** står bare på samlesiden.

## Utenfor

- Påskrift langs rørene og automatisk plassering av etiketter.
- Flyfoto, som krever avtale. «Norge i bilder» er stengt uten token.
- Blanding av stående og liggende sider i én fil.
