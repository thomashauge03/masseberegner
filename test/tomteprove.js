'use strict';
/**
 * Tomteberegningen mot fasit man kan regne ut for hand.
 *
 *   node test/tomteprove.js
 *
 * Alle fasitene her er lukkede formler - ikke tall hentet fra en tidligere
 * kjøring. En prøve som bare sammenligner med det programmet selv sa sist,
 * fanger ingenting; den fryser bare feilen.
 */
const path = require('path');
const T = require(path.join(__dirname, '..', 'public', 'js', 'tomtmasser.js'));
const Tomt = require(path.join(__dirname, '..', 'public', 'js', 'tomt.js'));
const M = require(path.join(__dirname, '..', 'public', 'js', 'masser.js'));

let feil = 0, ok = 0;
const fmt = v => (Math.abs(v) >= 1000 ? v.toFixed(1) : v.toPrecision(6));
function sjekk(navn, faktisk, ventet, toleranse) {
  const d = Math.abs(faktisk - ventet);
  if (d <= toleranse) { ok++; console.log(`  ok   ${navn}  (${fmt(faktisk)} ≈ ${fmt(ventet)})`); }
  else { feil++; console.log(`  FEIL ${navn}  fikk ${fmt(faktisk)}, ventet ${fmt(ventet)} (avvik ${fmt(d)}, grense ${toleranse})`); }
}
function paastand(navn, sant, detalj) {
  if (sant) { ok++; console.log(`  ok   ${navn}`); }
  else { feil++; console.log(`  FEIL ${navn}${detalj ? '  ' + detalj : ''}`); }
}

/** Et rektangel med hjørne i origo. */
const rektangel = (b, l) => [{ x: 0, y: 0 }, { x: b, y: 0 }, { x: b, y: l }, { x: 0, y: l }];

const grunnmal = () => Object.assign({}, Tomt.StandardTomtemal, {
  matjordDybde: 0, renskDybde: 0, slitelagTykkelse: 0, baerelagTykkelse: 0,
  forsterkningslag: 0, frostsikring: 0, avrettingslag: 0, overberg: 0,
  maksSokebredde: 60, maksSkjaeringsdybde: 0, maksFyllingshoyde: 0, maksVeggHoyde: 0,
  minAvstandTilBerg: 0
});

const kjor = (o) => T.beregnTomtemasser(Object.assign({
  mal: grunnmal(),
  fjell: new M.Fjellmodell({ standarddybde: 100 }),   // fjellet langt nede
  rutestorrelse: 0.5, bakkefaktor: 1
}, o));

/* ------------------------------------------------------------------ */
console.log('\n1. Flatt terreng, flatt nivå – rene tall');
{
  /* Terreng pa kote 100, ferdig niva pa kote 98, ingen overbygning.
     Da er hele tomta 2 m skjæring: 40 x 60 x 2 = 4800 m³.
     Utenfor kanten stiger skraningen 1:2,5 (morene) opp til terrenget, som
     ligger 2 m over planum - altsa gar den 5 m ut hele veien rundt.

     Skraningsvolumet er en trekantprisme langs hver kant pluss en kjegle i
     hvert hjørne. Kjeglene til sammen blir én hel kjegle, siden ytre vinkler
     i et rektangel summerer til 360 grader.
       kanter:  omkrets x (1/2 x 5 x 2)          = 200 x 5      = 1000 m³
       hjørner: kjegle,  (1/3) x pi x 5² x 2     = 52,36 m³
     Til sammen 4800 + 1000 + 52,36 = 5852,36 m³. */
  const r = kjor({
    tomt: { punkter: rektangel(40, 60), kanter: [], nivaa: { modus: 'flat', kote: 98 } },
    terreng: { z: () => 100 }
  });
  const kant = 200 * 0.5 * 5 * 2;
  const hjorne = Math.PI * 25 * 2 / 3;
  sjekk('arealet er 2400 m²', r.areal, 2400, 3);
  sjekk('skjæring i tomta + skråning', r.sum.skjaering, 4800 + kant + hjorne, 60);
  sjekk('ingen fylling', r.sum.fylling, 0, 1e-9);
  sjekk('alt er løsmasse', r.sum.skjaeringLosmasse, r.sum.skjaering, 1e-6);
  sjekk('ingen fjellskjæring', r.sum.skjaeringFjell, 0, 1e-9);
  paastand('ingen merknader', r.merknader.length === 0, JSON.stringify(r.merknader));
}

