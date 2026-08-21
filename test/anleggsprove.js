'use strict';
/* Kan P.ip / P.vip / P.mal bli vinduer inn i det aktive anlegget, slik at de 212
   oppslagene i koden star uendret - og uten at speilingen havner i JSON-fila? */

function klargjor(P) {
  if (!P.anlegg) {                       // gammel fil: pakk inn som ett veganlegg
    P.anlegg = [{ id: 'a1', type: 'veg', navn: P.navn, ip: P.ip, vip: P.vip, mal: P.mal }];
    P.aktivt = 'a1';
    P.versjon = 2;
    delete P.ip; delete P.vip; delete P.mal;
  }
  const aktivt = () => P.anlegg.find(a => a.id === P.aktivt) || P.anlegg[0];
  for (const felt of ['ip', 'vip', 'mal', 'tomt']) {
    Object.defineProperty(P, felt, {
      configurable: true,
      enumerable: false,                 // holdes utenfor JSON.stringify
      get() { return aktivt()[felt]; },
      set(v) { aktivt()[felt] = v; }
    });
  }
  return P;
}

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

console.log('\n' + ok + ' ok, ' + feil + ' feil');
process.exit(feil ? 1 : 0);
