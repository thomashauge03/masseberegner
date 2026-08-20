'use strict';
/**
 * Leser tegnede kurver ut av en PDF.
 *
 * En lengdeprofil fra et tegneprogram inneholder ingen høydetall - terrenget
 * og veglinjen er streker, ikke tekst. Men strekene ligger der som kurver med
 * koordinater, og da gar de an a lese av: brukeren peker ut to punkt han vet
 * profilnummer og høyde pa, og resten faller pa plass.
 *
 * Dette er avlesning av en tegning, ikke innlesing av data. Tallene blir sa
 * nøyaktig som streken er tegnet, og bør kontrolleres mot planen før de
 * brukes i et tilbud.
 */

const PdfImport = {

  /**
   * Pakker ut alle strømmene i filen. Bruker nettleserens egen deflate.
   *
   * Lengden ma tas fra `/Length` i objektordboken, ikke males til `endstream`.
   * Mellom siste databyte og `endstream` star det et linjeskift eller to, og
   * de er ikke en del av strømmen. `DecompressionStream` kaster pa alt som
   * ligger etter at zlib-strømmen er slutt, sa de to ekstra bytene var nok
   * til at ingen innholdsstrøm i noen ekte PDF noen gang pakket ut - hele
   * avlesningen fant null kurver uten a si ifra om hvorfor.
   */
  async lesStrommer(bytes) {
    const ut = [];
    const tekst = new TextDecoder('latin1').decode(bytes);
    let idx = 0;
    while (true) {
      const s = tekst.indexOf('stream', idx);
      if (s === -1) break;
      // «endstream» inneholder ogsa «stream» - hopp over de treffene
      if (tekst.slice(s - 3, s) === 'end') { idx = s + 6; continue; }
      let start = s + 6;
      if (bytes[start] === 0x0d) start++;
      if (bytes[start] === 0x0a) start++;
      const e = tekst.indexOf('endstream', start);
      if (e === -1) break;
      idx = e + 9;

      /* /Length kan sta som et tall eller som en henvisning til et annet
         objekt («/Length 12 0 R»). Bare tallformen kan brukes direkte; ellers
         faller vi tilbake pa a trimme linjeskiftene bakerst. */
      const hode = tekst.slice(Math.max(0, s - 400), s);
      const lengdeTreff = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(hode);
      let slutt = e;
      if (lengdeTreff) {
        const n = parseInt(lengdeTreff[1], 10);
        if (n > 0 && start + n <= e) slutt = start + n;
      }
      while (slutt > start && (bytes[slutt - 1] === 0x0a || bytes[slutt - 1] === 0x0d)) slutt--;

      const pakket = await this.pakkUt(bytes.subarray(start, slutt));
      if (pakket) ut.push(pakket);
    }
    return ut;
  },

  async pakkUt(rå) {
    if (typeof DecompressionStream === 'undefined') return null;
    if (!rå.length) return null;
    // 0x78 er zlib-hodet; uten det er strømmen enten raa deflate eller noe annet
    const rekkefolge = rå[0] === 0x78 ? ['deflate', 'deflate-raw'] : ['deflate-raw', 'deflate'];
    for (const format of rekkefolge) {
      try {
        const str = new Blob([rå]).stream().pipeThrough(new DecompressionStream(format));
        const buf = await new Response(str).arrayBuffer();
        if (buf.byteLength) return new TextDecoder('latin1').decode(buf);
      } catch (e) { /* prøv neste */ }
    }
    return null;
  },

  /**
   * Tolker tegneoperatorene i en innholdsstrøm og gir tilbake polylinjene,
   * omregnet gjennom transformasjonsmatrisene slik at alt havner i samme
   * koordinatsystem.
   */
  tolkBaner(tekst) {
    const baner = [];
    let m = [1, 0, 0, 1, 0, 0];
    const stabel = [];
    let bane = [];
    const tall = [];

    const bruk = (px, py) => ({ x: m[0] * px + m[2] * py + m[4], y: m[1] * px + m[3] * py + m[5] });
    const avslutt = () => { if (bane.length > 1) baner.push(bane); bane = []; };

    const tokenRe = /(-?\d*\.?\d+)|([A-Za-z*'"]+)/g;
    let t;
    while ((t = tokenRe.exec(tekst)) !== null) {
      if (t[1] !== undefined) { tall.push(parseFloat(t[1])); continue; }
      const op = t[2];
      const n = tall.length;
      if (op === 'q') stabel.push(m.slice());
      else if (op === 'Q') { if (stabel.length) m = stabel.pop(); }
      else if (op === 'cm' && n >= 6) {
        const a = tall.slice(n - 6);
        m = [
          a[0] * m[0] + a[1] * m[2], a[0] * m[1] + a[1] * m[3],
          a[2] * m[0] + a[3] * m[2], a[2] * m[1] + a[3] * m[3],
          a[4] * m[0] + a[5] * m[2] + m[4], a[4] * m[1] + a[5] * m[3] + m[5]
        ];
      }
      else if (op === 'm' && n >= 2) { avslutt(); bane = [bruk(tall[n - 2], tall[n - 1])]; }
      else if (op === 'l' && n >= 2) { bane.push(bruk(tall[n - 2], tall[n - 1])); }
      /* Bézier-kurvene ma følges, ikke bare avsluttes.
         Her sto `c`, `v` og `y` sammen med `l`, og bare endepunktet ble tatt
         med - kontrollpunktene ble kastet. En vertikalkurve tegnet som en
         Bézier ble da lest som en rett korde mellom endene, og pilhøyden -
         som for en vertikalkurve er A·L/8 - forsvant. Det er nøyaktig det
         tallet man leser av profilen for.

           c x1 y1 x2 y2 x3 y3   to kontrollpunkt, sa endepunktet
           v x2 y2 x3 y3         første kontrollpunkt er startpunktet
           y x1 y1 x3 y3         andre kontrollpunkt er endepunktet */
      else if ((op === 'c' || op === 'v' || op === 'y') && n >= 4) {
        const p0 = bane.length ? bane[bane.length - 1] : null;
        let k1, k2, p3;
        if (op === 'c' && n >= 6) {
          const a = tall.slice(n - 6);
          k1 = bruk(a[0], a[1]); k2 = bruk(a[2], a[3]); p3 = bruk(a[4], a[5]);
        } else if (op === 'v') {
          const a = tall.slice(n - 4);
          k1 = p0; k2 = bruk(a[0], a[1]); p3 = bruk(a[2], a[3]);
        } else {
          const a = tall.slice(n - 4);
          k1 = bruk(a[0], a[1]); p3 = bruk(a[2], a[3]); k2 = p3;
        }
        if (!p0 || !k1 || !k2) { bane.push(p3); }
        else {
          // atte steg gjør en kurve til en polylinje som følger den innenfor
          // en brøkdel av en tegningsenhet
          for (let i = 1; i <= 8; i++) {
            const u = i / 8, v = 1 - u;
            bane.push({
              x: v * v * v * p0.x + 3 * v * v * u * k1.x + 3 * v * u * u * k2.x + u * u * u * p3.x,
              y: v * v * v * p0.y + 3 * v * v * u * k1.y + 3 * v * u * u * k2.y + u * u * u * p3.y
            });
          }
        }
      }
      else if (op === 're' && n >= 4) {
        const [rx, ry, rw, rh] = tall.slice(n - 4);
        avslutt();
        baner.push([bruk(rx, ry), bruk(rx + rw, ry), bruk(rx + rw, ry + rh), bruk(rx, ry + rh), bruk(rx, ry)]);
      }
      else if ('SsfFBbn'.includes(op) && op.length === 1) avslutt();
      tall.length = 0;
    }
    avslutt();
    return baner;
  },

  /** Leser hele filen og grupperer banene per tegning. */
  async lesFil(fil) {
    const bytes = new Uint8Array(await fil.arrayBuffer());
    const strommer = await this.lesStrommer(bytes);
    const tegninger = [];
    for (const s of strommer) {
      if (!/(^|\s)(m|l|re)(\s|$)/.test(s)) continue;
      const baner = this.tolkBaner(s).filter(b => b.length > 1);
      if (baner.length < 5) continue;
      tegninger.push({ baner, ...this.omfang(baner) });
    }
    // største tegning først - den er som regel selve profilen
    tegninger.sort((a, b) => b.baner.length - a.baner.length);
    return tegninger;
  },

  omfang(baner) {
    let minX = Infinity, maksX = -Infinity, minY = Infinity, maksY = -Infinity;
    for (const b of baner) for (const p of b) {
      if (p.x < minX) minX = p.x; if (p.x > maksX) maksX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maksY) maksY = p.y;
    }
    return { minX, maksX, minY, maksY };
  },

  /**
   * Baner som ser ut som en profillinje: mange punkt, brede, og gar stort
   * sett fra venstre mot høyre uten a snu.
   */
  kandidater(baner) {
    const ut = [];
    for (const b of baner) {
      /* Her sto det femten punkt. En veglinje tegnet som noen fa rette
         tangenter har ikke femten punkt - i Ydestad-planen ligger den med
         fire, og strekker seg over 1166 enheter. Femtenkravet kastet 5541 av
         5556 baner, og veglinjen var blant dem: brukeren fikk terrenglinjen a
         velge, og trodde det var veien.

         Det som skiller en profillinje fra alt annet i en tegning er ikke
         antall punkt, men at den gar én vei og strekker seg over hele
         tegningen. Rammer og rutenett gar fram og tilbake, og faller pa
         framover-kravet under. */
      if (b.length < 3) continue;
      let minX = Infinity, maksX = -Infinity, minY = Infinity, maksY = -Infinity, framover = 0;
      for (let i = 0; i < b.length; i++) {
        if (b[i].x < minX) minX = b[i].x; if (b[i].x > maksX) maksX = b[i].x;
        if (b[i].y < minY) minY = b[i].y; if (b[i].y > maksY) maksY = b[i].y;
        if (i && b[i].x >= b[i - 1].x) framover++;
      }
      const andel = framover / (b.length - 1);
      if (andel < 0.9 || maksX - minX < 50) continue;
      /* En profillinje stiger og faller. En rutenettlinje, en ramme eller en
         understrekning gar rett bortover uten høydevariasjon i det hele tatt -
         og de er det mange av. Grensen er satt lavt med vilje: den skal skille
         ut det som er nøyaktig flatt, ikke gjette pa hva som er en veg. */
      if (maksY - minY < 1) continue;
      ut.push({ bane: b, minX, maksX, minY, maksY, punkt: b.length, bredde: maksX - minX,
        hoyde: maksY - minY });
    }
    /* Samme strek kan vaere tegnet flere ganger oppa seg selv. To kandidater
       med samme utstrekning og samme antall punkt er samme strek. */
    const sett = new Set();
    const unike = ut.filter(k => {
      const n = [k.minX, k.maksX, k.minY, k.maksY].map(v => Math.round(v * 10)).join('_') + '_' + k.punkt;
      if (sett.has(n)) return false;
      sett.add(n); return true;
    });
    unike.sort((a, b) => b.bredde - a.bredde || b.hoyde - a.hoyde || b.punkt - a.punkt);
    return unike;
  },

  /**
   * Gjør en bane om til profilnummer og høyde.
   *
   * To referansepunkt holder sa lenge aksene star vinkelrett pa hverandre,
   * slik de gjør i en lengdeprofil. Da er det bare en skalering og en
   * forskyvning i hver retning.
   */
  tilHoyder(bane, ref, steg) {
    const [a, b] = ref;
    const dx = b.pdfX - a.pdfX, dy = b.pdfY - a.pdfY;
    if (Math.abs(dx) < 1e-6 || Math.abs(dy) < 1e-6) return null;
    const sPerX = (b.s - a.s) / dx;
    const zPerY = (b.z - a.z) / dy;
    const tilS = px => a.s + (px - a.pdfX) * sPerX;
    const tilZ = py => a.z + (py - a.pdfY) * zPerY;

    const punkt = bane.map(p => ({ s: tilS(p.x), z: tilZ(p.y) }))
      .filter(p => isFinite(p.s) && isFinite(p.z))
      .sort((p, q) => p.s - q.s);
    if (punkt.length < 2) return null;

    const fra = punkt[0].s, til = punkt[punkt.length - 1].s;
    const ut = [];
    for (let s = Math.ceil(fra / steg) * steg; s <= til + 1e-6; s += steg) {
      ut.push({ s: +s.toFixed(2), z: +this.interpoler(punkt, s).toFixed(3) });
    }
    return { punkt: ut, fra, til, malestokk: { sPerX, zPerY } };
  },

  _interpoler(punkt, s) { return this.interpoler(punkt, s); },

  interpoler(punkt, s) {
    if (s <= punkt[0].s) return punkt[0].z;
    if (s >= punkt[punkt.length - 1].s) return punkt[punkt.length - 1].z;
    let lo = 0, hi = punkt.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (punkt[m].s < s) lo = m; else hi = m; }
    const d = punkt[hi].s - punkt[lo].s;
    return d < 1e-9 ? punkt[lo].z : punkt[lo].z + (s - punkt[lo].s) / d * (punkt[hi].z - punkt[lo].z);
  }
};

if (typeof module !== 'undefined') module.exports = PdfImport;
