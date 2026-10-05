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
  /* Skalaen skjermens profil sist ble tegnet med, og det musa holder i:
     et kontrollpunkt som dras, eller et klikk på røret mellom dem. */
  _skala: null,
  _dra: null,
  _paRor: null,

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
      if (this._dra) this._dra.y = e.clientY - r.top;
      this.lerret.style.cursor = this._dra ? 'ns-resize'
        : this._kontrollVed(e.clientX - r.left, e.clientY - r.top) ? 'pointer' : '';
      this.tegn();
    });
    this.lerret.addEventListener('mouseleave', () => {
      this.peker = null; this._dra = null; this._paRor = null;
      this.lerret.style.cursor = '';
      this.tegn();
    });
    /* Et tegnet rør redigeres her: klikk på et kontrollpunkt åpner
       punktfeltet, dra låser det på ny høyde, og klikk på røret mellom
       kontrollpunktene setter inn et punkt der. */
    this.lerret.addEventListener('mousedown', e => this._ned(e));
    this.lerret.addEventListener('mouseup', e => this._opp(e));
    return this;
  },

  /** Kontrollpunktet under musa i profilen til et tegnet rør, eller null. */
  _kontrollVed(mx, my) {
    const sk = this._skala;
    if (!sk || !sk.d || !sk.d.plan) return null;
    return sk.d.plan.kontroll.find(x => Math.abs(sk.X(x.s) - mx) <= 7 && Math.abs(sk.Y(x.topp) - my) <= 9) || null;
  },

  _ned(e) {
    const sk = this._skala;
    this._dra = null; this._paRor = null;
    if (!sk || !sk.d || !sk.d.plan) return;
    const r = this.lerret.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    const c = this._kontrollVed(mx, my);
    if (c) { this._dra = { c, y0: my, y: null }; return; }
    const s = sk.sAv(mx), P = sk.d.profil.prover;
    const q = P.reduce((a, b) => (Math.abs(b.s - s) < Math.abs(a.s - s) ? b : a));
    if (Math.abs(sk.Y(q.topp) - my) <= 8) this._paRor = { s: q.s };
  },

  _opp(e) {
    const sk = this._skala, d = sk && sk.d;
    const r = this.lerret.getBoundingClientRect(), my = e.clientY - r.top;
    if (this._dra && d) {
      const { c, y0 } = this._dra;
      this._dra = null;
      if (Math.abs(my - y0) > 3) {
        const topp = sk.zAv(sk.Y(c.topp) + (my - y0));
        RorPlanUI.laas(d.linje.id, c.punkt, Math.round(RorPlan.bunnFraTopp(topp, d.kode) * 100) / 100);
      } else RorPlanUI.punktfelt(d.linje.id, c.punkt);
      return;
    }
    if (this._paRor && d) {
      const s = this._paRor.s;
      this._paRor = null;
      const pid = RorPlanUI.settInnVed(d.linje.id, s);
      if (pid) RorPlanUI.punktfelt(d.linje.id, pid);
    }
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
      bakkefaktor: res.bakkefaktor || 1,
      groft: res.groft ? res.groft.profiler.get(linje.id) || null : null,
      // et tegnet rør: kontrollpunktene, varslene og kummene langs det
      plan: res.plan && linje.plan ? Object.assign({}, linje.plan, {
        D: (kode.dim || 0) / 1000,
        kontroll: (res.kontroll || []).filter(c => c.ror === linje.id).sort((a, b) => a.s - b.s),
        varsler: (res.merknader || []).filter(m => m.linje === linje.id && ['overdekning', 'fall', 'motfall'].includes(m.type)),
        kummer: (res.kummer || []).filter(k => k.ror === linje.id)
      }) : null
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
    /* Mens et kontrollpunkt dras: en ring der det havner, og høyden det får
       når man slipper. Uten den drar man i blinde. */
    const dra = this._dra, sk = this._skala;
    if (dra && dra.y != null && sk && sk.d && d) {
      const k = this.lerret.getContext('2d');
      const x = sk.X(dra.c.s), y = sk.Y(dra.c.topp) + (dra.y - dra.y0);
      k.strokeStyle = Farger.blekk; k.lineWidth = 1.5; k.setLineDash([3, 3]);
      k.beginPath(); k.arc(x, y, 6, 0, Math.PI * 2); k.stroke(); k.setLineDash([]);
      const bunn = Math.round(RorPlan.bunnFraTopp(sk.zAv(y), d.kode) * 100) / 100;
      if (e) e.textContent = `Slipp for å låse bunn innvendig på ${Rapport.tall(bunn, 2)}`;
    }
  },

  /** @returns {string} avlesningen under pekeren, eller '' */
  tegnPaa(lerret, d, valg = {}) {
    // skalaen musa leser – en gammel ville truffet punkt som ikke står der lenger
    if (lerret === this.lerret) this._skala = null;
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
    for (const q of d.groft || []) if (Number.isFinite(q.gravebunn)) zmin = Math.min(zmin, q.gravebunn, q.fundamentBunn);
    for (const km of (d.plan && d.plan.kummer) || []) zmin = Math.min(zmin, km.bunnlop - 0.4);
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

    /* GRØFTA: fundament og omfylling som felt, gravebunnen og fjellet som
       streker. Bare der det faktisk graves – over terrenget er det ingen, og
       der brytes feltene, så de aldri bygger bro over et hull. */
    const Gr = d.groft || [];
    const biter = [];
    let bit = [];
    for (const q of Gr) {
      if (Number.isFinite(q.gravebunn)) bit.push(q);
      else if (bit.length) { biter.push(bit); bit = []; }
    }
    if (bit.length) biter.push(bit);
    // hva tegningen er, og hvor mye høyden er strukket – står øverst til venstre
    const overdriv = (L / bb) / ((zmaks - zmin) / hh);
    const tittel = `${d.linje.kode}${d.kode.dim ? ' · ⌀' + d.kode.dim : ''} · ${Rapport.tall(L * bf, 1)} m`
      + ` · høyden ${Rapport.tall(overdriv, 0)}× overdrevet`;
    const tittelSlutt = ml + 6 + k.measureText(tittel).width + 12;
    if (biter.some(b => b.length > 1)) {
      const felt = (lo, hi, fyll) => {
        k.fillStyle = fyll; k.globalAlpha = 0.5;
        for (const G of biter) {
          if (G.length < 2) continue;
          k.beginPath();
          G.forEach((q, i) => (i ? k.lineTo(X(q.s), Y(hi(q))) : k.moveTo(X(q.s), Y(hi(q)))));
          for (let i = G.length - 1; i >= 0; i--) k.lineTo(X(G[i].s), Y(lo(G[i])));
          k.closePath(); k.fill();
        }
        k.globalAlpha = 1;
      };
      felt(q => q.fundamentTopp, q => Math.min(q.omfyllingTopp, q.terreng), Farger.groft('omfylling'));
      felt(q => q.fundamentBunn, q => q.fundamentTopp, Farger.groft('fundament'));
      const strek = (z, s, stipling) => {
        k.strokeStyle = s; k.lineWidth = 1.4; k.setLineDash(stipling);
        k.beginPath();
        let nede = false;
        for (const q of Gr) {
          const v = z(q);
          if (v == null || !Number.isFinite(v)) { nede = false; continue; }
          if (nede) k.lineTo(X(q.s), Y(v)); else { k.moveTo(X(q.s), Y(v)); nede = true; }
        }
        k.stroke(); k.setLineDash([]);
      };
      strek(q => q.gravebunn, Farger.groft('bunn'), []);
      strek(q => q.fjell, Farger.groft('fjell'), [3, 3]);
      /* Navnene ved fargene, så fargen aldri står alene. Fra høyre, og bare
         så langt det er plass før tittelen. */
      k.font = '10px ' + Farger.hent('skrift'); k.textAlign = 'right'; k.textBaseline = 'top';
      let xx = ml + bb - 4;
      for (const [navn, s, strekt] of [['fjell', Farger.groft('fjell'), true], ['gravebunn', Farger.groft('bunn'), true],
        ['fundament', Farger.groft('fundament'), false], ['omfylling', Farger.groft('omfylling'), false]]) {
        const bredde = k.measureText(navn).width + 4 + 12;
        if (xx - bredde < tittelSlutt) break;
        k.fillStyle = Farger.blekkSvak; k.fillText(navn, xx, mt + 2);
        xx -= k.measureText(navn).width + 4;
        k.fillStyle = s; k.strokeStyle = s;
        if (strekt) {
          k.lineWidth = 1.6; k.setLineDash(navn === 'fjell' ? [3, 3] : []);
          k.beginPath(); k.moveTo(xx - 12, mt + 7); k.lineTo(xx, mt + 7); k.stroke(); k.setLineDash([]);
        } else k.fillRect(xx - 12, mt + 3, 12, 8);
        xx -= 22;
      }
      k.font = '11px ' + Farger.hent('skrift');
    }

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

    /* ET TEGNET RØR: grensen for overdekningen, varslene, kummene og
       kontrollpunktene med bunnløpet – og fallet mellom dem for selvfall. */
    if (d.plan) {
      const pl = d.plan;
      k.strokeStyle = Farger.skjaering; k.lineWidth = 1; k.setLineDash([2, 4]);
      k.beginPath();
      let nede = false;
      for (const q of P) {
        if (!Number.isFinite(q.terreng)) { nede = false; continue; }
        const y = Y(q.terreng - pl.grense);
        if (nede) k.lineTo(X(q.s), y); else { k.moveTo(X(q.s), y); nede = true; }
      }
      k.stroke(); k.setLineDash([]);
      for (const v of pl.varsler) {
        k.fillStyle = Farger.skjaering; k.globalAlpha = 0.16;
        k.fillRect(X(v.fra), mt, Math.max(3, X(v.til) - X(v.fra)), hh);
        k.globalAlpha = 1;
      }
      for (const km of pl.kummer) {
        const c = pl.kontroll.find(x => x.kum === km.id);
        if (!c) continue;
        const halv = (km.diameter / 1000 + 0.2) / 2 / L * bb;
        k.strokeStyle = Farger.blekk; k.lineWidth = 1.2;
        k.strokeRect(X(c.s) - Math.max(2, halv), Y(km.terreng), 2 * Math.max(2, halv), Y(km.bunnlop - 0.25) - Y(km.terreng));
      }
      k.font = '10px ' + Farger.hent('skrift'); k.textAlign = 'center';
      for (const c of pl.kontroll) {
        const x = X(c.s), y = Y(c.topp);
        k.fillStyle = c.laast ? Farger.blekk : Farger.flate; k.strokeStyle = Farger.blekk; k.lineWidth = 1.5;
        k.beginPath();
        if (c.kum) k.rect(x - 4.5, y - 4.5, 9, 9);
        else if (c.laast || c.fra) { k.moveTo(x, y - 6); k.lineTo(x + 5, y + 3); k.lineTo(x - 5, y + 3); k.closePath(); }
        else k.arc(x, y, 4, 0, Math.PI * 2);
        k.fill(); k.stroke();
        k.fillStyle = Farger.blekk; k.textBaseline = 'top';
        k.fillText(Rapport.tall(c.bunn, 2), x, Y(c.topp - pl.D) + 4);
      }
      if (pl.regel === 'selvfall') {
        k.textBaseline = 'bottom';
        for (let j = 1; j < pl.kontroll.length; j++) {
          const a = pl.kontroll[j - 1], c = pl.kontroll[j], len = c.s - a.s;
          if (!(len > 0.01) || X(c.s) - X(a.s) < 34) continue;
          const fall = 1000 * (pl.motsatt ? c.bunn - a.bunn : a.bunn - c.bunn) / len;
          k.fillStyle = fall < -0.05 ? Farger.skjaering : Farger.blekkSvak;
          k.fillText(`${Rapport.tall(fall, 1)} ‰`, (X(a.s) + X(c.s)) / 2, Y((a.topp + c.topp) / 2) - 6);
        }
      }
      k.font = '11px ' + Farger.hent('skrift');
    }

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

    k.fillStyle = Farger.blekk; k.textAlign = 'left'; k.textBaseline = 'top';
    k.fillText(tittel, ml + 6, mt + 2);

    // skalaen til skjermens lerret – den musa redigerer et tegnet rør med
    if (lerret === this.lerret) {
      this._skala = { X, Y, sAv: px => (px - ml) / bb * L, zAv: py => zmaks - (py - mt) / hh * (zmaks - zmin), d };
    }

    // pekeren
    if (valg.peker == null || valg.peker < ml || valg.peker > ml + bb) return '';
    const s = (valg.peker - ml) / bb * L;
    const q = P.reduce((a, b) => (Math.abs(b.s - s) < Math.abs(a.s - s) ? b : a));
    k.strokeStyle = Farger.blekk; k.lineWidth = 1; k.setLineDash([3, 3]);
    k.beginPath(); k.moveTo(X(q.s) + 0.5, mt); k.lineTo(X(q.s) + 0.5, mt + hh); k.stroke();
    k.setLineDash([]);
    const f = pr.fall.find(x => q.s >= x.fra - 1e-9 && q.s <= x.til + 1e-9);
    // grøfteprøven nærmest – står den der det ikke graves, er det ingen dybde å vise
    const gq = Gr.length ? Gr.reduce((a, b) => (Math.abs(b.s - q.s) < Math.abs(a.s - q.s) ? b : a)) : null;
    const grofttekst = gq && Number.isFinite(gq.gravebunn)
      ? ` · gravedybde ${Rapport.tall(gq.terreng - gq.gravebunn, 2)} m`
        + (gq.fjell != null && gq.fjell > gq.gravebunn ? ` · fjell ${Rapport.tall(gq.fjell, 2)}` : '')
      : '';
    /* Et tegnet rør: bunn innvendig, og for selvfall fallet mellom
       kontrollpunktene i fallretningen – i promille, som det prosjekteres i.
       Da står ikke toppens fall i prosent ved siden av; to fall i to enheter
       og to retninger er ett for mye. */
    const selvfall = d.plan && d.plan.regel === 'selvfall';
    const plantekst = d.plan ? ` · bunn innv. ${Rapport.tall(q.topp - d.plan.D + d.plan.gods / 1000, 2)}` + (() => {
      if (!selvfall) return '';
      const ks = d.plan.kontroll, j = ks.findIndex(c => c.s >= q.s);
      if (j <= 0) return '';
      const a = ks[j - 1], c = ks[j], len = c.s - a.s;
      return len > 0.01 ? ` · fall ${Rapport.tall(1000 * (d.plan.motsatt ? c.bunn - a.bunn : a.bunn - c.bunn) / len, 1)} ‰` : '';
    })() : '';
    return `Profil ${Rapport.tall(q.s * bf, 1)} m · terreng ${Number.isFinite(q.terreng) ? Rapport.tall(q.terreng, 2) : '–'}`
      + ` · topp rør ${Rapport.tall(q.topp, 2)} · overdekning `
      + (Number.isFinite(q.overdekning) ? Rapport.tall(q.overdekning, 2) + ' m' : 'ukjent')
      + (!selvfall && f && Number.isFinite(f.fall) ? ` · fall ${Rapport.tall(f.fall * 100, 1)} %` : '')
      + plantekst + grofttekst;
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
