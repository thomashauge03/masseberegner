'use strict';
/**
 * Prosjektlager.
 *
 * Prosjektene ligger i nettleseren sin egen database (IndexedDB), sa
 * programmet virker likt enten det kjøres lokalt eller pa Vercel, og ogsa
 * uten nett nar terrengflisene først er hentet.
 *
 * Fordi lageret hører til nettleseren pa den enkelte maskinen, ligger
 * import og eksport av prosjektfiler tett pa: en fil kan sendes videre til
 * en kollega, legges i prosjektmappen eller tas vare pa som sikkerhetskopi.
 */

const Lager = {
  _db: null,
  _reserve: false,          // sant nar vi ma bruke localStorage i stedet
  DB: 'massekalk',
  BUTIKK: 'prosjekter',
  NOKKEL: 'massekalk:prosjekt:',
  TIDSGRENSE: 8000,

  /**
   * Apner databasen. Blir den blokkert - for eksempel av et annet vindu
   * som star midt i en oppgradering - eller er IndexedDB slatt av, gar vi
   * over til localStorage i stedet for a bli hengende.
   */
  async db() {
    if (this._db) return this._db;
    if (this._reserve) throw new Error('reservelager');
    try {
      this._db = await new Promise((løs, avvis) => {
        if (typeof indexedDB === 'undefined') return avvis(new Error('IndexedDB er ikke tilgjengelig'));
        const b = indexedDB.open(this.DB, 1);
        const klokke = setTimeout(() => avvis(new Error('Databasen svarte ikke')), this.TIDSGRENSE);
        const ferdig = f => (...a) => { clearTimeout(klokke); f(...a); };
        b.onupgradeneeded = () => {
          const d = b.result;
          if (!d.objectStoreNames.contains(this.BUTIKK)) d.createObjectStore(this.BUTIKK, { keyPath: 'navn' });
        };
        b.onsuccess = ferdig(() => løs(b.result));
        b.onerror = ferdig(() => avvis(b.error || new Error('Kunne ikke åpne databasen')));
        b.onblocked = ferdig(() => avvis(new Error('Databasen er låst av et annet vindu')));
      });
      return this._db;
    } catch (e) {
      console.warn('Bruker localStorage til prosjektene:', e.message);
      this._reserve = true;
      throw e;
    }
  },

  async _kjør(modus, arbeid) {
    const db = await this.db();
    return new Promise((løs, avvis) => {
      const t = db.transaction(this.BUTIKK, modus);
      const s = t.objectStore(this.BUTIKK);
      let svar;
      try { svar = arbeid(s); } catch (e) { return avvis(e); }
      const klokke = setTimeout(() => avvis(new Error('Databasen svarte ikke')), this.TIDSGRENSE);
      t.oncomplete = () => { clearTimeout(klokke); løs(svar && svar.result !== undefined ? svar.result : svar); };
      t.onerror = () => { clearTimeout(klokke); avvis(t.error); };
      t.onabort = () => { clearTimeout(klokke); avvis(t.error || new Error('Avbrutt')); };
    });
  },

  /* ---------------- reservelager i localStorage ---------------- */

  _reserveRader() {
    const ut = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k.startsWith(this.NOKKEL)) continue;
      try { ut.push(JSON.parse(localStorage.getItem(k))); } catch (e) { /* hopp over */ }
    }
    return ut;
  },

  /* ---------------- felles grensesnitt ---------------- */

  /**
   * Alle prosjekter, fra begge lagrene.
   *
   * Reservelageret ma leses hver gang, ikke bare nar databasen svarer med
   * feil. En skriving kan slaa feil - full kvote er det vanligste - selv om
   * lesing gaar fint. Da havnet prosjektet i localStorage, mens listen ble
   * hentet fra databasen som svarte pent at der var det ingenting. Brukeren
   * fikk «Lagret», og prosjektet kom aldri fram igjen.
   */
  async liste() {
    let rader = null, dbSvarte = false;
    try { rader = await this._kjør('readonly', s => s.getAll()); dbSvarte = true; }
    catch (e) { rader = null; }

    const samlet = new Map();
    for (const r of (rader || [])) if (r && r.navn) samlet.set(r.navn, r);
    // det som ligger i reserven vinner bare nar det er nyere
    for (const r of this._reserveRader()) {
      if (!r || !r.navn) continue;
      const før = samlet.get(r.navn);
      if (!før || String(r.endret) > String(før.endret)) samlet.set(r.navn, r);
    }
    this._dbSvarte = dbSvarte;
    return [...samlet.values()]
      .map(r => ({ navn: r.navn, endret: r.endret, storrelse: JSON.stringify(r.data || {}).length }))
      .sort((a, b) => String(b.endret).localeCompare(String(a.endret)));
  },

  async hent(navn) {
    let fraDb = null;
    try {
      const rad = await this._kjør('readonly', s => s.get(navn));
      fraDb = rad || null;
    } catch (e) { /* reserven under kan ha det */ }

    let fraReserve = null;
    try {
      const rå = localStorage.getItem(this.NOKKEL + navn);
      if (rå) fraReserve = JSON.parse(rå);
    } catch (e) { /* ødelagt oppføring skal gi null, ikke kaste */ }

    if (fraDb && fraReserve) {
      // begge har den: den nyeste gjelder
      return String(fraReserve.endret) > String(fraDb.endret) ? fraReserve.data : fraDb.data;
    }
    if (fraDb) return fraDb.data;
    return fraReserve ? fraReserve.data : null;
  },

  /**
   * @returns {Promise<{navn,endret,data,reserve:boolean}>} reserve er sant nar
   *   det bare ble lagret i localStorage, sa den som kaller kan si fra.
   */
  async lagre(navn, data) {
    const rad = { navn, endret: new Date().toISOString(), data };
    try {
      await this._kjør('readwrite', s => s.put(rad));
      /* Kom prosjektet i databasen, skal ikke en gammel reservekopi bli
         liggende og seire pa dato senere. */
      try { localStorage.removeItem(this.NOKKEL + navn); } catch (e) { /* ingen reserve */ }
      return rad;
    } catch (e) {
      try {
        localStorage.setItem(this.NOKKEL + navn, JSON.stringify(rad));
        return Object.assign({}, rad, { reserve: true });
      } catch (e2) {
        // begge lagrene sa nei - da ma den som kaller fa vite det
        throw new Error('Klarte ikke lagre: ' + (e2.message || e.message));
      }
    }
  },

  async slett(navn) {
    try { await this._kjør('readwrite', s => s.delete(navn)); }
    catch (e) { localStorage.removeItem(this.NOKKEL + navn); }
  },

  /**
   * Legger inn demoprosjektet første gang programmet apnes.
   *
   * «Ingen prosjekter» og «klarte ikke lese» er ikke det samme. Svarte
   * databasen med feil, ga listen null rader, og demoen ble skrevet inn - rett
   * over brukerens eget prosjekt om det tilfeldigvis het det samme. Derfor
   * saas det bare nar lageret svarte, og svarte at det var tomt.
   */
  async saFrø() {
    const nå = await this.liste();
    if (nå.length) return nå;
    if (!this._dbSvarte) return nå;             // vi vet ikke om det er tomt
    try {
      const r = await fetch('demo/ydestad-demo.json');
      if (r.ok) {
        const p = await r.json();
        const navn = p.navn || 'Ydestad demo';
        // en siste kontroll: ingenting skal overskrives av et demoprosjekt
        if (!await this.hent(navn)) await this.lagre(navn, p);
      }
    } catch (e) { /* uten demo gar det ogsa */ }
    return this.liste();
  },

  /* ---------------- filer ---------------- */

  lastNed(navn, innhold) {
    const blob = new Blob([innhold], { type: 'application/json;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = navn;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  },

  async eksporter(navn) {
    const data = await this.hent(navn);
    if (!data) return;
    this.lastNed(filnavn(navn) + '.massekalk.json', JSON.stringify(data, null, 1));
  },

  async eksporterAlle() {
    const liste = await this.liste();
    const alle = [];
    for (const p of liste) alle.push(await this.hent(p.navn));
    this.lastNed(
      'massekalk-alle-prosjekt-' + new Date().toISOString().slice(0, 10) + '.json',
      JSON.stringify({ massekalk: 1, eksportert: new Date().toISOString(), prosjekter: alle }, null, 1)
    );
    return alle.length;
  },

  /**
   * Leser inn en prosjektfil. Tar bade en enkelt fil og en samlefil.
   * Finnes navnet fra før, far det nye et løpenummer.
   */
  async importer(fil) {
    const tekst = await fil.text();
    const data = JSON.parse(tekst);
    const prosjekter = Array.isArray(data.prosjekter) ? data.prosjekter : [data];
    const lagt = [];
    for (const p of prosjekter) {
      /* Et prosjekt kan ha to former: den nye med `anlegg`, og den gamle med
         `ip` rett pa toppniva. Her sto det bare kravet om `ip`, og da ble hver
         eneste fil med en tomt i stille hoppet over - importen svarte at null
         prosjekter ble lagt inn, uten a si hvorfor. */
      const gyldig = p && (Array.isArray(p.anlegg) ? p.anlegg.length > 0 : Array.isArray(p.ip));
      if (!gyldig) continue;
      let navn = (p.navn || 'Uten navn').trim();
      let n = 2;
      while (await this.hent(navn)) navn = `${p.navn || 'Uten navn'} (${n++})`;
      p.navn = navn;
      await this.lagre(navn, p);
      lagt.push(navn);
    }
    return lagt;
  }
};

function filnavn(s) {
  return String(s).replace(/[^\wæøåÆØÅ -]/g, '_').replace(/\s+/g, '_').slice(0, 80) || 'prosjekt';
}
/* Ett filnavn, ett sted. Eksporten hadde sin egen `replace(/\W+/g, '_')`, og
   `\w` er ASCII-only uansett flagg: «Ydestad Sør» ble til «Ydestad_S_r». */
Lager.filnavn = filnavn;
