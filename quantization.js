import { rgbToLab, labToRgb, convertColorSpace, convertBackToRgb } from './colorSpaces.js';

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
  const pixels=[]; for(let i=0;i<data.length;i+=4){ if(data[i+3]>0){ let p=[data[i],data[i+1],data[i+2]]; if(usePerceptualWeighting && colorSpace==='rgb'){ p=[p[0]*0.299,p[1]*0.587,p[2]*0.114]; } pixels.push(p);} }
  if(!pixels.length) return [];
  const centroids=[ pixels[rng.randInt(0,pixels.length)] ];
  for(let c=1;c<k;c++){
    const dists=pixels.map(px=>Math.min(...centroids.map(ct=>px.reduce((s,v,i)=>s+(v-ct[i])**2,0))));
    const total=dists.reduce((a,b)=>a+b,0); if(total===0) break; const thresh=rng.next()*total; let acc=0; for(let i=0;i<dists.length;i++){ acc+=dists[i]; if(acc>=thresh){ centroids.push([...pixels[i]]); break; }}
  }
  for(let iter=0;iter<50;iter++){
    const clusters=new Array(centroids.length).fill(0).map(()=>[]);
    for(const px of pixels){ let bi=0, bd=Infinity; for(let c=0;c<centroids.length;c++){ let d; if(useCIEDE2000 && colorSpace==='lab'){ d=deltaE2000(px[0],px[1],px[2],centroids[c][0],centroids[c][1],centroids[c][2]); } else { d=px.reduce((s,v,i)=>s+(v-centroids[c][i])**2,0); } if(d<bd){bd=d;bi=c;} } clusters[bi].push(px); }
    let changed=false; const tol = (useCIEDE2000 && colorSpace==='lab') ? 0.1 : 1;
    for(let c=0;c<centroids.length;c++) if(clusters[c].length){ const sums=[0,0,0]; for(const px of clusters[c]){sums[0]+=px[0];sums[1]+=px[1];sums[2]+=px[2];} const nc=[sums[0]/clusters[c].length,sums[1]/clusters[c].length,sums[2]/clusters[c].length]; if(nc.some((v,i)=>Math.abs(v-centroids[c][i])>tol)) changed=true; centroids[c]=nc; }
    if(!changed) break;
  }
  if(usePerceptualWeighting && colorSpace==='rgb') return centroids.map(c=>[Math.round(c[0]/0.299),Math.round(c[1]/0.587),Math.round(c[2]/0.114)]);
  return centroids.map(c=>c.map(Math.round));
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
  const layers=buildLayerData(data,centroids,w,h);
  const pixelCount = data.length/4;
  // Build assignment map (cluster index per pixel, -1 if none)
  const assign = new Int16Array(pixelCount).fill(-1);
  for(let ci=0; ci<layers.length; ci++){
    const d=layers[ci].data; for(let p=0;p<pixelCount;p++){ const o=p*4; if(d[o+3]>0) assign[p]=ci; }
  }
  if(strayPixelThreshold>0){
    // Connected-component clean-up per cluster (4-neighborhood) and merge tiny regions to neighboring majority cluster.
    const visited=new Uint8Array(pixelCount);
    const stack=new Int32Array(pixelCount);
    for(let p=0;p<pixelCount;p++){
      if(visited[p]||assign[p]===-1) continue;
      const cluster=assign[p]; let top=0; stack[top++]=p; visited[p]=1; const regionIdxs=[]; regionIdxs.push(p);
      // BFS/DFS
      while(top){ const cur=stack[--top]; const x=cur%w, y=(cur/w)|0; // neighbors
        if(x>0){ const np=cur-1; if(!visited[np] && assign[np]===cluster){ visited[np]=1; stack[top++]=np; regionIdxs.push(np);} }
        if(x<w-1){ const np=cur+1; if(!visited[np] && assign[np]===cluster){ visited[np]=1; stack[top++]=np; regionIdxs.push(np);} }
        if(y>0){ const np=cur-w; if(!visited[np] && assign[np]===cluster){ visited[np]=1; stack[top++]=np; regionIdxs.push(np);} }
        if(y<h-1){ const np=cur+w; if(!visited[np] && assign[np]===cluster){ visited[np]=1; stack[top++]=np; regionIdxs.push(np);} }
      }
      if(regionIdxs.length>0 && regionIdxs.length<=strayPixelThreshold){
        // Collect neighbor cluster counts
        const counts=new Int32Array(centroids.length);
        for(const rp of regionIdxs){ const x=rp%w, y=(rp/w)|0; // look at 8 neighbors to find alternative clusters
          for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
            if(dx===0&&dy===0) continue; const nx=x+dx, ny=y+dy; if(nx<0||nx>=w||ny<0||ny>=h) continue; const np=ny*w+nx; const ac=assign[np]; if(ac!==-1 && ac!==cluster) counts[ac]++; }
        }
        // Choose best alternative cluster with most adjacency
        let best=cluster, bestCount=0; for(let c=0;c<counts.length;c++) if(counts[c]>bestCount){ bestCount=counts[c]; best=c; }
        if(best!==cluster && bestCount>0){ for(const rp of regionIdxs) assign[rp]=best; }
      }
    }
    // One smoothing pass: if a pixel's cluster differs from the majority of its 8-neighbors, and that majority exists, flip.
    for(let p=0;p<pixelCount;p++){
      if(assign[p]===-1) continue; const x=p%w, y=(p/w)|0; const localCounts=new Int32Array(centroids.length); let total=0;
      for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
        if(dx===0&&dy===0) continue; const nx=x+dx, ny=y+dy; if(nx<0||nx>=w||ny<0||ny>=h) continue; const np=ny*w+nx; const ac=assign[np]; if(ac!==-1){ localCounts[ac]++; total++; } }
      if(total){ let majority=assign[p], max=localCounts[assign[p]]; for(let c=0;c<localCounts.length;c++) if(localCounts[c]>max){ max=localCounts[c]; majority=c; }
        if(majority!==assign[p] && max>=4){ assign[p]=majority; }
      }
    }
    // Rebuild layers from assignment map
    for(const layer of layers) layer.data.fill(0);
    for(let p=0;p<pixelCount;p++){
      const ci=assign[p]; if(ci===-1) continue; const o=p*4; const layer=layers[ci].data; const col=centroids[ci]; layer[o]=col[0]; layer[o+1]=col[1]; layer[o+2]=col[2]; layer[o+3]=255; }
  }
  // Guarantee coverage: Any original opaque pixel without assignment (could happen if k=0) -> nearest centroid
  if(centroids.length){
    for(let p=0;p<pixelCount;p++){
      const o=p*4; if(data[o+3]<=10) continue; let covered=false; for(const layer of layers){ if(layer.data[o+3]>0){ covered=true; break; } }
      if(!covered){ const r=data[o],g=data[o+1],b=data[o+2]; let bi=0,bd=Infinity; for(let c=0;c<centroids.length;c++){ const cc=centroids[c]; const d=(r-cc[0])**2+(g-cc[1])**2+(b-cc[2])**2; if(d<bd){bd=d;bi=c;} } const ld=layers[bi].data; ld[o]=centroids[bi][0]; ld[o+1]=centroids[bi][1]; ld[o+2]=centroids[bi][2]; ld[o+3]=255; }
    }
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
  // Color space conversion
  const { data, width:w, height:h } = working;
  let spaceData = data;
  if(colorSpace!=='rgb') spaceData = convertColorSpace(data, colorSpace);
  const rng = new SeededRandom(seed);
  // Start with locked centroids (already RGB). Trim if too many.
  const locked = lockedCentroids.slice(0, k);
  const remainingTarget = Math.max(0, k - locked.length);
  let centroids = [];
  if (remainingTarget === 0) {
    centroids = locked;
  } else if (algorithm === 'octree') {
    const rgb = colorSpace==='rgb'? data : convertBackToRgb(spaceData, colorSpace);
    const partialLayers = octreeQuantize(rgb, remainingTarget, w, h);
    const generated = partialLayers.map(layer => { const d=layer.data; let r=0,g=0,b=0,c=0; for(let i=0;i<d.length;i+=4){ if(d[i+3]>0){ r+=d[i]; g+=d[i+1]; b+=d[i+2]; c++; }} return c? [Math.round(r/c),Math.round(g/c),Math.round(b/c)]:[0,0,0]; });
    centroids = locked.concat(generated);
  } else if (algorithm === 'lab') {
    const labData = convertColorSpace(data,'lab');
    const generated = quantizeColorsKMeansAdvanced(labData, remainingTarget, 'lab', perceptualWeighting, rng, useCIEDE2000).map(c=>labToRgb(c[0],c[1],c[2]));
    centroids = locked.concat(generated);
  } else if (algorithm === 'medianCut') {
    const rgb = colorSpace==='rgb'? data : convertBackToRgb(spaceData, colorSpace);
    const generated = quantizeColorsMedianCut(rgb, remainingTarget);
    centroids = locked.concat(generated);
  } else { // kmeans
  const raw = quantizeColorsKMeansAdvanced(spaceData, remainingTarget, colorSpace, perceptualWeighting, rng, useCIEDE2000 && colorSpace==='lab');
    let generated = raw;
    if(colorSpace!=='rgb') generated = raw.map(c=>{ const rgb=convertBackToRgb([c[0],c[1],c[2],255], colorSpace); return [rgb[0],rgb[1],rgb[2]]; });
    centroids = locked.concat(generated);
  }
  const layers = createVectorizedRepresentation(data, centroids, w, h, strayPixelSize);
  return { centroids, layers, width:w, height:h };
}

export { deltaE2000 };
