import { rgbToHex, hexToRgb, rgbToLab } from './colorSpaces.js';

// DOM refs
const qs = s => document.querySelector(s);
const fileInput = qs('#file');
const preview = qs('#preview');
const colorsRange = qs('#colors');
const colorsVal = qs('#colorsVal');
const processBtn = qs('#process');
const layersEl = qs('#layers');
const paletteEl = qs('#palette');
const mergeBtn = qs('#mergeColors');
const downsampleChk = qs('#downsample');
const downsampleOptions = qs('#downsampleOptions');
const downsampleSizeInput = qs('#downsampleSize');
const strayPixelSizeRange = qs('#strayPixelSize');
const strayPixelSizeVal = qs('#strayPixelSizeVal');
const algorithmSelect = qs('#algorithm');
const colorSpaceSelect = qs('#colorSpace');
const preprocessingSelect = qs('#preprocessing');
const blurStrengthRange = qs('#blurStrength');
const blurStrengthVal = qs('#blurStrengthVal');
const perceptualWeightingCheckbox = qs('#perceptualWeighting');
const ciede2000Checkbox = qs('#ciede2000');
const randomSeedCheckbox = qs('#randomSeed');
const seedInput = qs('#seed');
const seedVal = qs('#seedVal');
const downloadBtn = qs('#download');

// State
let originalImage=null; let currentCentroids=[]; let currentLayerData=[]; let currentImageDimensions={width:0,height:0};
let clusterPixelCounts=[]; let totalClusterPixels=0;
let colorLocks=[]; // parallel to currentCentroids
let mergeSelection = new Set();

// Worker
const worker = new Worker('./kmeansWorker.js', { type: 'module' });
worker.onmessage = (e) => {
  const { type } = e.data;
  if (type === 'done') {
    try {
      const { centroids, width, height, layers } = e.data;
      currentCentroids = centroids.map(c=>[...c]);
      currentLayerData = layers.map(l => new ImageData(new Uint8ClampedArray(l.buffer), l.width, l.height));
      currentImageDimensions = { width, height };
      renderResult();
    } catch (err) {
      console.error('Render failure', err);
      alert('Render failed: '+err.message);
    } finally {
      processBtn.disabled=false; processBtn.textContent='Separate';
    }
  } else if (type === 'error') {
    console.error('Worker error', e.data.message, e.data.stack);
    alert('Processing failed: '+e.data.message);
    processBtn.disabled=false; processBtn.textContent='Separate';
  }
};

// UI bindings
colorsRange.addEventListener('input', ()=> colorsVal.textContent=colorsRange.value);
strayPixelSizeRange.addEventListener('input', ()=> strayPixelSizeVal.textContent=strayPixelSizeRange.value);
blurStrengthRange.addEventListener('input', ()=> blurStrengthVal.textContent=blurStrengthRange.value);
seedInput.addEventListener('input', ()=> seedVal.textContent=seedInput.value);
downsampleChk.addEventListener('change', ()=>{ downsampleOptions.style.display=downsampleChk.checked?'block':'none'; });
downsampleOptions.style.display=downsampleChk.checked?'block':'none';

randomSeedCheckbox.addEventListener('change', ()=>{
  seedInput.disabled = randomSeedCheckbox.checked;
  if(randomSeedCheckbox.checked){ const newSeed = Math.floor(Math.random()*1000000); seedInput.value=newSeed; seedVal.textContent=newSeed; }
});

downloadBtn.addEventListener('click', async () => {
  if(!currentLayerData.length){ alert('Process an image first'); return; }
  const zip = new JSZip(); const folder = zip.folder('layers');
  for (let i=0;i<currentLayerData.length;i++){ const layer=currentLayerData[i]; const centroid=currentCentroids[i]; const hex=rgbToHex(centroid[0],centroid[1],centroid[2]); const canvas=document.createElement('canvas'); canvas.width=layer.width; canvas.height=layer.height; canvas.getContext('2d').putImageData(layer,0,0); const blob = await new Promise(r=>canvas.toBlob(r,'image/png')); folder.file(`${hex}.png`, blob); }
  const content = await zip.generateAsync({type:'blob'}); const a=document.createElement('a'); a.href=URL.createObjectURL(content); a.download='color-layers.zip'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),2000);
});

