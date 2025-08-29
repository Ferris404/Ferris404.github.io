import { rgbToLab, labToRgb, convertColorSpaceBatch, convertBackToRgbBatch } from './colorSpaces.js';

export class SeededRandom {
  constructor(seed){ this.seed=seed%2147483647; if(this.seed<=0) this.seed+=2147483646; }
  next(){ this.seed=(this.seed*16807)%2147483647; return (this.seed-1)/2147483646; }
  randInt(min,max){ return Math.floor(this.next()*(max-min))+min; }
}

// Exported for testing
function deltaE2000(l1,a1,b1,l2,a2,b2){
  const avgLp=(l1+l2)/2; const c1=Math.sqrt(a1*a1+b1*b1); const c2=Math.sqrt(a2*a2+b2*b2); const avgC=(c1+c2)/2;
  const G=0.5*(1-Math.sqrt(Math.pow(avgC,7)/(Math.pow(avgC,7)+Math.pow(25,7))));
  const a1p=a1*(1+G), a2p=a2*(1+G); const c1p=Math.sqrt(a1p*a1p+b1*b1), c2p=Math.sqrt(a2p*a2p+b2*b2); const avgCp=(c1p+c2p)/2;
  const h1p=Math.atan2(b1,a1p)+(Math.atan2(b1,a1p)<0?2*Math.PI:0); const h2p=Math.atan2(b2,a2p)+(Math.atan2(b2,a2p)<0?2*Math.PI:0);
  let dHp=h2p-h1p; if(dHp>Math.PI) dHp-=2*Math.PI; else if(dHp<-Math.PI) dHp+=2*Math.PI; const dLp=l2-l1; const dCp=c2p-c1p; const dHpTerm=2*Math.sqrt(c1p*c2p)*Math.sin(dHp/2);
  let avgHp=h1p+h2p; if(Math.abs(h1p-h2p)>Math.PI) avgHp += ((h1p+h2p)<2*Math.PI?2*Math.PI:-2*Math.PI); avgHp/=2;
  const T=1-0.17*Math.cos(avgHp-Math.PI/6)+0.24*Math.cos(2*avgHp)+0.32*Math.cos(3*avgHp+Math.PI/30)-0.20*Math.cos(4*avgHp-63*Math.PI/180);
  const Sl=1+(0.015*(avgLp-50)*(avgLp-50))/Math.sqrt(20+(avgLp-50)*(avgLp-50)); const Sc=1+0.045*avgCp; const Sh=1+0.015*avgCp*T;
  const deltaTheta=30*Math.PI/180*Math.exp(-(((180/Math.PI*avgHp - 275)/25)**2)); const Rc=2*Math.sqrt(Math.pow(avgCp,7)/(Math.pow(avgCp,7)+Math.pow(25,7))); const Rt=-Rc*Math.sin(2*deltaTheta);
  const Kl=1,Kc=1,Kh=1; return Math.sqrt(Math.pow(dLp/(Sl*Kl),2)+Math.pow(dCp/(Sc*Kc),2)+Math.pow(dHpTerm/(Sh*Kh),2)+Rt*(dCp/(Sc*Kc))*(dHpTerm/(Sh*Kh))); }