/* ------------------------------------------------------------------ */
console.log('\n2. Ren fylling – speilbildet');
{
  // terreng pa 98, niva pa 100: 2 m fylling over hele, skraning 1:2 ned igjen
  const r = kjor({
    tomt: { punkter: rektangel(40, 60), kanter: [], nivaa: { modus: 'flat', kote: 100 } },
    terreng: { z: () => 98 }
  });
  const kant = 200 * 0.5 * 4 * 2;                 // 1:2 -> 4 m ut
  const hjorne = Math.PI * 16 * 2 / 3;
  sjekk('fyllingen', r.sum.fylling, 4800 + kant + hjorne, 60);
  sjekk('ingen skjæring', r.sum.skjaering, 0, 1e-9);
}

/* ------------------------------------------------------------------ */
console.log('\n3. Skrått terreng – halvt skjæring, halvt fylling');
{
  /* Terrenget faller 1 m per 10 m i x-retning: z = 100 - x/10.
     Tomta er 40 m bred, sa terrenget gar fra 100 til 96 over den.
     Ferdig niva pa 98 skjærer terrenget midt pa, ved x = 20.
     Inne i tomta: skjæring pa venstre halvdel, fylling pa høyre, og begge er
     en trekant med grunnflate 20 m og høyde 2 m over 60 m lengde:
       0,5 x 20 x 2 x 60 = 1200 m³ hver. */
  const r = kjor({
    tomt: { punkter: rektangel(40, 60), kanter: [], nivaa: { modus: 'flat', kote: 98 } },
    terreng: { z: (x) => 100 - x / 10 }
  });
  paastand('bade skjæring og fylling', r.sum.skjaering > 1000 && r.sum.fylling > 1000,
    `skjæring ${r.sum.skjaering.toFixed(0)}, fylling ${r.sum.fylling.toFixed(0)}`);
  // inne i tomta skal de to vaere like store; skraningene utenfor er ulike
  sjekk('dypeste skjæring er 2 m', r.dypesteSkjaering, 2, 0.3);
  sjekk('høyeste fylling er 2 m', r.hoyesteFylling, 2, 0.3);
}

/* ------------------------------------------------------------------ */
console.log('\n4. Fjell under – skjæringen deles');
{
  /* Terreng 100, fjell 1 m under (kote 99), ferdig niva 97.
     Da er øverste meter løsmasse og nederste meter fjell, over hele tomta:
       løsmasse 2400 x 1 = 2400 m³, fjell 2400 x 1 = 2400 m³ - inne i tomta.
     Utenfor kommer skraningen i tillegg, og der er bergveggen bratt. */
  const mal = Object.assign(grunnmal(), { skjaeringLosmasse: 2, skjaeringFjell: 0.2 });
  const r = T.beregnTomtemasser({
    tomt: { punkter: rektangel(40, 60), kanter: [], nivaa: { modus: 'flat', kote: 97 } },
    mal, terreng: { z: () => 100 },
    fjell: new M.Fjellmodell({ standarddybde: 1 }),
    rutestorrelse: 0.5, bakkefaktor: 1
  });
  paastand('summen stemmer med delene',
    Math.abs(r.sum.skjaering - (r.sum.skjaeringFjell + r.sum.skjaeringLosmasse)) < 1e-6);
  paastand('bade fjell og løsmasse', r.sum.skjaeringFjell > 2000 && r.sum.skjaeringLosmasse > 2000,
    `fjell ${r.sum.skjaeringFjell.toFixed(0)}, løs ${r.sum.skjaeringLosmasse.toFixed(0)}`);
  /* Fra kote 100 ned til 97 er det 3 m. Fjelloverflaten ligger pa 99, sa
     øverste meter er løsmasse og de to nederste er fjell:
       inne i tomta   2400 x 2                       = 4800 m³
     Utenfor kanten star bergveggen 0,2 m ut per meter høyde, altsa 0,4 m ut
     for de to meterne. Det gir en trekantprisme langs omkretsen:
       band           200 x (0,5 x 0,4 x 2)          = 80 m³
     Til sammen 4880 m³. */
  sjekk('fjell = to meter i tomta pluss båndet utenfor', r.sum.skjaeringFjell, 4880, 60);
  /* Løsmassen, regnet i tverrsnittet utenfor kanten:
       d = 0 .. 0,4 m   bergveggen stiger fra 97 til 99. Over den ligger
                        løsmassen 99 -> 100, altsa 1 m tykk over 0,4 m bredde
                                                                   = 0,40 m²
       d = 0,4 .. 2,4   skraningen 1:2 gar fra 99 opp til terrenget 100.
                        Løsmassen er 1 - (d-0,4)/2, integrert over 2 m
                                                                   = 1,00 m²
       til sammen 1,4 m² per meter kant x 200 m omkrets            = 280 m³
     Hjørnene til sammen er én full omdreining av det samme tverrsnittet.
     Pappus: V = 2 pi x tyngdepunktavstand x areal = 2 pi x 0,8 x 1,4 ≈ 7 m³.
     Inne i tomta ligger det 1 m løsmasse over 2400 m²             = 2400 m³
     Til sammen 2687 m³. */
  sjekk('løsmasse = én meter i tomta pluss skråningen over berget',
    r.sum.skjaeringLosmasse, 2400 + 280 + 7, 25);
}

