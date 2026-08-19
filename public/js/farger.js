'use strict';
/**
 * Fargene som brukes nar profilene tegnes pa lerret.
 *
 * De hentes fra CSS-variablene, slik at stilarket er eneste sted en farge
 * defineres. Uten dette ville tegnefargene levd sitt eget liv i JavaScript
 * og drevet fra hverandre neste gang noen justerte designet.
 */

const Farger = {
  _bufret: {},

  hent(navn) {
    if (this._bufret[navn]) return this._bufret[navn];
    const v = getComputedStyle(document.documentElement).getPropertyValue('--' + navn).trim();
    this._bufret[navn] = v || '#888';
    return this._bufret[navn];
  },

  /** Kalles dersom temaet endres, sa fargene hentes pa nytt. */
  glem() { this._bufret = {}; },

  get terreng() { return this.hent('data-terreng'); },
  get rensk() { return this.hent('data-rensk'); },
  get veg() { return this.hent('data-veg'); },
  get planum() { return this.hent('data-planum'); },
  get skjaering() { return this.hent('data-skjaering'); },
  get skjaeringFlate() { return this.hent('data-skjaering-flate'); },
  get fylling() { return this.hent('data-fylling'); },
  get fyllingFlate() { return this.hent('data-fylling-flate'); },
  get fjell() { return this.hent('data-fjell'); },
  get baerelag() { return this.hent('data-baerelag'); },
  get slitelag() { return this.hent('data-slitelag'); },
  get rutenett() { return this.hent('data-rutenett'); },
  get akse() { return this.hent('data-akse'); },
  get flate() { return this.hent('flate'); },
  get blekk() { return this.hent('blekk'); },
  get blekkSvak() { return this.hent('blekk-svak'); },

  /**
   * Skravur for fjell i skjæringen.
   *
   * Fjellet er en del av skjæringen, ikke noe ved siden av. Derfor blir det
   * lagt som skravur oppa skjæringsfargen i stedet for a fa en egen farge -
   * da slipper vi en fjerde kulør, og det leses med en gang som "denne
   * delen av det samme".
   */
  fjellskravur(ctx) {
    if (this._skravur) return this._skravur;
    const s = 8;
    const l = document.createElement('canvas');
    l.width = s; l.height = s;
    const k = l.getContext('2d');
    k.strokeStyle = this.fjell;
    k.lineWidth = 1.6;
    k.beginPath();
    k.moveTo(-s, s); k.lineTo(s, -s);
    k.moveTo(0, 2 * s); k.lineTo(2 * s, 0);
    k.stroke();
    this._skravur = ctx.createPattern(l, 'repeat');
    return this._skravur;
  }
};
