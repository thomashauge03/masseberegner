/**
 * Klienten mot Makin 3D, via vår egen proxy (/api/makin, se api/makin.js).
 *
 * Ren logikk uten skjerm: fetch, lager og vent sprøytes inn, så prøvene i
 * test/makinprove.js kjører den uten nett og uten å vente.
 *
 * NØKKELEN. Brukerens Makin-nøkkel ligger bare i lageret (localStorage,
 * «massekalk.makin» som {v:1, nokkel}) og i Authorization-hodet på kall til
 * /api/makin. Den skal aldri inn i anlegget, angre-historikken, eksporter,
 * logger eller feilmeldinger: meldingene under bygges av status og faste
 * tekster, aldri av det proxyen svarer.
 *
 * FEIL. Alt som går galt kastes som MakinFeil med en `art` som kallestedet kan
 * velge tekst og knapp etter:
 *   'nokkel'   mangler eller avvist nøkkel (401, eller ingen lagret)
 *   'nett'     fetch kastet: ingen kontakt
 *   'makin'    Makin eller proxyen svarte feil (5xx, 502, 504), ga noe vi ikke
 *              forsto, eller proxyen kalte 400 (ugyldig kall – en feil hos oss,
 *              ikke hos brukeren; ingen egen art, for kallestedet kan uansett
 *              bare si «noe gikk galt med Makin» og prøve igjen)
 *   'for stor' svaret var over det en funksjon får sende (413)
 *   'venter'   Makin ble ikke ferdig med fila innen tiden
 */