/* ------------------------------------------------------------------ */
console.log('\n5. Sprengt vegg mot planert skråning');
{
  /* Samme tomt to ganger, én med alle kanter som skraning og én med alle som
     sprengt vegg. Veggen skal gi MINDRE masse, fordi den star nær loddrett i
     stedet for a legge seg utover. Det er hele poenget med a sprenge en vegg:
     man slipper a ta ut skraningen. */
  const felles = { punkter: rektangel(40, 60), nivaa: { modus: 'flat', kote: 96 } };
  const terreng = { z: () => 100 };
  const fjell = new M.Fjellmodell({ standarddybde: 0 });     // berg i dagen
  const mal = Object.assign(grunnmal(), { skjaeringLosmasse: 2, skjaeringFjell: 2 });

  const skraaning = T.beregnTomtemasser({
    tomt: Object.assign({ kanter: [] }, felles), mal, terreng, fjell,
    rutestorrelse: 0.5, bakkefaktor: 1
  });
  const vegg = T.beregnTomtemasser({
    tomt: Object.assign({}, felles, { kanter: [0, 1, 2, 3].map(() => ({ type: 'fjellvegg' })) }),
    mal: Object.assign({}, mal, { veggHelning: 0.1, losmasseOverFjell: 2 }),
    terreng, fjell, rutestorrelse: 0.5, bakkefaktor: 1
  });
  paastand('sprengt vegg gir mindre masse enn planert skråning',
    vegg.sum.skjaering < skraaning.sum.skjaering,
    `vegg ${vegg.sum.skjaering.toFixed(0)}, skråning ${skraaning.sum.skjaering.toFixed(0)}`);
  /* Med berg i dagen og 4 m dyp skjæring er forskjellen den skraningen man
     slipper: 1:2 gar 8 m ut, 10:1 gar 0,4 m ut. Per meter kant er det
     0,5 x (8 - 0,4) x 4 = 15,2 m², over 200 m = 3040 m³ pluss hjørner. */
  sjekk('forskjellen er skråningen man slipper',
    skraaning.sum.skjaering - vegg.sum.skjaering, 200 * 0.5 * (8 - 0.4) * 4, 400);
  sjekk('begge har 4 m i selve tomta', vegg.sum.skjaering, 2400 * 4, 300);
}

/* ------------------------------------------------------------------ */
console.log('\n6. Åpen kant regner ingenting utenfor');
{
  const felles = { punkter: rektangel(40, 60), nivaa: { modus: 'flat', kote: 98 } };
  const terreng = { z: () => 100 };
  const alle = kjor({ tomt: Object.assign({ kanter: [] }, felles), terreng });
  const apen = kjor({
    tomt: Object.assign({}, felles, { kanter: [0, 1, 2, 3].map(() => ({ type: 'apen' })) }),
    terreng
  });
  sjekk('apen kant gir bare tomta selv', apen.sum.skjaering, 2400 * 2, 20);
  paastand('og det er mindre enn med skråninger', apen.sum.skjaering < alle.sum.skjaering);
}

/* ------------------------------------------------------------------ */
console.log('\n7. Lagene under ferdig nivå');
{
  const mal = Object.assign(grunnmal(), {
    matjordDybde: 0.25, slitelagTykkelse: 0.05, baerelagTykkelse: 0.10,
    forsterkningslag: 0.40, frostsikring: 0.30, avrettingslag: 0.03
  });
  const r = T.beregnTomtemasser({
    tomt: { punkter: rektangel(40, 60), kanter: [], nivaa: { modus: 'flat', kote: 98 } },
    mal, terreng: { z: () => 100 }, fjell: new M.Fjellmodell({ standarddybde: 100 }),
    rutestorrelse: 0.5, bakkefaktor: 1
  });
  sjekk('slitelag = 2400 x 0,05', r.sum.slitelag, 2400 * 0.05, 2);
  sjekk('bærelag = 2400 x 0,10', r.sum.baerelag, 2400 * 0.10, 3);
  sjekk('forsterkningslag = 2400 x 0,40', r.sum.forsterkningslag, 2400 * 0.40, 12);
  sjekk('frostsikring = 2400 x 0,30', r.sum.frostsikring, 2400 * 0.30, 9);
  sjekk('avretting = 2400 x 0,03', r.sum.avrettingslag, 2400 * 0.03, 2);
  sjekk('overbygningen er summen av lagene', r.overbygning, 0.05 + 0.10 + 0.40 + 0.30 + 0.03, 1e-9);
  /* Overbygningen senker planum, sa skjæringen blir dypere: 2 m + 0,88 m. */
  sjekk('planum ligger under ferdig nivå', r.dypesteSkjaering, 2 + 0.88, 0.3);
  paastand('matjord tas av over hele tomta og skråningene', r.sum.matjord > 2400 * 0.25,
    r.sum.matjord.toFixed(0) + ' m³');
}

