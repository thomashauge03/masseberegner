'use strict';
/**
 * Avlesning av lengdeprofil fra PDF.
 *
 * Tegningen vises som den er, med alle strekene. Brukeren peker ut to punkt
 * han vet profilnummer og høyde pa - typisk to kryss i rutenettet - og sa
 * hvilken strek som er veien. Da er resten bare a regne om.
 *
 * Grunnen til at brukeren ma peke selv, og ikke programmet gjette: en
 * lengdeprofil har fem tusen streker, og terrenglinjen, veglinjen,
 * rutenettet og skraveringen ser like ut for en maskin. Feil strek gir tall
 * som ser riktige ut, og det er verre enn ingen tall.
 */

const PdfUI = {
  app: null,
  tegninger: [],
  gjeldende: null,
  ref: [],            // [{pdfX, pdfY, s, z}]
  valgtLinje: null,
  modus: null,        // 'ref1' | 'ref2' | 'linje'
  vis: { skala: 1, dx: 0, dy: 0 },

  init(app) {
    this.app = app;
    const id = x => document.getElementById(x);
    id('pdfVelg').onclick = () => id('pdfFil').click();
    id('pdfFil').onchange = e => { if (e.target.files[0]) this.apne(e.target.files[0]); e.target.value = ''; };
    id('pdfLukk').onclick = () => id('pdfdialog').classList.add('skjult');
    id('pdfTegning').onchange = e => this.velgTegning(+e.target.value);
    id('pdfRef1').onclick = () => this.settModus('ref1');
    id('pdfRef2').onclick = () => this.settModus('ref2');
    id('pdfVelgLinje').onclick = () => this.settModus('linje');
    id('pdfBruk').onclick = () => this.leggInn();

    const l = id('pdflerret');
    l.addEventListener('click', e => this.klikk(e));
    l.addEventListener('mousemove', e => { this.peker = this.fraSkjerm(e); this.tegn(); });
    l.addEventListener('mouseleave', () => { this.peker = null; this.tegn(); });
    return this;
  },

  async apne(fil) {
    const st = document.getElementById('pdfStatus');
    document.getElementById('pdfdialog').classList.remove('skjult');
    st.textContent = 'Leser ' + fil.name + ' …';
    this.ref = []; this.valgtLinje = null; this.modus = null;
    document.getElementById('pdfBruk').disabled = true;

    if (typeof DecompressionStream === 'undefined') {
      st.innerHTML = '<span class="merke-varsel">Nettleseren kan ikke pakke ut PDF-en. Prøv Chrome eller Edge.</span>';
      return;
    }
    try {
      this.tegninger = await PdfImport.lesFil(fil);
    } catch (e) {
      st.innerHTML = '<span class="merke-varsel">Klarte ikke lese PDF-en: ' + e.message + '</span>';
      return;
    }
    if (!this.tegninger.length) {
      st.innerHTML = '<span class="merke-varsel">Fant ingen tegnede streker i filen. '
        + 'Er PDF-en skannet fra papir, ligger det bare et bilde der – da må høydene skrives inn manuelt.</span>';
      return;
    }
    const velg = document.getElementById('pdfTegning');
    velg.innerHTML = this.tegninger.map((t, i) =>
      `<option value="${i}">Tegning ${i + 1} – ${t.baner.length} streker</option>`).join('');
    this.velgTegning(0);
    st.textContent = `Fant ${this.tegninger.length} tegninger. Velg den som viser lengdeprofilen.`;
    this.settSteg(1);
  },

  velgTegning(i) {
    this.gjeldende = this.tegninger[i];
    this.kandidater = PdfImport.kandidater(this.gjeldende.baner);
    this.ref = []; this.valgtLinje = null;
    document.getElementById('pdfBruk').disabled = true;
    this.tilpassVisning();
    this.tegn();
  },

  settSteg(n) {
    const tekst = {
      1: '1 · Velg tegningen som viser lengdeprofilen',
      2: '2 · Trykk «Sett punkt 1», klikk i et punkt du vet profilnummer og høyde på – gjerne et kryss i rutenettet',
      3: '3 · Gjør det samme med «Sett punkt 2», så langt unna det første som mulig',
      4: '4 · Trykk «Velg linje» og klikk på streken som er veglinjen',
      5: '5 · Kontroller tallene under, og legg dem inn'
    };
    document.getElementById('pdfSteg').textContent = tekst[n] || '';
  },

  tilpassVisning() {
    const l = document.getElementById('pdflerret');
    const B = l.clientWidth || 900, H = l.clientHeight || 460;
    const g = this.gjeldende;
    const bw = g.maksX - g.minX, bh = g.maksY - g.minY;
    this.vis.skala = Math.min((B - 20) / (bw || 1), (H - 20) / (bh || 1));
    this.vis.dx = 10 - g.minX * this.vis.skala;
    // PDF har y oppover, lerretet nedover
    this.vis.dy = H - 10 + g.minY * this.vis.skala;
  },

  tilSkjerm(p) {
    return { x: p.x * this.vis.skala + this.vis.dx, y: this.vis.dy - p.y * this.vis.skala };
  },
  fraSkjerm(e) {
    const r = document.getElementById('pdflerret').getBoundingClientRect();
    return {
      x: (e.clientX - r.left - this.vis.dx) / this.vis.skala,
      y: (this.vis.dy - (e.clientY - r.top)) / this.vis.skala
    };
  },

  settModus(m) {
    this.modus = m;
    for (const [id, n] of [['pdfRef1', 'ref1'], ['pdfRef2', 'ref2'], ['pdfVelgLinje', 'linje']]) {
      document.getElementById(id).classList.toggle('aktiv', n === m);
    }
    if (m === 'ref1') this.settSteg(2);
    if (m === 'ref2') this.settSteg(3);
    if (m === 'linje') this.settSteg(4);
    this.tegn();
  },

  klikk(e) {
    if (!this.gjeldende || !this.modus) return;
    const p = this.fraSkjerm(e);
    if (this.modus === 'linje') {
      const funn = this.naermesteBane(p);
      if (funn) { this.valgtLinje = funn; this.oppdaterResultat(); }
      this.settModus(null);
      this.tegn();
      return;
    }
    const nr = this.modus === 'ref1' ? 0 : 1;
    const svar = prompt(
      `Punkt ${nr + 1}: skriv profilnummer og høyde, atskilt med mellomrom.\nFor eksempel:  0 150.5`,
      this.ref[nr] ? `${this.ref[nr].s} ${this.ref[nr].z}` : '');
    if (svar) {
      const biter = svar.trim().split(/[\s;,]+/).map(v => parseFloat(v.replace(',', '.')));
      if (biter.length >= 2 && isFinite(biter[0]) && isFinite(biter[1])) {
        this.ref[nr] = { pdfX: p.x, pdfY: p.y, s: biter[0], z: biter[1] };
      }
    }
    this.settModus(null);
    this.oppdaterResultat();
    this.tegn();
  },

  naermesteBane(p) {
    let best = null, bestD = Infinity;
    const grense = 12 / this.vis.skala;
    for (const k of this.kandidater) {
      for (let i = 1; i < k.bane.length; i++) {
        const d = avstandTilStrek(p, k.bane[i - 1], k.bane[i]);
        if (d < bestD) { bestD = d; best = k; }
      }
    }
    return bestD <= grense ? best : null;
  },

  oppdaterResultat() {
    const st = document.getElementById('pdfStatus');
    const knapp = document.getElementById('pdfBruk');
    knapp.disabled = true;
    if (this.ref.length < 2 || !this.ref[0] || !this.ref[1]) {
      st.textContent = 'Sett to referansepunkt du vet profilnummer og høyde på.';
      return;
    }
    if (!this.valgtLinje) { st.textContent = 'Velg hvilken strek som er veglinjen.'; return; }

    const steg = Math.max(1, parseInt(document.getElementById('pdfSteglengde').value, 10) || 5);
    const r = PdfImport.tilHoyder(this.valgtLinje.bane, this.ref, steg);
    if (!r || !r.punkt.length) { st.textContent = 'Klarte ikke regne om linjen. Sett referansepunktene lenger fra hverandre.'; return; }
    this.resultat = r;

    const p = r.punkt;
    const zMin = Math.min(...p.map(q => q.z)), zMaks = Math.max(...p.map(q => q.z));
    const vise = p.filter((_, i) => i % Math.max(1, Math.floor(p.length / 6)) === 0).slice(0, 6);
    st.innerHTML = `<b>${p.length} punkt</b> fra profil ${r.fra.toFixed(0)} til ${r.til.toFixed(0)}, `
      + `høyde ${zMin.toFixed(2)} – ${zMaks.toFixed(2)} moh.<br>`
      + '<span class="pdfsmak">' + vise.map(q => `${q.s.toFixed(0)}: ${q.z.toFixed(2)}`).join(' &nbsp; ') + ' …</span>'
      + '<br><span class="merke-varsel">Kontroller noen av disse mot planen før du bruker dem.</span>';
    knapp.disabled = false;
    this.settSteg(5);
  },

  leggInn() {
    if (!this.resultat) return;
    const L = this.app.linje ? this.app.linje.lengde : Infinity;
    const innafor = this.resultat.punkt.filter(p => p.s >= -0.5 && p.s <= L + 0.5);
    if (!innafor.length) {
      document.getElementById('pdfStatus').innerHTML =
        `<span class="merke-varsel">Ingen av punktene faller innenfor veglengden på ${L.toFixed(0)} m. `
        + 'Sjekk at referansepunktene har riktig profilnummer.</span>';
      return;
    }
    this.app.P.vip = innafor.map(p => ({ s: +Math.min(p.s, L).toFixed(2), z: p.z, k: 0, laast: true }));
    this.app.beregn();
    this.app.visHoydetabell();
    document.getElementById('pdfdialog').classList.add('skjult');
    this.app.status(`Leste inn ${innafor.length} høyder fra PDF-en`
      + (innafor.length < this.resultat.punkt.length
        ? ` (${this.resultat.punkt.length - innafor.length} lå utenfor veglengden)` : ''));
  },

  tegn() {
    const l = document.getElementById('pdflerret');
    if (!l || !this.gjeldende) return;
    const dpr = window.devicePixelRatio || 1;
    if (l.width !== l.clientWidth * dpr || l.height !== l.clientHeight * dpr) {
      l.width = l.clientWidth * dpr; l.height = l.clientHeight * dpr;
      this.tilpassVisning();
    }
    const c = l.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = Farger.flate;
    c.fillRect(0, 0, l.clientWidth, l.clientHeight);

    // hele tegningen svakt
    c.strokeStyle = Farger.rutenett; c.lineWidth = 0.7;
    c.beginPath();
    for (const b of this.gjeldende.baner) {
      for (let i = 0; i < b.length; i++) {
        const p = this.tilSkjerm(b[i]);
        i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y);
      }
    }
    c.stroke();

    // kandidatene tydeligere
    c.strokeStyle = Farger.terreng; c.lineWidth = 1.1;
    c.beginPath();
    for (const k of this.kandidater) {
      for (let i = 0; i < k.bane.length; i++) {
        const p = this.tilSkjerm(k.bane[i]);
        i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y);
      }
    }
    c.stroke();

    // streken under pekeren nar man skal velge
    if (this.modus === 'linje' && this.peker) {
      const under = this.naermesteBane(this.peker);
      if (under) this.strekOpp(c, under.bane, Farger.skjaering, 2.5);
    }
    if (this.valgtLinje) this.strekOpp(c, this.valgtLinje.bane, Farger.veg, 2.5);

    // referansepunktene
    this.ref.forEach((r, i) => {
      if (!r) return;
      const p = this.tilSkjerm({ x: r.pdfX, y: r.pdfY });
      c.strokeStyle = Farger.skjaering; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(p.x - 9, p.y); c.lineTo(p.x + 9, p.y);
      c.moveTo(p.x, p.y - 9); c.lineTo(p.x, p.y + 9); c.stroke();
      c.fillStyle = Farger.blekk; c.font = '11px system-ui'; c.textAlign = 'left';
      c.fillText(`${i + 1}: prof ${r.s}, ${r.z} moh`, p.x + 11, p.y - 4);
    });
  },

  strekOpp(c, bane, farge, bredde) {
    c.strokeStyle = farge; c.lineWidth = bredde;
    c.beginPath();
    for (let i = 0; i < bane.length; i++) {
      const p = this.tilSkjerm(bane[i]);
      i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y);
    }
    c.stroke();
  }
};

function avstandTilStrek(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