fileInput.addEventListener('change', e => { const f=e.target.files && e.target.files[0]; if(f) handleFile(f); });

['dragenter','dragover','dragleave','drop'].forEach(ev=>document.body.addEventListener(ev, preventDefaults, false));
let dragCounter=0; document.body.addEventListener('dragenter', ()=>{ dragCounter++; document.body.classList.add('drag-over'); });
document.body.addEventListener('dragleave', ()=>{ dragCounter--; if(dragCounter===0) document.body.classList.remove('drag-over'); });
document.body.addEventListener('drop', e=>{ dragCounter=0; document.body.classList.remove('drag-over'); const dt=e.dataTransfer; if(dt.files.length>0) handleFile(dt.files[0]); });
window.addEventListener('paste', e=>{ const items=(e.clipboardData||e.originalEvent?.clipboardData)?.items||[]; for(const item of items){ if(item.kind==='file' && item.type.startsWith('image/')){ const file=item.getAsFile(); if(file) handleFile(file); break; } } });

function preventDefaults(e){ e.preventDefault(); e.stopPropagation(); }

function handleFile(file){ if(!file.type.startsWith('image/')) return; const url=URL.createObjectURL(file); const img=new Image(); img.onload=()=>{ originalImage=img; preview.style.display='block'; drawPreview(img); URL.revokeObjectURL(url); }; img.src=url; }

function drawPreview(img){ const ctx=preview.getContext('2d',{willReadFrequently:true}); const max=Number(downsampleSizeInput.value); let w=img.naturalWidth, h=img.naturalHeight; if(downsampleChk.checked && Math.max(w,h)>max){ const scale=max/Math.max(w,h); w=Math.round(w*scale); h=Math.round(h*scale);} preview.width=w; preview.height=h; ctx.clearRect(0,0,w,h); ctx.drawImage(img,0,0,w,h); }

function getCurrentSeed(){ if(randomSeedCheckbox.checked){ const seed=Math.floor(Math.random()*1000000); seedInput.value=seed; seedVal.textContent=seed; return seed; } return Number(seedInput.value); }

processBtn.addEventListener('click', ()=>{
  if(!originalImage){ alert('Choose an image first'); return; }
  const k=Number(colorsRange.value); if(k<1){ alert('Invalid color count'); return; }
  const seed=getCurrentSeed(); drawPreview(originalImage);
  const ctx=preview.getContext('2d',{willReadFrequently:true}); const img=ctx.getImageData(0,0,preview.width, preview.height);
  processBtn.disabled=true; processBtn.textContent='Processing...';
  const lockedCentroids = currentCentroids.filter((_,i)=>colorLocks[i]);
  if(lockedCentroids.length > k){ alert('Locked colors exceed requested color count. Increase Colors or unlock some.'); processBtn.disabled=false; processBtn.textContent='Separate'; return; }
  worker.postMessage({ type:'process', payload:{ width:img.width, height:img.height, buffer: img.data.buffer, k, algorithm: algorithmSelect.value, colorSpace: colorSpaceSelect.value, perceptualWeighting: perceptualWeightingCheckbox.checked, preprocessing: preprocessingSelect.value, blurStrength: Number(blurStrengthRange.value), strayPixelSize: Number(strayPixelSizeRange.value), seed, lockedCentroids, useCIEDE2000: ciede2000Checkbox.checked } }, [img.data.buffer]);
});