/* ------------------------------------------------------------------ */
console.log('\n8. Fall på det ferdige nivået');
{
  /* 2 % fall mot sør (fallretning 180). Over 60 m i y-retning gir det 1,2 m
     forskjell. Midlere kote er den samme som den flate, sa volumet skal vaere
     omtrent likt - men dypeste skjæring skal vaere større. */
  const flat = kjor({
    tomt: { punkter: rektangel(40, 60), kanter: [], nivaa: { modus: 'flat', kote: 98 } },
    terreng: { z: () => 100 }
  });
  const skratt = kjor({
    tomt: { punkter: rektangel(40, 60), kanter: [],
      nivaa: { modus: 'fall', kote: 98, fall: 0.02, fallretning: 180 } },
    terreng: { z: () => 100 }
  });
  sjekk('samme midlere kote gir omtrent samme volum', skratt.sum.skjaering, flat.sum.skjaering, 120);
  paastand('men fallet gir dypere skjæring i den ene enden',
    skratt.dypesteSkjaering > flat.dypesteSkjaering + 0.4,
    `${skratt.dypesteSkjaering.toFixed(2)} mot ${flat.dypesteSkjaering.toFixed(2)}`);

  /* Fallretningen ma peke dit vannet renner. 180 grader er sør, altsa mot
     synkende y. Da skal nivaet vaere HØYEST i nord. Bytter man sin og cos i
     formelen, faller flaten nitti grader feil - og volumet blir det samme, sa
     feilen synes ikke i tallene. */
  const n = { modus: 'fall', kote: 98, fall: 0.02, fallretning: 180 };
  const ref = { x: 20, y: 30 };
  const nord = T.nivaaVed(n, 20, 60, ref);
  const sor = T.nivaaVed(n, 20, 0, ref);
  const ost = T.nivaaVed(n, 40, 30, ref);
  paastand('fall mot sør gir høyest nivå i nord', nord > sor, `nord ${nord}, sør ${sor}`);
  sjekk('og ingen forskjell øst-vest', ost, 98, 1e-9);
  sjekk('høydeforskjellen er 2 % av 60 m', nord - sor, 1.2, 1e-9);
}

/* ------------------------------------------------------------------ */
console.log('\n9. Hjørnene: vifte ute, trimming inne');
{
  /* En L-formet tomt har bade konvekse og konkave hjørner. Uten trimming i det
     konkave hjørnet ville skraningene overlappet, og volumet blitt talt to
     ganger. Avstandsflaten gjør trimmingen av seg selv - derfor kan volumet
     aldri bli større enn det samme omrisset uten innhukk. */
  const L = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 20 },
    { x: 20, y: 20 }, { x: 20, y: 40 }, { x: 0, y: 40 }];
  const kvadrat = rektangel(40, 40);
  const rL = kjor({ tomt: { punkter: L, kanter: [], nivaa: { modus: 'flat', kote: 98 } },
    terreng: { z: () => 100 } });
  const rK = kjor({ tomt: { punkter: kvadrat, kanter: [], nivaa: { modus: 'flat', kote: 98 } },
    terreng: { z: () => 100 } });
  sjekk('L-tomta har 1200 m²', rL.areal, 1200, 3);
  paastand('L-tomta gir mindre masse enn kvadratet den er klipt ut av',
    rL.sum.skjaering < rK.sum.skjaering,
    `L ${rL.sum.skjaering.toFixed(0)}, kvadrat ${rK.sum.skjaering.toFixed(0)}`);
  /* Selve tomta er 1200 x 2 = 2400 m³. Resten er skraning. Overlappet i det
     konkave hjørnet ville lagt pa flere titalls kubikk om det ble talt to
     ganger - kontrollen er at volumet ligger under en øvre grense: omrisset
     er 160 m langt, og en 5 m skraning rundt hele gir høyst 160 x 5 = 800 m³
     pluss hjørnene. */
  paastand('ingen dobbelttelling i det konkave hjørnet',
    rL.sum.skjaering < 2400 + 800 + 60,
    `${rL.sum.skjaering.toFixed(0)} mot øvre grense ${2400 + 800 + 60}`);
}