export function quantizeColorsKMeansAdvanced(data, k, colorSpace='rgb', usePerceptualWeighting=true, rng=new SeededRandom(12345), useCIEDE2000=false) {
  // Pre-allocate arrays to avoid repeated allocations
  const pixels = [];
  const pixelCount = data.length / 4;

  // Single pass to collect valid pixels
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 0) {
      let p = [data[i], data[i + 1], data[i + 2]];
      if (usePerceptualWeighting && colorSpace === 'rgb') {
        p = [p[0] * 0.299, p[1] * 0.587, p[2] * 0.114];
      }
      pixels.push(p);
    }
  }

  if (!pixels.length) return [];

  const pixelLen = pixels.length;
  const centroids = [];

  // K-means++ initialization - optimized
  centroids.push(pixels[rng.randInt(0, pixelLen)]);

  if (k > 1) {
    // Pre-compute distances for efficiency
    const distances = new Float32Array(pixelLen);

    for (let c = 1; c < k; c++) {
      let totalWeight = 0;

      // Calculate squared distances to nearest centroid
      for (let i = 0; i < pixelLen; i++) {
        const px = pixels[i];
        let minDist = Infinity;

        for (let j = 0; j < centroids.length; j++) {
          const ct = centroids[j];
          const dist = (px[0] - ct[0]) ** 2 + (px[1] - ct[1]) ** 2 + (px[2] - ct[2]) ** 2;
          if (dist < minDist) minDist = dist;
        }

        distances[i] = minDist;
        totalWeight += minDist;
      }

      if (totalWeight === 0) break;

      // Select next centroid
      const threshold = rng.next() * totalWeight;
      let cumulative = 0;
      for (let i = 0; i < pixelLen; i++) {
        cumulative += distances[i];
        if (cumulative >= threshold) {
          centroids.push([...pixels[i]]);
          break;
        }
      }
    }
  }

  // Main K-means loop - optimized convergence
  const clusters = new Array(k);
  const clusterSums = new Float32Array(k * 3);
  const clusterCounts = new Uint32Array(k);

  for (let iter = 0; iter < 50; iter++) {
    // Reset clusters and sums
    for (let i = 0; i < k; i++) {
      clusters[i] = [];
      clusterSums[i * 3] = 0;
      clusterSums[i * 3 + 1] = 0;
      clusterSums[i * 3 + 2] = 0;
      clusterCounts[i] = 0;
    }

    let changed = false;
    const tol = (useCIEDE2000 && colorSpace === 'lab') ? 0.1 : 1;

    // Assign pixels to clusters
    for (let i = 0; i < pixelLen; i++) {
      const px = pixels[i];
      let bestIdx = 0;
      let bestDist = Infinity;

      for (let c = 0; c < k; c++) {
        const ct = centroids[c];
        let dist;

        if (useCIEDE2000 && colorSpace === 'lab') {
          dist = deltaE2000(px[0], px[1], px[2], ct[0], ct[1], ct[2]);
        } else {
          dist = (px[0] - ct[0]) ** 2 + (px[1] - ct[1]) ** 2 + (px[2] - ct[2]) ** 2;
        }

        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = c;
        }
      }

      clusters[bestIdx].push(px);
      clusterSums[bestIdx * 3] += px[0];
      clusterSums[bestIdx * 3 + 1] += px[1];
      clusterSums[bestIdx * 3 + 2] += px[2];
      clusterCounts[bestIdx]++;
    }

    // Update centroids
    for (let c = 0; c < k; c++) {
      if (clusterCounts[c] > 0) {
        const newCentroid = [
          clusterSums[c * 3] / clusterCounts[c],
          clusterSums[c * 3 + 1] / clusterCounts[c],
          clusterSums[c * 3 + 2] / clusterCounts[c]
        ];

        // Check for convergence
        const diff0 = Math.abs(newCentroid[0] - centroids[c][0]);
        const diff1 = Math.abs(newCentroid[1] - centroids[c][1]);
        const diff2 = Math.abs(newCentroid[2] - centroids[c][2]);

        if (diff0 > tol || diff1 > tol || diff2 > tol) {
          centroids[c] = newCentroid;
          changed = true;
        }
      }
    }

    if (!changed) break;
  }

  if (usePerceptualWeighting && colorSpace === 'rgb') {
    return centroids.map(c => [
      Math.round(c[0] / 0.299),
      Math.round(c[1] / 0.587),
      Math.round(c[2] / 0.114)
    ]);
  }

  return centroids.map(c => c.map(Math.round));
}