function renderResult(){ preview.style.display='none'; layersEl.innerHTML=''; paletteEl.innerHTML=''; mergeSelection.clear(); updateMergeButtonState(); if(colorLocks.length !== currentCentroids.length) colorLocks = currentCentroids.map((_,i)=>colorLocks[i]||false); clusterPixelCounts=[]; totalClusterPixels=0;
  // Blend layers
  const blended=document.createElement('canvas'); blended.width=currentImageDimensions.width; blended.height=currentImageDimensions.height; const bctx=blended.getContext('2d');
  for(const layer of currentLayerData){ const c=document.createElement('canvas'); c.width=layer.width; c.height=layer.height; c.getContext('2d').putImageData(layer,0,0); bctx.drawImage(c,0,0); }
  /** @type {HTMLImageElement|null} */ const originalImageEl = document.getElementById('original-image');
  /** @type {HTMLImageElement|null} */ const processedImageEl = document.getElementById('processed-image');
  /** @type {HTMLElement|null} */ const slider = document.querySelector('img-comparison-slider');
  if(slider){
    slider.style.setProperty('aspect-ratio', `${blended.width} / ${blended.height}`);
    // Provide an inline max-width hint matching intrinsic pixel width (CSS will cap further)
    slider.style.setProperty('--intrinsic-width', `${blended.width}px`);
  }
  if(originalImageEl) originalImageEl.style.setProperty('aspect-ratio', `${blended.width} / ${blended.height}`);
  if(processedImageEl) processedImageEl.style.setProperty('aspect-ratio', `${blended.width} / ${blended.height}`);
  if(originalImage){
    const originalCanvas=document.createElement('canvas'); originalCanvas.width=blended.width; originalCanvas.height=blended.height; const octx=originalCanvas.getContext('2d'); if(octx) octx.drawImage(originalImage,0,0,blended.width, blended.height);
    if(originalImageEl) originalImageEl.src=originalCanvas.toDataURL();
  }
  if(processedImageEl) processedImageEl.src=blended.toDataURL();
  setupHighlightOverlay(blended.width, blended.height);
  for(let i=0;i<currentCentroids.length;i++){
    const col=currentCentroids[i]; const hex=rgbToHex(col[0],col[1],col[2]);
    const cont=document.createElement('div'); cont.className='swatch-container';
    const selectBox=document.createElement('div'); selectBox.className='merge-select-box'; selectBox.dataset.colorIndex=i; selectBox.textContent='+'; if(mergeSelection.has(i)) selectBox.classList.add('selected');
    const sw=document.createElement('div'); sw.className='swatch'; if(colorLocks[i]) sw.classList.add('locked'); sw.style.background=hex; sw.dataset.colorIndex=i; sw.title=`Click to change color (dbl-click lock): ${hex}`;
    const input=document.createElement('input'); input.type='color'; input.value=hex; input.dataset.colorIndex=i;
    sw.addEventListener('click', (ev)=>{ if(ev.shiftKey){ toggleMergeSelection(i); } else { input.click(); } });
    sw.addEventListener('dblclick', ()=> toggleLock(i));
    sw.addEventListener('mouseenter',()=>highlightColorRegion(i)); sw.addEventListener('mouseleave',()=>hideHighlight());
    input.addEventListener('change',e=>{ updatePaletteColor(Number(e.target.dataset.colorIndex), e.target.value); });
    selectBox.addEventListener('click',(e)=>{ e.stopPropagation(); toggleMergeSelection(i); });
    cont.appendChild(selectBox); cont.appendChild(sw); cont.appendChild(input); paletteEl.appendChild(cont);
  }
  computeClusterCounts(); updateStatsPanel(true);
}

function updatePaletteColor(index,newHex){ const rgb=hexToRgb(newHex); if(!rgb) return; currentCentroids[index]=rgb; const layer=currentLayerData[index]; const d=layer.data; for(let i=0;i<d.length;i+=4) if(d[i+3]>0){ d[i]=rgb[0]; d[i+1]=rgb[1]; d[i+2]=rgb[2]; } const sw=document.querySelector(`.swatch[data-color-index="${index}"]`); if(sw) sw.style.background=newHex; updateBlendedImage(); }
paletteEl.addEventListener('change', e=>{ if(e.target.type==='color') updateStatsPanel(false); });

function toggleLock(i){ colorLocks[i]=!colorLocks[i]; const sw=document.querySelector(`.swatch[data-color-index="${i}"]`); if(sw) sw.classList.toggle('locked', colorLocks[i]); }

function toggleMergeSelection(i){ if(mergeSelection.has(i)) mergeSelection.delete(i); else mergeSelection.add(i); const box=document.querySelector(`.merge-select-box[data-color-index="${i}"]`); if(box) box.classList.toggle('selected', mergeSelection.has(i)); updateMergeButtonState(); }

