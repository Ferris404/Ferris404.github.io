import { describe, it, expect } from 'vitest';
import { SeededRandom, quantizeColorsKMeansAdvanced, deltaE2000 } from '../quantization.js';

function makeSolidImageData(color:[number,number,number], w=10, h=10){
  const data = new Uint8ClampedArray(w*h*4);
  for(let i=0;i<data.length;i+=4){ data[i]=color[0]; data[i+1]=color[1]; data[i+2]=color[2]; data[i+3]=255; }
  return data;
}

describe('quantization core', () => {
  it('k-means returns requested number of centroids', () => {
    const img = makeSolidImageData([120,50,200], 4, 4); // single color
    const rng = new SeededRandom(1234);
    const cents = quantizeColorsKMeansAdvanced(img, 3, 'rgb', false, rng);
    expect(cents.length).to.equal(3);
  });

  it('deltaE2000 identical colors = 0', () => {
    expect(deltaE2000(50,0,0, 50,0,0)).to.be.lessThan(1e-6);
  });

  it('deltaE2000 larger for very different colors', () => {
    const d1 = deltaE2000(50,0,0, 55,0,0); // small lightness change
    const d2 = deltaE2000(50,0,0, 80,60,-60); // large diff
    expect(d2).to.be.greaterThan(d1);
  });
});