export function buildLayerData(data, centroids, w, h){
  const k=centroids.length; const layers=new Array(k).fill(0).map(()=>new ImageData(w,h));
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const i=(y*w+x)*4; if(data[i+3]<10){ for(let c=0;c<k;c++) layers[c].data[i+3]=0; continue; } const r=data[i],g=data[i+1],b=data[i+2]; let bi=0, bd=Infinity; for(let c=0;c<k;c++){ const cc=centroids[c]; const d=(r-cc[0])**2+(g-cc[1])**2+(b-cc[2])**2; if(d<bd){bd=d;bi=c;} } for(let c=0;c<k;c++){ const ld=layers[c].data; if(c===bi){ ld[i]=centroids[c][0]; ld[i+1]=centroids[c][1]; ld[i+2]=centroids[c][2]; ld[i+3]=255;} else ld[i+3]=0; }}
  return layers;
}

export function octreeQuantize(data, k, w, h){
  class Node{ constructor(level=0){ this.level=level; this.children=new Array(8).fill(null); this.isLeaf=level===7; this.pixelCount=0; this.red=0; this.green=0; this.blue=0; } add(r,g,b){ this.pixelCount++; this.red+=r; this.green+=g; this.blue+=b; if(!this.isLeaf){ const idx=this.idx(r,g,b); if(!this.children[idx]) this.children[idx]=new Node(this.level+1); this.children[idx].add(r,g,b);} } idx(r,g,b){ const shift=7-this.level; return ((r>>shift)&1)<<2 | ((g>>shift)&1)<<1 | ((b>>shift)&1); } leaves(){ if(this.isLeaf) return [this]; return this.children.flatMap(c=>c?c.leaves():[]);} color(){ return [Math.round(this.red/this.pixelCount),Math.round(this.green/this.pixelCount),Math.round(this.blue/this.pixelCount)]; } }
  const root=new Node(); for(let i=0;i<data.length;i+=4) if(data[i+3]>0) root.add(data[i],data[i+1],data[i+2]);
  const leaves=root.leaves().sort((a,b)=>b.pixelCount-a.pixelCount); const centroids=leaves.slice(0,k).map(l=>l.color());
  return buildLayerData(data,centroids,w,h).map(ld=>ld); // return layers
}

export function quantizeColorsMedianCut(data, k){
  const pixels=[]; for(let i=0;i<data.length;i+=4) if(data[i+3]>10) pixels.push([data[i],data[i+1],data[i+2]]);
  function split(box){ const axis=box.axis; box.pixels.sort((a,b)=>a[axis]-b[axis]); const mid=Math.floor(box.pixels.length/2); return [{pixels:box.pixels.slice(0,mid),axis:(axis+1)%3},{pixels:box.pixels.slice(mid),axis:(axis+1)%3}]; }
  let boxes=[{pixels,axis:0}]; while(boxes.length<k) boxes=boxes.flatMap(split);
  return boxes.map(b=>{ const avg=b.pixels.reduce((a,p)=>[a[0]+p[0],a[1]+p[1],a[2]+p[2]],[0,0,0]); return avg.map(v=>Math.round(v/b.pixels.length)); });
}

