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
 * samme faktor, også når det fantes en fordeling der den ene fikk alt den ba
 * om. En kurve brukeren hadde prosjektert riktig ble ødelagt fordi naboen var
 * urimelig: R = 60 på et ben på 100 m ble 23 fordi naboen ba om R = 200.
 *
 * DEN MINSTE FÅR DET DEN TRENGER. Knekkpunktene tar for seg i rekkefølge
 * etter hvor mye de ber om, den minste først. Hver får det den ber om så langt
 * det er plass ved siden av det som alt er gitt bort; den som ber om mer, tar
 * det som er igjen. Ber naboer om like mye, deler de: de regnes samtidig, og så
 * én gang til, så den som er klemt fra andre siden gir plass til naboen. Svaret
 * er da det samme uansett hvilken ende linja tegnes fra.
 *
 * «LIKE MYE» ER INNENFOR FEM PROSENT. Med en grense på en milliondel av en
 * meter ble en sikksakk med samme radius i hvert knekkpunkt – litt ulik etter
 * projeksjonen til UTM – til annenhver kurve med hel radius og annenhver kuttet
 * dobbelt så mye. Små forskjeller i hva de ber om, skal ikke avgjøre hvem som
 * får alt.
 *
 * @param {number[]} onsket  det hvert punkt ber om (0 = ingen kurve)
 * @param {number[]} plass   plassen på strekket mellom punkt k og k+1 (lengde n−1)
 * @returns {number[]} det hvert punkt får, aldri mer enn det ba om
 */
function delPlass(onsket, plass) {
  const n = onsket.length;
  const fatt = new Array(n).fill(0);
  const gitt = new Array(n).fill(false);
  // punkt uten ønske tar ingen plass, og står som gitt
  for (let i = 0; i < n; i++) if (!(onsket[i] > 0)) gitt[i] = true;
  const LIK = 0.05;
  // plassen punkt i har mot naboen j: det som er igjen etter den, en likedel, eller alt
  const rom = (i, j, iGruppe) => {
    const P = plass[Math.min(i, j)];
    if (!(P > 0)) return 0;
    if (gitt[j] && !iGruppe.has(j)) return P - fatt[j];
    if (iGruppe.has(j)) return null;          // avgjøres i rundene under
    return P;                                 // naboen ber om mer, og tar resten
  };
  for (;;) {
    let minste = Infinity;
    for (let i = 0; i < n; i++) if (!gitt[i] && onsket[i] < minste) minste = onsket[i];
    if (!isFinite(minste)) break;
    const gruppe = new Set();
    for (let i = 0; i < n; i++) if (!gitt[i] && onsket[i] <= minste * (1 + LIK) + 1e-9) gruppe.add(i);
    // første runde: naboer i samme gruppe deler likt
    const grense = new Map();
    for (const i of gruppe) {
      let g = onsket[i];
      for (const j of [i - 1, i + 1]) {
        if (j < 0 || j >= n) continue;
        const r = rom(i, j, gruppe);
        g = Math.min(g, r == null ? plass[Math.min(i, j)] / 2 : r);
      }
      grense.set(i, Math.max(0, g));
    }
    for (const [i, g] of grense) fatt[i] = g;
    // så samtidig om igjen: plass en klemt nabo ikke trengte, kan den andre ta
    for (let runde = 0; runde < 10; runde++) {
      let endret = false;
      const ny = new Map();
      for (const i of gruppe) {
        let g = onsket[i];
        for (const j of [i - 1, i + 1]) {
          if (j < 0 || j >= n) continue;
          const r = rom(i, j, gruppe);
          g = Math.min(g, r == null ? plass[Math.min(i, j)] - fatt[j] : r);
        }
        ny.set(i, Math.max(fatt[i], Math.max(0, g)));
      }
      for (const [i, g] of ny) if (g > fatt[i] + 1e-12) { fatt[i] = g; endret = true; }
      if (!endret) break;
    }
    for (const i of gruppe) gitt[i] = true;
  }
  return fatt;
}

if (typeof module !== 'undefined') module.exports = { delPlass };