/* ------------------------------------------------------------------ */
console.log('\n10. Rutestørrelsen skal ikke flytte svaret');
{
  const lag = rute => kjor({
    tomt: { punkter: rektangel(40, 60), kanter: [], nivaa: { modus: 'flat', kote: 98 } },
    terreng: { z: () => 100 }, rutestorrelse: rute
  });
  const grov = lag(2), fin = lag(0.25);
  const rel = Math.abs(grov.sum.skjaering - fin.sum.skjaering) / fin.sum.skjaering;
  paastand('2 m og 0,25 m rutenett gir samme svar innenfor 2 %', rel < 0.02,
    `${grov.sum.skjaering.toFixed(0)} mot ${fin.sum.skjaering.toFixed(0)} (${(rel * 100).toFixed(2)} %)`);
}

/* ------------------------------------------------------------------ */
console.log('\n11. Det som ikke lar seg regne');
{
  const r1 = T.beregnTomtemasser({
    tomt: { punkter: rektangel(40, 60), kanter: [], nivaa: { modus: 'flat', kote: null } },
    mal: grunnmal(), terreng: { z: () => 100 },
    fjell: new M.Fjellmodell({ standarddybde: 5 }), rutestorrelse: 1, bakkefaktor: 1
  });
  paastand('uten kote sier den fra i stedet for a gi null',
    r1.merknader.some(m => /kote/.test(m.tekst)), JSON.stringify(r1.merknader));

  const r2 = kjor({
    tomt: { punkter: [{ x: 0, y: 0 }, { x: 10, y: 0 }], kanter: [], nivaa: { modus: 'flat', kote: 98 } },
    terreng: { z: () => 100 }
  });
  paastand('to hjørner er ikke en tomt', r2.merknader.some(m => /tre hjørner/.test(m.tekst)));

  const r3 = kjor({
    tomt: { punkter: rektangel(40, 60), kanter: [], nivaa: { modus: 'flat', kote: 98 } },
    terreng: { z: () => null }
  });
  paastand('uten terrengdata blir alt null og det blir meldt fra',
    r3.sum.skjaering === 0 && r3.merknader.some(m => m.type === 'data'),
    JSON.stringify(r3.merknader));

  const r4 = kjor({
    tomt: { punkter: rektangel(40, 60), kanter: [], nivaa: { modus: 'flat', kote: 98 } },
    terreng: { z: (x, y) => (x > 20 ? NaN : 100) }
  });
  paastand('halvt datahull gir tall og merknad',
    Number.isFinite(r4.sum.skjaering) && r4.sum.skjaering > 0 && r4.merknader.some(m => m.type === 'data'));
}

/* ------------------------------------------------------------------ */
console.log('\n12. Grensene sier fra');
{
  const mal = Object.assign(grunnmal(), {
    maksSkjaeringsdybde: 3, maksFyllingshoyde: 3, maksVeggHoyde: 5, minAvstandTilBerg: 0.75
  });
  const r = T.beregnTomtemasser({
    tomt: { punkter: rektangel(40, 60),
      kanter: [0, 1, 2, 3].map(() => ({ type: 'fjellvegg' })),
      nivaa: { modus: 'flat', kote: 92 } },
    mal, terreng: { z: () => 100 },
    fjell: new M.Fjellmodell({ standarddybde: 0 }), rutestorrelse: 1, bakkefaktor: 1
  });
  paastand('for dyp skjæring blir meldt', r.merknader.some(m => m.type === 'skjaering'));
  paastand('for høy bergvegg blir meldt', r.merknader.some(m => m.type === 'vegg'),
    JSON.stringify(r.merknader.map(m => m.type)));
  paastand('sikringskravet blir meldt', r.merknader.some(m => m.type === 'sikring'));
}

/* ------------------------------------------------------------------ */
console.log('\n13. Bakkefaktoren i annen potens');
{
  const en = kjor({
    tomt: { punkter: rektangel(40, 60), kanter: [], nivaa: { modus: 'flat', kote: 98 } },
    terreng: { z: () => 100 }, bakkefaktor: 1
  });
  const to = kjor({
    tomt: { punkter: rektangel(40, 60), kanter: [], nivaa: { modus: 'flat', kote: 98 } },
    terreng: { z: () => 100 }, bakkefaktor: 1.001
  });
  /* Arealet skal ga opp med kvadratet, ikke med faktoren. Brukes den lineært,
     blir feilen halvparten sa stor - og det er en feil ingen ser. */
  sjekk('arealet skalerer med kvadratet', to.areal / en.areal, 1.001 * 1.001, 1e-9);
  sjekk('volumet ogsa', to.sum.skjaering / en.sum.skjaering, 1.001 * 1.001, 1e-9);
}