export function createVectorizedRepresentation(data, centroids, w, h, strayPixelThreshold){
  const layers = buildLayerData(data, centroids, w, h);
  const pixelCount = data.length / 4;
  const k = centroids.length;

  // Early exit for simple cases
  if (strayPixelThreshold <= 0) {
    // Guarantee coverage without complex processing
    if (centroids.length) {
      for (let p = 0; p < pixelCount; p++) {
        const o = p * 4;
        if (data[o + 3] <= 10) continue;

        let covered = false;
        for (const layer of layers) {
          if (layer.data[o + 3] > 0) {
            covered = true;
            break;
          }
        }

        if (!covered) {
          const r = data[o], g = data[o + 1], b = data[o + 2];
          let bi = 0, bd = Infinity;
          for (let c = 0; c < k; c++) {
            const cc = centroids[c];
            const d = (r - cc[0]) ** 2 + (g - cc[1]) ** 2 + (b - cc[2]) ** 2;
            if (d < bd) { bd = d; bi = c; }
          }
          const ld = layers[bi].data;
          ld[o] = centroids[bi][0];
          ld[o + 1] = centroids[bi][1];
          ld[o + 2] = centroids[bi][2];
          ld[o + 3] = 255;
        }
      }
    }
    return layers;
  }

  // Build assignment map more efficiently
  const assign = new Int16Array(pixelCount).fill(-1);

  // Single pass to build assignment map
  for (let ci = 0; ci < k; ci++) {
    const layerData = layers[ci].data;
    for (let p = 0; p < pixelCount; p++) {
      const o = p * 4;
      if (layerData[o + 3] > 0) {
        assign[p] = ci;
      }
    }
  }

  // Optimized connected component analysis
  const visited = new Uint8Array(pixelCount);
  const stack = new Int32Array(pixelCount);

  for (let p = 0; p < pixelCount; p++) {
    if (visited[p] || assign[p] === -1) continue;

    const cluster = assign[p];
    let top = 0;
    stack[top++] = p;
    visited[p] = 1;
    const regionIdxs = [p];

    // BFS with optimized neighbor checking
    while (top > 0) {
      const cur = stack[--top];
      const x = cur % w;
      const y = (cur / w) | 0;

      // Check 4 neighbors
      if (x > 0) {
        const np = cur - 1;
        if (!visited[np] && assign[np] === cluster) {
          visited[np] = 1;
          stack[top++] = np;
          regionIdxs.push(np);
        }
      }
      if (x < w - 1) {
        const np = cur + 1;
        if (!visited[np] && assign[np] === cluster) {
          visited[np] = 1;
          stack[top++] = np;
          regionIdxs.push(np);
        }
      }
      if (y > 0) {
        const np = cur - w;
        if (!visited[np] && assign[np] === cluster) {
          visited[np] = 1;
          stack[top++] = np;
          regionIdxs.push(np);
        }
      }
      if (y < h - 1) {
        const np = cur + w;
        if (!visited[np] && assign[np] === cluster) {
          visited[np] = 1;
          stack[top++] = np;
          regionIdxs.push(np);
        }
      }
    }

    // Process small regions
    if (regionIdxs.length > 0 && regionIdxs.length <= strayPixelThreshold) {
      const counts = new Int32Array(k);

      // Count neighboring clusters
      for (const rp of regionIdxs) {
        const x = rp % w;
        const y = (rp / w) | 0;

        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              const np = ny * w + nx;
              const ac = assign[np];
              if (ac !== -1 && ac !== cluster) {
                counts[ac]++;
              }
            }
          }
        }
      }

      // Find best alternative cluster
      let best = cluster, bestCount = 0;
      for (let c = 0; c < k; c++) {
        if (counts[c] > bestCount) {
          bestCount = counts[c];
          best = c;
        }
      }

      if (best !== cluster && bestCount > 0) {
        for (const rp of regionIdxs) {
          assign[rp] = best;
        }
      }
    }
  }

  // Optimized smoothing pass
  const tempAssign = new Int16Array(pixelCount);
  for (let p = 0; p < pixelCount; p++) {
    if (assign[p] === -1) {
      tempAssign[p] = -1;
      continue;
    }

    const x = p % w;
    const y = (p / w) | 0;
    const localCounts = new Int32Array(k);
    let total = 0;

    // Check 8 neighbors
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
          const np = ny * w + nx;
          const ac = assign[np];
          if (ac !== -1) {
            localCounts[ac]++;
            total++;
          }
        }
      }
    }

    if (total > 0) {
      let majority = assign[p], max = localCounts[assign[p]];
      for (let c = 0; c < k; c++) {
        if (localCounts[c] > max) {
          max = localCounts[c];
          majority = c;
        }
      }

      tempAssign[p] = (majority !== assign[p] && max >= 4) ? majority : assign[p];
    } else {
      tempAssign[p] = assign[p];
    }
  }

  // Copy back optimized assignments
  for (let p = 0; p < pixelCount; p++) {
    assign[p] = tempAssign[p];
  }

  // Rebuild layers efficiently
  for (const layer of layers) {
    layer.data.fill(0);
  }

  for (let p = 0; p < pixelCount; p++) {
    const ci = assign[p];
    if (ci === -1) continue;

    const o = p * 4;
    const layer = layers[ci];
    const col = centroids[ci];
    const ld = layer.data;
    ld[o] = col[0];
    ld[o + 1] = col[1];
    ld[o + 2] = col[2];
    ld[o + 3] = 255;
  }

  return layers;
}

