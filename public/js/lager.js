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
  DB: 'massekalk',
  BUTIKK: 'prosjekter',

  async db() {
    if (this._db) return this._db;
    this._db = await new Promise((løs, avvis) => {
      const b = indexedDB.open(this.DB, 1);
      b.onupgradeneeded = () => {
        const d = b.result;
        if (!d.objectStoreNames.contains(this.BUTIKK)) d.createObjectStore(this.BUTIKK, { keyPath: 'navn' });
      };
      b.onsuccess = () => løs(b.result);
      b.onerror = () => avvis(b.error);
    });
    return this._db;
  },

  async _kjør(modus, arbeid) {
    const db = await this.db();
    return new Promise((løs, avvis) => {
      const t = db.transaction(this.BUTIKK, modus);
      const s = t.objectStore(this.BUTIKK);
      let svar;
      try { svar = arbeid(s); } catch (e) { return avvis(e); }
      t.oncomplete = () => løs(svar && svar.result !== undefined ? svar.result : svar);
      t.onerror = () => avvis(t.error);
    });
  },

  async liste() {
    const rader = await this._kjør('readonly', s => s.getAll());
    return (rader || [])
      .map(r => ({ navn: r.navn, endret: r.endret, storrelse: JSON.stringify(r.data || {}).length }))
      .sort((a, b) => String(b.endret).localeCompare(String(a.endret)));
  },

  async hent(navn) {
    const rad = await this._kjør('readonly', s => s.get(navn));
    return rad ? rad.data : null;
  },

  async lagre(navn, data) {
    const rad = { navn, endret: new Date().toISOString(), data };
    await this._kjør('readwrite', s => s.put(rad));
    return rad;
  },

  async slett(navn) {
    await this._kjør('readwrite', s => s.delete(navn));
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