/* ------------------------------------------------------------------ */
console.log('\n14. Omrisset: fortegn, tyngdepunkt og hvilken vei som er ut');
{
  /* Rektangelet er listet mot klokka. Skolisseformelen skal da gi positivt
     areal, og normalene skal peke UT av tomta. Peker de innover, marsjerer
     skraningen inn i tomta og spiser av arealet i stedet for a legge seg
     utenfor - og volumet blir feil uten at noe ser galt ut. */
  const r = rektangel(40, 60);
  sjekk('mot klokka gir positivt areal', Math.sign(Tomt.signertAreal(r)), 1, 0);
  sjekk('med klokka gir negativt', Math.sign(Tomt.signertAreal(r.slice().reverse())), -1, 0);
  sjekk('arealet er 2400 uansett vei', Tomt.areal(r.slice().reverse()), 2400, 1e-9);

  const tp = Tomt.tyngdepunkt(r);
  sjekk('tyngdepunkt x', tp.x, 20, 1e-9);
  sjekk('tyngdepunkt y', tp.y, 30, 1e-9);
  const tpBaklengs = Tomt.tyngdepunkt(r.slice().reverse());
  sjekk('samme tyngdepunkt uansett tegneretning', tpBaklengs.x, 20, 1e-9);

  /* Kant 0 gar fra (0,0) til (40,0), altsa langs sørkanten. Tomta ligger nord
     for den, sa normalen skal peke SØR - negativ y. */
  for (const punkter of [r, r.slice().reverse()]) {
    const k = Tomt.kanter(punkter);
    let alleUt = true;
    for (const kant of k) {
      const midtX = (kant.a.x + kant.b.x) / 2, midtY = (kant.a.y + kant.b.y) / 2;
      // et steg langs normalen skal føre oss ut av polygonet
      const ut = Tomt.innenfor(punkter, midtX + kant.nx * 0.5, midtY + kant.ny * 0.5);
      const inn = Tomt.innenfor(punkter, midtX - kant.nx * 0.5, midtY - kant.ny * 0.5);
      if (ut || !inn) alleUt = false;
    }
    paastand('normalene peker ut av tomta (' + (punkter === r ? 'mot klokka' : 'med klokka') + ')',
      alleUt);
  }
  const k0 = Tomt.kanter(r)[0];
  sjekk('sørkantens normal peker sør', k0.ny, -1, 1e-9);
  sjekk('og ikke øst-vest', k0.nx, 0, 1e-9);
}

/* ------------------------------------------------------------------ */
console.log('\n15. Bergveggens helning slår ut på volumet');
{
  /* Berg i dagen, 4 m dyp skjæring, alle kanter sprengt vegg. Skraningen man
     slipper er hele poenget med a sprenge en vegg, sa helningen ma slaa ut.
     N200 kap. 223.1 setter 10:1 (0,1) som normalen; 5:1 (0,2) er slakere og
     gir dobbelt sa mye uttak i veggen. */
  const lag = h => T.beregnTomtemasser({
    tomt: { punkter: rektangel(40, 60),
      kanter: [0, 1, 2, 3].map(() => ({ type: 'fjellvegg' })),
      nivaa: { modus: 'flat', kote: 96 } },
    mal: Object.assign(grunnmal(), { veggHelning: h, losmasseOverFjell: 2 }),
    terreng: { z: () => 100 }, fjell: new M.Fjellmodell({ standarddybde: 0 }),
    rutestorrelse: 0.5, bakkefaktor: 1
  });
  const bratt = lag(0.1), slak = lag(0.5);
  paastand('slakere vegg gir mer uttak',
    slak.sum.skjaering > bratt.sum.skjaering + 200,
    `10:1 ${bratt.sum.skjaering.toFixed(0)}, 2:1 ${slak.sum.skjaering.toFixed(0)}`);
  /* Forskjellen er trekantprismen langs omkretsen:
     0,5 x (0,5-0,1) x 4 x 4 m høyde x 200 m = 640 m³, pluss hjørner. */
  sjekk('forskjellen er den ekstra skråningen',
    slak.sum.skjaering - bratt.sum.skjaering, 200 * 0.5 * (0.5 - 0.1) * 4 * 4, 200);

  const loddrett = lag(0);
  paastand('loddrett vegg gir minst av alt',
    loddrett.sum.skjaering < bratt.sum.skjaering,
    `loddrett ${loddrett.sum.skjaering.toFixed(0)}, 10:1 ${bratt.sum.skjaering.toFixed(0)}`);
  sjekk('loddrett gir nøyaktig tomta selv', loddrett.sum.skjaering, 2400 * 4, 60);
}

