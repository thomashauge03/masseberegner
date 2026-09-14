'use strict';
/* Kan P.ip / P.vip / P.mal bli vinduer inn i det aktive anlegget, slik at de 212
   oppslagene i koden star uendret - og uten at speilingen havner i JSON-fila?

   DENNE FILA PRØVDE EN KOPI, IKKE PROGRAMMET.
   Her sto en egen `klargjor()` – en avskrift av aksessor-logikken i app.js –
   og fila hadde ikke ett eneste `require`. Den lastet altså ikke én linje av
   programmet. Avskriften var dessuten to felt på etterskudd: den hadde
   `['ip', 'vip', 'mal', 'tomt']` mens programmet hadde fått `tverrfall` og
   `plasser` i tillegg.

   Målt: med hele aksessor-mekanismen revet ut av app.js – `for (const felt of
   [])` – meldte denne fila fortsatt «24 ok, 0 feil». Tjuefire grønne hakk som
   ikke kunne bli røde uansett hva som skjedde med koden.

   Logikken ligger nå i `public/js/prosjektform.js`, og prøven laster den. */
const path = require('path');
const Prosjektform = require(path.join(__dirname, '..', 'public', 'js', 'prosjektform.js'));
const klargjor = P => Prosjektform.klargjor(P);

let feil = 0, ok = 0;
const sjekk = (navn, sant, detalj) => {
  if (sant) { ok++; console.log('  ok   ' + navn); }
  else { feil++; console.log('  FEIL ' + navn + (detalj ? '  ' + detalj : '')); }
};

console.log('\n1. Gammel fil apner uendret');
const gammel = klargjor({
  navn: 'veg ny ny',
  ip: [{ lat: 58.29, lon: 7.2, r: 30 }, { lat: 58.30, lon: 7.21, r: 30 }],
  vip: [{ s: 0, z: 100, k: 1 }, { s: 50, z: 105, k: 1 }],
  mal: { vegbredde: 4.5, skjaeringFjell: 0.2 }
});
sjekk('P.ip leses som for', gammel.ip.length === 2);
sjekk('P.vip leses som for', gammel.vip[1].z === 105);
sjekk('P.mal leses som for', gammel.mal.vegbredde === 4.5);
sjekk('den ble til ett veganlegg', gammel.anlegg.length === 1 && gammel.anlegg[0].type === 'veg');

console.log('\n2. Skriving gar rett i anlegget');
gammel.ip.push({ lat: 58.31, lon: 7.22, r: 30 });        // mutasjon
sjekk('mutasjon lander i anlegget', gammel.anlegg[0].ip.length === 3);
gammel.vip = [{ s: 0, z: 200, k: 0 }];                    // tilordning - den farlige
sjekk('tilordning lander ogsa i anlegget', gammel.anlegg[0].vip[0].z === 200);
sjekk('og leses tilbake riktig', gammel.vip[0].z === 200);
gammel.mal.skjaeringFjell = 0.1;
sjekk('endring i malen lander i anlegget', gammel.anlegg[0].mal.skjaeringFjell === 0.1);

