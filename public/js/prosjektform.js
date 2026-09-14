'use strict';
/**
 * Formen på et prosjekt: anleggslista og vinduene inn i det aktive anlegget.
 *
 * HVORFOR DETTE LIGGER FOR SEG SELV.
 * Logikken sto midt i `App.klargjorProsjekt` i app.js. Den er ren databehandling
 * – den rører verken skjermen, kartet eller lagringen – men app.js kan ikke
 * lastes utenfor en nettleser, og derfor kunne ingen node-prøve nå den.
 *
 * Det gikk akkurat så galt som det måtte: `test/anleggsprove.js` hadde ikke ett
 * eneste `require`. Den SKREV AV aksessor-logikken øverst i seg selv og prøvde
 * kopien. Kopien var allerede to felt på etterskudd – den hadde
 * `['ip', 'vip', 'mal', 'tomt']` mens programmet hadde fått `tverrfall` og
 * `plasser` i tillegg. Målt: med hele aksessor-mekanismen revet ut av app.js
 * – `for (const felt of [])` – meldte prøven fortsatt «24 ok, 0 feil».
 *
 * Tjuefire grønne hakk som ikke kunne bli røde uansett hva som skjedde med
 * koden. Nå ligger logikken her, og prøven laster den.
 */

/* Hentes der de bor: globaler i nettleseren, moduler i node. Et oppslag i
   stedet for en fast referanse, slik at rekkefølgen på script-taggene ikke blir
   en usynlig avhengighet. */
function _masser() {
  if (typeof StandardMal !== 'undefined') return { StandardMal };
  return require('./masser.js');
}
function _tomt() {
  if (typeof StandardTomtemal !== 'undefined') return { StandardTomtemal, nyTomt };
  return require('./tomt.js');
}

/**
 * En mal fra en eldre fil, brakt opp til dagens navn.
 *
 * Lå som `App.moderniserMal`. Den er ren – ingen `this`, ingen skjerm – og
 * hører til formen på fila, ikke til grensesnittet.
 */
function moderniserMal(mal) {
  const m = mal || {};
  if (m.grofteDybde != null && m.grofteDybdePlanum == null) {
    const overbygning = (m.slitelagTykkelse || 0.10) + (m.baerelagTykkelse || 0.60);
    m.grofteDybdePlanum = Math.max(0.05, +(m.grofteDybde - overbygning).toFixed(3));
    delete m.grofteDybde;
  }
  if (m.breddeutvidelse && !m.breddeIKurve) {
    m.breddeIKurve = m.breddeutvidelse
      .filter(r => r[1] > 0)
      .map(r => [r[0], r[0] + 4, (m.vegbredde || 4.5) + r[1], (m.vegbredde || 4.5) + r[1]]);
    delete m.breddeutvidelse;
  }
  if (m.maksStigning && !m.stigningIKurve) {
    m.stigningIKurve = m.maksStigning.map(r => [r[0], r[1], r[1]]);
    delete m.maksStigning;
  }
  return m;
}

/**
 * Bygger prosjektet om til dagens form, og legger på vinduene inn i anlegget.
 *
 * Returnerer det samme objektet, endret på plass – kallerne regner med det.
 */