/* ------------------------------------------------------------------ */
console.log('\n16. Balansen synker når koten heves');
{
  /* Egenskapen halveringssøket i «Massebalanse» hviler pa. Løfter man det
     ferdige nivaet, blir det mindre a grave og mer a fylle - alltid. Sto
     søket motsatt vei, løp det til bunnen av søkeomradet og meldte at det
     hadde funnet balanse med 71 000 m³ i avvik. Det gjorde det.

     Testen er ikke bare et fortegn: den kontrollerer at balansen er strengt
     synkende over hele omradet, for det er dét som gjør halvering gyldig. */
  const kote = k => {
    const r = kjor({
      tomt: { punkter: rektangel(40, 60), kanter: [], nivaa: { modus: 'flat', kote: k } },
      terreng: { z: () => 100 }, rutestorrelse: 1
    });
    const f = { sprengningsfaktor: 1.5, fjellIFylling: 1.3, losmasseIFylling: 0.95, brukbarLosmasse: 0.5 };
    const tilgjengelig = r.sum.skjaeringFjell * f.fjellIFylling
      + r.sum.skjaeringLosmasse * f.brukbarLosmasse * f.losmasseIFylling;
    return tilgjengelig - r.sum.fylling;
  };
  const verdier = [94, 96, 98, 100, 102, 104].map(kote);
  let synker = true;
  for (let i = 1; i < verdier.length; i++) if (verdier[i] >= verdier[i - 1]) synker = false;
  paastand('balansen synker strengt når koten heves', synker,
    verdier.map(v => v.toFixed(0)).join(' → '));
  paastand('lavt nivå gir overskudd', verdier[0] > 0, verdier[0].toFixed(0));
  paastand('høyt nivå gir underskudd', verdier[verdier.length - 1] < 0,
    verdier[verdier.length - 1].toFixed(0));
  /* Og roten ligger mellom dem, sa halvering i det hele tatt har noe a finne. */
  paastand('roten er innenfor søkeområdet', verdier[0] > 0 && verdier[verdier.length - 1] < 0);
}

/* ------------------------------------------------------------------ */
console.log('\n17. En ny tomt er flat');
{
  /* Fallet er noe man legger pa bevisst der vann skal renne av. Sto en ny tomt
     pa fall, matte man skru det av hver gang - og to prosent man ikke har bedt
     om flytter en hel meter over femti meter. */
  const t = Tomt.nyTomt();
  paastand('ny tomt er flat', t.nivaa.modus === 'flat', t.nivaa.modus);
  paastand('men fallet ligger klart til bruk', t.nivaa.fall === 0.02, String(t.nivaa.fall));
  paastand('koten er ikke satt enda', t.nivaa.kote === null, String(t.nivaa.kote));

  // og flatt niva skal gi samme kote overalt
  const ref = { x: 20, y: 30 };
  const n = { modus: 'flat', kote: 98, fall: 0.02, fallretning: 180 };
  sjekk('flatt nivå er likt i nord', T.nivaaVed(n, 20, 60, ref), 98, 1e-12);
  sjekk('flatt nivå er likt i sør', T.nivaaVed(n, 20, 0, ref), 98, 1e-12);
  sjekk('flatt nivå er likt i øst', T.nivaaVed(n, 40, 30, ref), 98, 1e-12);
  paastand('fallet blir ikke brukt når nivået er flatt',
    T.nivaaVed(n, 20, 60, ref) === T.nivaaVed(n, 20, 0, ref));
}