console.log('\n3. JSON far ikke med speilingen');
const tekst = JSON.stringify(gammel);
sjekk('ingen "ip" pa toppniva i fila', !/^\{[^{]*"ip":/.test(tekst), tekst.slice(0, 80));
const paany = JSON.parse(tekst);
sjekk('anlegget overlevde', paany.anlegg[0].ip.length === 3);
sjekk('men aksessorene er borte etter parse', paany.ip === undefined);
klargjor(paany);
sjekk('og kommer tilbake nar den klargjores', paany.ip.length === 3);
sjekk('fila blir ikke storre av duplisering',
  tekst.indexOf('"ip"') === tekst.lastIndexOf('"ip"'), 'ip nevnt flere ganger');

console.log('\n4. To anlegg ved siden av hverandre');
const to = klargjor({
  navn: 'Ydestad', versjon: 2, aktivt: 'a1',
  anlegg: [
    { id: 'a1', type: 'veg', navn: 'Hovedveg', ip: [1, 2, 3], vip: [], mal: { vegbredde: 4.5 } },
    { id: 'a2', type: 'tomt', navn: 'Snuplass', tomt: { form: 'sirkel', radius: 12 }, mal: { rutestorrelse: 1 } }
  ],
  fjell: { standarddybde: 0.5 }, faktorer: { sprengningsfaktor: 1.5 }
});
sjekk('aktivt anlegg er vegen', to.ip.length === 3 && to.mal.vegbredde === 4.5);
to.aktivt = 'a2';
sjekk('bytte til tomta gir tomtas mal', to.mal.rutestorrelse === 1 && to.mal.vegbredde === undefined);
sjekk('og tomtas geometri', to.tomt.radius === 12);
sjekk('vegens data star urort', to.anlegg[0].ip.length === 3);
sjekk('fjell og faktorer er felles', to.fjell.standarddybde === 0.5 && to.faktorer.sprengningsfaktor === 1.5);

console.log('\n5. Angre: øyeblikksbilde og tilbakelegging');
to.aktivt = 'a1';
const bilde = JSON.stringify(to);
to.ip.push(4);
to.mal.vegbredde = 6;
sjekk('endringen er der', to.ip.length === 4 && to.mal.vegbredde === 6);
const tilbake = klargjor(JSON.parse(bilde));
sjekk('angre gir tilbake knekkpunktene', tilbake.ip.length === 3);
sjekk('angre gir tilbake malen', tilbake.mal.vegbredde === 4.5);
sjekk('angre husker hvilket anlegg som var oppe', tilbake.aktivt === 'a1');

console.log('\n6. Sammenligning for "ulagret"');
const a = klargjor(JSON.parse(JSON.stringify(to)));
const b = klargjor(JSON.parse(JSON.stringify(to)));
sjekk('like prosjekter gir lik tekst', JSON.stringify(a) === JSON.stringify(b));
b.ip.push(9);
sjekk('en endring gir ulik tekst', JSON.stringify(a) !== JSON.stringify(b));

/* ==================================================================
   7. HVERT FELT I LISTA ER ET EKTE VINDU

   Prøvene over dekker `ip`, `vip`, `mal` og `tomt` – nøyaktig de fire den
   gamle avskriften hadde. `tverrfall` og `plasser` kom til senere, og ingen
   prøvde dem: det var derfor avskriften kunne drive fra programmet uten at noe
   sa fra.

   Denne bolken går gjennom `Prosjektform.FELT` i stedet for en liste skrevet av
   for hånd. Da kan ikke et nytt felt legges til uten å bli prøvd – lista er den
   samme som koden bruker, ikke en kopi av den.
   ================================================================== */
console.log('\n7. Hvert felt i lista er et ekte vindu');
{
  /* LØKKA UNDER GÅR OVER DEN SAMME LISTA SOM KODEN BRUKER, og det er med vilje:
     den prøver at hvert felt OPPFØRER SEG som et vindu. Men nettopp derfor kan
     den ikke se at et felt er FJERNET – da faller det bare ut av løkka, og
     prøven blir grønn på et program som har mistet et vindu.

     Derfor står forventningen her, som en SPESIFIKASJON og ikke som en avskrift
     av implementasjonen. Forskjellen er hva den sier: lista i koden sier «slik
     er det gjort», denne sier «dette trenger programmet». Faller et av dem bort,
     skal noen ta stilling til det – ikke oppdage det på en tomt.

     Målt: uten `plasser` i koden fanger denne raden det; løkka alene gjorde det
     ikke. */
  const MAA_FINNAST = ['ip', 'vip', 'mal', 'tomt', 'tverrfall', 'plasser'];
  const har = new Set(Prosjektform.FELT || []);
  const mangler = MAA_FINNAST.filter(f => !har.has(f));
  sjekk('alle feltene programmet trenger er vinduer', mangler.length === 0,
    mangler.length ? 'mangler: ' + mangler.join(', ') : '');

  for (const felt of Prosjektform.FELT) {
    const P = klargjor({
      navn: 'to anlegg',
      anlegg: [
        { id: 'v1', type: 'veg', navn: 'Veg', ip: [], vip: [], mal: {} },
        { id: 't1', type: 'tomt', navn: 'Tomt', ip: [], vip: [], mal: {}, tomt: { punkter: [] } }
      ],
      aktivt: 'v1'
    });

    /* LESE: feltet skal hente fra det anlegget som er oppe, ikke fra noe annet. */
    const merke = { _merke: felt };
    P.anlegg[0][felt] = merke;
    sjekk(`«${felt}» leses fra det aktive anlegget`, P[felt] === merke,
      String(P[felt] && P[felt]._merke));

    /* SKRIVE: en tilordning skal lande i anlegget, ikke på prosjektet. */
    const nytt = { _merke: felt + '-nytt' };
    P[felt] = nytt;
    sjekk(`  og en tilordning lander i anlegget`, P.anlegg[0][felt] === nytt);

    /* BYTTE ANLEGG: feltet skal følge med til det nye. */
    P.aktivt = 't1';
    sjekk(`  og feltet følger anleggsbyttet`, P[felt] !== nytt,
      `fikk fortsatt ${P[felt] && P[felt]._merke}`);

    /* IKKE I FILA: speilingen skal aldri havne i JSON. */
    const tekst = JSON.stringify(P);
    sjekk(`  og «${felt}» står ikke på toppnivå i fila`,
      !new RegExp('^\\{[^{]*"' + felt + '"').test(tekst), tekst.slice(0, 70));
  }
}

console.log('\n' + ok + ' ok, ' + feil + ' feil');
process.exit(feil ? 1 : 0);
