import { describe, it, expect } from 'vitest';
import { rgbToLab, labToRgb, rgbToHex, hexToRgb } from '../colorSpaces.js';

function roundTripRgb(r:number,g:number,b:number){
  const [L,a,b2] = rgbToLab(r,g,b);
  const [rr,gg,bb] = labToRgb(L,a,b2);
  return { rr, gg, bb, L, a, b2 };
}

describe('color space conversions', () => {
  it('rgb -> lab -> rgb round trip close', () => {
    const samples = [ [0,0,0], [255,255,255], [12,120,200], [240,32,160], [80,200,40] ];
    for(const [r,g,b] of samples){
      const { rr, gg, bb } = roundTripRgb(r,g,b);
      expect(Math.abs(rr-r)).to.be.at.most(2);
      expect(Math.abs(gg-g)).to.be.at.most(2);
      expect(Math.abs(bb-b)).to.be.at.most(2);
    }
  });

  it('hex <-> rgb symmetry', () => {
    const colors = ['#000000','#ffffff','#1e90ff','#ff00aa'];
    for(const h of colors){
      const rgb = hexToRgb(h)!; const h2 = rgbToHex(rgb[0],rgb[1],rgb[2]);
      expect(h2.toLowerCase()).to.equal(h.toLowerCase());
    }
  });
});