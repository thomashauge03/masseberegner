'use strict';
/**
 * Planlagte rør i skjermen: verktøyene i kartet, dialogene, Rør-fanen for
 * tegnede anlegg og redigeringen i profilen.
 *
 * Regnestykket ligger i rorplan.js. Her er bare det som rører skjermen.
 */
const RorPlanUI = {
  app: null,
  /* Traseen som tegnes nå. Den ligger utenfor prosjektet til den er ferdig,
     så hele traseen blir én angrepost – ikke én per klikk. */
  _ny: null,
  /* Tracepunktet som er valgt i kartet – Delete tar det bort. */
  valgt: null,
  _sistKode: null,

  init(app) {
    this.app = app;
    const id = x => document.getElementById(x);
    for (const [knapp, modus] of [['verktoyTrase', 'tegnTrase'], ['verktoyKum', 'kum'], ['verktoySnu', 'snuTrase']]) {
      if (id(knapp)) id(knapp).onclick = () => Kart.settModus(Kart.modus === modus ? 'rediger' : modus);
    }
    if (id('verktoyTraseFil') && id('traseFil')) {
      id('verktoyTraseFil').onclick = () => id('traseFil').click();
      id('traseFil').onchange = async e => {
        const f = e.target.files && e.target.files[0];
        e.target.value = '';   // samme fil en gang til skal også lastes
        if (f) this.importerTraseTekst(f.name, await this._lesTekst(f));
      };
    }
    return this;
  },

  plan() { return this.app.P.ror.plan; },

  /* ---------------- trase fra fil ---------------- */

  /**
   * Teksten i en fil: UTF-8 når den er det, ellers Windows-1252. DXF og KOF
   * fra eldre programmer er ofte ANSI, og lest som UTF-8 ble æøå i lagnavnene
   * til spørsmålstegn.
   */
  async _lesTekst(f) {
    const buf = await f.arrayBuffer();
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { return new TextDecoder('windows-1252').decode(buf); }
  },

  /**
   * «Trase fra fil»: linjene i en KOF- eller DXF-fil blir traseer i det
   * tegnede anlegget, med røret brukeren velger i hver. Høydene i fila brukes
   * bare når det velges – da låses de som bunn innvendig. Alt er ett
   * angresteg. `valg` er for prøven og hopper over dialogen:
   * { linjer: [indekser], kode | koder: [per linje], regel?, hoyder: 'ingen'|'bunn'|'topp', sone? }.
   * @returns {boolean} om fila kunne leses
   */
  importerTraseTekst(navn, tekst, valg) {
    const app = this.app;
    if (!app.erPlan()) { RorUI._feil('Traseer fra fil hentes inn i et tegnet røranlegg – velg eller lag et i anleggslista.'); return false; }
    let les;
    try { les = TraseImport.les(navn, tekst); } catch (e) { RorUI._feil(e.message); return false; }
    const alle = les.linjer.flatMap(l => l.punkter);
    if (!alle.length) {
      RorUI._feil(`Fant ingen linjer i ${navn}` + (les.merknader.length ? ` – ${les.merknader[0]}` : '')
        + (Object.keys(les.hoppet || {}).length ? ` (bare ${Object.entries(les.hoppet).map(([t, n]) => `${n} ${t}`).join(', ')})` : '') + '.');
      return false;
    }
    // koordinatene: som for rørene fra maskinstyringen – punkt utenfor UTM i Norge hoppes over og telles
    const kk = Ror.sjekkKoordinater(alle);
    if (kk.melding) { RorUI._feil(kk.melding); return false; }
    if (kk.utenfor) {
      for (const l of les.linjer) l.punkter = l.punkter.filter(p => Ror.erUtm(p));
      les.linjer = les.linjer.filter(l => l.punkter.length >= 2);
    }
    const sone = les.sone ? { sone: les.sone, grunn: 'fila' } : Ror.gjettSone(alle.filter(p => Ror.erUtm(p)), null, RorUI._prosjektpunkter());
    if (valg) return this._lagreTraseFil(navn, les, Object.assign({ sone: sone.sone }, valg));
    this._traseFilDialog(navn, les, sone, kk.utenfor);
    return true;
  },

  /** En rørkode av et lag- eller kodenavn – når det kan tolkes som et rør med dimensjon, eller anlegget har koden. */
  _kodeFraLag(lag) {
    const kode = String(lag || '').trim();
    if (!kode) return null;
    if (this.app.P.ror.koder[kode]) return kode;
    const k = Ror.tolkKode(kode);
    return k.form === 'linje' && k.dim > 0 ? kode : null;
  },

  /** Dialogen: linjene med avkrysning og kode, sonen og høydene i fila. */
  _traseFilDialog(navn, les, sone, utenfor) {
    const app = this.app, koder = app.P.ror.koder, t = (v, d = 0) => Rapport.tall(v, d);
    const boks = document.getElementById('dialog'), innhold = document.getElementById('dialoginnhold');
    document.getElementById('dialogtittel').textContent = 'Trase fra fil';
    const forslag = [...new Set(Object.keys(koder).filter(k => koder[k].form !== 'punkt').concat(this._andreKoder()))];
    const harZ = les.linjer.some(l => l.punkter.some(p => Number.isFinite(p.z)));
    const hoppet = Object.entries(les.hoppet || {}).map(([ty, n]) => `${n} ${ty}`).join(', ');
    const rader = les.linjer.map((l, i) => `<tr><td><input type="checkbox" id="tfl${i}" checked></td>`
      + `<td><label for="tfl${i}">${escapeHtml(l.navn)}</label></td><td>${l.punkter.length}</td><td>${t(TraseImport.lengde(l))} m</td>`
      + `<td><label class="sr-only" for="tfk${i}">Kode for ${escapeHtml(l.navn)}</label><input id="tfk${i}" class="plankode" `
      // et lag som ikke er en rørkode, står tomt – en feil kode som ser riktig ut, er verre enn ingen
      + `list="planKodeliste" value="${escapeAttr(this._kodeFraLag(l.lag) || '')}" placeholder="f.eks. SP 160PE"></td></tr>`).join('');
    const grunn = { fila: 'oppgitt i fila', prosjektet: 'ved de andre anleggene i prosjektet', standard: 'standard – sjekk at traseen havner riktig' };
    innhold.innerHTML = `<p class="notis">${escapeHtml(navn)}: ${les.linjer.length} ${les.linjer.length === 1 ? 'linje' : 'linjer'}`
      + (utenfor ? ` · ${utenfor} punkt utenfor UTM i Norge er hoppet over` : '') + (hoppet ? ` · hoppet over: ${escapeHtml(hoppet)}` : '')
      + '. Hver linje blir en trase med ett rør; flere rør legges til i Rør-fanen.</p>'
      + `<datalist id="planKodeliste">${forslag.map(k => `<option value="${escapeAttr(k)}">`).join('')}</datalist>`
      + '<div class="tabellrull"><table class="trasefil"><thead><tr><th scope="col">Med</th><th scope="col">Linje</th>'
      + `<th scope="col">Punkt</th><th scope="col">Lengde</th><th scope="col">Rør</th></tr></thead><tbody>${rader}</tbody></table></div>`
      + '<div class="rorinnstilling"><label for="tfSone">Koordinatsystem</label><select id="tfSone" class="minivalg">'
      + [32, 33, 35].map(s => `<option value="${s}"${s === sone.sone ? ' selected' : ''}>EUREF89 UTM${s}</option>`).join('')
      + `</select> <span class="notis">${grunn[sone.grunn] || ''}</span></div>`
      + `<div class="rorinnstilling"><label for="tfHoyder">Høydene i fila</label><select id="tfHoyder" class="minivalg"${harZ ? '' : ' disabled'}>`
      + [['ingen', 'Bruk ikke – terrenget og fallet gir dem'], ['bunn', 'Bunn innvendig – låses'], ['topp', 'Topp rør – låses']]
        .map(([v, tekst]) => `<option value="${v}">${tekst}</option>`).join('')
      + `</select>${harZ ? '' : ' <span class="notis">fila har ingen høyder</span>'}</div>`
      + '<div class="knapperad" style="justify-content:flex-end"><button class="knapp" id="tfAvbryt">Avbryt</button>'
      + '<button class="knapp primaer" id="tfLagre">Hent inn</button></div>';
    const lukk = () => boks.classList.add('skjult');
    innhold.querySelector('#tfAvbryt').onclick = () => { lukk(); app.status('Ingen traseer ble hentet'); };
    innhold.querySelector('#tfLagre').onclick = () => {
      const valgte = les.linjer.map((l, i) => i).filter(i => innhold.querySelector('#tfl' + i).checked);
      if (!valgte.length) { app.status('Kryss av minst én linje'); return; }
      const kodene = valgte.map(i => innhold.querySelector('#tfk' + i).value.trim());
      if (kodene.some(k => !k)) { app.status('Skriv rørkoden for hver linje som skal med'); return; }
      lukk();
      this._lagreTraseFil(navn, les, { linjer: valgte, koder: kodene, sone: +innhold.querySelector('#tfSone').value,
        hoyder: innhold.querySelector('#tfHoyder').value });
    };
    boks.classList.remove('skjult');
  },

  /**
   * Lagrer linjene som traseer, ett angresteg for alle. Endene festes som når
   * en trase tegnes – til et innmålt rør eller en annen trase – men med en
   * halv meter, ikke fjorten skjermpunkt: fila er målt, ikke klikket.
   */
  _lagreTraseFil(navn, les, valg) {
    const app = this.app, r = app.P.ror, plan = r.plan;
    const linjer = (valg.linjer || []).map(i => les.linjer[i]).filter(Boolean);
    if (!linjer.length) { app.status('Ingen linjer valgt'); return false; }
    app.merk('traseer fra fil');
    let antall = 0, laast = 0;
    const koblet = [];
    linjer.forEach((l, k) => {
      const kode = valg.koder ? valg.koder[k] : valg.kode;
      const punkter = l.punkter.map(p => { const g = Geo.fraUtm(p.o, p.n, valg.sone); return { lat: g.lat, lon: g.lon }; });
      for (const i of [0, punkter.length - 1]) {
        const fest = this._fest(L.latLng(punkter[i].lat, punkter[i].lon), 0.5);
        if (fest) punkter[i] = { lat: fest.lat, lon: fest.lon, fest };
      }
      const svar = this.lagreTrase(punkter, [{ kode, side: 0, regel: valg.regel || null }], { stille: true, sone: valg.sone });
      antall++;
      koblet.push(...svar.koblet);
      if (valg.hoyder !== 'bunn' && valg.hoyder !== 'topp') return;
      // høydene i fila: låst som bunn innvendig der de finnes – men en påkobling står
      const ror = svar.nye[0], kd = RorPlan.kodeAv(r.koder, kode);
      l.punkter.forEach((p, i) => {
        const pid = svar.trase.punkter[i].id;
        if (!Number.isFinite(p.z) || plan.laast.some(x => x.ror === ror.id && x.punkt === pid)) return;
        plan.laast.push({ ror: ror.id, punkt: pid, bunn: Math.round((valg.hoyder === 'bunn' ? p.z : RorPlan.bunnFraTopp(p.z, kd)) * 1000) / 1000 });
        laast++;
      });
    });
    app.tegnAlt();
    app.planlegg(30);
    app.status(`${antall} ${antall === 1 ? 'trase' : 'traseer'} fra ${navn}`
      + (laast ? ` · ${laast} høyder låst fra fila` : '') + (koblet.length ? ` · ${koblet.length} ender koblet` : '')
      + ' – høydene kommer når terrenget er hentet');
    return true;
  },

  /* ---------------- ny trase ---------------- */

  /** Et klikk med «Ny trase»: punktet legges til, festet om det treffer et rør. */
  tegnKlikk(latlng) {
    if (!this.app.erPlan()) return;
    if (!this._ny) this._ny = [];
    const fest = this._fest(latlng);
    this._ny.push({ lat: fest ? fest.lat : latlng.lat, lon: fest ? fest.lon : latlng.lng, fest });
    /* BARE ENDENE KOBLES. Punktet legges på det det traff, men om det blir en
       påkobling eller en grein, avgjøres når traseen er ferdig – et punkt midt
       i traseen kobles ikke. Her sto «festet til» for hvert punkt. */
    const ved = !fest ? '' : fest.trase ? ' – ved en annen trase, blir en grein om det er en ende'
      : ` – ved ${fest.kode}, kobles på om det blir en ende`;
    this.app.status(`${this._ny.length} punkt${ved}. `
      + 'Dobbeltklikk eller Enter avslutter, tilbaketasten tar bort det siste, Esc avbryter.');
    Kart.tegnRor();
  },

  /**
   * Et rør å feste til nær klikket: et punkt på en annen trase i dette
   * anlegget (greining), eller et målt punkt på et innmålt rør i et annet
   * anlegg (påkobling). Det nærmeste innen fjorten skjermpunkt vinner – eller
   * innen `tolMeter` når punktet kommer fra en fil.
   */
  _fest(latlng, tolMeter) {
    const app = this.app, tol = Number.isFinite(tolMeter) ? tolMeter : RorUI._toleranse(latlng);
    let best = null;
    const prov = (lat, lon, mer) => {
      const d = Kart.kart.distance(latlng, L.latLng(lat, lon));
      if (d <= tol && (!best || d < best.d)) best = Object.assign({ d, lat, lon }, mer);
    };
    for (const t of this.plan().traseer) for (const p of t.punkter) prov(p.lat, p.lon, { trase: t.id, punkt: p.id });
    for (const a of app.P.anlegg) {
      if (a.type !== 'ror' || a.id === app.P.aktivt || !a.ror || a.ror.plan) continue;
      const b = Ror.byggLinjer(a.ror, a.mal || Ror.StandardRormal, Ror.lagTilXY(a.ror.sone, a.ror.sone));
      for (const l of b.linjer) {
        for (const p of l.punkter) {
          const [lat, lon] = Ror.tilLatLon(p, a.ror.sone);
          prov(lat, lon, { anlegg: a.id, punkt: p.id, topp: p.z, kode: p.kode, koder: a.ror.koder });
        }
      }
    }
    return best;
  },

  /** Tilbaketasten: det siste punktet bort. */
  angreSiste() {
    if (!this._ny || !this._ny.length) return;
    this._ny.pop();
    Kart.tegnRor();
  },

  /** Esc, eller et annet verktøy: traseen som tegnes, forkastes. */
  avbryt() {
    if (this._ny && this._ny.length) this.app.status('Traseen ble ikke lagret');
    this._ny = null;
  },

  /** Dobbeltklikk eller Enter: traseen er ferdig – velg rørene i den. */
  avsluttTrase() {
    const ny = this._ny;
    if (!ny || ny.length < 2) { this.app.status('En trase trenger minst to punkt'); return; }
    this._ny = null;
    Kart.settModus('rediger');
    const fest = [ny[0].fest, ny[ny.length - 1].fest].find(f => f && f.kode);
    this.rorDialog({
      tittel: 'Rør i traseen', flere: true, notis: `${ny.length} punkt.`,
      rader: [{ kode: (fest && fest.kode) || this._sistKode || '', side: 0, regel: '' }],
      lagre: rader => this.lagreTrase(ny, rader),
      avbrutt: () => this.app.status('Traseen ble ikke lagret')
    });
  },

  /** Kodene i de andre røranleggene – forslag når man skriver en kode. */
  _andreKoder() {
    const ut = [];
    for (const a of this.app.P.anlegg) {
      if (a.type !== 'ror' || a.id === this.app.P.aktivt || !a.ror) continue;
      for (const [k, v] of Object.entries(a.ror.koder || {})) if (v.form !== 'punkt') ut.push(k);
    }
    return ut;
  },

  /**
   * Dialogen for rør: kode, sideavstand og regel – én rad per rør. Brukes for
   * en ny trase (flere rør), et nytt rør i en trase og «Endre».
   */
  rorDialog(o) {
    const app = this.app, koder = app.P.ror.koder;
    const boks = document.getElementById('dialog'), innhold = document.getElementById('dialoginnhold');
    document.getElementById('dialogtittel').textContent = o.tittel;
    const forslag = [...new Set(Object.keys(koder).filter(k => koder[k].form !== 'punkt').concat(this._andreKoder()))];
    let nr = 0;
    const rad = x => {
      nr++;
      return `<div class="planrad"><label for="pk${nr}">Kode</label>`
        + `<input id="pk${nr}" class="plankode" list="planKodeliste" value="${escapeAttr(x.kode || '')}" placeholder="f.eks. SP 160PE">`
        + `<label for="ps${nr}">Side</label><input id="ps${nr}" class="planside" type="number" step="0.1" value="${x.side || 0}"> m`
        + `<label for="pr${nr}">Regel</label><select id="pr${nr}" class="minivalg planregel">`
        + ['', 'selvfall', 'trykk'].map(v => `<option value="${v}"${(x.regel || '') === v ? ' selected' : ''}>${v || 'fra koden'}</option>`).join('')
        + '</select>' + (o.flere ? ' <button class="minilenke planfjern" title="Ta bort røret">×</button>' : '') + '</div>';
    };
    innhold.innerHTML = `<p class="notis">${escapeHtml(o.notis || '')} Sideavstanden er fra traseen, positiv til høyre i `
      + 'tegneretningen. Regelen kommer av koden: selvfall for spillvann, overvann og drens, trykk for vann og kabel.</p>'
      + `<datalist id="planKodeliste">${forslag.map(k => `<option value="${escapeAttr(k)}">`).join('')}</datalist>`
      + `<div id="planRader">${o.rader.map(rad).join('')}</div>`
      + (o.flere ? '<div class="knapperad"><button class="knapp" id="planNyRad">+ Rør</button></div>' : '')
      + '<div class="knapperad" style="justify-content:flex-end"><button class="knapp" id="planAvbryt">Avbryt</button>'
      + '<button class="knapp primaer" id="planLagre">Lagre</button></div>';
    const koble = () => {
      for (const b of innhold.querySelectorAll('.planfjern')) {
        b.onclick = () => { if (innhold.querySelectorAll('.planrad').length > 1) b.closest('.planrad').remove(); };
      }
    };
    koble();
    if (o.flere) {
      innhold.querySelector('#planNyRad').onclick = () => {
        innhold.querySelector('#planRader').insertAdjacentHTML('beforeend', rad({ kode: '', side: 0, regel: '' }));
        koble();
      };
    }
    const lukk = () => boks.classList.add('skjult');
    innhold.querySelector('#planAvbryt').onclick = () => { lukk(); if (o.avbrutt) o.avbrutt(); };
    innhold.querySelector('#planLagre').onclick = () => {
      const rader = [...innhold.querySelectorAll('.planrad')].map(d => ({
        kode: d.querySelector('.plankode').value.trim(),
        side: RorPlan.klem('side', d.querySelector('.planside').value),
        regel: d.querySelector('.planregel').value || null
      })).filter(x => x.kode);
      if (!rader.length) { app.status('Skriv koden til minst ett rør'); return; }
      lukk();
      o.lagre(rader);
    };
    boks.classList.remove('skjult');
  },

  /**
   * Lagrer en ny trase med rørene. Endene som traff noe, festes: til en annen
   * trase som grein, til et innmålt rør som låst høyde på røret med samme kode
   * – med kilden, så merknadene kan si fra om den endres.
   *
   * HAR INGEN AV RØRENE KODEN, LÅSES INGENTING. Her tok det første røret
   * høyden: en ende på en vannledning ga spillvannsrøret vannledningens
   * bunnløp. Samme system og dimensjon med en annen skrivemåte («SP 160 PE»)
   * er samme rør.
   */
  lagreTrase(punkter, rader, o = {}) {
    const app = this.app, r = app.P.ror, plan = r.plan;
    // `stille`: en av flere fra en fil – angreposten, tegningen og statuslinja tar den som kaller
    if (!o.stille) app.merk('ny trase');
    // den første traseen bestemmer sonen punktene tegnes i – fra en fil er det filas
    if (!plan.traseer.length) r.sone = o.sone || Geo.sone(punkter[0].lon);
    const brukt = RorPlan.alleIder(plan, this.app.P.ror.groft);
    const ny = id => { brukt.add(id); return id; };
    const t = { id: ny(RorPlan.nyId(brukt, 't')), punkter: [] };
    for (const p of punkter) t.punkter.push({ id: ny(RorPlan.nyId(brukt, 'p')), lat: p.lat, lon: p.lon });
    plan.traseer.push(t);
    r.koder = Ror.koderFra(rader.map(x => ({ kode: x.kode })), r.koder);
    const nye = rader.map(x => {
      const ror = { id: ny(RorPlan.nyId(brukt, 'r')), trase: t.id, kode: x.kode, side: x.side || 0, regel: x.regel, motsatt: false };
      plan.ror.push(ror);
      return ror;
    });
    // det som ble koblet, og det som ikke ble det, står i statuslinja til slutt – ikke skrevet over av den
    const koblet = [], notater = [];
    for (const [i, ende] of [[0, 'start'], [punkter.length - 1, 'slutt']]) {
      const f = punkter[i].fest;
      if (!f) continue;
      const hvilken = ende === 'start' ? 'starten' : 'slutten';
      if (f.trase) {
        plan.greiner.push({ trase: t.id, ende, til: { trase: f.trase, punkt: f.punkt } });
        koblet.push(`${hvilken} er en grein av en annen trase`);
        continue;
      }
      const k = RorPlan.kodeAv(f.koder, f.kode);
      if (!(k.dim > 0)) { notater.push(`påkoblingen har koden ${f.kode} uten dimensjon, så høyden ble ikke hentet`); continue; }
      const kodeAv = x => RorPlan.kodeAv(r.koder, x.kode);
      const ror = nye.find(x => x.kode === f.kode)
        || nye.find(x => kodeAv(x).dim === k.dim && kodeAv(x).system && kodeAv(x).system === k.system);
      if (!ror) { notater.push(`enden ligger på ${f.kode}, men ingen av rørene har den koden – høyden ble ikke hentet`); continue; }
      plan.laast.push({ ror: ror.id, punkt: t.punkter[i].id, bunn: +RorPlan.bunnFraTopp(f.topp, k).toFixed(3),
        kilde: { anlegg: f.anlegg, punkt: f.punkt, topp: f.topp } });
      koblet.push(`${hvilken} er koblet på ${f.kode}`);
    }
    this._sistKode = rader[rader.length - 1].kode;
    RorUI.valgt = nye[0].id;
    if (!o.stille) {
      app.tegnAlt();
      app.planlegg(30);
      app.status(`Traseen er lagret med ${nye.length} rør` + (koblet.length ? ' – ' + koblet.join(' og ') : '')
        + ' – høydene kommer når terrenget er hentet' + (notater.length ? ' · ' + notater.join(' · ') : ''));
    }
    return { trase: t, nye, koblet, notater };
  },

  /* ---------------- redigering i kartet ---------------- */

  /** Klikk med «Kum» eller «Snu fallretning». */
  kartklikk(modus, latlng) {
    const app = this.app;
    if (!app.erPlan()) return;
    const plan = this.plan(), tol = RorUI._toleranse(latlng);
    if (modus === 'kum') {
      const p = this._naermestePunkt(latlng, tol);
      if (!p) { app.status('Klikk på et punkt på en trase'); return; }
      const ror = plan.ror.filter(x => x.trase === p.trase);
      if (!ror.length) { app.status('Traseen har ingen rør'); return; }
      if (ror.length === 1) this._vekslKum(ror[0], p.punkt);
      else this._velgRor(ror, 'Hvilket rør er kummen på?', x => this._vekslKum(x, p.punkt));
      return;
    }
    if (modus === 'snuTrase') {
      const t = this._naermesteTrase(latlng, tol);
      if (!t) { app.status('Klikk på en trase'); return; }
      app.merk('snudde fallretningen');
      for (const x of plan.ror) if (x.trase === t.id) x.motsatt = !x.motsatt;
      app.tegnAlt();
      app.planlegg(30);
      app.status('Fallretningen er snudd for rørene i traseen');
    }
  },

  /** Et valg mellom rørene i en trase – selvfall først, det er dem kummene står på. */
  _velgRor(ror, tittel, valgt) {
    const koder = this.app.P.ror.koder;
    const selv = x => (RorPlan.regel(x, RorPlan.kodeAv(koder, x.kode)) === 'selvfall' ? 0 : 1);
    const sortert = ror.slice().sort((a, b) => selv(a) - selv(b));
    const boks = document.getElementById('dialog'), innhold = document.getElementById('dialoginnhold');
    document.getElementById('dialogtittel').textContent = tittel;
    innhold.innerHTML = '<div class="knapperad">' + sortert.map((x, i) =>
      `<button class="knapp${i === 0 ? ' primaer' : ''}" data-planvelg="${escapeAttr(x.id)}">${escapeHtml(x.kode)}</button>`).join('')
      + '</div>';
    for (const b of innhold.querySelectorAll('[data-planvelg]')) {
      b.onclick = () => { boks.classList.add('skjult'); valgt(ror.find(x => x.id === b.dataset.planvelg)); };
    }
    boks.classList.remove('skjult');
  },

  /** Kum på et rør i et punkt – av om den finnes, på om den ikke gjør det. */
  _vekslKum(ror, punkt) {
    const app = this.app, plan = this.plan();
    const i = plan.kummer.findIndex(k => k.ror === ror.id && k.punkt === punkt);
    if (i >= 0) {
      app.merk('tok bort kum');
      plan.kummer.splice(i, 1);
      app.status('Kummen er tatt bort');
    } else {
      app.merk('ny kum');
      const id = RorPlan.nyId(RorPlan.alleIder(plan, this.app.P.ror.groft), 'k');
      plan.kummer.push({ id, ror: ror.id, punkt, diameter: app.P.mal.plan.kum.diameter });
      app.status(`Kum ${id} på ${ror.kode} – bunnløpet følger overdekningen til det låses i profilen`);
    }
    app.tegnAlt();
    app.planlegg(30);
  },

  /** Nærmeste tracepunkt innen toleransen. */
  _naermestePunkt(latlng, tol) {
    let best = null;
    for (const t of this.plan().traseer) {
      for (const p of t.punkter) {
        const d = Kart.kart.distance(latlng, L.latLng(p.lat, p.lon));
        if (d <= tol && (!best || d < best.d)) best = { trase: t.id, punkt: p.id, d };
      }
    }
    return best;
  },

  /** Nærmeste trase innen toleransen – målt til strekene i regnesonen. */
  _naermesteTrase(latlng, tol) {
    const sone = this.app.sone, u = Geo.tilUtm(latlng.lat, latlng.lng, sone);
    let best = null;
    for (const t of this.plan().traseer) {
      const xy = t.punkter.map(p => Geo.tilUtm(p.lat, p.lon, sone));
      for (let i = 1; i < xy.length; i++) {
        const d = Ror.avstandTilStrekk(u, xy[i - 1], xy[i]);
        if (d <= tol && (!best || d < best.d)) best = { t, d };
      }
    }
    return best ? best.t : null;
  },

  /**
   * Et tracepunkt er flyttet. Greiner festet til punktet følger med – også i
   * greinas eget endepunkt, så festet kan slippes uten at greina hopper.
   */
  flyttPunkt(tid, pid, latlng) {
    const plan = this.plan(), t = plan.traseer.find(x => x.id === tid);
    const p = t && t.punkter.find(x => x.id === pid);
    if (!p) return;
    p.lat = latlng.lat; p.lon = latlng.lng;
    /* Drar man en ende som er festet til en annen trase, slippes festet –
       ellers ville enden hoppet tilbake til punktet den var festet til. */
    const i = t.punkter.indexOf(p), ende = i === 0 ? 'start' : i === t.punkter.length - 1 ? 'slutt' : null;
    if (ende && plan.greiner.some(g => g.trase === tid && g.ende === ende)) {
      plan.greiner = plan.greiner.filter(g => !(g.trase === tid && g.ende === ende));
      this.app.status('Festet til den andre traseen er sluppet');
    }
    for (const g of plan.greiner) {
      if (g.til.trase !== tid || g.til.punkt !== pid) continue;
      const gt = plan.traseer.find(x => x.id === g.trase);
      const ende = gt && gt.punkter[g.ende === 'start' ? 0 : gt.punkter.length - 1];
      if (ende) { ende.lat = p.lat; ende.lon = p.lon; }
    }
  },

  /**
   * Setter inn et punkt der traseen er nærmest klikket – på linja, så rørene
   * ligger der de lå. Lander klikket på et punkt som finnes (eller forbi en
   * ende), er svaret det punktet: et punkt til der ville gitt et strekk uten
   * lengde, og røret ved siden av fikk en pigg i knekken.
   */
  settInnPaaTrase(tid, latlng) {
    const app = this.app, plan = this.plan(), t = plan.traseer.find(x => x.id === tid);
    if (!t) return null;
    const sone = app.sone, u = Geo.tilUtm(latlng.lat, latlng.lng, sone);
    const xy = t.punkter.map(p => Geo.tilUtm(p.lat, p.lon, sone));
    let best = null;
    for (let i = 1; i < xy.length; i++) {
      const a = xy[i - 1], b = xy[i], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
      const s = L2 > 0 ? Math.max(0, Math.min(1, ((u.x - a.x) * dx + (u.y - a.y) * dy) / L2)) : 0;
      const q = { x: a.x + dx * s, y: a.y + dy * s }, d = Math.hypot(u.x - q.x, u.y - q.y);
      if (!best || d < best.d) best = { i, q, d };
    }
    for (const j of [best.i - 1, best.i]) {
      if (Math.hypot(best.q.x - xy[j].x, best.q.y - xy[j].y) < 0.05) return t.punkter[j].id;
    }
    app.merk('satte inn tracepunkt');
    const id = RorPlan.nyId(RorPlan.alleIder(plan, this.app.P.ror.groft), 'p');
    const g = Geo.fraUtm(best.q.x, best.q.y, sone);
    t.punkter.splice(best.i, 0, { id, lat: g.lat, lon: g.lon });
    app.tegnAlt();
    app.planlegg(30);
    return id;
  },

  /**
   * Velger et tracepunkt – Delete tar det bort. Anlegget står i valget: id-ene
   * (t1, p2) går igjen i hvert tegnet anlegg, og et valg i ett skal ikke
   * slette et punkt i et annet man har byttet til.
   */
  velgPunkt(tid, pid) {
    this.valgt = { anlegg: this.app.P.aktivt, trase: tid, punkt: pid };
    this.app.status('Punktet er valgt – Delete tar det bort, dra det for å flytte');
    Kart.tegnRor();
  },

  /** Det valgte punktet, om det er valgt i anlegget som er oppe. */
  valgtHer() {
    return this.valgt && this.valgt.anlegg === this.app.P.aktivt ? this.valgt : null;
  },

  slettValgt() {
    const v = this.valgtHer();
    if (v) this.slettPunkt(v.trase, v.punkt);
    this.valgt = null;
  },

  /**
   * Tar bort et tracepunkt – og det som står på det: kummer og låste høyder.
   * Greiner festet til punktet slippes; endepunktet deres blir stående der det
   * var. En trase kan ikke ha færre enn to punkt.
   */
  slettPunkt(tid, pid) {
    const app = this.app, plan = this.plan(), t = plan.traseer.find(x => x.id === tid);
    if (!t) return;
    if (t.punkter.length <= 2) { app.status('En trase trenger minst to punkt – slett traseen i Rør-fanen'); return; }
    const i = t.punkter.findIndex(x => x.id === pid);
    if (i < 0) return;
    app.merk('slettet tracepunkt');
    t.punkter.splice(i, 1);
    const rorHer = new Set(plan.ror.filter(x => x.trase === tid).map(x => x.id));
    const for0 = [plan.kummer.length, plan.laast.length, plan.greiner.length];
    plan.kummer = plan.kummer.filter(k => !(rorHer.has(k.ror) && k.punkt === pid));
    plan.laast = plan.laast.filter(l => !(rorHer.has(l.ror) && l.punkt === pid));
    plan.greiner = plan.greiner.filter(g => !(g.til.trase === tid && g.til.punkt === pid)
      && !(g.trase === tid && ((g.ende === 'start' && i === 0) || (g.ende === 'slutt' && i === t.punkter.length))));
    const borte = [[for0[0] - plan.kummer.length, 'kum', 'kummer'], [for0[1] - plan.laast.length, 'låst høyde', 'låste høyder'],
      [for0[2] - plan.greiner.length, 'feste', 'fester']].filter(x => x[0]).map(x => `${x[0]} ${x[0] === 1 ? x[1] : x[2]}`);
    app.status('Punktet er slettet' + (borte.length ? ' – sammen med ' + borte.join(', ') : ''));
    if (this.valgt && this.valgt.punkt === pid) this.valgt = null;
    app.tegnAlt();
    app.planlegg(30);
  },

  /* ---------------- Rør-fanen ---------------- */

  /** Rør-fanen for et tegnet anlegg: traseene med rørene, kumlista, kontrollene, grøfta og innstillingene. */
  fyllFane(e, r, bygg, res) {
    const app = this.app, plan = r.plan, mp = app.P.mal.plan, t = (v, d = 0) => Rapport.tall(v, d);
    const bf = (res && res.bakkefaktor) || 1;
    let tr = '';
    plan.traseer.forEach((tra, ti) => {
      tr += `<div class="rorgruppe"><div class="rorkode"><b>Trase ${ti + 1}</b><span class="notis">${tra.punkter.length} punkt</span>`
        + ` <button class="minilenke" data-plannytt="${escapeAttr(tra.id)}">+ Rør</button>`
        + ` <button class="minilenke" data-plantraseslett="${escapeAttr(tra.id)}">Slett traseen</button></div>`;
      for (const x of plan.ror.filter(y => y.trase === tra.id)) {
        const k = RorPlan.kodeAv(r.koder, x.kode), reg = RorPlan.regel(x, k);
        const l = (res ? res.linjer : bygg.linjer).find(y => y.id === x.id);
        const pr = res && res.profiler.get(x.id), gr = res && res.groft && res.groft.perLinje.get(x.id);
        const f = res && l ? RorPlan.fallSpenn(res.kontroll, l) : null;
        tr += `<div class="planror"><button class="rorlinje${x.id === RorUI.valgt ? ' aktiv' : ''}" data-linje="${escapeAttr(x.id)}">`
          + `<span class="rorfarge" style="background:${Farger.ror(k.farge)}" aria-hidden="true"></span> <b>${escapeHtml(x.kode)}</b>`
          + ` · ${reg}${x.motsatt ? ' (snudd)' : ''} · side ${t(x.side || 0, 1)} m`
          + (l ? ` · ${t(l.lengde * bf, 1)} m` : ' · ingen høyder ennå')
          + (f ? ` · fall ${Ror.spenn(f.min, f.maks, v => t(v, 1))} ‰` : '')
          + (pr ? ` · overdekning ${Ror.spenn(pr.minOverdekning, pr.maksOverdekning, v => t(v, 2))} m` : '')
          + (gr ? ` · graving ${t(gr.gravingLos + gr.sprengning)} m³` : '') + '</button>'
          + ` <button class="minilenke" data-planendre="${escapeAttr(x.id)}">Endre</button>`
          + ` <button class="minilenke" data-plansnu="${escapeAttr(x.id)}">Snu</button>`
          + (reg === 'selvfall' ? ` <button class="minilenke" data-planlegg="${escapeAttr(x.id)}" title="Høydene i kummene og de frie `
            + 'endene som gir minst graving, med overdekningen og fallet innenfor kravene – låst, og kan angres">⤓ Legg høydene</button>' : '')
          + ` <button class="minilenke" data-planslett="${escapeAttr(x.id)}">Slett</button></div>`;
      }
      tr += '</div>';
    });
    const kummer = (res && res.kummer) || bygg.kummer || [];
    const kumtabell = kummer.length
      ? '<table class="kumliste"><thead><tr><th scope="col">Kum</th><th scope="col">Rør</th><th scope="col">Ø mm</th>'
        + '<th scope="col">Terreng</th><th scope="col">Bunnløp</th><th scope="col">Dybde</th><th scope="col"><span class="sr-only">Slett</span></th></tr></thead><tbody>'
        + kummer.map(k => {
          const ror = plan.ror.find(x => x.id === k.ror), kid = escapeAttr(k.id);
          return `<tr><th scope="row">${escapeHtml(k.id)}</th><td>${escapeHtml(ror ? ror.kode : '?')}</td>`
            + `<td><label class="sr-only" for="kd_${kid}">Diameter for ${escapeHtml(k.id)}</label>`
            + `<input id="kd_${kid}" class="minitall" type="number" min="400" max="3000" step="100" value="${k.diameter}" data-kumdiameter="${kid}"></td>`
            + `<td>${t(k.terreng, 2)}</td><td>${t(k.bunnlop, 2)}</td><td>${t(k.terreng - k.bunnlop, 2)}</td>`
            + `<td><button class="minilenke" data-kumslett="${kid}">Slett</button></td></tr>`;
        }).join('') + '</tbody></table>'
      : '<p class="notis">Ingen kummer – sett dem med «◯ Kum» i kartet.</p>';
    const merk = (res ? res.merknader : []).map(m => `<li>${escapeHtml(m.tekst)}</li>`).join('');
    const felt = this._felt;
    const s = res ? Ror.sammendrag(res) : null;
    e.innerHTML = `<h3>${escapeHtml(app.anlegg().navn || 'Planlagte rør')}</h3>
      <p class="notis">Tegnet i Massekalk · ${plan.traseer.length} ${plan.traseer.length === 1 ? 'trase' : 'traseer'}.
        Høydene ved kummer og låste punkt er bunn innvendig; frie punkt ligger med overdekningen under terrenget.</p>
      ${s ? `<div class="sumrad"><span>Rør</span><span class="verdi">${s.antall} · ${t(s.lengde)} m</span></div>` : ''}
      <h3>Traseene</h3>
      <div class="rorliste">${tr || '<p class="tomtekst">Ingen traseer ennå – tegn en med «✎ Ny trase» i kartet.</p>'}</div>
      <h3>Kummer</h3>${kumtabell}
      ${merk ? `<h3>Kontroller og merknader</h3><ul class="rormerknader">${merk}</ul>` : ''}
      ${GroftUI.html(r, res)}
      ${this.avvikHtml(res)}
      <h3>Innstillinger</h3>
      ${felt('planOverdekning', 'Overdekning til topp rør – frie punkt og varselgrense', mp.overdekning, 'm', 0.1, 0, 10)}
      ${felt('planKryss', 'Minste klaring der rør krysser', mp.kryssKlaring, 'm', 0.05, 0, 5)}
      ${felt('planKumDiameter', 'Diameter på nye kummer', mp.kum.diameter, 'mm', 100, 400, 3000)}
      ${felt('planArbeidsrom', 'Arbeidsrom rundt kummene', mp.kum.arbeidsrom, 'm', 0.1, 0, 3)}
      ${felt('planBrekk', 'Trykkrør: høybrekk og lavbrekk fra', mp.brekk, 'm', 0.05, 0.05, 5)}
      ${felt('planTrykkFall', 'Trykkrør: minste fall mellom brekkene (0 = av)', mp.trykkMinFall, '‰', 0.5, 0, 1000)}`;
    GroftUI.koble(e);
    this.koble(e);
  },

  /** Ett tallfelt i fanen – merkelappen står, feltet har grensene. */
  _felt(id, navn, verdi, enhet, steg, min, maks) {
    return `<div class="rorinnstilling"><label for="${id}">${navn}</label>`
      + `<input id="${id}" class="minitall" type="number" min="${min}" max="${maks}" step="${steg}" value="${verdi}"> ${enhet}</div>`;
  },

  /**
   * «Avvik mot innmålt» i Rør-fanen: knappen, og når den er på, toleransene,
   * tabellen per rør og de største avvikene.
   *
   * KNAPPEN ENDRER INGENTING. Den viser hvor de innmålte rørene ligger i
   * forhold til planen – planen tilpasses ikke, og de målte høydene røres ikke.
   */
  avvikHtml(res) {
    const av = this.app.P.mal.plan.avvik, t = (v, d = 0) => Rapport.tall(v, d);
    const tegn = v => (Number.isFinite(v) ? RorAvvik.fortegn(v) : '–');
    const hode = `<h3>Avvik mot innmålt</h3>
      <p class="notis">Sammenligner rørene her med de innmålte røranleggene i prosjektet: avviket i plan (+ til høyre i
        tegneretningen) og i høyde (bunn innvendig, + over planen) i hvert innmålt punkt. Endrer ingenting – verken planen
        eller de innmålte høydene.</p>
      <div class="knapperad"><button class="knapp${av.vis ? ' aktiv' : ''}" id="planAvvik" aria-pressed="${av.vis}">`
      + 'Vis avvik mot innmålt</button></div>';
    if (!av.vis) return hode;
    const felt = this._felt;
    const a = res && res.avvik;
    let innhold;
    if (!a) innhold = '<p class="notis">Regnes når rørene er regnet.</p>';
    else if (!a.anlegg.length) {
      innhold = '<p class="tomtekst">Ingen innmålte røranlegg i prosjektet – importer de innmålte rørene som et eget anlegg.</p>';
    } else {
      const rader = RorAvvik.oppsummering(a, res.linjer, res.bakkefaktor);
      // nummeret er raden i tabellen over – to rør med samme kode skal kunne skilles
      const nr = new Map(rader.map(r => [r.id, r.nr]));
      innhold = `<p class="notis">${a.punkter.length} av ${a.antallInnmalt} innmålte punkt med planens koder er knyttet til et rør
          (fra ${a.anlegg.map(escapeHtml).join(', ')}).</p>`
        + '<table class="avvikliste"><caption>Per rør</caption><thead><tr><th scope="col">Rør</th><th scope="col">Punkt</th>'
        + '<th scope="col">Innmålt</th><th scope="col">Utenfor</th><th scope="col">Plan m</th><th scope="col">Høyde m</th></tr></thead><tbody>'
        + rader.map(r => `<tr${r.utenfor ? ' class="utenfor"' : ''}><th scope="row"><button class="minilenke" data-linje="${escapeAttr(r.id)}">`
          + `${r.nr} ${escapeHtml(r.kode)}</button></th><td>${r.antall}${r.naer ? ` (+${r.naer} nær)` : ''}</td>`
          + `<td>${t(r.dekket)} av ${t(r.lengde)} m</td><td>${r.utenfor}${r.utenfor ? ' ⚠' : ''}</td>`
          + `<td>${tegn(r.maksSide)}</td><td>${tegn(r.maksHoyde)}</td></tr>`).join('')
        + '</tbody></table>'
        + (a.verste.length ? '<table class="avvikliste"><caption>De største avvikene</caption><thead><tr><th scope="col">Rør</th>'
          + '<th scope="col">Profil m</th><th scope="col">Plan m</th><th scope="col">Høyde m</th><th scope="col">Punkt</th></tr></thead><tbody>'
          + a.verste.map(p => `<tr${p.ok ? '' : ' class="utenfor"'}><td class="tekst"><button class="minilenke" data-linje="${escapeAttr(p.linje)}">`
            + `${nr.get(p.linje)} ${escapeHtml(p.planKode)}</button></td><td>${t(p.stasjon, 1)}</td>`
            + `<td>${tegn(p.side)}${p.utenforPlan ? ' ⚠' : ''}</td><td>${tegn(p.hoyde)}${p.utenforHoyde ? ' ⚠' : ''}</td>`
            + `<td class="tekst">${escapeHtml(p.navn)} · ${escapeHtml(p.punkt)}</td></tr>`).join('')
          + '</tbody></table>' : '');
    }
    return hode
      // steget går opp i minstegrensen – med 0,01 var standarden 0,10 et ugyldig tall for feltet
      + felt('planAvvikPlan', 'Toleranse i plan', av.plan, 'm', 0.005, 0.005, 2)
      + felt('planAvvikSelvfall', 'Toleranse i høyde – selvfall', av.selvfall, 'm', 0.005, 0.005, 2)
      + felt('planAvvikTrykk', 'Toleranse i høyde – trykk', av.trykk, 'm', 0.005, 0.005, 2)
      + felt('planAvvikSok', 'Søkebredde – så langt fra røret kan et innmålt punkt ligge', av.sok, 'm', 0.1, 0.1, 10)
      + innhold;
  },

  /**
   * Knappene og feltene i fanen. Hver endring går gjennom `merk`, så den kan
   * angres.
   *
   * PLANEN SLÅS OPP NÅR NOE GJØRES, IKKE NÅR FANEN TEGNES. Et angre bytter ut
   * prosjektet, og Ctrl+Z virker også mens en dialog står oppe: «Lagre» i
   * «Nytt rør» skrev da røret inn i prosjektet som var angret bort, og det
   * ble aldri lagt til.
   */
  koble(e) {
    const app = this.app, P = () => this.plan(), mp = () => app.P.mal.plan;
    const ferdig = () => { app.tegnAlt(); app.planlegg(30); };
    const rorAv = id => P().ror.find(x => x.id === id);
    for (const b of e.querySelectorAll('[data-linje]')) b.onclick = () => RorUI.velgLinje(b.dataset.linje);
    for (const b of e.querySelectorAll('[data-plannytt]')) {
      b.onclick = () => this.rorDialog({ tittel: 'Nytt rør i traseen', flere: true, notis: '', rader: [{ kode: this._sistKode || '', side: 0, regel: '' }],
        lagre: rader => {
          const plan = P();
          if (!plan.traseer.some(t => t.id === b.dataset.plannytt)) { app.status('Traseen finnes ikke lenger'); return; }
          app.merk('nytt rør');
          app.P.ror.koder = Ror.koderFra(rader.map(x => ({ kode: x.kode })), app.P.ror.koder);
          const brukt = RorPlan.alleIder(plan, app.P.ror.groft);
          for (const x of rader) {
            const id = RorPlan.nyId(brukt, 'r');
            brukt.add(id);
            plan.ror.push({ id, trase: b.dataset.plannytt, kode: x.kode, side: x.side || 0, regel: x.regel, motsatt: false });
          }
          this._sistKode = rader[rader.length - 1].kode;
          ferdig();
        } });
    }
    for (const b of e.querySelectorAll('[data-planendre]')) {
      b.onclick = () => {
        const x = rorAv(b.dataset.planendre);
        if (!x) return;
        this.rorDialog({ tittel: 'Endre rør', flere: false, notis: '', rader: [{ kode: x.kode, side: x.side, regel: x.regel || '' }],
          lagre: ([ny]) => {
            const naa = rorAv(b.dataset.planendre);
            if (!naa) { app.status('Røret finnes ikke lenger'); return; }
            app.merk('endret rør');
            app.P.ror.koder = Ror.koderFra([{ kode: ny.kode }], app.P.ror.koder);
            Object.assign(naa, { kode: ny.kode, side: ny.side || 0, regel: ny.regel });
            ferdig();
          } });
      };
    }
    for (const b of e.querySelectorAll('[data-plansnu]')) {
      b.onclick = () => { const x = rorAv(b.dataset.plansnu); if (!x) return; app.merk('snudde røret'); x.motsatt = !x.motsatt; ferdig(); };
    }
    for (const b of e.querySelectorAll('[data-planlegg]')) b.onclick = () => this.leggHoyder(b.dataset.planlegg);
    for (const b of e.querySelectorAll('[data-planslett]')) {
      b.onclick = () => {
        const id = b.dataset.planslett, plan = P();
        app.merk('slettet rør');
        plan.ror = plan.ror.filter(x => x.id !== id);
        plan.kummer = plan.kummer.filter(k => k.ror !== id);
        plan.laast = plan.laast.filter(l => l.ror !== id);
        app.status('Røret er slettet – med kummene og de låste høydene på det');
        ferdig();
      };
    }
    for (const b of e.querySelectorAll('[data-plantraseslett]')) {
      b.onclick = async () => {
        const tid = b.dataset.plantraseslett, antall = P().ror.filter(x => x.trase === tid).length;
        if (antall && !await app.bekreft(`Slette traseen med ${antall} rør? Du kan angre etterpå.`, 'Slett traseen')) return;
        const plan = P(), ror = new Set(plan.ror.filter(x => x.trase === tid).map(x => x.id));
        app.merk('slettet trase');
        plan.traseer = plan.traseer.filter(x => x.id !== tid);
        plan.ror = plan.ror.filter(x => x.trase !== tid);
        plan.kummer = plan.kummer.filter(k => !ror.has(k.ror));
        plan.laast = plan.laast.filter(l => !ror.has(l.ror));
        plan.greiner = plan.greiner.filter(g => g.trase !== tid && g.til.trase !== tid);
        ferdig();
      };
    }
    for (const inp of e.querySelectorAll('[data-kumdiameter]')) {
      inp.onchange = () => {
        const k = P().kummer.find(x => x.id === inp.dataset.kumdiameter), v = RorPlan.klem('diameter', inp.value);
        if (!k || v === null) { if (k) inp.value = k.diameter; return; }
        app.merk('endret kumdiameter');
        k.diameter = v;
        ferdig();
      };
    }
    for (const b of e.querySelectorAll('[data-kumslett]')) {
      b.onclick = () => { const plan = P(); app.merk('slettet kum'); plan.kummer = plan.kummer.filter(k => k.id !== b.dataset.kumslett); ferdig(); };
    }
    // et ugyldig tall settes tilbake i feltet selv – fanen tegnes ikke på nytt av det
    const tall = (id, felt, les, sett) => {
      const inp = e.querySelector('#' + id);
      if (!inp) return;
      inp.onchange = () => {
        const v = RorPlan.klem(felt, inp.value);
        if (v === null) { inp.value = les(); app.status('Ugyldig tall – feltet er satt tilbake'); return; }
        app.merk('endret innstilling for planlagte rør');
        sett(v);
        ferdig();
      };
    };
    tall('planOverdekning', 'overdekning', () => mp().overdekning, v => { mp().overdekning = v; });
    tall('planKryss', 'kryssKlaring', () => mp().kryssKlaring, v => { mp().kryssKlaring = v; });
    tall('planKumDiameter', 'diameter', () => mp().kum.diameter, v => { mp().kum.diameter = v; });
    tall('planArbeidsrom', 'arbeidsrom', () => mp().kum.arbeidsrom, v => { mp().kum.arbeidsrom = v; });
    tall('planBrekk', 'brekk', () => mp().brekk, v => { mp().brekk = v; });
    tall('planTrykkFall', 'trykkMinFall', () => mp().trykkMinFall, v => { mp().trykkMinFall = v; });
    // avviket mot innmålt: knappen og toleransene – de lagres med anlegget og kan angres
    const avKnapp = e.querySelector('#planAvvik');
    if (avKnapp) {
      avKnapp.onclick = () => {
        const av = mp().avvik;
        app.merk(av.vis ? 'skjulte avviket mot innmålt' : 'viste avviket mot innmålt');
        av.vis = !av.vis;
        ferdig();
      };
    }
    tall('planAvvikPlan', 'avvikPlan', () => mp().avvik.plan, v => { mp().avvik.plan = v; });
    tall('planAvvikSelvfall', 'avvikHoyde', () => mp().avvik.selvfall, v => { mp().avvik.selvfall = v; });
    tall('planAvvikTrykk', 'avvikHoyde', () => mp().avvik.trykk, v => { mp().avvik.trykk = v; });
    tall('planAvvikSok', 'sok', () => mp().avvik.sok, v => { mp().avvik.sok = v; });
  },

  /** Planfeltene per kode. Tomt felt = standarden, som står som plassholder. */
  kodeHtml(koder) {
    const navn = { gods: 'Gods mm', regel: 'Regel', overdekning: 'Overdekning m', minFall: 'Minste fall ‰', maksFall: 'Største fall ‰' };
    const mp = this.app.P.mal.plan;
    const rader = Object.entries(koder).filter(([, k]) => k.form === 'linje').map(([kode, k], i) => {
      const uten = f => Object.assign({}, k, { [f]: undefined });
      // et trykkrør har anleggets fallkrav for trykk som standard, ikke systemets
      const std = { gods: RorPlan.gods(uten('gods')), overdekning: RorPlan.overdekning(uten('overdekning'), mp),
        minFall: RorPlan.regel(null, k) === 'trykk' ? mp.trykkMinFall : RorPlan.minFall(uten('minFall')), maksFall: '' };
      const tall = f => `<td><label class="sr-only" for="pl${i}${f}">${navn[f]} for ${escapeHtml(kode)}</label>`
        + `<input id="pl${i}${f}" class="minitall" type="number" min="0" step="any" data-plan="${f}" `
        + `value="${Number.isFinite(k[f]) ? k[f] : ''}" placeholder="${std[f]}"></td>`;
      const reg = `<td><label class="sr-only" for="pl${i}regel">Regel for ${escapeHtml(kode)}</label>`
        + `<select id="pl${i}regel" class="minivalg" data-plan="regel">`
        + [['', `standard (${RorPlan.regel({}, uten('regel'))})`], ['selvfall', 'selvfall'], ['trykk', 'trykk']]
          .map(([v, tekst]) => `<option value="${v}"${(k.regel || '') === v ? ' selected' : ''}>${tekst}</option>`).join('')
        + '</select></td>';
      return `<tr data-kode="${escapeAttr(kode)}"><th scope="row">${escapeHtml(kode)}</th>${tall('gods')}${reg}`
        + `${tall('overdekning')}${tall('minFall')}${tall('maksFall')}</tr>`;
    }).join('');
    return '<h3>Planlagte rør per kode</h3><p class="notis">Tomt felt = standarden, som står som plassholder.</p>'
      + '<div class="tabellrull"><table class="rorkoder plankoder"><thead><tr><th scope="col">Kode</th>'
      + ['gods', 'regel', 'overdekning', 'minFall', 'maksFall'].map(f => `<th scope="col">${navn[f]}</th>`).join('')
      + `</tr></thead><tbody>${rader}</tbody></table></div>`;
  },

  /** Et planfelt i kodetabellen er endret. */
  endreKode(input) {
    const app = this.app, kode = input.closest('tr').dataset.kode, f = input.dataset.plan;
    const k = app.P.ror.koder[kode];
    if (!k) return;
    app.merk('endret kode for planlagte rør');
    if (f === 'regel') {
      if (input.value === 'selvfall' || input.value === 'trykk') k.regel = input.value; else delete k.regel;
    } else {
      const v = RorPlan.klem(f, input.value);
      if (v === null) delete k[f]; else k[f] = v;
    }
    app.tegnAlt();
    app.planlegg(30);
  },

  /* ---------------- høydene i profilen ---------------- */

  /**
   * Punktfeltet for et punkt på et tegnet rør: bunn innvendig, lås og lås opp,
   * for selvfall fallet videre, og «Hent på nytt» for en påkobling.
   *
   * `valg` = { s, bunn } for et punkt som nettopp er satt inn fra profilen:
   * beregningen med det er ikke ferdig, så høyden og stasjonen er det røret
   * har der det ble klikket.
   */
  punktfelt(rorId, punkt, valg = {}) {
    const app = this.app, plan = this.plan(), res = app.resultat;
    const ror = plan.ror.find(x => x.id === rorId);
    if (!ror) return;
    const k = RorPlan.kodeAv(app.P.ror.koder, ror.kode);
    const L = plan.laast.find(x => x.ror === rorId && x.punkt === punkt);
    const kum = plan.kummer.find(x => x.ror === rorId && x.punkt === punkt);
    const c = res && res.kontroll ? res.kontroll.find(x => x.ror === rorId && x.punkt === punkt) : null;
    const l = res && res.linjer.find(x => x.id === rorId);
    const lp = l && l.punkter.find(p => p.id === rorId + ':' + punkt);
    const bunnNa = L ? L.bunn : c ? c.bunn : lp ? RorPlan.bunnFraTopp(lp.z, k)
      : Number.isFinite(valg.bunn) ? valg.bunn : NaN;
    const selvfall = RorPlan.regel(ror, k) === 'selvfall';
    const boks = document.getElementById('dialog'), innhold = document.getElementById('dialoginnhold');
    document.getElementById('dialogtittel').textContent = `${ror.kode} · ${kum ? 'kum ' + kum.id : 'punkt ' + punkt}`;
    const kb = L && L.kilde ? this._kildeBunn(L) : null;
    const tilstand = !L ? 'Fri – følger overdekningen under terrenget.'
      : !L.kilde ? 'Låst.'
        : kb == null ? 'Låst – koblet på et innmålt rør som ikke finnes lenger.'
          : Math.abs(L.bunn - kb) <= 0.0005 ? 'Låst – hentet fra et innmålt rør.'
            : `Låst – koblet på et innmålt rør, men høyden er satt for hånd (røret har ${Rapport.tall(kb, 3)}). `
              + '«Hent på nytt» tar den fra røret igjen.';
    innhold.innerHTML = `<p class="notis">${escapeHtml(tilstand)}</p>`
      + `<div class="rorinnstilling"><label for="ppBunn">Bunn innvendig</label><input id="ppBunn" class="minitall" type="number" step="0.01" `
      + `value="${Number.isFinite(bunnNa) ? bunnNa.toFixed(3) : ''}"> moh</div>`
      + (selvfall ? '<div class="rorinnstilling"><label for="ppFall">Fall videre i fallretningen</label>'
        + '<input id="ppFall" class="minitall" type="number" step="0.5" min="0"> ‰ <button class="knapp" id="ppFallKnapp">Sett</button></div>' : '')
      + '<div class="knapperad" style="justify-content:flex-end">'
      + (L && L.kilde ? '<button class="knapp" id="ppHent">Hent på nytt</button>' : '')
      + (L ? '<button class="knapp" id="ppLaasOpp">Lås opp</button>' : '')
      + '<button class="knapp" id="ppAvbryt">Avbryt</button><button class="knapp primaer" id="ppLaas">Lås</button></div>';
    const lukk = () => boks.classList.add('skjult');
    const tall = id => parseFloat(String(innhold.querySelector('#' + id).value).replace(',', '.'));
    innhold.querySelector('#ppAvbryt').onclick = lukk;
    innhold.querySelector('#ppLaas').onclick = () => {
      const v = tall('ppBunn');
      if (!Number.isFinite(v)) { app.status('Skriv bunn innvendig i meter over havet'); return; }
      lukk(); this.laas(rorId, punkt, v);
    };
    if (L) innhold.querySelector('#ppLaasOpp').onclick = () => { lukk(); this.laasOpp(rorId, punkt); };
    if (L && L.kilde) innhold.querySelector('#ppHent').onclick = () => { lukk(); this.hentPaNytt(rorId, punkt); };
    if (selvfall) {
      innhold.querySelector('#ppFallKnapp').onclick = () => {
        const f = tall('ppFall');
        lukk();
        this.fallVidere(rorId, punkt, f, tall('ppBunn'), valg.s);
      };
    }
    boks.classList.remove('skjult');
  },

  /** Låser bunn innvendig i et punkt – i klikk, dragning og «fall videre». */
  laas(rorId, punkt, bunn) {
    const app = this.app;
    app.merk('låste høyde');
    this._settLaast(rorId, punkt, bunn);
    // låst på nytt til det samme: ingen tom angrepost (se App.slippMerke)
    app.slippMerke();
    app.tegnAlt();
    app.planlegg(30);
    app.status(`Bunn innvendig låst på ${Rapport.tall(bunn, 2)}`);
  },

  /**
   * EN PÅKOBLING ER EN KOBLING OGSÅ NÅR HØYDEN LÅSES PÅ NYTT. Kilden står: den
   * sier hvor røret er koblet på, og det er den som gjør møtet med det
   * innmålte røret til en kobling og ikke et kryss – og som gir «Hent på
   * nytt». Her ble den skrevet over, og «Lås» uten å endre noe ga «treffer»
   * i merknadene. Høyden er brukerens til den hentes på nytt.
   */
  _settLaast(rorId, punkt, bunn, lagt) {
    const plan = this.plan(), i = plan.laast.findIndex(x => x.ror === rorId && x.punkt === punkt);
    const ny = { ror: rorId, punkt, bunn: Math.round(bunn * 1000) / 1000 };
    if (i >= 0 && plan.laast[i].kilde) ny.kilde = plan.laast[i].kilde;
    // lagt av knappen – låst for hånd mister merket og står fast
    else if (lagt) ny.lagt = true;
    if (i >= 0) plan.laast[i] = ny; else plan.laast.push(ny);
  },

  /**
   * «⤓ Legg høydene» for et selvfallsrør: de frie kontrollpunktene – kummene
   * og endene som ikke er låst eller koblet – får høydene som gir minst
   * graving, med overdekningen og fallet innenfor kravene (`RorPlan.leggHoyderFor`).
   * De låses merket `lagt`, så et nytt trykk legger dem på nytt; det
   * brukeren har låst selv, står. Ett angresteg. Går det ikke, endres ingenting.
   */
  leggHoyder(rorId) {
    const app = this.app, res = app.resultat;
    if (!res || !res.plan || !res.bygg || !res.bygg.linjer.some(l => l.id === rorId)) {
      app.status('Høydene er ikke regnet ennå – prøv igjen om et øyeblikk');
      return false;
    }
    const svar = RorPlan.leggHoyderFor({ bygg: res.bygg, ror: rorId, koder: app.P.ror.koder,
      terrengZ: (x, y) => (app.terreng ? app.terreng.z(x, y) : NaN) });
    if (svar.feil) {
      const t = v => Rapport.tall(v, 0);
      app.status('Høydene ble ikke lagt: ' + svar.feil
        + (Number.isFinite(svar.fra) && svar.til > svar.fra ? ` mellom ${t(svar.fra)} og ${t(svar.til)} m` : '')
        + (svar.feil === 'ingen profil oppfyller kravene' ? ' – låste høyder eller fallet gjør det umulig innen 6 m dybde' : ''));
      return false;
    }
    if (!svar.laast.length) { app.status('Alle kontrollpunktene på røret er låst eller koblet – ingenting å legge'); return false; }
    app.merk('la høydene');
    for (const x of svar.laast) this._settLaast(rorId, x.punkt, x.bunn, true);
    // lagt på nytt til det samme: ingen tom angrepost
    app.slippMerke();
    app.tegnAlt();
    app.planlegg(30);
    app.status(`Høydene er lagt i ${svar.laast.length} kontrollpunkt – minst graving med overdekningen og fallet innenfor kravene`);
    return true;
  },

  /** Bunn innvendig i det innmålte punktet en påkobling henter fra – eller null om det er borte. */
  _kildeBunn(L) {
    const a = this.app.P.anlegg.find(x => x.id === L.kilde.anlegg);
    const p = a && a.ror && !a.ror.plan ? a.ror.punkter.find(x => x.id === L.kilde.punkt) : null;
    return p ? Math.round(RorPlan.bunnFraTopp(L.kilde.topp, RorPlan.kodeAv(a.ror.koder, p.kode)) * 1000) / 1000 : null;
  },

  laasOpp(rorId, punkt) {
    const app = this.app, plan = this.plan();
    app.merk('låste opp høyde');
    plan.laast = plan.laast.filter(x => !(x.ror === rorId && x.punkt === punkt));
    app.tegnAlt();
    app.planlegg(30);
    app.status('Høyden følger overdekningen igjen');
  },

  /**
   * Fall videre: låser dette punktet der det står, og neste kontrollpunkt i
   * fallretningen så fallet mellom dem blir det som er skrevet.
   *
   * ER NESTE EN PÅKOBLING, FLYTTES DEN IKKE. Høyden der er det innmålte
   * røret sin, og skrevet over ville det nye røret ikke lenger møtt det.
   * Da settes i stedet dette punktet, så fallet ned til påkoblingen blir det
   * som er skrevet – høydeføring bakover fra det som ligger fast.
   *
   * Punktet trenger ikke være et kontrollpunkt: et fritt knekkpunkt – eller
   * et som nettopp er satt inn fra profilen (`sKjent`) – finnes etter
   * stasjonen, og neste kontrollpunkt er det første forbi det i fallretningen.
   */
  fallVidere(rorId, punkt, fall, bunnHer, sKjent) {
    const app = this.app, res = app.resultat, plan = this.plan(), ror = plan.ror.find(x => x.id === rorId);
    if (!Number.isFinite(fall)) { app.status('Skriv fallet i promille'); return; }
    if (!ror) return;
    const ktr = (res && res.kontroll ? res.kontroll : []).filter(c => c.ror === rorId).sort((a, b) => a.s - b.s);
    const j = ktr.findIndex(c => c.punkt === punkt);
    let sHer = j >= 0 ? ktr[j].s : null;
    if (sHer == null) {
      const l = res && res.linjer.find(x => x.id === rorId);
      const i = l ? l.punkter.findIndex(p => p.id === rorId + ':' + punkt) : -1;
      sHer = i >= 0 ? RorPlan.stasjonering(l.xy)[i] : Number.isFinite(sKjent) ? sKjent : null;
    }
    if (sHer == null) { app.status('Punktet er ikke regnet ennå – prøv igjen om et øyeblikk'); return; }
    const neste = ror.motsatt ? ktr.filter(c => c.s < sHer - 0.01).pop() : ktr.find(c => c.s > sHer + 0.01);
    if (!neste) { app.status('Ingen kontrollpunkt videre i fallretningen – sett en kum eller lås en høyde der først'); return; }
    const L = Math.abs(neste.s - sHer);
    const fast = plan.laast.find(x => x.ror === rorId && x.punkt === neste.punkt && x.kilde);
    if (fast) {
      const herFraFast = fast.bunn + fall / 1000 * L;
      app.merk('satte fall');
      this._settLaast(rorId, punkt, herFraFast);
      app.tegnAlt();
      app.planlegg(30);
      app.status(`Neste kontrollpunkt er en påkobling, og den flyttes ikke – bunnløpet her er låst på `
        + `${Rapport.tall(herFraFast, 2)}, så fallet ned dit blir ${Rapport.tall(fall, 1)} ‰`);
      return;
    }
    const her = Number.isFinite(bunnHer) ? bunnHer : j >= 0 ? ktr[j].bunn : NaN;
    if (!Number.isFinite(her)) { app.status('Skriv bunn innvendig i punktet først'); return; }
    const bunnNeste = her - fall / 1000 * L;
    app.merk('satte fall');
    this._settLaast(rorId, punkt, her);
    this._settLaast(rorId, neste.punkt, bunnNeste);
    app.tegnAlt();
    app.planlegg(30);
    app.status(`Fall ${Rapport.tall(fall, 1)} ‰ – bunnløpet i neste kontrollpunkt er låst på ${Rapport.tall(bunnNeste, 2)}`);
  },

  /** Henter høyden i en påkobling på nytt fra det innmålte røret. */
  hentPaNytt(rorId, punkt) {
    const app = this.app, plan = this.plan();
    const L = plan.laast.find(x => x.ror === rorId && x.punkt === punkt);
    if (!L || !L.kilde) return;
    const a = app.P.anlegg.find(x => x.id === L.kilde.anlegg);
    const p = a && a.ror && !a.ror.plan ? a.ror.punkter.find(x => x.id === L.kilde.punkt) : null;
    if (!p) { app.status('Punktet røret er koblet på, finnes ikke lenger'); return; }
    app.merk('hentet påkoblingen på nytt');
    L.bunn = Math.round(RorPlan.bunnFraTopp(p.z, RorPlan.kodeAv(a.ror.koder, p.kode)) * 1000) / 1000;
    L.kilde.topp = p.z;
    app.tegnAlt();
    app.planlegg(30);
    app.status(`Påkoblingen er hentet på nytt: bunn innvendig ${Rapport.tall(L.bunn, 2)}`);
  },

  /** Setter inn et tracepunkt der røret er i profilen – på stasjon s langs røret. */
  settInnVed(rorId, s) {
    const app = this.app, res = app.resultat, ror = this.plan().ror.find(x => x.id === rorId);
    const l = res && res.linjer.find(x => x.id === rorId);
    if (!ror || !l) return null;
    const st = RorPlan.stasjonering(l.xy);
    let i = 1;
    while (i < st.length - 1 && st[i] < s) i++;
    const a = l.xy[i - 1], b = l.xy[i], len = st[i] - st[i - 1], u = len > 0 ? (s - st[i - 1]) / len : 0;
    const g = Geo.fraUtm(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, res.sone);
    return this.settInnPaaTrase(ror.trase, L.latLng(g.lat, g.lon));
  }
};

if (typeof module !== 'undefined') module.exports = RorPlanUI;
