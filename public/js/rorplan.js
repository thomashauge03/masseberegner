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

  /** Anleggets standard: overdekning til topp rør, klaring i kryss, kummene – og
      avviket mot innmålt (se roravvik.js): av til knappen slås på, toleransene i m. */
  const StandardPlanmal = { overdekning: 2.0, kryssKlaring: 0.3, kum: { diameter: 1000, arbeidsrom: 0.5 },
    avvik: { vis: false, plan: 0.10, selvfall: 0.03, trykk: 0.10, sok: 1.0 },
    // trykkrør: et høybrekk eller lavbrekk stikker minst så mye ut (m); minste fall mellom dem (‰), 0 = av
    brekk: 0.3, trykkMinFall: 0 };
  /** Systemene som renner av seg selv – resten følger terrenget. */
  const SELVFALL = new Set(['spill', 'felles', 'overvann', 'drens']);
  /** Minste fall (‰) når koden ikke sier noe. */
  const STANDARD_MINFALL = { spill: 10, felles: 10, overvann: 5, drens: 5 };
  const GRENSER = { side: [-10, 10], diameter: [400, 3000], gods: [0.5, 100], overdekning: [0, 10],
    minFall: [0, 1000], maksFall: [0, 1000], kryssKlaring: [0, 5], arbeidsrom: [0, 3],
    avvikPlan: [0.005, 2], avvikHoyde: [0.005, 2], sok: [0.1, 10], brekk: [0.05, 5], trykkMinFall: [0, 1000] };

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

  /**
   * Alle id-ene i planen – prefiksene skiller traseer, punkt, rør og kummer.
   *
   * MED `groft` OGSÅ ID-ENE GRØFTEJUSTERINGENE PEKER PÅ. En strekning eller
   * en felles grøft lagres mot rør:punkt, og den blir stående når punktet
   * slettes – med en merknad om at den ikke finner punktene sine. Fikk et nytt
   * punkt den samme id-en, gjaldt den gamle justeringen igjen, på et annet
   * sted: fjell på en strekning ingen hadde markert. Derfor er de brukt.
   */
  function alleIder(plan, groft) {
    const ut = new Set();
    for (const t of plan.traseer) { ut.add(t.id); for (const p of t.punkter) ut.add(p.id); }
    for (const r of plan.ror) ut.add(r.id);
    for (const k of plan.kummer) ut.add(k.id);
    if (groft) {
      // «r1:p3» – og et mellompunkt «r1:p3+5», selv om de ikke skal lagres
      const ref = id => { for (const del of String(id).split(':')) ut.add(del.replace(/\+.*$/, '')); };
      for (const st of groft.strekninger || []) { ref(st.fra); ref(st.til); }
      for (const par of groft.sammen || []) for (const id of par || []) ref(id);
    }
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
        const K = kumHer.get(pid);
        const far = ende && !brutt.has(r.id + ':' + ende) ? forelder(r, ende) : null;
        const harFar = !!far && toppVed.has(far.ror.id + ':' + far.punkt);
        let L = laastHer.get(pid);
        /* DET KNAPPEN LA, GJELDER DER KNAPPEN LEGGER: i en kum og i en ende som
           ikke er en grein. Ble kummen tatt bort, sto høyden igjen og gjorde
           punktet til et kontrollpunkt – et fallbrudd uten kum, som neste trykk
           la på nytt. I en grein vant den over høyden fra hovedrøret. */
        if (L && L.lagt && ((!ende && !K) || harFar)) L = null;
        if (!ende && !L && !K) continue;
        let topp, fra = null, fraPunkt = null;
        if (L) topp = toppFraBunn(L.bunn, k);
        else if (harFar) { topp = toppVed.get(far.ror.id + ':' + far.punkt); fra = far.ror.id; fraPunkt = far.punkt; }
        else topp = Tnaer(s[i]) - ov;
        ktr.push({ i, s: s[i], topp, laast: !!L, lagt: !!(L && L.lagt), kum: K ? K.id : null, fra, fraPunkt, punkt: pid,
          kilde: !!(L && L.kilde) });
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
        plan: { ror: r.id, trase: t.id, regel: reg, grense: ov, gods: gods(k), motsatt: !!r.motsatt, side: r.side || 0 }
      });
      const vedKnekk = i => rader.find(q => q.i === i).z;
      for (let i = 0; i < n; i++) toppVed.set(r.id + ':' + t.punkter[i].id, vedKnekk(i));
      for (const c of ktr) {
        // `fraPunkt`: punktet på røret en grein henter høyden fra – se `leggHoyderFor`
        kontroll.push({ ror: r.id, s: c.s, punkt: c.punkt, x: xy[c.i].x, y: xy[c.i].y, topp: c.topp,
          bunn: bunnFraTopp(c.topp, k), laast: c.laast, lagt: c.lagt, kum: c.kum, fra: c.fra, fraPunkt: c.fraPunkt, kilde: c.kilde });
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
       med i møtet. For en påkobling likeså: midt i traseen, ikke i rørets eget
       punkt – ellers sto røret ved siden av i samme grøft som et kryss med
       ledningen det andre er koblet på. */
    const moter = [];
    const sidenAv = tider => Math.max(0, ...tider.flatMap(tid => rorPaa.get(tid) || []).map(x => Math.abs(x.side || 0)));
    for (const g of plan.greiner) {
      const t = traseer.get(g.trase);
      if (!t) continue;
      moter.push(Object.assign(tilXY(posisjon(t, g.ende === 'start' ? 0 : t.punkter.length - 1)),
        { r: 0.5 + sidenAv([g.trase, g.til.trase]) }));
    }
    for (const c of kontroll) {
      if (!c.kilde) continue;
      const r = plan.ror.find(x => x.id === c.ror), t = r && traseer.get(r.trase);
      const i = t ? t.punkter.findIndex(p => p.id === c.punkt) : -1;
      if (i < 0) { moter.push({ x: c.x, y: c.y, r: 0.5 }); continue; }
      moter.push(Object.assign(tilXY(posisjon(t, i)), { r: 0.5 + sidenAv([t.id]) }));
    }
    return { linjer, enslige: [], objekter: [], bruddUtenTreff: 0, koblingUtenTreff: 0,
      kummer, kontroll, utenHoyde, merknader, moter };
  }

  /** Motfall er motfall først under dette (‰) – avrunding er ikke motfall. På
      korte strekk er grensen større: se toleransen i `kontroller`. */
  const MOTFALL = -0.05;

  /** Skjæringen mellom to strekk: { t, u } langs hvert, eller null. */
  function kryssPunkt(a0, a1, b0, b1) {
    const rx = a1.x - a0.x, ry = a1.y - a0.y, sx = b1.x - b0.x, sy = b1.y - b0.y;
    const nevner = rx * sy - ry * sx;
    if (Math.abs(nevner) < 1e-12) return null;
    const qx = b0.x - a0.x, qy = b0.y - a0.y;
    const t = (qx * sy - qy * sx) / nevner, u = (qx * ry - qy * rx) / nevner;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { t, u } : null;
  }
  const ramme = xy => xy.reduce((r, q) => ({ x0: Math.min(r.x0, q.x), x1: Math.max(r.x1, q.x),
    y0: Math.min(r.y0, q.y), y1: Math.max(r.y1, q.y) }), { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity });

  /**
   * Kontrollene på de planlagte rørene. Fjellet kommer fra grøfta – se `fjell`.
   *
   * OVERDEKNING prøves hver meter langs røret, mot rørets grense (det samme
   * tallet de frie punktene legges på), og slås sammen til strekk. FALL er for
   * selvfall, mellom kontrollpunktene, i fallretningen. KRYSSING finnes i plan
   * mot hvert annet rør; klaringen er avstanden mellom utsidene i krysset.
   *
   * @param {object} o
   *   bygg        – svaret fra `bygg`
   *   koder, mal  – anleggets kodetabell og `mal.plan`
   *   terrengZ    – i regnesonen
   *   andre       – rør i andre anlegg: [{ id, kode, D, xy, topp: [z per punkt], navn }]
   */
  function kontroller(o) {
    const b = o.bygg, ut = [], T = o.terrengZ || (() => NaN);
    const m0 = v => fmt(v, 0), m1 = v => fmt(v, 1), m2 = v => fmt(v, 2);
    // OVERDEKNING
    for (const l of b.linjer) {
      const grense = l.plan.grense, s = stasjonering(l.xy);
      let fra = null, til = null, min = Infinity, ved = null;
      const lukk = () => {
        if (fra == null) return;
        ut.push({ type: 'overdekning', linje: l.id, fra, til, x: ved.x, y: ved.y,
          tekst: `${l.kode}: overdekning ned til ${m2(min)} m på ${m0(fra)}–${m0(til)} m (grense ${m2(grense)} m).` });
        fra = null; min = Infinity;
      };
      const prov = (sv, x, y, topp) => {
        const c = T(x, y) - topp;
        if (!Number.isFinite(c) || c >= grense - 0.01) { lukk(); return; }
        if (fra == null) fra = sv;
        til = sv;
        if (c < min) { min = c; ved = { x, y }; }
      };
      for (let i = 0; i + 1 < l.xy.length; i++) {
        const L = s[i + 1] - s[i], a = l.xy[i], c = l.xy[i + 1], za = l.punkter[i].z, zc = l.punkter[i + 1].z;
        for (let d = 0; d < L - 1e-9; d += STEG) {
          const u = d / L;
          prov(s[i] + d, a.x + (c.x - a.x) * u, a.y + (c.y - a.y) * u, za + (zc - za) * u);
        }
      }
      const e = l.xy.length - 1;
      prov(s[e], l.xy[e].x, l.xy[e].y, l.punkter[e].z);
      lukk();
    }
    // FALL OG MOTFALL
    for (const l of b.linjer) {
      if (l.plan.regel !== 'selvfall') continue;
      const k = kodeAv(o.koder, l.kode), lav = minFall(k), hoy = maksFall(k);
      const ktr = b.kontroll.filter(c => c.ror === l.id).sort((a, c) => a.s - c.s);
      for (let j = 1; j < ktr.length; j++) {
        const a = ktr[j - 1], c = ktr[j], L = c.s - a.s;
        if (!(L > 0.01)) continue;
        const fall = 1000 * (l.plan.motsatt ? c.bunn - a.bunn : a.bunn - c.bunn) / L;
        const v = { linje: l.id, fra: a.s, til: c.s, x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 };
        const hvor = `på ${m0(a.s)}–${m0(c.s)} m`;
        /* Høydene låses på hel millimeter, så fallet over strekket kan ikke
           treffes bedre enn 1 mm / L. Innenfor det er avviket avrunding. */
        const tol = Math.max(-MOTFALL, 1 / L);
        if (fall < -tol) {
          ut.push(Object.assign(v, { type: 'motfall', tekst: `${l.kode}: motfall ${m1(-fall)} ‰ ${hvor}.` }));
        } else if (lav > 0 && fall < lav - tol) {
          ut.push(Object.assign(v, { type: 'fall', tekst: `${l.kode}: fall ${m1(fall)} ‰ ${hvor} – under ${m1(lav)} ‰.` }));
        } else if (hoy != null && fall > hoy + tol) {
          ut.push(Object.assign(v, { type: 'fall', tekst: `${l.kode}: fall ${m1(fall)} ‰ ${hvor} – over ${m1(hoy)} ‰.` }));
        }
      }
    }
    /* TRYKKRØR: HØYBREKK, LAVBREKK OG FALLET MELLOM DEM. Et trykkrør følger
       terrenget med overdekningen, og kontrollen over hoppet over det. Det
       som teller for et trykkrør, er hvor luft samler seg (høybrekk – lufting)
       og hvor det må tømmes (lavbrekk). Brekkene finnes med en terskel – se
       `brekk` – og mellom dem, og ut til endene, er fallet høyde over lengde.
       Kravet er kodens minste fall når koden er et trykkrør, ellers anleggets
       for trykkrør; 0 er av. Et selvfallsrør som er satt til trykk, tar ikke
       med seg selvfallskravet. */
    for (const l of b.linjer) {
      if (l.plan.regel !== 'trykk') continue;
      const k = kodeAv(o.koder, l.kode);
      const h = o.mal && Number.isFinite(o.mal.brekk) ? o.mal.brekk : StandardPlanmal.brekk;
      const krav = regel(null, k) === 'trykk' && Number.isFinite(k.minFall) ? k.minFall
        : o.mal && Number.isFinite(o.mal.trykkMinFall) ? o.mal.trykkMinFall : StandardPlanmal.trykkMinFall;
      const s = stasjonering(l.xy), z = l.punkter.map(p => p.z);
      const pv = brekk(z, h);
      for (const p of pv) {
        const q = l.xy[p.i];
        ut.push({ type: p.type === 'hoy' ? 'hoybrekk' : 'lavbrekk', linje: l.id, fra: s[p.i], til: s[p.i], x: q.x, y: q.y,
          tekst: p.type === 'hoy' ? `${l.kode}: høybrekk ved ${m0(s[p.i])} m – her samler luft seg, og det trengs lufting.`
            : `${l.kode}: lavbrekk ved ${m0(s[p.i])} m – her må røret kunne tømmes.` });
      }
      if (krav > 0) {
        const punkt = [0].concat(pv.map(p => p.i), [z.length - 1]);
        for (let j = 1; j < punkt.length; j++) {
          const a = punkt[j - 1], c = punkt[j], L = s[c] - s[a];
          if (!(L > 1) || !Number.isFinite(z[a]) || !Number.isFinite(z[c])) continue;
          const fall = 1000 * Math.abs(z[c] - z[a]) / L;
          if (fall >= krav - 1e-9) continue;
          ut.push({ type: 'fall', linje: l.id, fra: s[a], til: s[c], x: (l.xy[a].x + l.xy[c].x) / 2, y: (l.xy[a].y + l.xy[c].y) / 2,
            tekst: `${l.kode}: flatt – ${m1(fall)} ‰ på ${m0(s[a])}–${m0(s[c])} m, under ${m1(krav)} ‰ for trykkrør.` });
        }
      }
    }
    // KRYSSING
    const grense = o.mal && Number.isFinite(o.mal.kryssKlaring) ? o.mal.kryssKlaring : StandardPlanmal.kryssKlaring;
    const egne = b.linjer.map(l => ({ id: l.id, kode: l.kode, D: kodeAv(o.koder, l.kode).dim / 1000, xy: l.xy,
      topp: l.punkter.map(p => p.z), egen: true }));
    const alle = egne.concat(o.andre || []).map(x => Object.assign({ boks: ramme(x.xy) }, x));
    const moter = b.moter || [];
    for (let ia = 0; ia < egne.length; ia++) {
      const A = alle[ia], sA = stasjonering(A.xy);
      for (let ib = 0; ib < alle.length; ib++) {
        const B = alle[ib];
        if (B.egen && ib <= ia) continue;   // hvert par av planlagte én gang
        if (A.boks.x1 < B.boks.x0 || B.boks.x1 < A.boks.x0 || A.boks.y1 < B.boks.y0 || B.boks.y1 < A.boks.y0) continue;
        for (let i = 0; i + 1 < A.xy.length; i++) {
          for (let j = 0; j + 1 < B.xy.length; j++) {
            const kr = kryssPunkt(A.xy[i], A.xy[i + 1], B.xy[j], B.xy[j + 1]);
            if (!kr) continue;
            const P = { x: A.xy[i].x + (A.xy[i + 1].x - A.xy[i].x) * kr.t, y: A.xy[i].y + (A.xy[i + 1].y - A.xy[i].y) * kr.t };
            if (moter.some(m => Math.hypot(m.x - P.x, m.y - P.y) <= m.r)) continue;
            const tA = A.topp[i] + (A.topp[i + 1] - A.topp[i]) * kr.t, tB = B.topp[j] + (B.topp[j + 1] - B.topp[j]) * kr.u;
            if (!Number.isFinite(tA) || !Number.isFinite(tB)) continue;
            const klaring = Math.max(tA - A.D - tB, tB - B.D - tA);
            if (klaring >= grense) continue;
            const sv = sA[i] + (sA[i + 1] - sA[i]) * kr.t;
            // et kryss i et knekkpunkt på det andre røret finnes i to strekk – ett varsel
            if (ut.some(v => v.type === 'kryss' && v.linje === A.id && v.mot === B.id && Math.abs(v.fra - sv) < 0.5)) continue;
            const hvem = `${B.kode}${B.navn ? ' (' + B.navn + ')' : ''}`;
            ut.push({ type: 'kryss', linje: A.id, mot: B.id, fra: sv, til: sv, x: P.x, y: P.y, tekst: klaring < 0
              ? `${A.kode} treffer ${hvem} ved ${m0(sv)} m.`
              : `${A.kode} krysser ${hvem} med ${m2(klaring)} m klaring ved ${m0(sv)} m (grense ${m2(grense)} m).` });
          }
        }
      }
    }
    /* RØR OPPÅ HVERANDRE: to rør i samme trase som ligger nærmere hverandre
       enn halve diameterne til sammen. Strekk som går parallelt, krysser
       aldri, så kontrollen over så dem ikke – og «Nytt rør» foreslår side 0
       hver gang. */
    const iTrase = new Map();
    for (const l of b.linjer) {
      if (!l.plan) continue;
      if (!iTrase.has(l.plan.trase)) iTrase.set(l.plan.trase, []);
      iTrase.get(l.plan.trase).push(l);
    }
    for (const ls of iTrase.values()) {
      for (let i = 0; i < ls.length; i++) {
        for (let j = i + 1; j < ls.length; j++) {
          const A = ls[i], B = ls[j], sa = A.plan.side || 0, sb = B.plan.side || 0;
          const DA = (kodeAv(o.koder, A.kode).dim || 0) / 1000, DB = (kodeAv(o.koder, B.kode).dim || 0) / 1000;
          if (Math.abs(sa - sb) >= (DA + DB) / 2) continue;
          const midt = A.xy[Math.floor((A.xy.length - 1) / 2)];
          ut.push({ type: 'kryss', linje: A.id, mot: B.id, fra: 0, til: 0, x: midt.x, y: midt.y,
            tekst: `${A.kode} og ${B.kode} ligger oppå hverandre i traseen – sideavstand ${m1(sa)} og ${m1(sb)} m.` });
        }
      }
    }
    return ut;
  }

  /** Fjell i grøfta, per rør – en opplysning, ikke en feil: hvor langt og hvor mye. */
  function fjell(g, b) {
    const ut = [];
    if (!g || !g.profiler) return ut;
    for (const l of b.linjer) {
      const pr = g.profiler.get(l.id), per = g.perLinje.get(l.id);
      if (!pr || !per) continue;
      let lengde = 0, fra = null, til = null;
      for (let i = 0; i + 1 < pr.length; i++) {
        const q = pr[i];
        if (q.fjell == null || !Number.isFinite(q.gravebunn) || q.fjell <= q.gravebunn) continue;
        lengde += pr[i + 1].s - q.s;
        if (fra == null) fra = q.s;
        til = pr[i + 1].s;
      }
      if (lengde > 0.5) {
        ut.push({ type: 'fjell', linje: l.id, fra, til,
          tekst: `${l.kode}: grøfta går i fjell på ${fmt(lengde, 0)} m – sprengning ${fmt(per.sprengning, 0)} m³.` });
      }
    }
    return ut;
  }

  /**
   * Høybrekk og lavbrekk langs en profil – toppunkt og bunnpunkt som stikker
   * minst `h` meter opp eller ned fra det som ligger rundt, i rekkefølge langs
   * røret.
   *
   * MED TERSKEL, IKKE PUNKT FOR PUNKT. Et tegnet trykkrør følger terrenget
   * meter for meter, og hver tue ville ellers blitt et høybrekk. Profilen
   * følges som en sikksakk: et toppunkt er et brekk når profilen etterpå har
   * falt minst `h` under det, og før det steg minst `h` opp til det. Endene
   * er ikke brekk – der er røret koblet på noe.
   *
   * @param {number[]} z  høydene langs røret (NaN hoppes over)
   * @param {number} h   terskelen (m)
   * @returns {Array<{i:number, type:'hoy'|'lav'}>}
   */
  function brekk(z, h) {
    // en terskel på null gjorde starten til et brekk; den må være over null
    const t = h > 0 ? h : 1e-9;
    const idx = [];
    for (let i = 0; i < z.length; i++) if (Number.isFinite(z[i])) idx.push(i);
    if (idx.length < 3) return [];
    const ut = [], start = idx[0];
    let trend = 0, kand = start, hoy = start, lav = start;
    // punktene med samme høyde som kandidaten: et flatt topp er et brekk midt på, ikke i enden
    let like = [start];
    const midt = () => like[(like.length - 1) >> 1];
    for (const i of idx.slice(1)) {
      if (trend === 0) {
        if (z[i] > z[hoy]) hoy = i;
        if (z[i] < z[lav]) lav = i;
        if (z[hoy] - z[lav] < t) continue;
        /* Den første store bevegelsen avgjør retningen. Det laveste før en
           stigning er ikke et lavbrekk: hadde profilen falt t fra starten
           ned dit, var den første store bevegelsen et fall. */
        if (hoy > lav) { trend = 1; kand = hoy; } else { trend = -1; kand = lav; }
        like = [kand];
        continue;
      }
      if (trend === 1) {
        if (z[i] > z[kand]) { kand = i; like = [i]; }
        else if (z[i] === z[kand]) { kand = i; like.push(i); }
        else if (z[kand] - z[i] >= t) { ut.push({ i: midt(), type: 'hoy' }); trend = -1; kand = i; like = [i]; }
      } else {
        if (z[i] < z[kand]) { kand = i; like = [i]; }
        else if (z[i] === z[kand]) { kand = i; like.push(i); }
        else if (z[i] - z[kand] >= t) { ut.push({ i: midt(), type: 'lav' }); trend = 1; kand = i; like = [i]; }
      }
    }
    return ut;
  }

  /** Fallet (‰) mellom kontrollpunktene på et selvfallsrør, i fallretningen – minste og største. */
  function fallSpenn(kontroll, l) {
    if (!l.plan || l.plan.regel !== 'selvfall') return null;
    const k = kontroll.filter(c => c.ror === l.id).sort((a, c) => a.s - c.s), f = [];
    for (let j = 1; j < k.length; j++) {
      const L = k[j].s - k[j - 1].s;
      if (L > 0.01) f.push(1000 * (l.plan.motsatt ? k[j].bunn - k[j - 1].bunn : k[j - 1].bunn - k[j].bunn) / L);
    }
    return f.length ? { min: Math.min(...f), maks: Math.max(...f) } : null;
  }

  /**
   * Høydene i kontrollpunktene på et selvfallsrør som gir minst graving
   * innenfor kravene. Røret går rett mellom kontrollpunktene, som ellers.
   *
   * DYNAMISK PROGRAMMERING over kontrollpunktene, med høyder i hele `steg`:
   * - et fritt punkt kan ligge fra taket (terrenget minus overdekningen) og
   *   `dyp` meter ned; et fast punkt (låst, påkobling, grein) har én verdi;
   * - et par av naboverdier er lovlig når fallet er innenfor kravene og linja
   *   mellom dem holder seg under taket i hvert prøvepunkt;
   * - det beste er det med størst sum av høyder langs røret, vektet med
   *   lengden – minst gravedybde i snitt.
   * For hver verdi i et punkt regnes det høyeste neste punktet linja tåler
   * én gang, så prøvepunktene går gjennom én gang per verdi. Parene er
   * verdier × verdier per strekk – 600 × 600 med 6 m dybde; 6 km med 300
   * kummer tar under et halvt sekund.
   *
   * ET FAST PUNKT OVER TAKET – en påkobling på et grunt rør, en høyde låst for
   * hånd – bryter overdekningen der det står, og det kan ikke flyttes. Her
   * måtte linja likevel under taket i første prøvepunkt, en meter unna:
   * overskuddet ble ganget med lengden av strekket, og 9 mm for lite
   * overdekning i en lås la neste punkt 45 cm for dypt. Nå løftes taket ved
   * siden av et slikt punkt med overskuddet, rett ned til null i neste
   * kontrollpunkt. Overdekningen er brutt der den var brutt fra før, og
   * kontrollen sier fra. To faste punkt etter hverandre gir linja mellom seg
   * selv: knappen kan ikke endre den, og den skal ikke hindre resten.
   *
   * @param {object} o
   *   s        – stasjonene til kontrollpunktene, stigende
   *   fast     – topp der punktet er fast, ellers null
   *   prover   – [{ s, U }]: der kontrollen prøver; U = taket (NaN = ukjent)
   *   moter    – [{ s, z }]: høyeste topp der en grein renner inn (se `leggHoyderFor`)
   *   minFall, maksFall – ‰; maksFall null = ingen grense, 0 = flatt, som i kontrollen
   *   motsatt  – fallet går mot starten
   *   steg     – høydesteget (m), standard 0,01
   *   dyp      – hvor langt under taket det letes (m), standard 6
   * @returns {{ topp: number[], hoyest: number } | { feil: string, fra: number, til: number, i: number|null }}
   *   `hoyest` er den høyeste toppen siste punkt kan ha; `i` er strekket det stoppet på
   */
  function leggHoyder(o) {
    const s = o.s, n = s.length, steg = o.steg || 0.01, dyp = o.dyp || 6;
    if (n < 2) return { feil: 'røret har ikke to kontrollpunkt', fra: 0, til: 0, i: null };
    const fmin = (o.minFall || 0) / 1000;
    // HER STO `maksFall > 0`: 0 var «ingen grense», mens kontrollen leste det som flatt
    const fmax = Number.isFinite(o.maksFall) ? o.maksFall / 1000 : Infinity;
    if (fmax < fmin) return { feil: 'største fall er mindre enn minste fall for koden', fra: s[0], til: s[n - 1], i: null };
    const prover = o.prover.filter(p => Number.isFinite(p.U)), moter = o.moter || [];
    // taket i et punkt: prøven nærmest, så et punkt over et hull i terrenget likevel får ett
    const Uved = sv => {
      let best = null;
      for (const p of prover) if (!best || Math.abs(p.s - sv) < Math.abs(best.s - sv)) best = p;
      return best ? best.U : NaN;
    };
    const fast = i => Number.isFinite(o.fast[i]);
    const nivaa = [], over = [];
    for (let i = 0; i < n; i++) {
      const U = Uved(s[i]);
      if (fast(i)) {
        nivaa.push([o.fast[i]]);
        over.push(Number.isFinite(U) ? Math.max(0, o.fast[i] - U) : 0);
        continue;
      }
      over.push(0);
      if (!Number.isFinite(U)) return { feil: 'terrenget mangler', fra: s[i], til: s[i], i: null };
      let tak = U;
      for (const m of moter) if (Math.abs(m.s - s[i]) < 1e-6) tak = Math.min(tak, m.z);
      const topp = Math.floor(tak / steg + 1e-9), bunn = Math.ceil((U - dyp) / steg - 1e-9), liste = [];
      for (let k = topp; k >= bunn; k--) liste.push(k * steg);
      nivaa.push(liste);
    }
    let best = nivaa[0].map(() => 0);
    const fra = [];
    for (let i = 0; i + 1 < n; i++) {
      const L = s[i + 1] - s[i];
      const A = nivaa[i], B = nivaa[i + 1];
      const ny = B.map(() => -Infinity), hvor = B.map(() => -1);
      if (fast(i) && fast(i + 1)) {
        if (best[0] > -Infinity) { ny[0] = best[0] + (A[0] + B[0]) / 2 * L; hvor[0] = 0; }
      } else {
        // taket i prøvepunktene mellom, løftet ved et fast punkt over sitt eget
        const inni = [];
        for (const p of prover) {
          if (!(p.s > s[i] + 1e-9 && p.s < s[i + 1] - 1e-9)) continue;
          const u = (p.s - s[i]) / L;
          inni.push({ u, U: p.U + over[i] * (1 - u) + over[i + 1] * u });
        }
        for (const m of moter) if (m.s > s[i] + 1e-9 && m.s < s[i + 1] - 1e-9) inni.push({ u: (m.s - s[i]) / L, U: m.z });
        for (let a = 0; a < A.length; a++) {
          if (best[a] === -Infinity) continue;
          const za = A[a];
          let tak = Infinity;
          for (const q of inni) tak = Math.min(tak, (q.U - za * (1 - q.u)) / q.u);
          // fallet i fallretningen: z[i] − z[i+1] mot slutten, motsatt mot starten
          let hoy, lav;
          if (!(L > 1e-6)) {
            // to punkt på samme sted: et sprang ned i fallretningen er lov, motfall ikke
            if (!o.motsatt) { hoy = za + steg / 2; lav = -Infinity; } else { lav = za - steg / 2; hoy = Infinity; }
          } else if (!o.motsatt) { hoy = za - fmin * L; lav = za - fmax * L; } else { lav = za + fmin * L; hoy = za + fmax * L; }
          hoy = Math.min(hoy, tak);
          for (let b = 0; b < B.length; b++) {
            const zb = B[b];
            if (zb > hoy + 1e-9 || zb < lav - 1e-9) continue;
            const v = best[a] + (za + zb) / 2 * L;
            if (v > ny[b]) { ny[b] = v; hvor[b] = a; }
          }
        }
      }
      if (ny.every(v => v === -Infinity)) return { feil: 'ingen profil oppfyller kravene', fra: s[i], til: s[i + 1], i };
      best = ny;
      fra.push(hvor);
    }
    let b = 0;
    for (let k = 1; k < best.length; k++) if (best[k] > best[b]) b = k;
    // listene går ovenfra, så den første som kan nås, er den høyeste
    const hoyest = nivaa[n - 1][best.findIndex(v => v > -Infinity)];
    const topp = new Array(n);
    topp[n - 1] = nivaa[n - 1][b];
    for (let i = n - 2; i >= 0; i--) { b = fra[i][b]; topp[i] = nivaa[i][b]; }
    return { topp, hoyest };
  }

  /**
   * Prøvepunktene langs en linje, der `kontroller` prøver overdekningen: hvert
   * knekkpunkt, hver meter fra det, og enden. U er taket – terrenget minus
   * grensen.
   *
   * HER VAR DE HVER METER FRA STARTEN AV RØRET, og taket i et kontrollpunkt var
   * prøven nærmest – opptil en halv meter unna. Kontrollen prøver andre steder,
   * og hvert niende rør fikk merknad om for lite overdekning rett etter knappen.
   */
  function proverLangs(l, T) {
    const sl = stasjonering(l.xy), prover = [];
    const prov = (sv, x, y) => { const Tz = T(x, y); prover.push({ s: sv, U: Number.isFinite(Tz) ? Tz - l.plan.grense : NaN }); };
    for (let i = 0; i + 1 < l.xy.length; i++) {
      const L = sl[i + 1] - sl[i], a = l.xy[i], c = l.xy[i + 1];
      for (let d = 0; d < L - 1e-9; d += STEG) { const u = d / L; prov(sl[i] + d, a.x + (c.x - a.x) * u, a.y + (c.y - a.y) * u); }
    }
    const e = l.xy.length - 1;
    prov(sl[e], l.xy[e].x, l.xy[e].y);
    return { sl, prover };
  }

  /**
   * «Legg høydene» for ett selvfallsrør, fra det `bygg` ga. De frie
   * kontrollpunktene – endene og kummene som verken er låst av brukeren eller
   * hentet fra en annen trase – får høydene som gir minst graving. En høyde
   * knappen la sist (`lagt`), er fri igjen. Svaret er bunn innvendig, til å
   * låses; eller hvorfor det ikke går.
   *
   * GREINENE SOM RENNER INN. En grein henter høyden fra dette røret der den er
   * festet. Lagt rett under taket, ble røret liggende så høyt der at en grein
   * som renner inn på flatt terreng aldri fikk fall. Nå finnes den høyeste
   * høyden hver grein kan møte røret i – med greinas egen programmering, møtet
   * fritt – og røret holdes under den der. Går ikke det med det som ellers står
   * fast på røret, legges røret uten, og svaret sier fra (`merk`).
   *
   * @param {object} o  bygg, ror (id), koder, terrengZ, steg?, dyp?
   * @returns {{ laast: Array<{punkt:string, bunn:number}>, greiner: number, merk: string|null }
   *   | { feil: string, grunn?: string, fra?: number, til?: number }}
   *   grunn: 'dyp' | 'grein' | 'pakobling' | 'laast' – se `hvorfor`
   */
  function leggHoyderFor(o) {
    const l = o.bygg.linjer.find(x => x.id === o.ror);
    if (!l) {
      const u = (o.bygg.utenHoyde || []).find(x => x.id === o.ror);
      return { feil: !u ? 'røret har ingen høyder' : u.grunn === 'dimensjon' ? 'røret har ingen dimensjon – sett den i Koder-fanen'
        : 'terrenget mangler langs røret – det hentes fra Kartverket når anlegget regnes' };
    }
    if (l.plan.regel !== 'selvfall') return { feil: 'bare selvfallsrør får høydene lagt – et trykkrør følger terrenget' };
    const T = o.terrengZ || (() => NaN);
    // fast er det brukeren har låst, påkoblingene og greinene – ikke det knappen la sist
    const fast = c => (c.laast && !c.lagt) || !!c.fra;
    const oppsett = (linje, fri) => {
      const k = kodeAv(o.koder, linje.kode);
      const ktr = o.bygg.kontroll.filter(c => c.ror === linje.id).sort((a, b) => a.s - b.s);
      const { sl, prover } = proverLangs(linje, T);
      return { k, ktr, sl, arg: { s: ktr.map(c => c.s), fast: ktr.map(c => (fast(c) && c !== fri ? c.topp : null)), prover,
        minFall: minFall(k), maksFall: maksFall(k), motsatt: linje.plan.motsatt, steg: o.steg, dyp: o.dyp } };
    };
    // den høyeste toppen greina kan møte røret i – møtet er siste punkt, så en grein som starter i møtet, snus
    const hoyesteMote = (lb, g) => {
      const { ktr, arg } = oppsett(lb, g), j = ktr.indexOf(g);
      if (j !== 0 && j !== ktr.length - 1) return NaN;
      if (j === 0) {
        const S = arg.s[arg.s.length - 1];
        Object.assign(arg, { s: arg.s.map(v => S - v).reverse(), fast: arg.fast.slice().reverse(),
          prover: arg.prover.map(p => ({ s: S - p.s, U: p.U })).reverse(), motsatt: !arg.motsatt });
      }
      const svar = leggHoyder(arg);
      return svar.feil ? NaN : svar.hoyest;
    };
    const { k, ktr, sl, arg } = oppsett(l, null);
    const moter = [];
    for (const g of o.bygg.kontroll) {
      if (g.fra !== o.ror || !g.fraPunkt) continue;
      const lb = o.bygg.linjer.find(x => x.id === g.ror), j = l.punkter.findIndex(p => p.id === o.ror + ':' + g.fraPunkt);
      if (!lb || lb.plan.regel !== 'selvfall' || j < 0) continue;
      const H = hoyesteMote(lb, g);
      if (Number.isFinite(H)) moter.push({ s: sl[j], z: H });
    }
    let svar = leggHoyder(Object.assign({}, arg, { moter }));
    if (svar.feil && moter.length) {
      const uten = leggHoyder(arg);
      if (!uten.feil) svar = uten;
    }
    if (svar.feil) return Object.assign(svar, hvorfor(svar, ktr, arg));
    // et møte i et fast punkt – en kum låst for hånd – flytter ikke knappen: sjekk profilen mot hvert møte
    const ved = sv => {
      let j = 1;
      while (j < arg.s.length - 1 && arg.s[j] < sv) j++;
      const L = arg.s[j] - arg.s[j - 1];
      return L > 0 ? svar.topp[j - 1] + (svar.topp[j] - svar.topp[j - 1]) * (sv - arg.s[j - 1]) / L : svar.topp[j];
    };
    const merk = moter.some(m => ved(m.s) > m.z + 1e-6) ? 'greinene som renner inn, får ikke fall hit med det som står fast på røret' : null;
    /* NED TIL HEL MILLIMETER. Rundet av til nærmeste kunne punktet havne en
       halv millimeter over det programmeringen fant: over taket, og over den
       høyeste høyden en grein tåler å møte røret i – så greina ikke fikk fall. */
    return { laast: ktr.map((c, i) => ({ c, topp: svar.topp[i] })).filter(x => !fast(x.c))
      .map(x => ({ punkt: x.c.punkt, bunn: Math.floor(bunnFraTopp(x.topp, k) * 1000 + 1e-6) / 1000 })), greiner: moter.length, merk };
  }

  /**
   * Hvorfor knappen ikke fant noen profil. «Låste høyder eller fallet» sto for
   * alt – også når røret bare måtte dypere, og når en påkobling lå for grunt.
   *
   * Det som avgjør strekket det stoppet på, er det faste punktet foran det og
   * det i enden av det: bak et fast punkt begynner alt på nytt. Er det ingen
   * faste punkt der, kan det bare være dybden – et fritt rør kan alltid legges
   * dypere. Ellers prøves det dobbelt så dypt; går det, er det dybden, og
   * ellers det faste punktet: en grein, en påkobling eller en høyde låst for
   * hånd. (Mye dypere ble mange ganger tregere – parene er verdier × verdier.)
   */
  function hvorfor(svar, ktr, arg) {
    if (svar.i == null) return {};
    const dyp = arg.dyp || 6;
    let F = null;
    for (let j = svar.i; j >= 0 && F == null; j--) if (Number.isFinite(arg.fast[j])) F = j;
    const G = Number.isFinite(arg.fast[svar.i + 1]) ? svar.i + 1 : null;
    const med = [F, G].filter(j => j != null).map(j => ktr[j]);
    if (!med.length || !leggHoyder(Object.assign({}, arg, { dyp: 2 * dyp })).feil) {
      return { grunn: 'dyp', fra: svar.fra, til: svar.til, feil: `røret må ligge mer enn ${dyp} m dypere enn overdekningen krever for å få fallet` };
    }
    const hvor = { fra: F != null ? ktr[F].s : svar.fra, til: svar.til };
    if (med.some(c => c.fra)) {
      return Object.assign(hvor, { grunn: 'grein', feil: 'greina henter høyden fra røret den er festet til, og derfra får den ikke fallet '
        + 'uten å komme over overdekningen – legg høydene på det røret først, eller lås det dypere der greina kommer inn' });
    }
    if (med.some(c => c.kilde)) {
      return Object.assign(hvor, { grunn: 'pakobling', feil: 'høyden i påkoblingen gir ikke fallet uten å komme over overdekningen '
        + '– sjekk det innmålte røret, eller lås høydene for hånd' });
    }
    return Object.assign(hvor, { grunn: 'laast', feil: 'de låste høydene gir ikke fallet uten å komme over overdekningen – lås dem opp eller endre dem' });
  }

  return { StandardPlanmal, GRENSER, nyPlan, nyPlanmal, klem, nyId, alleIder, kodeAv, gods,
    toppFraBunn, bunnFraTopp, regel, overdekning, minFall, maksFall, forskyv, stasjonering, bygg, kontroller, fjell,
    fallSpenn, brekk, leggHoyder, leggHoyderFor, proverLangs };
})();

if (typeof module !== 'undefined') module.exports = RorPlan;