/**
 * @param {{ imageData: ImageData; k:number; algorithm:string; colorSpace:string; perceptualWeighting:boolean; preprocessing:string; blurStrength:number; strayPixelSize:number; seed:number; lockedCentroids?: number[][]; useCIEDE2000?: boolean; }} params
 */
export function processImage({ imageData, k, algorithm, colorSpace, perceptualWeighting, preprocessing, blurStrength, strayPixelSize, seed, lockedCentroids = [], useCIEDE2000=false }){
  let working = imageData; // ImageData
  // Preprocess
  // (Actual filters done outside or could be imported; kept simple here)
  // Color space conversion - use batch processing for better performance
  const { data, width:w, height:h } = working;
  let spaceData = data;
  if(colorSpace!=='rgb') {
    spaceData = convertColorSpaceBatch(data, colorSpace);
  }
  const rng = new SeededRandom(seed);
  // Start with locked centroids (already RGB). Trim if too many.
  const locked = lockedCentroids.slice(0, k);
  const remainingTarget = Math.max(0, k - locked.length);
  let centroids = [];
  if (remainingTarget === 0) {
    centroids = locked;
  } else if (algorithm === 'octree') {
    const rgb = colorSpace==='rgb'? data : convertBackToRgbBatch(spaceData, colorSpace);
    const partialLayers = octreeQuantize(rgb, remainingTarget, w, h);
    const generated = partialLayers.map(layer => { const d=layer.data; let r=0,g=0,b=0,c=0; for(let i=0;i<d.length;i+=4){ if(d[i+3]>0){ r+=d[i]; g+=d[i+1]; b+=d[i+2]; c++; }} return c? [Math.round(r/c),Math.round(g/c),Math.round(b/c)]:[0,0,0]; });
    centroids = locked.concat(generated);
  } else if (algorithm === 'lab') {
    const labData = convertColorSpaceBatch(data,'lab');
    const generated = quantizeColorsKMeansAdvanced(labData, remainingTarget, 'lab', perceptualWeighting, rng, useCIEDE2000).map(c=>labToRgb(c[0],c[1],c[2]));
    centroids = locked.concat(generated);
  } else if (algorithm === 'medianCut') {
    const rgb = colorSpace==='rgb'? data : convertBackToRgbBatch(spaceData, colorSpace);
    const generated = quantizeColorsMedianCut(rgb, remainingTarget);
    centroids = locked.concat(generated);
  } else { // kmeans
  const raw = quantizeColorsKMeansAdvanced(spaceData, remainingTarget, colorSpace, perceptualWeighting, rng, useCIEDE2000 && colorSpace==='lab');
    let generated = raw;
    if(colorSpace!=='rgb') generated = raw.map(c=>{ const rgb=convertBackToRgbBatch([c[0],c[1],c[2],255], colorSpace); return [rgb[0],rgb[1],rgb[2]]; });
    centroids = locked.concat(generated);
  }
  const layers = createVectorizedRepresentation(data, centroids, w, h, strayPixelSize);
  return { centroids, layers, width:w, height:h };
}

export { deltaE2000 };
