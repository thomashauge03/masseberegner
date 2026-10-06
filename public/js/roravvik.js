'use strict';
/**
 * Planlagte rør mot innmålte – hvor røret ble lagt i forhold til planen.
 *
 * Ren logikk: ingen skjerm, intet kart, ingen lagring. Lastes som global
 * `RorAvvik` i nettleseren og med `require` i test/roravvikprove.js.
 *
 * SAMMENLIGNINGEN ENDRER INGENTING. Den leser linjene planen og importen
 * allerede gir, og sier hvor langt fra hverandre de er. Planen tilpasses ikke
 * det innmålte, og de målte høydene røres ikke – alt som endrer høyder, ligger
 * på knapper. Se docs/superpowers/specs/2026-10-06-ror-etappe3c-design.md.
 */
const RorAvvik = (() => {
  const _rp = () => (typeof RorPlan !== 'undefined' ? RorPlan : require('./rorplan.js'));

  /* Hull i dekningen kortere enn dette er ikke hull: ved kummer og i endene
     står det siste målte punktet sjelden helt ute. */
  const HULL = 2;
  /* Punkt med samme kode mellom søkebredden og dette telles som «nær». Et rør
     lagt 1,5 m til siden ville ellers bare sett «ikke innmålt» ut. */
  const NAER = 10;
  /* De største avvikene som listes. */
  const VERSTE = 10;

  const fmt = (v, d) => v.toFixed(d).replace('.', ',').replace('-', '−');

  /**
   * Et tall med minst `min` og høyst `maks` desimaler: 0,10 og 0,015, 1,0 og
   * 1,25. En toleranse på 0,025 skrevet med to desimaler ble «0,03» – en
   * annen grense enn den som gjaldt.
   */
  function kortTall(v, min, maks) {
    let s = v.toFixed(maks);
    for (let i = maks; i > min && s.endsWith('0'); i--) s = s.slice(0, -1);
    return s.replace('.', ',').replace('-', '−');
  }
  /** En toleranse i tekst – se `kortTall`. */
  function toleranseTekst(v) { return kortTall(v, 2, 3); }

  /** «+0,05», «−0,02» – og «0,00», aldri «−0,00». */
  function fortegn(v, d = 2) {
    const r = Math.round(v * 10 ** d) / 10 ** d;
    return (r > 0 ? '+' : '') + fmt(r === 0 ? 0 : r, d);
  }

  /** Skrivemåten likestilt: «SP160PE», «sp_160 pe» og «SP 160PE» blir «SP 160 PE». */
  function normKode(kode) {
    return String(kode || '').toUpperCase().replace(/_/g, ' ')
      .replace(/(\d)([A-ZÆØÅ])/g, '$1 $2').replace(/([A-ZÆØÅ])(\d)/g, '$1 $2')
      .replace(/\s+/g, ' ').trim();
  }

  /**
   * Samme rør? Samme kode med en annen skrivemåte – eller samme system og
   * dimensjon, når begge er kjent. Materialet teller ikke: «SP 160 PVC» der
   * planen sa «SP 160PE» er det samme røret, lagt i et annet materiale. Et
   * annet system med samme dimensjon er det ikke – vannet ved siden av
   * spillvannet skal ikke knyttes til det.
   */
  function likKode(a, ka, b, kb) {
    if (normKode(a) === normKode(b)) return true;
    return !!(ka && kb && ka.dim > 0 && ka.dim === kb.dim && ka.system && ka.system === kb.system);
  }

  /** Rammen rundt linja, med en margin – så punkt langt unna slipper avstandsregningen. */
  function ramme(xy, pad) {
    const r = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    for (const q of xy) {
      r.x0 = Math.min(r.x0, q.x); r.x1 = Math.max(r.x1, q.x);
      r.y0 = Math.min(r.y0, q.y); r.y1 = Math.max(r.y1, q.y);
    }
    return { x0: r.x0 - pad, x1: r.x1 + pad, y0: r.y0 - pad, y1: r.y1 + pad };
  }

  /** Strekkene med lengde – to punkt på samme sted gir ingen retning. Regnes én gang per linje. */
  function ekteStrekk(xy) {
    const ut = [];
    for (let i = 0; i + 1 < xy.length; i++) {
      if (Math.hypot(xy[i + 1].x - xy[i].x, xy[i + 1].y - xy[i].y) > 1e-6) ut.push(i);
    }
    return ut;
  }
  const retning = (xy, i) => {
    const dx = xy[i + 1].x - xy[i].x, dy = xy[i + 1].y - xy[i].y, L = Math.hypot(dx, dy);
    return { x: dx / L, y: dy / L };
  };

  /**
   * Nærmeste sted på linja: avstanden, strekket og hvor langt ut i det (0–1),
   * sideavviket og hvor langt forbi enden.
   *
   * SIDEAVVIKET har fortegn, + til høyre i tegneretningen. Midt på et strekk
   * er det tverravstanden. Forbi enden er det tverravstanden til det siste
   * strekket, og hvor langt forbi står for seg: et rør som går 0,6 m inn i
   * kummen, ligger ikke 0,6 m feil til siden.
   *
   * PÅ UTSIDEN AV EN KNEKK er knekkpunktet det nærmeste, avviket er avstanden
   * dit, og fortegnet er svingens: utsiden av en venstresving er til høyre.
   * Her ble fortegnet tatt fra tverravstanden til det ene strekket – i en
   * knekk skarpere enn 90° kan punktet ligge til venstre for linja det kom
   * fra, og på forlengelsen av den er tverravstanden null, selv om punktet
   * står en halv meter ute. Det ble «innenfor».
   */
  function naermest(xy, q, ekte = ekteStrekk(xy)) {
    if (!ekte.length) return null;
    const forste = ekte[0], siste = ekte[ekte.length - 1];
    let best = null;
    for (const i of ekte) {
      const a = xy[i], b = xy[i + 1], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, L = Math.sqrt(L2);
      const t = ((q.x - a.x) * dx + (q.y - a.y) * dy) / L2;
      const tk = Math.max(0, Math.min(1, t));
      const d = Math.hypot(q.x - (a.x + dx * tk), q.y - (a.y + dy * tk));
      if (best && d >= best.d - 1e-12) continue;
      const tvers = ((q.x - a.x) * dy - (q.y - a.y) * dx) / L;   // høyre for (dx, dy) er (dy, −dx)
      const forbi = i === forste && t < 0 ? -t * L : i === siste && t > 1 ? (t - 1) * L : 0;
      best = { d, i, tk, tvers, forbi };
    }
    if (best.forbi > 0) { best.side = best.tvers; return best; }
    let tegn = Math.sign(best.tvers);
    const knekk = best.tk >= 1 - 1e-12 ? best.i + 1 : best.tk <= 1e-12 ? best.i : -1;
    if (knekk >= 0) {
      const inn = ekte.filter(j => j < knekk).pop(), ut = ekte.find(j => j >= knekk);
      if (inn !== undefined && ut !== undefined) {
        const r0 = retning(xy, inn), r1 = retning(xy, ut), sving = r0.x * r1.y - r0.y * r1.x;
        if (Math.abs(sving) > 1e-9) tegn = sving > 0 ? 1 : -1;
      }
    }
    best.side = (tegn || 1) * best.d;
    return best;
  }

  /**
   * Hvert målte punkt på de innmålte rørene mot planen.
   *
   * Et punkt knyttes til det nærmeste planlagte røret med samme kode (se
   * `likKode`) innenfor søkebredden. HØYDEAVVIKET er bunn innvendig mot bunn
   * innvendig ved samme stasjon – hver side med sitt eget gods: «SP 160 PVC»
   * lagt der planen sa «SP 160PE», har tynnere vegg, og samme topp rør er da
   * ikke samme bunnløp.
   *
   * DEKNINGEN regnes av de innmålte linjene, ikke av punktene alene: strekket
   * mellom to nabopunkt dekker planen mellom stasjonene deres når begge er
   * knyttet til samme rør. Det er slik importen allerede leser punktene – et rør
   * mellom dem.
   *
   * @param {object} o
   *   plan         – linjene fra `RorPlan.bygg`, i regnesonen
   *   planKoder    – kodetabellen til det tegnede anlegget
   *   innmalt      – [{ anlegg, navn, koder, linjer }]: linjene fra `Ror.byggLinjer`, i regnesonen
   *   toleranse    – { plan, selvfall, trykk, sok } i m; standarden er `RorPlan.StandardPlanmal.avvik`
   *   bakkefaktor  – stasjonene vises som lengde på bakken, som i profilen
   */
  function sammenlign(o) {
    const RP = _rp();
    const tol = Object.assign({}, RP.StandardPlanmal.avvik, o.toleranse || {});
    const bf = o.bakkefaktor || 1;
    const linjer = (o.plan || []).filter(l => l.xy && l.xy.length > 1).map(l => {
      const k = RP.kodeAv(o.planKoder, l.kode), s = RP.stasjonering(l.xy);
      const regel = l.plan && l.plan.regel ? l.plan.regel : RP.regel(null, k);
      return { l, k, s, regel, tolH: regel === 'selvfall' ? tol.selvfall : tol.trykk, boks: ramme(l.xy, NAER),
        ekte: ekteStrekk(l.xy) };
    });
    const per = new Map(linjer.map(x => [x.l.id, {
      id: x.l.id, kode: x.l.kode, regel: x.regel, lengde: x.s[x.s.length - 1],
      antall: 0, utenfor: 0, maksSide: 0, maksHoyde: 0, naer: 0, ikkeInnmalt: [], dekket: 0, biter: []
    }]));
    const punkter = [];
    let antallInnmalt = 0;
    /* PUNKTENE SOM ER TELT. Importen deler rørnettet i hver knute, så et
       T-punkt er enden på tre linjer – og ble telt tre ganger: i tabellene, i
       de største avvikene og i rapporten. Hvert punkt telles én gang; hver
       forekomst gir likevel sin bit av dekningen, for knuten binder linjene
       sammen. */
    const telt = new Set();
    for (const a of o.innmalt || []) {
      for (const im of a.linjer || []) {
        const kM = RP.kodeAv(a.koder, im.kode);
        const kand = linjer.filter(x => likKode(x.l.kode, x.k, im.kode, kM));
        if (!kand.length) continue;
        /* GODSET TIL DEN INNMÅLTE KODEN – men sier den verken materiale eller
           gods («SP 160» knyttet til «SP 160PE»), er det planens rør, og da
           planens gods. Her ble SN8 (D/34) brukt, en innebygd centimeter mot
           PE med 3 cm toleranse. Mangler den dimensjonen, er det også planens. */
        const egen = kM.dim > 0 && (!!kM.materiale || (Number.isFinite(kM.gods) && kM.gods > 0));
        let forrige = null;       // knytningen til nabopunktet før – for dekningen
        for (let j = 0; j < im.punkter.length; j++) {
          const p = im.punkter[j], q = im.xy[j];
          const nokkel = a.anlegg + '\u0001' + p.id, ny = !telt.has(nokkel);
          telt.add(nokkel);
          if (ny) antallInnmalt++;
          let best = null;
          for (const x of kand) {
            const b = x.boks;
            if (q.x < b.x0 || q.x > b.x1 || q.y < b.y0 || q.y > b.y1) continue;
            const n = naermest(x.l.xy, q, x.ekte);
            if (n && (!best || n.d < best.n.d)) best = { x, n };
          }
          const x = best && best.x, n = best && best.n;
          const za = n ? x.l.punkter[n.i].z : NaN, zb = n ? x.l.punkter[n.i + 1].z : NaN;
          const toppPlan = za + (zb - za) * (n ? n.tk : 0);
          /* Et innmålt punkt har alltid høyde (importen tar ikke med punkt
             uten), og planens linjer har høyde overalt – hullene er fylt. Vakten
             er for det som ikke skal kunne skje. */
          if (!best || n.d > tol.sok + 1e-9 || !Number.isFinite(toppPlan) || !Number.isFinite(p.z)) {
            if (ny && best && n.d > tol.sok + 1e-9 && n.d <= NAER) per.get(x.l.id).naer++;
            forrige = null;
            continue;
          }
          const sv = x.s[n.i] + (x.s[n.i + 1] - x.s[n.i]) * n.tk;
          const r = per.get(x.l.id);
          r.biter.push(forrige && forrige.linje === x.l.id ? [Math.min(forrige.s, sv), Math.max(forrige.s, sv)] : [sv, sv]);
          forrige = { linje: x.l.id, s: sv };
          if (!ny) continue;
          const bunnPlan = RP.bunnFraTopp(toppPlan, x.k);
          const bunnInnmalt = RP.bunnFraTopp(p.z, egen ? kM : x.k);
          const hoyde = bunnInnmalt - bunnPlan;
          const utenforPlan = Math.abs(n.side) > tol.plan + 1e-9;
          const utenforHoyde = Math.abs(hoyde) > x.tolH + 1e-9;
          const pk = {
            anlegg: a.anlegg, navn: a.navn, punkt: p.id, kode: im.kode, planKode: x.l.kode,
            x: q.x, y: q.y, z: p.z, linje: x.l.id, s: sv, stasjon: sv * bf,
            side: n.side, hoyde, toppPlan, bunnPlan, bunnInnmalt, forbi: n.forbi, tolH: x.tolH,
            utenforPlan, utenforHoyde, ok: !utenforPlan && !utenforHoyde,
            grad: Math.max(Math.abs(n.side) / tol.plan, Math.abs(hoyde) / x.tolH)
          };
          punkter.push(pk);
          r.antall++;
          if (!pk.ok) r.utenfor++;
          if (Math.abs(pk.side) > Math.abs(r.maksSide)) r.maksSide = pk.side;
          if (Math.abs(hoyde) > Math.abs(r.maksHoyde)) r.maksHoyde = hoyde;
        }
      }
    }
    // HULLENE: fra starten, mellom bitene og til enden – de på 2 m eller mer
    for (const r of per.values()) {
      if (!r.antall) {
        r.ikkeInnmalt = r.lengde > 0 ? [{ fra: 0, til: r.lengde }] : [];
      } else {
        let naa = 0;
        for (const [fra, til] of r.biter.sort((p, q) => p[0] - q[0])) {
          if (fra - naa >= HULL) r.ikkeInnmalt.push({ fra: naa, til: fra });
          naa = Math.max(naa, til);
        }
        if (r.lengde - naa >= HULL) r.ikkeInnmalt.push({ fra: naa, til: r.lengde });
      }
      r.dekket = r.lengde - r.ikkeInnmalt.reduce((sum, h) => sum + h.til - h.fra, 0);
      delete r.biter;
    }
    const verste = punkter.slice().sort((p, q) => q.grad - p.grad).slice(0, VERSTE);
    // MERKNADENE: per rør, og én samlet når det ikke er noe å sammenligne med
    const merknader = [];
    const m0 = v => fmt(v * bf, 0), sok = kortTall(tol.sok, 1, 2);
    if (!(o.innmalt || []).length) {
      merknader.push({ type: 'avvik', tekst: 'Avvik mot innmålt: det er ingen innmålte røranlegg i prosjektet – '
        + 'importer de innmålte rørene som et eget anlegg.' });
    } else {
      if (!punkter.length) {
        merknader.push({ type: 'avvik', tekst: `Avvik mot innmålt: ingen innmålte punkt ligger innenfor ${sok} m `
          + 'av et planlagt rør med samme kode.' });
      }
      for (const x of linjer) {
        const r = per.get(x.l.id), k = x.l.kode;
        if (r.utenfor) {
          merknader.push({ type: 'avvik', linje: r.id, tekst: `${k}: ${r.utenfor} av ${r.antall} innmålte punkt utenfor `
            + `toleransen – største avvik ${fortegn(r.maksHoyde)} m i høyde og ${fortegn(r.maksSide)} m i plan.` });
        }
        if (punkter.length && r.ikkeInnmalt.length) {
          merknader.push({ type: 'avvik', linje: r.id, tekst: r.antall
            ? `${k}: ikke innmålt på ${r.ikkeInnmalt.map(h => `${m0(h.fra)}–${m0(h.til)}`).join(', ')} m.`
            : `${k}: ikke innmålt.` });
        }
        if (r.naer) {
          merknader.push({ type: 'avvik', linje: r.id, tekst: `${k}: ${r.naer} ${r.naer === 1 ? 'innmålt' : 'innmålte'} punkt `
            + `med samme kode ligger mer enn ${sok} m fra røret – utenfor søkebredden.` });
        }
      }
    }
    return { punkter, perLinje: per, verste, merknader, toleranse: tol, antallInnmalt,
      anlegg: (o.innmalt || []).map(a => a.navn) };
  }

  /**
   * Radene til tabellene – Rør-fanen, rapporten og PDF-en: ett rør per rad, i
   * linjenes rekkefølge, så nummeret er raden i rørtabellen. Lengdene på bakken.
   */
  function oppsummering(avvik, linjer, bakkefaktor) {
    const bf = bakkefaktor || 1;
    return (linjer || []).map((l, i) => {
      const r = avvik && avvik.perLinje.get(l.id);
      if (!r) return null;
      return { nr: i + 1, id: l.id, kode: l.kode, antall: r.antall, utenfor: r.utenfor, naer: r.naer,
        lengde: r.lengde * bf, dekket: r.dekket * bf, andel: r.lengde > 0 ? r.dekket / r.lengde : 0,
        maksSide: r.antall ? r.maksSide : NaN, maksHoyde: r.antall ? r.maksHoyde : NaN };
    }).filter(Boolean);
  }

  /** Ett punkt i ord – verktøytipset i kartet og avlesningen i profilen. Teksten sier innenfor eller utenfor. */
  function punkttekst(p, toleranse) {
    const tol = toleranse || _rp().StandardPlanmal.avvik;
    const hvor = [];
    if (p.utenforPlan) hvor.push(`i plan (±${toleranseTekst(tol.plan)})`);
    if (p.utenforHoyde) hvor.push(`i høyde (±${toleranseTekst(p.tolH)})`);
    return `${p.kode}${normKode(p.kode) !== normKode(p.planKode) ? ' mot ' + p.planKode : ''} · ${fmt(p.stasjon, 1)} m`
      + ` · plan ${fortegn(p.side)} m · høyde ${fortegn(p.hoyde)} m`
      + (p.forbi > 0.05 ? ` · ${fmt(p.forbi, 1)} m forbi enden` : '')
      + (p.ok ? ' · innenfor' : ' · utenfor ' + hvor.join(' og '));
  }

  return { HULL, NAER, VERSTE, fortegn, kortTall, toleranseTekst, normKode, likKode, sammenlign, oppsummering, punkttekst };
})();

if (typeof module !== 'undefined') module.exports = RorAvvik;