function updateMergeButtonState(){ mergeBtn && (mergeBtn.disabled = mergeSelection.size < 2); }

mergeBtn?.addEventListener('click', ()=>{
  if(mergeSelection.size < 2) return; const indices=[...mergeSelection].sort((a,b)=>a-b);
  const counts = indices.map(idx=>{ const d=currentLayerData[idx].data; let c=0; for(let i=0;i<d.length;i+=4) if(d[i+3]>0) c++; return c||1; });
  const total = counts.reduce((a,b)=>a+b,0); const mergedColor=[0,0,0]; indices.forEach((idx,j)=>{ const c=currentCentroids[idx]; const w=counts[j]; mergedColor[0]+=c[0]*w; mergedColor[1]+=c[1]*w; mergedColor[2]+=c[2]*w; }); mergedColor[0]=Math.round(mergedColor[0]/total); mergedColor[1]=Math.round(mergedColor[1]/total); mergedColor[2]=Math.round(mergedColor[2]/total);
  const w=currentImageDimensions.width, h=currentImageDimensions.height; const mergedLayer=new ImageData(w,h); const md=mergedLayer.data;
  for(let i=0;i<md.length;i+=4){ let inAny=false; for(const idx of indices){ const d=currentLayerData[idx].data; if(d[i+3]>0){ inAny=true; break; } } if(inAny){ md[i]=mergedColor[0]; md[i+1]=mergedColor[1]; md[i+2]=mergedColor[2]; md[i+3]=255; } else { md[i+3]=0; } }
  // Remove originals
  for(let k=indices.length-1;k>=0;k--){ const rm=indices[k]; currentCentroids.splice(rm,1); currentLayerData.splice(rm,1); colorLocks.splice(rm,1); }
  const insertAt = indices[0]; currentCentroids.splice(insertAt,0,mergedColor); currentLayerData.splice(insertAt,0,mergedLayer); colorLocks.splice(insertAt,0, indices.some(i=>colorLocks[i]));
  // Update color count input
  colorsRange.value = currentCentroids.length; colorsVal.textContent = colorsRange.value;
  mergeSelection.clear(); renderResult(); updateBlendedImage();
});

function updateBlendedImage(){ const blended=document.createElement('canvas'); blended.width=currentImageDimensions.width; blended.height=currentImageDimensions.height; const ctx=blended.getContext('2d'); for(const layer of currentLayerData){ const c=document.createElement('canvas'); c.width=layer.width; c.height=layer.height; c.getContext('2d').putImageData(layer,0,0); ctx.drawImage(c,0,0); } document.getElementById('processed-image').src=blended.toDataURL(); }

function setupHighlightOverlay(width,height){ const overlay=document.getElementById('highlight-overlay'); const processed=document.getElementById('processed-image'); const setup=()=>{ overlay.width=processed.offsetWidth; overlay.height=processed.offsetHeight; overlay.style.width=processed.offsetWidth+'px'; overlay.style.height=processed.offsetHeight+'px'; overlay.style.position='absolute'; overlay.style.top='0'; overlay.style.left='0'; overlay.style.pointerEvents='none'; }; processed.onload=setup; if(processed.complete && processed.offsetWidth>0) setup(); window.addEventListener('resize', setup); }

