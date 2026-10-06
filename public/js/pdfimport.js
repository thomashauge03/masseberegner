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
    return (await this.lesObjekter(bytes)).map(o => o.tekst);
  },

  /**
   * Strømmene i fila, hver med objektet den står i: `{ nr, gen, ordbok, tekst }`.
   *
   * ORDBOKEN ER STRØMMENS EGEN. Her ble `/Length` lett etter i de 400 tegnene
   * foran `stream`, og det første treffet vant – var den egne ordboken kort,
   * var det lengden til FORRIGE objekt (målt: 22 der strømmen var 509), og
   * strømmen ble kuttet. Nå er ordboken det som står mellom «N G obj» og
   * `stream`.
   *
   * `/Length 12 0 R` er en henvisning til et annet objekt, og slås opp. Her
   * ga regexet «4500 0 R» lengden 450 – det trakk ett siffer tilbake til
   * henvisningen ikke lenger så ut som en henvisning.
   *
   * LINJESKIFT TRIMMES BARE NÅR LENGDEN IKKE ER KJENT. Med eksakt /Length er
   * siste byte data – også når den er 0x0d eller 0x0a – og trimmingen kuttet
   * omtrent én av hundre komprimerte strømmer.
   *
   * `/Filter` leses: uten filter er strømmen ren tekst og brukes som den er
   * (her ble den sendt til dekomprimering og forkastet); med et annet filter
   * enn Flate (bilder, LZW, ASCII85) er den ikke en tegning vi kan lese.
   */
  async lesObjekter(bytes) {
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

      // objektet strømmen står i: det siste «N G obj» foran den
      const vindu = tekst.slice(Math.max(0, s - 8000), s);
      let hode = null;
      for (const m of vindu.matchAll(/(\d+)\s+(\d+)\s+obj\b/g)) hode = m;
      const ordbok = hode ? vindu.slice(hode.index + hode[0].length) : vindu.slice(-400);

      let n = NaN;
      const direkte = /\/Length\s+(\d+)\b(?!\s+\d+\s+R)/.exec(ordbok);
      const henvist = /\/Length\s+(\d+)\s+(\d+)\s+R/.exec(ordbok);
      if (direkte) n = parseInt(direkte[1], 10);
      else if (henvist) {
        const m = new RegExp(`(?:^|\\D)${henvist[1]}\\s+${henvist[2]}\\s+obj\\s*(\\d+)\\s*endobj`).exec(tekst);
        if (m) n = parseInt(m[1], 10);
      }
      let slutt = e;
      if (n > 0 && start + n <= e) slutt = start + n;
      else while (slutt > start && (bytes[slutt - 1] === 0x0a || bytes[slutt - 1] === 0x0d)) slutt--;

      const filter = /\/Filter\s*(\[[^\]]*\]|\/\w+)/.exec(ordbok);
      const filtre = filter ? (filter[1].match(/\/\w+/g) || []) : [];
      let innhold = null;
      if (!filtre.length) innhold = new TextDecoder('latin1').decode(bytes.subarray(start, slutt));
      else if (filtre.length === 1 && /^\/(FlateDecode|Fl)$/.test(filtre[0])) innhold = await this.pakkUt(bytes.subarray(start, slutt));
      if (innhold) ut.push({ nr: hode ? +hode[1] : NaN, gen: hode ? +hode[2] : 0, ordbok, tekst: innhold });
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

  /**
   * Innholdet side for side – det som skal tolkes som én tegning.
   *
   * EN SIDE KAN HA FLERE STRØMMER. `/Contents [4 0 R 5 0 R]` er én tegning
   * delt i biter, og tegnetilstanden går videre fra den ene til den neste: et
   * `cm` i den første gjelder strekene i den andre. Her ble hver strøm tolket
   * for seg, med enhetsmatrise, og profilen havnet i feil målestokk – eller
   * delt i to tegninger. Nå settes bitene sammen i rekkefølge.
   *
   * SKJEMAOBJEKTER (`/Fm0 Do`) legges inn der de brukes, med sin `/Matrix`.
   * Mange tegneprogram legger selve profilen i et slikt objekt.
   *
   * Finnes ingen `/Contents` (sidene ligger i en komprimert objektstrøm vi ikke
   * leser), er hver strøm en tegning, som før.
   */
  innholdPerSide(objekter, tekst) {
    const etterNr = new Map(objekter.filter(o => Number.isFinite(o.nr)).map(o => [o.nr, o]));
    const kilder = [tekst].concat(objekter.map(o => o.tekst));
    // skjemaobjektene: navn → objekt, fra hver /XObject-ordbok i fila
    const skjema = new Map();
    for (const k of kilder) {
      for (const d of k.matchAll(/\/XObject\s*<<([^>]*)>>/g)) {
        for (const m of d[1].matchAll(/\/([^\s/<>[\]()]+)\s+(\d+)\s+\d+\s+R/g)) {
          const o = etterNr.get(+m[2]);
          if (o && /\/Subtype\s*\/Form/.test(o.ordbok)) skjema.set(m[1], o);
        }
      }
    }
    const medSkjema = (t, dybde = 0) => (dybde > 3 || !skjema.size ? t
      : t.replace(/\/([^\s/<>[\]()]+)\s+Do\b/g, (hele, navn) => {
        const o = skjema.get(navn);
        if (!o) return hele;
        const mx = /\/Matrix\s*\[([^\]]*)\]/.exec(o.ordbok);
        return ` q ${mx ? mx[1].trim() + ' cm ' : ''}${medSkjema(o.tekst, dybde + 1)} Q `;
      }));
    const sider = [];
    const brukt = new Set();
    for (const k of kilder) {
      for (const m of k.matchAll(/\/Contents\s*(\[[^\]]*\]|\d+\s+\d+\s+R)/g)) {
        const nr = [...m[1].matchAll(/(\d+)\s+\d+\s+R/g)].map(x => +x[1]);
        const deler = nr.map(x => etterNr.get(x)).filter(Boolean);
        if (!deler.length) continue;
        const nokkel = nr.join(',');
        if (brukt.has(nokkel)) continue;
        brukt.add(nokkel);
        sider.push(medSkjema(deler.map(o => o.tekst).join('\n')));
      }
    }
    return sider.length ? sider : objekter.map(o => medSkjema(o.tekst));
  },

  /** Leser hele filen og grupperer banene per tegning. */
  async lesFil(fil) {
    const bytes = new Uint8Array(await fil.arrayBuffer());
    const objekter = await this.lesObjekter(bytes);
    const tekst = new TextDecoder('latin1').decode(bytes);
    const tegninger = [];
    for (const s of this.innholdPerSide(objekter, tekst)) {
      if (!/(^|\s)(m|l|re)(\s|$)/.test(s)) continue;
      const baner = this.tolkBaner(s).filter(b => b.length > 1);
      /* En tegning med én profil i er en tegning. Her måtte den ha fem streker,
         og en ren CAD-eksport med terreng, veg og ramme har ofte tre. */
      if (!baner.length || !this.kandidater(baner).length) continue;
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
      /* EN VEI – HVILKEN SOM HELST, OG BARE STEG SOM FAKTISK GÅR. Her talte et
         loddrett steg (`>=`) som framover, og en lukket flate – fyllingen
         mellom terreng og veg, tegnet som én bane – slapp gjennom og ble
         sortert foran veglinja; tilHoyder blandet så over- og underkanten.
         Og en bane tegnet fra høyre mot venstre ble kastet, selv om
         omregningen tar den fint. Nå telles bare steg som flytter seg
         sidelengs, i den retningen banen går, og en lukket bane er en flate. */
      let minX = Infinity, maksX = -Infinity, minY = Infinity, maksY = -Infinity, framover = 0, bakover = 0;
      for (let i = 0; i < b.length; i++) {
        if (b[i].x < minX) minX = b[i].x; if (b[i].x > maksX) maksX = b[i].x;
        if (b[i].y < minY) minY = b[i].y; if (b[i].y > maksY) maksY = b[i].y;
        if (!i) continue;
        const dx = b[i].x - b[i - 1].x;
        if (dx > 1e-6) framover++; else if (dx < -1e-6) bakover++;
      }
      const lukket = Math.hypot(b[0].x - b[b.length - 1].x, b[0].y - b[b.length - 1].y) < 1e-3;
      const andel = Math.max(framover, bakover) / Math.max(1, framover + bakover);
      if (lukket || andel < 0.9 || maksX - minX < 50) continue;
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
    /* Referansepunktene må ligge et stykke fra hverandre i begge retninger.
       Her var grensen en milliondel av en tegneenhet, og to nesten like klikk
       ga høyder på hundre millioner meter. Ett punkt i tegningen (1/72 tomme)
       er det minste som kan være meningen. */
    if (Math.abs(dx) < 1 || Math.abs(dy) < 1) return null;
    const sPerX = (b.s - a.s) / dx;
    const zPerY = (b.z - a.z) / dy;
    const tilS = px => a.s + (px - a.pdfX) * sPerX;
    const tilZ = py => a.z + (py - a.pdfY) * zPerY;

    let punkt = bane.map(p => ({ s: tilS(p.x), z: tilZ(p.y) }))
      .filter(p => isFinite(p.s) && isFinite(p.z));
    if (punkt.length < 2) return null;
    /* BANEN SKAL GÅ ÉN VEI. Den kan være tegnet baklengs – da snus den – men
       går den fram og tilbake, er den ikke en profillinje (en flate, eller to
       linjer i én bane), og å sortere den ville blandet dem. Her ble den
       sortert uansett, og slutthøyden ble 90 der riktig var 98,9. */
    if (punkt[punkt.length - 1].s < punkt[0].s) punkt = punkt.reverse();
    if (punkt.some((p, i) => i && p.s < punkt[i - 1].s - 1e-6)) {
      return { punkt: [], feil: 'Linja du valgte går fram og tilbake – den er en flate eller to linjer i én. Velg en annen.' };
    }

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
