'use strict';
/**
 * Planlagte rør – tegnet i kartet, ikke målt.
 *
 * Ren logikk: ingen skjerm, intet kart, ingen lagring. Lastes som global
 * `RorPlan` i nettleseren og med `require` i test/rorplanprove.js.
 *
 * PLANEN BLIR TIL DE SAMME LINJENE SOM IMPORTEN GIR. Et rør er en trase
 * forskjøvet sidelengs, med høyder fra høydereglene – topp rør i hvert punkt,
 * som de innmålte. Da tar profilen, 3D-en, grøftemotoren og rapporten de
 * planlagte rørene uten å vite forskjell.
 *
 * HØYDENE SKRIVES SOM BUNN INNVENDIG – bunnløpet, slik VA-tegningene oppgir
 * det – men alt regnes i topp rør: topp = bunn − gods + D. Se
 * docs/superpowers/specs/2026-10-05-ror-etappe3a-design.md.
 */
const RorPlan = (() => {
  function _ror() { return typeof Ror !== 'undefined' ? Ror : require('./ror.js'); }

  /** Anleggets standard: overdekning til topp rør, klaring i kryss, kummene. */
  const StandardPlanmal = { overdekning: 2.0, kryssKlaring: 0.3, kum: { diameter: 1000, arbeidsrom: 0.5 } };
  /** Systemene som renner av seg selv – resten følger terrenget. */
  const SELVFALL = new Set(['spill', 'felles', 'overvann', 'drens']);
  /** Minste fall (‰) når koden ikke sier noe. */
  const STANDARD_MINFALL = { spill: 10, felles: 10, overvann: 5, drens: 5 };
  const GRENSER = { side: [-10, 10], diameter: [400, 3000], gods: [0.5, 100], overdekning: [0, 10],
    minFall: [0, 1000], maksFall: [0, 1000], kryssKlaring: [0, 5], arbeidsrom: [0, 3] };

  function nyPlan() { return { traseer: [], ror: [], kummer: [], laast: [], greiner: [] }; }
  function nyPlanmal() { return JSON.parse(JSON.stringify(StandardPlanmal)); }

  /**
   * Et tall innenfor grensene for feltet, eller null. Tekst med komma godtas.
   * Under grensen er en skrivefeil – den klemmes ikke opp, den avvises.
   */
  function klem(felt, v) {
    const x = typeof v === 'string' ? (v.trim() === '' ? NaN : Number(v.trim().replace(',', '.'))) : v;
    if (typeof x !== 'number' || !Number.isFinite(x) || !GRENSER[felt]) return null;
    if (x < GRENSER[felt][0]) return null;
    return Math.min(GRENSER[felt][1], x);
  }

  /** Første ledige id med prefikset: 't3', 'p12' … */
  function nyId(brukt, prefiks) {
    let n = 1;
    while (brukt.has(prefiks + n)) n++;
    return prefiks + n;
  }

  /** Alle id-ene i planen – prefiksene skiller traseer, punkt, rør og kummer. */
  function alleIder(plan) {
    const ut = new Set();
    for (const t of plan.traseer) { ut.add(t.id); for (const p of t.punkter) ut.add(p.id); }
    for (const r of plan.ror) ut.add(r.id);
    for (const k of plan.kummer) ut.add(k.id);
    return ut;
  }

  /** Koden slik planen bruker den: kodetabellen først, så tolkningen. */
  function kodeAv(koder, kode) { return (koder && koder[kode]) || _ror().tolkKode(kode); }

  /** Godstykkelsen i mm: kodens, ellers SDR 11 for PE og SN8 (D/34) for resten. */
  function gods(k) {
    if (Number.isFinite(k.gods) && k.gods > 0) return k.gods;
    if (!(k.dim > 0)) return 0;
    return Math.round(k.dim / (/^PE/.test(k.materiale || '') ? 11 : 34) * 10) / 10;
  }
  /** Topp rør utvendig fra bunn innvendig, og omvendt (m). */
  function toppFraBunn(bunn, k) { return bunn - gods(k) / 1000 + (k.dim || 0) / 1000; }
  function bunnFraTopp(topp, k) { return topp - (k.dim || 0) / 1000 + gods(k) / 1000; }

  /** Selvfall eller trykk: røret, så koden, så systemet. */
  function regel(r, k) {
    return (r && r.regel) || (k && k.regel) || (k && SELVFALL.has(k.system) ? 'selvfall' : 'trykk');
  }
  /** Overdekningen et fritt punkt legges på – og varselgrensen. */
  function overdekning(k, mal) {
    if (k && Number.isFinite(k.overdekning)) return k.overdekning;
    return mal && Number.isFinite(mal.overdekning) ? mal.overdekning : StandardPlanmal.overdekning;
  }
  function minFall(k) { return Number.isFinite(k.minFall) ? k.minFall : (STANDARD_MINFALL[k.system] || 0); }
  function maksFall(k) { return Number.isFinite(k.maksFall) ? k.maksFall : null; }

  /**
   * Traseen forskjøvet `side` meter til høyre i tegneretningen. I et
   * knekkpunkt ligger punktet på halveringslinja, side / cos(θ/2) ut; i knekker
   * skarpere enn 120° kappes det ved 2 · side, så en spiss knekk ikke sender
   * røret langt av sted. Strekk uten lengde låner retningen fra naboen.
   */
  function forskyv(pts, side) {
    if (!side || pts.length < 2) return pts.map(p => ({ x: p.x, y: p.y }));
    const n = pts.length;
    // høyre for retningen (dx, dy) er (dy, −dx)
    const normal = (a, b) => {
      const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
      return L > 0 ? { x: dy / L, y: -dx / L } : null;
    };
    const nr = [];
    for (let i = 0; i + 1 < n; i++) nr.push(normal(pts[i], pts[i + 1]));
    for (let i = 1; i < nr.length; i++) if (!nr[i]) nr[i] = nr[i - 1];
    for (let i = nr.length - 2; i >= 0; i--) if (!nr[i]) nr[i] = nr[i + 1];
    const ut = [];
    for (let i = 0; i < n; i++) {
      const n1 = i > 0 ? nr[i - 1] : null, n2 = i < n - 1 ? nr[i] : null;
      let mx, my, f = 1;
      if (n1 && n2) {
        mx = n1.x + n2.x; my = n1.y + n2.y;
        const L = Math.hypot(mx, my);
        if (L < 1e-9) { mx = n1.x; my = n1.y; } else {
          mx /= L; my /= L;
          f = 1 / Math.max(mx * n1.x + my * n1.y, 0.5);   // 1 / cos(θ/2), høyst 2
        }
      } else {
        const m = n1 || n2 || { x: 0, y: 0 };
        mx = m.x; my = m.y;
      }
      ut.push({ x: pts[i].x + mx * side * f, y: pts[i].y + my * side * f });
    }
    return ut;
  }

  /** Lengden fram til hvert punkt langs linja. */
  function stasjonering(xy) {
    const s = [0];
    for (let i = 1; i < xy.length; i++) s.push(s[i - 1] + Math.hypot(xy[i].x - xy[i - 1].x, xy[i].y - xy[i - 1].y));
    return s;
  }

  /* Mellompunktene for trykkrør (m) – som stasjonene i grøfta. */
  const STEG = 1;
  const fmt = (v, d) => v.toFixed(d).replace('.', ',').replace('-', '−');

  /**
   * Planen som linjer – samme form som `Ror.byggLinjer` gir – med kummene og
   * kontrollpunktene til profilen.
   *
   * KONTROLLPUNKTENE er endene, kummene og de låste punktene. Et låst punkt
   * har sin høyde; en grein festet til et annet rør har høyden til det røret
   * i punktet; et fritt punkt ligger med overdekningen under terrenget.
   * SELVFALL er rett linje mellom kontrollpunktene. TRYKK følger terrenget
   * meter for meter, med overdekningen lineær mellom kontrollpunktene – så
   * røret møter en låst påkobling uten sprang.
   *
   * @param {object} o
   *   plan, koder, mal              – `mal` er anleggets `mal.plan`
   *   tilSone(lat, lon) → { o, n }  – i anleggets sone, der punktene tegnes
   *   tilXY({ o, n }) → { x, y }    – i regnesonen
   *   terrengZ(x, y)                – i regnesonen; NaN der det mangler
   *   innmalt(anlegg, punkt)        – topp rør i et innmålt punkt nå, eller null
   */
  function bygg(o) {
    const plan = o.plan || nyPlan(), koder = o.koder || {}, mal = o.mal || StandardPlanmal;
    const T = o.terrengZ || (() => NaN);
    const tilSone = o.tilSone || ((lat, lon) => ({ o: lon, n: lat }));
    const tilXY = o.tilXY || (p => ({ x: p.o, y: p.n }));
    const traseer = new Map(plan.traseer.map(t => [t.id, t]));
    const linjer = [], kummer = [], kontroll = [], utenHoyde = [], merknader = [];
    const meldt = new Set();

    /* En grein følger punktet den er festet til – også i plan. */
    const festet = new Map(plan.greiner.map(g => [g.trase + ':' + g.ende, g.til]));
    const punktI = (tid, pid) => { const t = traseer.get(tid); return t ? t.punkter.find(p => p.id === pid) : null; };
    const posisjon = (t, i) => {
      const ende = i === 0 ? 'start' : i === t.punkter.length - 1 ? 'slutt' : null;
      const f = ende ? festet.get(t.id + ':' + ende) : null;
      const p = (f && punktI(f.trase, f.punkt)) || t.punkter[i];
      return tilSone(p.lat, p.lon);
    };
    const rorPaa = new Map();
    for (const r of plan.ror) {
      if (!rorPaa.has(r.trase)) rorPaa.set(r.trase, []);
      rorPaa.get(r.trase).push(r);
    }
    /* Røret en ende leser høyden fra: røret med samme kode på traseen den er festet til. */
    const forelder = (r, ende) => {
      const f = festet.get(r.trase + ':' + ende);
      if (!f) return null;
      const far = (rorPaa.get(f.trase) || []).find(x => x.kode === r.kode && x.id !== r.id);
      return far ? { ror: far, punkt: f.punkt } : null;
    };
    const toppVed = new Map();   // `rør:punkt` → topp, til greinene
    const brutt = new Set();     // `rør:ende` der festet er sluppet

    function byggRor(r) {
      const t = traseer.get(r.trase);
      if (!t || t.punkter.length < 2) return;
      const k = kodeAv(koder, r.kode);
      if (k.vis === false) return;   // «Med» er slått av i kodetabellen, som for innmålte rør
      const n = t.punkter.length;
      const sone = forskyv(t.punkter.map((p, i) => { const q = posisjon(t, i); return { x: q.o, y: q.n }; }), r.side || 0)
        .map(q => ({ o: q.x, n: q.y }));
      const xy = sone.map(tilXY);
      const s = stasjonering(xy);
      if (!(k.dim > 0)) {
        utenHoyde.push({ id: r.id, kode: r.kode, xy, punkter: sone, grunn: 'dimensjon' });
        if (!meldt.has('dim:' + r.kode)) {
          meldt.add('dim:' + r.kode);
          merknader.push({ type: 'dimensjon', linje: r.id,
            tekst: `${r.kode}: rør uten dimensjon får ingen høyder og ingen grøft – sett dimensjonen i Koder-fanen.` });
        }
        return;
      }
      const reg = regel(r, k), ov = overdekning(k, mal);
      const punktVed = sv => {
        let j = 1;
        while (j < n - 1 && s[j] < sv) j++;
        const a = xy[j - 1], b = xy[j], L = s[j] - s[j - 1];
        const u = L > 0 ? Math.max(0, Math.min(1, (sv - s[j - 1]) / L)) : 0;
        return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
      };
      const Tved = sv => { const p = punktVed(sv); const z = T(p.x, p.y); return Number.isFinite(z) ? z : NaN; };
      /* Mangler terrenget der et fritt kontrollpunkt står, hentes det fra
         nærmeste sted langs røret som har det. */
      const Tnaer = sv => {
        let z = Tved(sv);
        for (let d = STEG; !Number.isFinite(z) && (sv - d >= 0 || sv + d <= s[n - 1]); d += STEG) {
          if (sv + d <= s[n - 1]) z = Tved(sv + d);
          if (!Number.isFinite(z) && sv - d >= 0) z = Tved(sv - d);
        }
        return z;
      };
      // kontrollpunktene
      const laastHer = new Map(plan.laast.filter(l => l.ror === r.id).map(l => [l.punkt, l]));
      const kumHer = new Map(plan.kummer.filter(x => x.ror === r.id).map(x => [x.punkt, x]));
      const ktr = [];
      for (let i = 0; i < n; i++) {
        const pid = t.punkter[i].id;
        const ende = i === 0 ? 'start' : i === n - 1 ? 'slutt' : null;
        const L = laastHer.get(pid), K = kumHer.get(pid);
        if (!ende && !L && !K) continue;
        const far = ende && !brutt.has(r.id + ':' + ende) ? forelder(r, ende) : null;
        let topp, fra = null;
        if (L) topp = toppFraBunn(L.bunn, k);
        else if (far && toppVed.has(far.ror.id + ':' + far.punkt)) { topp = toppVed.get(far.ror.id + ':' + far.punkt); fra = far.ror.id; }
        else topp = Tnaer(s[i]) - ov;
        ktr.push({ i, s: s[i], topp, laast: !!L, kum: K ? K.id : null, fra, punkt: pid, kilde: !!(L && L.kilde) });
      }
      if (ktr.some(c => !Number.isFinite(c.topp))) {
        utenHoyde.push({ id: r.id, kode: r.kode, xy, punkter: sone, grunn: 'terreng' });
        merknader.push({ type: 'terreng', linje: r.id, tekst: `${r.kode}: terrenget mangler langs hele røret – ingen høyder ennå.` });
        return;
      }
      const lin = (sv, felt) => {
        let a = ktr[0], b = ktr[ktr.length - 1];
        for (let j = 1; j < ktr.length; j++) if (ktr[j].s >= sv) { a = ktr[j - 1]; b = ktr[j]; break; }
        const L = b.s - a.s;
        return L > 0 ? a[felt] + (b[felt] - a[felt]) * (sv - a.s) / L : a[felt];
      };
      if (reg === 'trykk') {
        // overdekningen i kontrollpunktene: den frie er målet, den låste det den gir
        for (const c of ktr) { const Tz = Tnaer(c.s); c.dekning = Number.isFinite(Tz) ? Tz - c.topp : ov; }
      }
      // punktene: knekkpunktene, og for trykk én per meter mellom dem
      const rader = [];
      for (let i = 0; i < n; i++) {
        const pid = t.punkter[i].id;
        rader.push({ s: s[i], x: xy[i].x, y: xy[i].y, o: sone[i].o, n: sone[i].n, id: `${r.id}:${pid}`, i });
        if (reg !== 'trykk' || i === n - 1) continue;
        const L = s[i + 1] - s[i];
        for (let d = STEG; d < L - 1e-9; d += STEG) {
          const u = d / L;
          rader.push({ s: s[i] + d, x: xy[i].x + (xy[i + 1].x - xy[i].x) * u, y: xy[i].y + (xy[i + 1].y - xy[i].y) * u,
            o: sone[i].o + (sone[i + 1].o - sone[i].o) * u, n: sone[i].n + (sone[i + 1].n - sone[i].n) * u,
            id: `${r.id}:${pid}+${d}`, mellom: true });
        }
      }
      for (const q of rader) {
        if (reg === 'selvfall') q.z = lin(q.s, 'topp');
        else { const Tz = T(q.x, q.y); q.z = Number.isFinite(Tz) ? Tz - lin(q.s, 'dekning') : NaN; }
      }
      // et låst kontrollpunkt ligger der det er låst, også om terrenget mangler der
      for (const c of ktr) { const q = rader.find(x => x.i === c.i); if (q) q.z = c.topp; }
      // over et hull i terrenget: rett linje mellom kantene
      for (let a = 0; a < rader.length; a++) {
        if (Number.isFinite(rader[a].z)) continue;
        let b = a;
        while (b < rader.length && !Number.isFinite(rader[b].z)) b++;
        const v = a > 0 ? rader[a - 1] : null, h = b < rader.length ? rader[b] : null;
        for (let j = a; j < b; j++) {
          rader[j].z = v && h ? v.z + (h.z - v.z) * (rader[j].s - v.s) / (h.s - v.s) : (v || h).z;
        }
        a = b;
      }
      let lengde3d = 0;
      for (let j = 1; j < rader.length; j++) {
        lengde3d += Math.hypot(rader[j].s - rader[j - 1].s, rader[j].z - rader[j - 1].z);
      }
      linjer.push({
        id: r.id, kode: r.kode,
        punkter: rader.map(q => Object.assign({ id: q.id, kode: r.kode, o: q.o, n: q.n, z: q.z }, q.mellom ? { mellom: true } : {})),
        xy: rader.map(q => ({ x: q.x, y: q.y })), lengde: s[n - 1], lengde3d,
        plan: { ror: r.id, trase: t.id, regel: reg, grense: ov, gods: gods(k), motsatt: !!r.motsatt }
      });
      const vedKnekk = i => rader.find(q => q.i === i).z;
      for (let i = 0; i < n; i++) toppVed.set(r.id + ':' + t.punkter[i].id, vedKnekk(i));
      for (const c of ktr) {
        kontroll.push({ ror: r.id, s: c.s, punkt: c.punkt, x: xy[c.i].x, y: xy[c.i].y, topp: c.topp,
          bunn: bunnFraTopp(c.topp, k), laast: c.laast, kum: c.kum, fra: c.fra, kilde: c.kilde });
      }
      for (const K of kumHer.values()) {
        const i = t.punkter.findIndex(p => p.id === K.punkt);
        if (i < 0) continue;
        kummer.push({ id: K.id, ror: r.id, x: xy[i].x, y: xy[i].y, o: sone[i].o, n: sone[i].n,
          bunnlop: bunnFraTopp(vedKnekk(i), k), terreng: Tnaer(s[i]), diameter: K.diameter || mal.kum.diameter });
      }
      // en påkobling: den låste høyden står, men merknaden sier fra om kilden er endret
      for (const L of laastHer.values()) {
        if (!L.kilde || !o.innmalt) continue;
        const na = o.innmalt(L.kilde.anlegg, L.kilde.punkt);
        if (na == null) {
          merknader.push({ type: 'pakobling', linje: r.id,
            tekst: `${r.kode}: punktet røret er koblet på, finnes ikke lenger – den låste høyden står.` });
        } else if (Math.abs(na - L.kilde.topp) > 0.01) {
          merknader.push({ type: 'pakobling', linje: r.id, tekst: `${r.kode}: punktet røret er koblet på, har fått ny høyde `
            + `(${fmt(na, 2)} mot ${fmt(L.kilde.topp, 2)}) – «Hent på nytt» i punktfeltet.` });
        }
      }
    }

    /* REKKEFØLGEN: et rør regnes før greinene som leser høyden fra det. Går
       festene i sirkel, slippes festet til det første røret som står igjen. */
    const igjen = plan.ror.slice(), ferdig = new Set();
    while (igjen.length) {
      let i = igjen.findIndex(r => ['start', 'slutt'].every(e => {
        const far = forelder(r, e);
        return !far || ferdig.has(far.ror.id) || brutt.has(r.id + ':' + e);
      }));
      if (i < 0) {
        const r = igjen[0];
        for (const e of ['start', 'slutt']) {
          const far = forelder(r, e);
          if (far && !ferdig.has(far.ror.id)) brutt.add(r.id + ':' + e);
        }
        merknader.push({ type: 'grein', linje: r.id,
          tekst: `${r.kode}: greinene går i sirkel – høyden fra den andre traseen er sluppet ett sted.` });
        i = 0;
      }
      const r = igjen.splice(i, 1)[0];
      byggRor(r);
      ferdig.add(r.id);
    }
    /* MØTENE: der en grein er festet og der et rør er koblet på et innmålt.
       Der skal rørene møtes – kontrollen for kryssing hopper over dem. Radien
       tar med sideavstanden, så rør som ligger ved siden av traseen også er
       med i møtet. */
    const moter = [];
    for (const g of plan.greiner) {
      const t = traseer.get(g.trase);
      if (!t) continue;
      const side = Math.max(0, ...(rorPaa.get(g.trase) || []).concat(rorPaa.get(g.til.trase) || [])
        .map(x => Math.abs(x.side || 0)));
      moter.push(Object.assign(tilXY(posisjon(t, g.ende === 'start' ? 0 : t.punkter.length - 1)), { r: 0.5 + side }));
    }
    for (const c of kontroll) if (c.kilde) moter.push({ x: c.x, y: c.y, r: 0.5 });
    return { linjer, enslige: [], objekter: [], bruddUtenTreff: 0, koblingUtenTreff: 0,
      kummer, kontroll, utenHoyde, merknader, moter };
  }

  return { StandardPlanmal, GRENSER, nyPlan, nyPlanmal, klem, nyId, alleIder, kodeAv, gods,
    toppFraBunn, bunnFraTopp, regel, overdekning, minFall, maksFall, forskyv, stasjonering, bygg };
})();

if (typeof module !== 'undefined') module.exports = RorPlan;
