'use strict';
/**
 * Lengdeprofilen for ett rør: terrenget, røret som et bånd mellom topp og
 * bunn, overdekningen ved de målte punktene og objektene som sitter på røret.
 *
 * `tegnPaa(lerret, data, valg)` tegner på et hvilket som helst lerret – det er
 * den rapporten bruker, med lys palett. `tegn()` er skjermens utgave.
 *
 * HØYDEN ER OVERDREVET, OG DET STÅR PÅ TEGNINGEN.
 * Et rør på 700 m som faller 40 m er en strek uten form i riktig målestokk.
 * Overdrivelsen velges så profilen fyller lerretet, og tallet står i hjørnet –
 * et bilde som overdriver uten å si det, lyver.
 */
const Rorprofil = {
  app: null,
  lerret: null,
  peker: null,

  init(app) {
    this.app = app;
    this.lerret = document.getElementById('rorprofil');
    if (!this.lerret) return this;
    /* Neste bilde, ikke nå – se `tegnSnart`. Her sto `this.tegn()`, som satte
       canvas.width inne i målingen, og nettlesertesten ble rød på «ResizeObserver
       loop completed» når rørbildet ble byttet inn og ut. */
    new ResizeObserver(() => tegnSnart(this)).observe(this.lerret);
    this.lerret.addEventListener('mousemove', e => {
      const r = this.lerret.getBoundingClientRect();
      this.peker = e.clientX - r.left;
      this.tegn();
    });
    this.lerret.addEventListener('mouseleave', () => { this.peker = null; this.tegn(); });
    return this;
  },

  /** Alt profilen trenger for ett rør. */
  dataFor(app, res, linje) {
    if (!res || res.type !== 'ror' || !linje) return null;
    const r = app.P.ror;
    const kode = r.koder[linje.kode] || Ror.tolkKode(linje.kode);
    /* Hvert objekt hører til ETT rør – det nærmeste. Fordelingen gjøres én
       gang per resultat; den er den samme for alle profilene. */
    if (!res._objektplass) {
      Object.defineProperty(res, '_objektplass', { configurable: true, enumerable: false,
        value: Ror.objekterPaaLinjer(res.linjer, res.bygg.objekter, Ror.lagTilXY(r.sone, res.sone), 3, r.koder) });
    }
    return {
      linje, kode, profil: res.profiler.get(linje.id),
      objekter: res._objektplass.get(linje.id) || [],
      bakkefaktor: res.bakkefaktor || 1
    };
  },

  tegn() {
    if (!this.lerret || !this.lerret.clientWidth || !this.lerret.clientHeight) return;
    if (typeof Ror3d !== 'undefined' && Ror3d.aktiv) return;      // 3D ligger oppå
    const app = this.app;
    const res = app && app.erRor() && app.resultat && app.resultat.type === 'ror' ? app.resultat : null;
    const linje = res && res.linjer.find(l => l.id === RorUI.valgt);
    const d = this.dataFor(app, res, linje);
    /* Avlesningsstripa ligger oppå de nederste pikslene av lerretet – se
       `.avlesning`. Uten den ekstra marginen dekket den stasjonstallene. */
    const lesning = this.tegnPaa(this.lerret, d, { peker: this.peker, bunn: 48 });
    const e = document.getElementById('rorEtikett');
    if (e) {
      e.textContent = lesning || (d ? `${d.linje.kode} – pek i profilen for tall`
        : (app && app.erRor() ? 'Ingen rør å vise ennå' : '–'));
    }
  },

  /** @returns {string} avlesningen under pekeren, eller '' */
  tegnPaa(lerret, d, valg = {}) {
    const dpr = valg.dpr || window.devicePixelRatio || 1;
    const B = lerret.clientWidth, H = lerret.clientHeight;
    lerret.width = Math.round(B * dpr);
    lerret.height = Math.round(H * dpr);
    const k = lerret.getContext('2d');
    k.setTransform(dpr, 0, 0, dpr, 0, 0);
    k.fillStyle = Farger.flate;
    k.fillRect(0, 0, B, H);
    k.font = '11px ' + Farger.hent('skrift');
    if (!d || !d.profil || d.profil.prover.length < 2) {
      k.fillStyle = Farger.blekkSvak; k.textAlign = 'center'; k.textBaseline = 'middle';
      k.fillText(d ? 'Røret har for få punkt til en profil' : 'Ingen rør å vise ennå', B / 2, H / 2);
      return '';
    }
    const pr = d.profil, P = pr.prover, bf = d.bakkefaktor;
    const ml = 56, mr = 14, mt = 18, mb = valg.bunn != null ? valg.bunn : 26;
    const bb = B - ml - mr, hh = H - mt - mb;
    const L = Math.max(pr.lengde, 1e-6);
    let zmin = Infinity, zmaks = -Infinity;
    for (const q of P) {
      if (Number.isFinite(q.terreng)) { zmin = Math.min(zmin, q.terreng); zmaks = Math.max(zmaks, q.terreng); }
      zmin = Math.min(zmin, q.bunn); zmaks = Math.max(zmaks, q.topp);
    }
    const pad = Math.max(0.4, (zmaks - zmin) * 0.12);
    zmin -= pad; zmaks += pad;
    const X = s => ml + (s / L) * bb;
    const Y = z => mt + (zmaks - z) / (zmaks - zmin) * hh;

    // rutenett med stasjon (lengde på bakken) og kote
    const stegS = velgSteg(L * bf, Math.max(2, Math.floor(bb / 90)));
    const stegZ = velgSteg(zmaks - zmin, Math.max(2, Math.floor(hh / 40)));
    k.strokeStyle = Farger.rutenett; k.lineWidth = 1; k.fillStyle = Farger.blekkSvak;
    k.textAlign = 'center'; k.textBaseline = 'top';
    for (let s = 0; s <= L * bf + 1e-9; s += stegS) {
      const x = Math.round(X(s / bf)) + 0.5;
      k.beginPath(); k.moveTo(x, mt); k.lineTo(x, mt + hh); k.stroke();
      k.fillText(Rapport.tall(s, 0), x, mt + hh + 6);
    }
    k.textAlign = 'right'; k.textBaseline = 'middle';
    for (let z = Math.ceil(zmin / stegZ) * stegZ; z <= zmaks; z += stegZ) {
      const y = Math.round(Y(z)) + 0.5;
      k.beginPath(); k.moveTo(ml, y); k.lineTo(ml + bb, y); k.stroke();
      k.fillText(Rapport.tall(z, stegZ < 1 ? 1 : 0), ml - 6, y);
    }

    // terrenget – med hull der Kartverket ikke har data, aldri en strek over dem
    k.strokeStyle = Farger.terreng; k.lineWidth = 1.6;
    k.beginPath();
    let nede = false;
    for (const q of P) {
      if (!Number.isFinite(q.terreng)) { nede = false; continue; }
      if (nede) k.lineTo(X(q.s), Y(q.terreng)); else { k.moveTo(X(q.s), Y(q.terreng)); nede = true; }
    }
    k.stroke();

    // røret: båndet mellom topp og bunn, og toppen som strek
    const farge = Farger.ror(d.kode.farge);
    k.fillStyle = farge; k.globalAlpha = 0.35;
    k.beginPath();
    P.forEach((q, i) => (i ? k.lineTo(X(q.s), Y(q.topp)) : k.moveTo(X(q.s), Y(q.topp))));
    for (let i = P.length - 1; i >= 0; i--) k.lineTo(X(P[i].s), Y(P[i].bunn));
    k.closePath(); k.fill();
    k.globalAlpha = 1;
    k.strokeStyle = farge; k.lineWidth = 2;
    k.beginPath();
    P.forEach((q, i) => (i ? k.lineTo(X(q.s), Y(q.topp)) : k.moveTo(X(q.s), Y(q.topp))));
    k.stroke();

    // de målte punktene, og overdekningen ved dem der det er plass til tallet
    const maalte = P.filter(q => q.maalt);
    const hver = Math.max(1, Math.ceil(maalte.length / Math.max(1, bb / 38)));
    k.textAlign = 'center'; k.textBaseline = 'bottom';
    maalte.forEach((q, i) => {
      k.fillStyle = farge;
      k.beginPath(); k.arc(X(q.s), Y(q.topp), 2.6, 0, Math.PI * 2); k.fill();
      if (!Number.isFinite(q.overdekning) || i % hver) return;
      k.fillStyle = q.overdekning < 0 ? Farger.skjaering : Farger.blekk;
      k.fillText(Rapport.tall(q.overdekning, 2), X(q.s), Y(Math.max(q.topp, q.terreng)) - 4);
    });

    // objektene som sitter på røret
    k.textBaseline = 'top';
    for (const o of d.objekter) {
      const x = X(o.s), y = Y(o.z);
      k.fillStyle = Farger.ror('punkt'); k.strokeStyle = Farger.blekk; k.lineWidth = 1;
      k.fillRect(x - 3.5, y - 3.5, 7, 7); k.strokeRect(x - 3.5, y - 3.5, 7, 7);
      k.fillStyle = Farger.blekkSvak;
      k.fillText(o.kode, x, y + 6);
    }

    // hva tegningen er, og hvor mye høyden er strukket
    const overdriv = (L / bb) / ((zmaks - zmin) / hh);
    k.fillStyle = Farger.blekk; k.textAlign = 'left'; k.textBaseline = 'top';
    k.fillText(`${d.linje.kode}${d.kode.dim ? ' · ⌀' + d.kode.dim : ''} · ${Rapport.tall(L * bf, 1)} m`
      + ` · høyden ${Rapport.tall(overdriv, 0)}× overdrevet`, ml + 6, mt + 2);

    // pekeren
    if (valg.peker == null || valg.peker < ml || valg.peker > ml + bb) return '';
    const s = (valg.peker - ml) / bb * L;
    const q = P.reduce((a, b) => (Math.abs(b.s - s) < Math.abs(a.s - s) ? b : a));
    k.strokeStyle = Farger.blekk; k.lineWidth = 1; k.setLineDash([3, 3]);
    k.beginPath(); k.moveTo(X(q.s) + 0.5, mt); k.lineTo(X(q.s) + 0.5, mt + hh); k.stroke();
    k.setLineDash([]);
    const f = pr.fall.find(x => q.s >= x.fra - 1e-9 && q.s <= x.til + 1e-9);
    return `Profil ${Rapport.tall(q.s * bf, 1)} m · terreng ${Number.isFinite(q.terreng) ? Rapport.tall(q.terreng, 2) : '–'}`
      + ` · topp rør ${Rapport.tall(q.topp, 2)} · overdekning `
      + (Number.isFinite(q.overdekning) ? Rapport.tall(q.overdekning, 2) + ' m' : 'ukjent')
      + (f && Number.isFinite(f.fall) ? ` · fall ${Rapport.tall(f.fall * 100, 1)} %` : '');
  },

  /**
   * Oversiktsplanen til rapporten: rørene sett ovenfra, med nummer, målestokk
   * og nordpil.
   *
   * UTEN BAKGRUNNSKART. Kartflisene kommer fra en annen tjener, og tegnes de
   * inn i et lerret, kan lerretet ikke leses ut som bilde lenger – rapporten
   * ville stått uten plan. Strekene alene er det papiret trenger.
   */
  tegnPlan(lerret, res, app) {
    const B = lerret.clientWidth, H = lerret.clientHeight;
    lerret.width = B; lerret.height = H;
    const k = lerret.getContext('2d');
    k.fillStyle = Farger.flate; k.fillRect(0, 0, B, H);
    const r = app.P.ror;
    const tilXY = Ror.lagTilXY(r.sone, res.sone);
    let minX = Infinity, maksX = -Infinity, minY = Infinity, maksY = -Infinity;
    const ta = q => {
      minX = Math.min(minX, q.x); maksX = Math.max(maksX, q.x);
      minY = Math.min(minY, q.y); maksY = Math.max(maksY, q.y);
    };
    for (const l of res.linjer) l.xy.forEach(ta);
    for (const p of res.bygg.objekter) ta(tilXY(p));
    if (!Number.isFinite(minX)) return;
    const marg = 48;
    const skala = Math.min((B - 2 * marg) / Math.max(1, maksX - minX), (H - 2 * marg) / Math.max(1, maksY - minY));
    const ox = marg + ((B - 2 * marg) - (maksX - minX) * skala) / 2;
    const oy = marg + ((H - 2 * marg) - (maksY - minY) * skala) / 2;
    const X = x => ox + (x - minX) * skala;
    const Y = y => H - oy - (y - minY) * skala;
    const skrift = Farger.hent('skrift');
    for (const l of res.linjer) {
      const kd = r.koder[l.kode] || Ror.tolkKode(l.kode);
      k.strokeStyle = Farger.ror(kd.farge);
      k.lineWidth = Math.max(2, Math.min(5, 1.5 + (kd.dim || 50) / 60));
      k.beginPath();
      l.xy.forEach((q, i) => (i ? k.lineTo(X(q.x), Y(q.y)) : k.moveTo(X(q.x), Y(q.y))));
      k.stroke();
    }
    k.fillStyle = Farger.blekk;
    for (const p of res.bygg.objekter) { const q = tilXY(p); k.fillRect(X(q.x) - 3, Y(q.y) - 3, 6, 6); }
    // nummeret er raden i tabellen – bare ved rørene over 20 m, ellers blir det et kratt av tall
    const bf = res.bakkefaktor || 1;
    k.font = 'bold 15px ' + skrift; k.textAlign = 'center'; k.textBaseline = 'middle';
    res.linjer.forEach((l, i) => {
      if (l.lengde * bf < 20) return;
      /* SPREDT LANGS RØRET, IKKE MIDT PÅ. Rørene i samme grøft har samme midte,
         og der la nummeret til det ene seg over det andre. Det gylne snitt
         sprer dem jevnt uansett hvor mange som deler grøft. */
      const m = l.xy[Math.floor((l.xy.length - 1) * (0.2 + 0.6 * ((i * 0.618034) % 1)))];
      k.fillStyle = Farger.flate; k.fillRect(X(m.x) + 4, Y(m.y) - 21, 22, 18);
      k.fillStyle = Farger.blekk; k.fillText(String(i + 1), X(m.x) + 15, Y(m.y) - 12);
    });
    // målestokk og nordpil
    const meter = velgSteg((B - 2 * marg) / skala / 4, 1);
    k.strokeStyle = Farger.blekk; k.lineWidth = 3;
    k.beginPath(); k.moveTo(marg, H - 20); k.lineTo(marg + meter * skala, H - 20); k.stroke();
    k.font = '14px ' + skrift; k.textAlign = 'left'; k.textBaseline = 'bottom';
    k.fillText(Rapport.tall(meter, 0) + ' m', marg, H - 26);
    k.textAlign = 'center';
    k.beginPath(); k.moveTo(B - 30, 22); k.lineTo(B - 38, 44); k.lineTo(B - 22, 44); k.closePath(); k.fill();
    k.fillText('N', B - 30, 62);
  }
};

if (typeof module !== 'undefined') module.exports = Rorprofil;