function highlightColorRegion(idx, highlightOpacity = 1, otherOpacity = 0.1) {
  // Show selected color at highlightOpacity, all others at otherOpacity
  const overlay = document.getElementById('highlight-overlay');
  const processed = document.getElementById('processed-image');
  if (!overlay || !processed || !currentLayerData[idx]) return;
  const { width, height } = currentImageDimensions;
  overlay.width = width;
  overlay.height = height;
  // Build mask: selected cluster is highlightOpacity, others are otherOpacity
  const mask = new ImageData(width, height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    let found = false;
    for (let l = 0; l < currentLayerData.length; l++) {
      const src = currentLayerData[l].data;
      if (src[o + 3] > 0) {
        if (l === idx) {
          mask.data[o] = src[o];
          mask.data[o + 1] = src[o + 1];
          mask.data[o + 2] = src[o + 2];
          mask.data[o + 3] = Math.round(255 * highlightOpacity);
        } else if (!found) {
          mask.data[o] = src[o];
          mask.data[o + 1] = src[o + 1];
          mask.data[o + 2] = src[o + 2];
          mask.data[o + 3] = Math.round(255 * otherOpacity);
          found = true;
        }
      }
    }
    if (!found && mask.data[o + 3] === 0) {
      mask.data[o] = 0;
      mask.data[o + 1] = 0;
      mask.data[o + 2] = 0;
      mask.data[o + 3] = 0;
    }
  }
  // Update processed image
  const processedCanvas = document.createElement('canvas');
  processedCanvas.width = width;
  processedCanvas.height = height;
  const pctx = processedCanvas.getContext('2d');
  if (pctx) pctx.putImageData(mask, 0, 0);
  processed.src = processedCanvas.toDataURL();
  // Overlay for highlight
  const ctx = overlay.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.putImageData(mask, 0, 0);
  overlay.style.opacity = '1';
}

function hideHighlight() {
  const overlay = document.getElementById('highlight-overlay');
  const processed = document.getElementById('processed-image');
  if (!overlay || !processed || !currentLayerData.length) return;
  const { width, height } = currentImageDimensions;
  overlay.width = width;
  overlay.height = height;
  // Compose all clusters at full opacity
  const mask = new ImageData(width, height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    let found = false;
    for (let l = 0; l < currentLayerData.length; l++) {
      const src = currentLayerData[l].data;
      if (src[o + 3] > 0 && !found) {
        mask.data[o] = src[o];
        mask.data[o + 1] = src[o + 1];
        mask.data[o + 2] = src[o + 2];
        mask.data[o + 3] = 255;
        found = true;
      }
    }
    if (!found) {
      mask.data[o] = 0;
      mask.data[o + 1] = 0;
      mask.data[o + 2] = 0;
      mask.data[o + 3] = 0;
    }
  }
  // Update processed image
  const processedCanvas = document.createElement('canvas');
  processedCanvas.width = width;
  processedCanvas.height = height;
  const pctx = processedCanvas.getContext('2d');
  if (pctx) pctx.putImageData(mask, 0, 0);
  processed.src = processedCanvas.toDataURL();
  // Hide overlay
  overlay.style.opacity = '0';
}

// Expose for potential debugging
window._cspState = () => ({ currentCentroids, currentLayerData, currentImageDimensions });

// Stats helpers
function computeClusterCounts(){ const counts=new Array(currentCentroids.length).fill(0); let total=0; currentLayerData.forEach((layer,idx)=>{ const d=layer.data; for(let i=0;i<d.length;i+=4) if(d[i+3]>0){ counts[idx]++; total++; } }); clusterPixelCounts=counts; totalClusterPixels=total; }
function updateStatsPanel(_recalc){ const statsEl=document.getElementById('clusterStats'); if(!statsEl) return; const rows=currentCentroids.map((c,i)=>{ const pct= totalClusterPixels? (clusterPixelCounts[i]/totalClusterPixels*100):0; const lab=rgbToLab(c[0],c[1],c[2]); return {i,rgb:c,pct,lab}; }); let html='<table><caption>Cluster Stats</caption><thead><tr><th>#</th><th>Color</th><th>Hex</th><th>Size</th><th>%</th><th>L*</th><th>a*</th><th>b*</th></tr></thead><tbody>'; rows.forEach(r=>{ const hex=rgbToHex(r.rgb[0],r.rgb[1],r.rgb[2]); html+=`<tr><td>${r.i}</td><td class="cluster-swatch-cell"><div class="cluster-swatch-mini" style="background:${hex}"></div></td><td>${hex}</td><td>${clusterPixelCounts[r.i]}</td><td>${r.pct.toFixed(2)}</td><td>${r.lab[0].toFixed(1)}</td><td>${r.lab[1].toFixed(1)}</td><td>${r.lab[2].toFixed(1)}</td></tr>`; }); html+='</tbody></table>'; statsEl.innerHTML=html; }
