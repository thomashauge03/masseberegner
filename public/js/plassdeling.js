'use strict';
/**
 * Deling av plassen mellom kurver som konkurrerer om de samme strekkene.
 *
 * Planlinja og lengdeprofilen har samme problem: en kurve i et knekkpunkt
 * strekker seg et stykke inn på strekket til hver side – tangenten i planet,
 * den halve kurvelengden i profilen – og to naboer som til sammen ber om mer
 * enn strekket har, må dele.
 *
 * HER STO PROPORSJONAL NEDSKALERING, I BEGGE. Begge naboene ble kortet med
 * samme faktor, også når den ene ba om lite: R = 60 på et ben på 100 m ble 23
 * fordi naboen ba om R = 200, og et brekk på 5 % som trengte 15 m av 40 fikk
 * ingenting.
 *
 * LIKEDELING. Alle får like mye av gangen, og den som har fått det den ba om,
 * står. Et strekk som er fullt, stopper begge endene sine. Den som ber om
 * lite, får alt den ber om; to som begge ber om mer enn strekket har, får
 * halvparten hver; og det en nabo ikke trenger, går til den andre. R = 60 ved
 * siden av R = 200 blir 50 og 50.
 *
 * FØRST STO «DEN MINSTE FØRST» HER, og den holdt ikke: to som var like innenfor
 * fem prosent delte, mens 5,1 prosent forskjell ga den ene alt – et sprang i
 * vegen for en bitte liten endring i radien – og i en hårnålsserie kunne to
 * naboer få mer enn strekket mellom dem, så linja gikk baklengs. Likedelingen
 * har ingen grenser å hoppe over, gir aldri mer enn strekket har, og gir samme
 * svar uansett hvilken ende linja tegnes fra.
 *
 * ET STREKK MED PLASS TIL BEGGE ENDENE SINE, FYLLES ALDRI, og skiller det som
 * ligger på hver side: bitene deles hver for seg, med samme svar. Her gikk
 * hver runde over hele linja – kvadratisk i antall punkt, 104 ms på 2 000.
 * Et uendelig langt strekk er et slikt skille; her talte det som fullt
 * (∞ − x ≤ ∞) og stoppet endene sine.
 *
 * @param {number[]} onsket  det hvert punkt ber om (0 = ingen kurve)
 * @param {number[]} plass   plassen på strekket mellom punkt k og k+1 (lengde n−1)
 * @returns {number[]} det hvert punkt får, aldri mer enn det ba om
 */
function delPlass(onsket, plass) {
  const n = onsket.length;
  const fatt = new Array(n).fill(0);
  const vil = i => (onsket[i] > 0 ? onsket[i] : 0);
  const P = k => (plass[k] > 0 ? plass[k] : 0);
  const fullt = k => P(k) - fatt[k] - fatt[k + 1] <= 1e-12 * Math.max(1, P(k));
  const aktiv = new Uint8Array(n);
  // punktene a..b, med strekkene a..b−1 mellom seg
  const delBit = (a, b) => {
    for (let i = a; i <= b; i++) aktiv[i] = vil(i) > 0 ? 1 : 0;
    // hver runde stopper minst ett punkt, så det er aldri flere runder enn punkt
    for (let runde = 0; runde <= b - a + 1; runde++) {
      let d = Infinity, med = false;
      // hvor mye alle som ennå er med, kan få til – før noen er mette eller et strekk er fullt
      for (let i = a; i <= b; i++) if (aktiv[i]) { med = true; d = Math.min(d, onsket[i] - fatt[i]); }
      if (!med) return;                           // ingen er med lenger – et uendelig ønske er med
      for (let k = a; k < b; k++) {
        const m = (aktiv[k] ? 1 : 0) + (aktiv[k + 1] ? 1 : 0);
        if (m) d = Math.min(d, (P(k) - fatt[k] - fatt[k + 1]) / m);
      }
      d = Math.max(0, d);
      for (let i = a; i <= b; i++) if (aktiv[i]) fatt[i] += d;
      for (let i = a; i <= b; i++) {
        if (aktiv[i] && fatt[i] >= onsket[i] - 1e-12) { fatt[i] = onsket[i]; aktiv[i] = false; }
      }
      for (let k = a; k < b; k++) if (fullt(k)) { aktiv[k] = false; aktiv[k + 1] = false; }
    }
  };
  let a = 0;
  for (let k = 0; k < n; k++) {
    if (k === n - 1 || P(k) >= vil(k) + vil(k + 1)) { delBit(a, k); a = k + 1; }
  }
  return fatt;
}

if (typeof module !== 'undefined') module.exports = { delPlass };