/* ------------------------------------------------------------------ */
console.log('\n18. Matjord og rensk telles ikke to ganger');
{
  /* Skjæringen ble malt fra RATT terreng samtidig som matjord og rensk ble
     ført som egne poster. Da la de samme kubikkene bade i skjæringen og i
     deponiposten: 993 m³ matjord oppa en skjæring som ikke endret seg med én
     kubikk nar matjorda ble slatt pa. Vegen har alltid gjort det riktig -
     skjæringen der synker nar renskedybden økes. */
  const lag = (mj, re, fjellDybde = 100) => T.beregnTomtemasser({
    tomt: { punkter: rektangel(40, 60), kanter: [], nivaa: { modus: 'flat', kote: 97 } },
    mal: Object.assign(grunnmal(), { matjordDybde: mj, renskDybde: re }),
    terreng: { z: () => 100 }, fjell: new M.Fjellmodell({ standarddybde: fjellDybde }),
    rutestorrelse: 1, bakkefaktor: 1
  });
  const uten = lag(0, 0), med = lag(0.25, 0);
  paastand('matjord finnes som egen post', med.sum.matjord > 500, med.sum.matjord.toFixed(0));
  /* Regnskapet ma ga opp EKSAKT: hver kubikk matjord som skrapes av er enten
     en kubikk mindre a grave eller en kubikk mer a fylle.
     A bare male at skjæringen synker holder ikke - der terrenget skraner, gar
     en del av matjorda til fylling i stedet, og pa en ekte tomt var det 128 av
     1024 m³. Identiteten under fanger begge veier. */
  sjekk('matjorden går enten fra skjæringen eller til fyllingen – ingen kubikk forsvinner',
    (uten.sum.skjaering - med.sum.skjaering) + (med.sum.fylling - uten.sum.fylling),
    med.sum.matjord, 0.5);
  paastand('summen av delene er hele skjæringen',
    Math.abs(med.sum.skjaering - (med.sum.skjaeringFjell + med.sum.skjaeringLosmasse + med.sum.rensk)) < 1e-6,
    `${med.sum.skjaering.toFixed(1)} mot ${(med.sum.skjaeringFjell + med.sum.skjaeringLosmasse + med.sum.rensk).toFixed(1)}`);

  /* «Rensk mot fjell» skal bare komme der uttaket faktisk nar ned til berget.
     Formelen spurte bare om det ble gravd i det hele tatt, sa en tomt med
     berget femti meter under fikk full rensk over hele flaten. */
  sjekk('ingen rensk når berget ligger 50 m under', lag(0, 0.2, 50).sum.rensk, 0, 1e-9);
  sjekk('heller ikke 5 m under', lag(0, 0.2, 5).sum.rensk, 0, 1e-9);
  paastand('men rensk når uttaket når berget', lag(0, 0.2, 0.5).sum.rensk > 100,
    lag(0, 0.2, 0.5).sum.rensk.toFixed(0));
  /* Og rensken er en DEL av løsmassen, ikke et tillegg - ellers telles den to
     ganger nar deponiet regnes. */
  const r05 = lag(0, 0.2, 0.5), u05 = lag(0, 0, 0.5);
  sjekk('rensken tas ut av løsmasseskjæringen, ikke lagt oppå',
    u05.sum.skjaeringLosmasse - r05.sum.skjaeringLosmasse, r05.sum.rensk, 1);
  sjekk('og totalen er den samme', r05.sum.skjaering, u05.sum.skjaering, 1e-6);
}

/* ------------------------------------------------------------------ */
console.log('\n19. Overberg er et volum, ikke en flate');
{
  /* Her sto `overberg * cellA / ruteM`, som er m x m² / m = m² - og som doblet
     seg hver gang rutenettet ble halvert: antall fjellceller vokser som
     1/ruteM², mens hvert bidrag bare halveres. Samme tomt ga 120, 265 og 529
     "m³" ved 1, 0,5 og 0,25 m. Pa standardinnstillingen traff det tilfeldigvis
     noe rimelig, sa feilen la og ventet pa at noen skrudde pa rutenettet. */
  const lag = rute => T.beregnTomtemasser({
    tomt: { punkter: rektangel(40, 60), kanter: [], nivaa: { modus: 'flat', kote: 96 } },
    mal: Object.assign(grunnmal(), { overberg: 0.3 }),
    terreng: { z: () => 100 }, fjell: new M.Fjellmodell({ standarddybde: 1 }),
    rutestorrelse: rute, bakkefaktor: 1
  });
  const v = [2, 1, 0.5, 0.25].map(r => lag(r).sum.overberg);
  const spenn = (Math.max(...v) - Math.min(...v)) / Math.max(...v);
  paastand('overberg flytter seg ikke med rutestørrelsen', spenn < 0.08,
    v.map(x => x.toFixed(0)).join(' · ') + `  spenn ${(spenn * 100).toFixed(1)} %`);
  sjekk('null overberg gir null', lag(1).sum.overberg > 0 ? 1 : 0, 1, 0);

  const uten = T.beregnTomtemasser({
    tomt: { punkter: rektangel(40, 60), kanter: [], nivaa: { modus: 'flat', kote: 96 } },
    mal: grunnmal(), terreng: { z: () => 100 },
    fjell: new M.Fjellmodell({ standarddybde: 1 }), rutestorrelse: 1, bakkefaktor: 1
  });
  sjekk('overberg står på null som standard', uten.sum.overberg, 0, 1e-9);
  paastand('og det er med vilje – R761 gir ikke tillegg for overberg', true);
}

/* ------------------------------------------------------------------ */
console.log(`\n${ok} tester ok, ${feil} feil`);
process.exit(feil ? 1 : 0);