function klargjor(P) {
  if (!P) return P;
  const { StandardMal } = _masser();
  const { StandardTomtemal, nyTomt } = _tomt();

  /* ET PROSJEKT MED GEOMETRI ER IKKE «UBESTEMT».
     Flagget slettes med `delete` når man velger type, så det står ikke i den
     lagrede fila – og åpningen bygger prosjektet som
     `Object.assign(nyttProsjekt(), fila)`, der standardverdien `true` da
     kommer tilbake. Et ferdig tegnet prosjekt kom altså opp med «Hva skal du
     regne på?», og ett klikk der byttet ut hele det aktive anlegget: målt en
     tomt med 5 852 m³ skjæring som ble null, uten en angrepost.
     Prøven står her og ikke i `apne`, fordi det er den samme fella for
     import, for angre, og for hver annen vei et prosjekt kan komme inn. Et
     HELT NYTT prosjekt har ingen geometri og forblir ubestemt – det er
     nettopp da spørsmålet er på sin plass. */
  if (Array.isArray(P.anlegg) && P.anlegg.some(a => (a.ip && a.ip.length)
    || (a.tomt && a.tomt.punkter && a.tomt.punkter.length))) {
    delete P.ubestemt;
  }

  /* Er `mal` eller `ip` en egen nøkkel pa prosjektet, er fila fra før
     tomtemodus. I den nye forma finnes de bare som ikke-tellbare aksessorer,
     og de blir aldri lagret - sa dette er et trygt kjennetegn.

     Sjekken kan ikke vaere "mangler anlegg". Apningen setter prosjektet
     sammen som Object.assign(nyttProsjekt(), fila), og da har resultatet
     alltid et anlegg - det tomme fra nyttProsjekt(). En gammel fil ville
     da fatt innholdet sitt kastet, uten et eneste tegn pa at noe var galt. */
  /* EN AKSESSOR ER IKKE EN GAMMEL FIL.
     Her sto `hasOwnProperty`, og den er SANN også for aksessorene denne
     funksjonen selv legger på nedenfor. Kjørte man klargjøringen to ganger på
     samme objekt – og det gjør en prøve, en import eller hva som helst som
     vil forsikre seg – så den sine egne `mal`, `ip` og `vip`, konkluderte med
     «gammel fil», og bygde hele anleggslista om til ETT veganlegg. Tre anlegg
     ble til ett, uten et eneste tegn på at noe var galt.
     Kjennetegnet på den gamle forma er en VERDI på prosjektet, ikke et navn. */
  const eier = k => {
    const d = Object.getOwnPropertyDescriptor(P, k);
    return !!d && 'value' in d;
  };
  const gammelForm = eier('mal') || eier('ip') || eier('vip');
  if (gammelForm || !Array.isArray(P.anlegg) || !P.anlegg.length) {
    P.anlegg = [{
      id: 'a1', type: 'veg', navn: P.navn || 'Veg',
      ip: P.ip || [], vip: P.vip || [], mal: P.mal || Object.assign({}, StandardMal)
    }];
    P.aktivt = 'a1';
    P.versjon = 2;
  }
  /* Males FØR malene flettes: etterpa har hvert anlegg nøkkelen uansett. */
  const manglerUtskifting = P.anlegg.some(a => a && a.mal
    && typeof a.mal === 'object' && !('utskifting' in a.mal));
  for (const a of P.anlegg) {
    if (!a.type) a.type = a.tomt ? 'tomt' : 'veg';
    if (a.type === 'tomt') {
      a.mal = Object.assign({}, StandardTomtemal, a.mal || {});
      /* Nivaet ma flettes for seg. Object.assign gar bare ett niva ned, sa
         en lagret tomt ville byttet ut hele `nivaa` med sin egen - og felt
         som kom til etterpa ble undefined i stedet for a fa standardverdien.
         Da regnet et gammelt prosjekt med NaN uten a si fra. */
      const nivaa = Object.assign(nyTomt().nivaa, (a.tomt && a.tomt.nivaa) || {});
      a.tomt = Object.assign(nyTomt(), a.tomt || {});
      a.tomt.nivaa = nivaa;
      if (!Array.isArray(a.tomt.punkter)) a.tomt.punkter = [];
      if (!Array.isArray(a.tomt.kanter)) a.tomt.kanter = [];
      a.ip = a.ip || [];      // se nyttAnlegg: tomme lister, ikke undefined
      a.vip = a.vip || [];
    } else {
      // en vegmal fra en eldre fil kan ligge inne i anlegget ogsa
      a.mal = Object.assign({}, StandardMal, moderniserMal(a.mal || {}));
      a.ip = a.ip || [];
      a.vip = a.vip || [];
    }
  }
  /* EN FIL SOM ER ELDRE ENN MASSEUTSKIFTINGEN SKAL SI DET.
     Et prosjekt lagret før utskiftingen fins har ingen `utskifting`-nøkkel, og
     `Object.assign` over lar da standardverdien – PÅ – bli stående. Det er med
     vilje: ellers ville gamle og nye prosjekter i samme program regnet to
     forskjellige svar, og det er verre. Men kubikken ENDRER seg, og på et
     tilbud som er sendt er det ikke noe man skal finne ut av selv. Flagget
     leses av åpningen, som sier det én gang.

     IKKE TELLBART, SÅ DET IKKE BLIR LAGRET. `JSON.stringify` tar bare tellbare
     felt, og et vanlig `P.utskiftingErNy = …` ville fulgt med ut i fila – og
     `eier()` over ser etter en VERDI pa prosjektet, sa et lagret flagg er
     nettopp den slags felt som har skapt bry før. Det hører til denne
     apningen, ikke til prosjektet. */
  Object.defineProperty(P, 'utskiftingErNy',
    { value: manglerUtskifting, enumerable: false, configurable: true, writable: true });
  /* TO ANLEGG MED SAMME ID ER ETT ANLEGG SOM IKKE FINNES.
     Alt slår opp med `find(a => a.id === P.aktivt)`, som gir det FØRSTE. Får
     to samme id – ved en håndredigert fil, en sammenslåing eller en framtidig
     «kopier anlegg» – blir det andre permanent uoppnåelig, og slettingen tar
     feil anlegg. Ett gjennomløp ved åpning koster ingenting og gjør at
     tilstanden ikke kan oppstå. */
  const sett = new Set();
  for (const a of P.anlegg) {
    if (!a.id || sett.has(a.id)) {
      a.id = 'a' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    }
    sett.add(a.id);
  }
  if (!P.anlegg.some(a => a.id === P.aktivt)) P.aktivt = P.anlegg[0].id;

  /* TVERRFALLET HØRER TIL VEGEN, IKKE TIL PROSJEKTET.
     Lista er nøklet på STASJON langs en senterlinje – {s, ...}. Lå den på
     prosjektet, delte to veger den: et tverrfall lagt inn i profil 120 på
     Veg 1 slo også inn i profil 120 på Veg 2, som er et helt annet sted i
     terrenget. Med ett anlegg fantes ikke problemet, og derfor sto det slik.
     Gamle filer har lista på prosjektet; den flyttes til det første
     veganlegget, der den kom fra. */
  for (const a of P.anlegg) if (!Array.isArray(a.tverrfall)) a.tverrfall = [];
  if (Array.isArray(P.tverrfall) && P.tverrfall.length) {
    const foerste = P.anlegg.find(a => a.type === 'veg') || P.anlegg[0];
    if (!foerste.tverrfall.length) foerste.tverrfall = P.tverrfall;
  }
  delete P.tverrfall;

  /* Snuplasser og møteplasser hører til ANLEGGET, av samme grunn som
     tverrfallslista over: to veger i samme prosjekt har hver sine, og en
     stasjon på den ene er et helt annet sted i terrenget enn på den andre. */
  for (const a of P.anlegg) if (!Array.isArray(a.plasser)) a.plasser = [];

  const aktivt = () => P.anlegg.find(a => a.id === P.aktivt) || P.anlegg[0];
  for (const felt of FELT) {
    delete P[felt];                       // fjern verdien fra den gamle forma
    Object.defineProperty(P, felt, {
      configurable: true,
      enumerable: false,
      get() { return aktivt()[felt]; },
      set(v) { aktivt()[felt] = v; }
    });
  }
  return P;
}

/* Feltene som er VINDUER inn i det aktive anlegget. Lista står her og ikke
   inne i løkka, så en prøve kan lese den og kreve at hvert felt virker – da
   kan ikke et nytt felt legges til uten at det blir prøvd. */
const FELT = ['ip', 'vip', 'mal', 'tomt', 'tverrfall', 'plasser'];

const Prosjektform = { klargjor, moderniserMal, FELT };

if (typeof module !== 'undefined') {
  module.exports = Prosjektform;
}