const Makin = (() => {
  const LAGER_NOKKEL = 'massekalk.makin';
  const API = '/api/makin';
  const VENTE_MS = 2000;
  const MAKS_FORSOK = 20;
  const DOGN_MS = 86400000;
  const LUFT_MS = 1000;

  class MakinFeil extends Error {
    constructor(melding, art) {
      super(melding);
      this.name = 'MakinFeil';
      this.art = art;
    }
  }

  /** Ror.dekod: i nettleseren er Ror global (ror.js lastes først), i Node hentes den. */
  function rorDekod(bytes) {
    const R = typeof Ror !== 'undefined' ? Ror : require('./ror.js');
    return R.dekod(bytes);
  }

  /** base64 → bytes. atob i nettleseren, Buffer som reserve i Node. */
  function base64TilBytes(b64) {
    if (typeof atob === 'function') {
      const bin = atob(b64);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return u8;
    }
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }

  /** Meldingen til brukeren for en feilstatus. Aldri bygd av svarteksten. */
  function feilFraStatus(status) {
    if (status === 401) return new MakinFeil('Makin avviste nøkkelen. Legg inn nøkkelen på nytt.', 'nokkel');
    if (status === 413) return new MakinFeil('Svaret fra Makin ble for stort.', 'for stor');
    if (status === 400) return new MakinFeil('Makin-kallet var ugyldig. Dette er en feil i Massekalk, ikke hos deg.', 'makin');
    if (status === 504) return new MakinFeil('Makin svarte ikke i tide. Prøv igjen om litt.', 'makin');
    return new MakinFeil('Makin svarte med en feil (' + status + '). Prøv igjen om litt.', 'makin');
  }

  function lag({ fetch: hent, lager, vent, na } = {}) {
    const doFetch = hent || ((...a) => window.fetch(...a));
    const doVent = vent || (ms => new Promise(r => setTimeout(r, ms)));
    const naMs = na || (() => Date.now());
    /* localStorage kan selv kaste bare ved å bli lest (privat modus, blokkert): slås opp når det trengs. */
    const lagerNå = () => lager || localStorage;

    /** Nøkkelen fra lageret, eller null – også når lageret kaster eller innholdet er ødelagt. */
    function nokkel() {
      try {
        const raa = lagerNå()[LAGER_NOKKEL];
        if (!raa) return null;
        const j = JSON.parse(raa);
        if (!j || j.v !== 1 || typeof j.nokkel !== 'string' || !j.nokkel.trim()) return null;
        return j.nokkel;
      } catch (e) { return null; }
    }

    /** Lagrer nøkkelen (trimmet). Gir false om den er tom eller lageret er stengt. */
    function lagreNokkel(k) {
      try {
        const t = typeof k === 'string' ? k.trim() : '';
        if (!t) return false;
        lagerNå()[LAGER_NOKKEL] = JSON.stringify({ v: 1, nokkel: t });
        return true;
      } catch (e) { return false; }
    }

    function glemNokkel() {
      try { delete lagerNå()[LAGER_NOKKEL]; } catch (e) { /* stengt lager: ingenting å glemme */ }
    }

    /**
     * Ett kall mot proxyen. `param` er org/prosjekt/eksport, `kropp` gjør det til POST.
     * Gir `data` fra svaret (200), eller {status:'venter'} (202). Alt annet kastes.
     */
    async function kall(hva, param, kropp) {
      const k = nokkel();
      if (!k) throw new MakinFeil('Legg inn Makin-nøkkelen først.', 'nokkel');
      const q = new URLSearchParams({ hva });
      for (const [navn, verdi] of Object.entries(param || {})) if (verdi !== undefined && verdi !== null) q.set(navn, String(verdi));
      const valg = { method: 'GET', headers: { Authorization: 'Bearer ' + k }, cache: 'no-store' };
      if (kropp !== undefined) {
        valg.method = 'POST';
        valg.headers['Content-Type'] = 'application/json';
        valg.body = JSON.stringify(kropp);
      }

      let r;
      try { r = await doFetch(API + '?' + q.toString(), valg); }
      catch (e) { throw new MakinFeil('Fikk ikke kontakt med Makin. Sjekk nettet og prøv igjen.', 'nett'); }

      if (r.status === 202 || (r.status >= 200 && r.status <= 299)) {
        try { return await r.json(); }
        catch (e) { throw new MakinFeil('Makin ga et svar Massekalk ikke forsto.', 'makin'); }
      }
      throw feilFraStatus(r.status);
    }

    /**
     * Ber Makin lage én fil for [fra, til] og henter den. Ved «venter» ventes det
     * 2 s og prøves igjen, høyst MAKS_FORSOK ganger. Gir [{navn, tekst}].
     */
    async function hentDel(p, fra, til, si) {
      const kropp = { systemer: p.systemer, koder: p.koder };
      if (fra !== undefined) { kropp.fra = fra; kropp.til = til; }
      si('Ber Makin lage fila …');
      const { eksport } = await kall('start', { org: p.orgId, prosjekt: p.prosjektId }, kropp);

      for (let n = 1; n <= MAKS_FORSOK; n++) {
        si('Venter på Makin (' + n + ') …');
        const svar = await kall('hent', { org: p.orgId, prosjekt: p.prosjektId, eksport });
        if (svar && svar.status === 'klar') {
          if (!Array.isArray(svar.filer)) throw new MakinFeil('Makin ga en fil Massekalk ikke forsto.', 'makin');
          si('Henter …');
          try {
            return svar.filer.map(f => ({ navn: f.navn, tekst: rorDekod(base64TilBytes(f.base64)) }));
          } catch (e) {
            /* ugyldig base64 eller ei fil som ikke lar seg lese: aldri et rått unntak ut */
            throw new MakinFeil('Makin ga en fil Massekalk ikke forsto.', 'makin');
          }
        }
        if (!svar || svar.status !== 'venter') throw new MakinFeil('Makin ga et svar Massekalk ikke forsto.', 'makin');
        if (n < MAKS_FORSOK) await doVent(VENTE_MS);
      }
      throw new MakinFeil('Makin ble ikke ferdig med fila', 'venter');
    }

    /** Hele tidsrommet koder-lista dekker; ellers de siste 10 årene til nå. */
    async function tidsrom(p) {
      const koder = await kall('koder', { org: p.orgId, prosjekt: p.prosjektId });
      let minst = Infinity, mest = -Infinity;
      for (const c of Array.isArray(koder) ? koder : []) {
        if (p.koder && !p.koder.includes(c && c.codeName)) continue;
        const a = Date.parse(c && c.firstLogged), b = Date.parse(c && c.lastLogged);
        if (!isNaN(a) && a < minst) minst = a;
        if (!isNaN(b) && b > mest) mest = b;
      }
      /* Litt luft i begge ender: er Makins fra/til utelukkende eller avrundet,
         ville punktene ytterst ellers falt stille bort i en halv henting. */
      if (minst <= mest) return [minst - LUFT_MS, mest + LUFT_MS];
      const til = naMs();
      const fra = new Date(til);
      fra.setUTCFullYear(fra.getUTCFullYear() - 10);
      return [fra.getTime() - LUFT_MS, til + LUFT_MS];
    }

    /**
     * Rørene i anlegget fra Makin, som tekst per fil:
     *   { orgId, prosjektId, systemer: uuid[]|null, koder: string[]|null }
     * Gir { filer: [{navn, tekst}] }. Enten får man alt eller en feil – aldri en halv henting.
     *
     * Er svaret for stort (413) deles tidsrommet i to og halvdelene hentes hver for seg,
     * til hver del går, men aldri i deler smalere enn ett døgn. Delene har felles grense,
     * så ingenting faller mellom dem; et punkt nøyaktig på grensen kan komme i begge.
     */
    async function hentEksport({ orgId, prosjektId, systemer, koder }, framdrift) {
      const si = t => { if (typeof framdrift === 'function') framdrift(t); };
      const p = {
        orgId, prosjektId,
        /* proxyen avviser [] – «alle» er null */
        systemer: Array.isArray(systemer) && systemer.length ? systemer : null,
        koder: Array.isArray(koder) && koder.length ? koder : null
      };

      /* Her ville én eksport per maskin vært løkka (R1: foreløpig én eksport for
         alle maskiner). Hver fil ville da fått `idForan` = maskinnavnet. */

      async function del(fra, til) {
        const iso = ms => new Date(ms).toISOString();
        let filer;
        try {
          filer = await hentDel(p, fra === undefined ? undefined : iso(fra), fra === undefined ? undefined : iso(til), si);
        } catch (e) {
          if (!(e instanceof MakinFeil) || e.art !== 'for stor') throw e;
          if (fra === undefined) [fra, til] = await tidsrom(p);
          if (!(til - fra >= 2 * DOGN_MS)) {
            throw new MakinFeil('Fila fra Makin er for stor, også for ett døgn. Velg færre maskiner eller koder.', 'for stor');
          }
          si('Fila ble for stor – henter i to deler …');
          const midt = Math.floor((fra + til) / 2);
          return [...await del(fra, midt), ...await del(midt, til)];
        }
        return filer;
      }

      return { filer: await del(undefined, undefined) };
    }

    return { nokkel, lagreNokkel, glemNokkel, kall, hentEksport };
  }

  return { lag, MakinFeil };
})();

if (typeof module !== 'undefined') module.exports = Makin;
