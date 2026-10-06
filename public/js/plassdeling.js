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
 * @param {number[]} onsket  det hvert punkt ber om (0 = ingen kurve)
 * @param {number[]} plass   plassen på strekket mellom punkt k og k+1 (lengde n−1)
 * @returns {number[]} det hvert punkt får, aldri mer enn det ba om
 */
function delPlass(onsket, plass) {
  const n = onsket.length;
  const fatt = new Array(n).fill(0);
  const aktiv = onsket.map(o => o > 0);
  const P = k => (plass[k] > 0 ? plass[k] : 0);
  // hver runde stopper minst ett punkt, så det er aldri flere runder enn punkt
  for (let runde = 0; runde <= n; runde++) {
    if (!aktiv.some(Boolean)) break;
    // hvor mye alle som ennå er med, kan få til – før noen er mette eller et strekk er fullt
    let d = Infinity;
    for (let i = 0; i < n; i++) if (aktiv[i]) d = Math.min(d, onsket[i] - fatt[i]);
    for (let k = 0; k + 1 < n; k++) {
      const m = (aktiv[k] ? 1 : 0) + (aktiv[k + 1] ? 1 : 0);
      if (m) d = Math.min(d, (P(k) - fatt[k] - fatt[k + 1]) / m);
    }
    d = Math.max(0, d);
    for (let i = 0; i < n; i++) if (aktiv[i]) fatt[i] += d;
    for (let i = 0; i < n; i++) {
      if (aktiv[i] && fatt[i] >= onsket[i] - 1e-12) { fatt[i] = onsket[i]; aktiv[i] = false; }
    }
    for (let k = 0; k + 1 < n; k++) {
      if (P(k) - fatt[k] - fatt[k + 1] <= 1e-12 * Math.max(1, P(k))) { aktiv[k] = false; aktiv[k + 1] = false; }
    }
  }
  return fatt;
}

if (typeof module !== 'undefined') module.exports = { delPlass };
