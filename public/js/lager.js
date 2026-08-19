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

  async liste() {
    let rader;
    try { rader = await this._kjør('readonly', s => s.getAll()); }
    catch (e) { rader = this._reserveRader(); }
    return (rader || [])
      .map(r => ({ navn: r.navn, endret: r.endret, storrelse: JSON.stringify(r.data || {}).length }))
      .sort((a, b) => String(b.endret).localeCompare(String(a.endret)));
  },

  async hent(navn) {
    try {
      const rad = await this._kjør('readonly', s => s.get(navn));
      return rad ? rad.data : null;
    } catch (e) {
      // en ødelagt oppføring skal gi null, ikke kaste videre og stoppe apningen
      try {
        const rå = localStorage.getItem(this.NOKKEL + navn);
        return rå ? JSON.parse(rå).data : null;
      } catch (e2) { return null; }
    }
  },

  async lagre(navn, data) {
    const rad = { navn, endret: new Date().toISOString(), data };
    try { await this._kjør('readwrite', s => s.put(rad)); }
    catch (e) { localStorage.setItem(this.NOKKEL + navn, JSON.stringify(rad)); }
    return rad;
  },

  async slett(navn) {
    try { await this._kjør('readwrite', s => s.delete(navn)); }
    catch (e) { localStorage.removeItem(this.NOKKEL + navn); }
  },

  /** Legger inn demoprosjektet første gang programmet apnes. */
  async saFrø() {
    const nå = await this.liste();
    if (nå.length) return nå;
    try {
      const r = await fetch('demo/ydestad-demo.json');
      if (r.ok) {
        const p = await r.json();
        await this.lagre(p.navn || 'Ydestad demo', p);
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
      if (!p || !Array.isArray(p.ip)) continue;
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
