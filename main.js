// @ts-nocheck
import { rgbToHex, hexToRgb, rgbToLab } from './colorSpaces.js';

// DOM refs
const qs = s => document.querySelector(s);
const fileInput = qs('#file');
const preview = qs('#preview');
const colorsRange = qs('#colors');
const colorsVal = qs('#colorsVal');
// Lazy-loaded GIF helpers (loaded via ESM CDN when needed)
// Holds decoder functions when loaded
let gifDecode = null; // shape: { parseGIF, decompressFrames }
// Holds encoder functions when loaded
let gifEnc = null;    // shape: { GIFEncoder, quantize, applyPalette }

// Robust dynamic import helpers with CDN fallbacks
async function importGifDecode(){
  if (gifDecode) return gifDecode;
  const urls = [
  'https://cdn.jsdelivr.net/npm/gifuct-js/+esm',
  'https://cdn.jsdelivr.net/npm/gifuct-js@2.1.2/+esm',
  'https://unpkg.com/gifuct-js?module',
  'https://unpkg.com/gifuct-js@2.1.2?module',
  'https://cdn.skypack.dev/gifuct-js',
  'https://esm.sh/gifuct-js',
  'https://esm.run/gifuct-js'
  ];
  let lastErr;
  for (const url of urls){
    try{
      const mod = await import(url);
      const parseGIF = mod.parseGIF || mod.default?.parseGIF;
      const decompressFrames = mod.decompressFrames || mod.default?.decompressFrames;
      if (parseGIF && decompressFrames){
        gifDecode = { parseGIF, decompressFrames };
        return gifDecode;
      }
    }catch(e){ lastErr = e; }
  }
  throw new Error('Failed to load gifuct-js: ' + (lastErr?.message||lastErr));
}

async function importGifEnc(){
  if (gifEnc) return gifEnc;
  const urls = [
  'https://cdn.jsdelivr.net/npm/gifenc@1.0.3/+esm',
  'https://unpkg.com/gifenc@1.0.3?module',
  'https://cdn.skypack.dev/gifenc@1.0.3',
  'https://esm.sh/gifenc@1.0.3'
  ];
  let lastErr;
  for (const url of urls){
    try{
      const mod = await import(url);
      const enc = {
        GIFEncoder: mod.GIFEncoder || mod.default?.GIFEncoder,
        quantize: mod.quantize || mod.default?.quantize,
        applyPalette: mod.applyPalette || mod.default?.applyPalette
      };
      if (enc.GIFEncoder && enc.quantize && enc.applyPalette){ gifEnc = enc; return gifEnc; }
    }catch(e){ lastErr = e; }
  }
  throw new Error('Failed to load gifenc: ' + (lastErr?.message||lastErr));
}
const processBtn = qs('#process');
const layersEl = qs('#layers');
const paletteEl = qs('#palette');
const mergeBtn = qs('#mergeColors');
const downsampleChk = qs('#downsample');
const downsampleOptions = qs('#downsampleOptions');
const downsampleSizeInput = qs('#downsampleSize');
const strayPixelSizeRange = qs('#strayPixelSize');

// GIF-specific state
let isAnimatedGif = false;
let gifFrames = []; // [{ imageData: ImageData, delay: number }]
let gifLoopCount = 0; // 0=infinite
let perColorGifFrames = []; // Array<Array<{ imageData: ImageData, delayCs: number }>>
let originalGifUrl = null; // Object URL of uploaded GIF for playback
let processedGifUrl = null; // Object URL of encoded quantized GIF for playback
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
let _pendingWorkerPromises = 0;
const worker = new Worker('./kmeansWorker.js', { type: 'module' });
worker.onmessage = (e) => {
  // If a promise-based call is awaiting, let that handler consume messages
  if (_pendingWorkerPromises > 0) return;
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

// Helper to run the worker once and get a Promise result
function runWorkerOnce(imageData, { k, lockedCentroids, seed }){
  return new Promise((resolve, reject) => {
    _pendingWorkerPromises++;
    const handler = (e) => {
      const { type } = e.data;
      if (type === 'done') { worker.removeEventListener('message', handler); _pendingWorkerPromises--; resolve(e.data); }
      else if (type === 'error') { worker.removeEventListener('message', handler); _pendingWorkerPromises--; reject(new Error(e.data.message||'Worker error')); }
    };
    worker.addEventListener('message', handler);
    // Copy pixels so we don't neuter the original buffer
    const copy = new Uint8ClampedArray(imageData.data);
    worker.postMessage({ type:'process', payload:{ width:imageData.width, height:imageData.height, buffer: copy.buffer, k, algorithm: algorithmSelect.value, colorSpace: colorSpaceSelect.value, perceptualWeighting: perceptualWeightingCheckbox.checked, preprocessing: preprocessingSelect.value, blurStrength: Number(blurStrengthRange.value), strayPixelSize: Number(strayPixelSizeRange.value), seed, lockedCentroids, useCIEDE2000: ciede2000Checkbox.checked } }, [copy.buffer]);
  });
}

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
  // If animated GIF processed, export per-color as animated GIFs
  if (isAnimatedGif && perColorGifFrames.length){
    await importGifEnc();
    const zip = new JSZip(); const folder = zip.folder('gif-layers');
  for (let ci=0; ci<perColorGifFrames.length; ci++){
  const enc = gifEnc.GIFEncoder();
      for (const fr of perColorGifFrames[ci]){
        const rgba = fr.imageData.data;
        // Use RGBA palette so masked transparency is preserved
        const pal = gifEnc.quantize(rgba, 256, { format: 'rgba4444', oneBitAlpha: true, clearAlpha: true });
        const index = gifEnc.applyPalette(rgba, pal, 'rgba4444');
    enc.writeFrame(index, fr.imageData.width, fr.imageData.height, { palette: pal, delay: Math.round(fr.delayCs * 10), transparent: true, repeat: gifLoopCount||0, dispose: 2 });
      }
      enc.finish();
      const bytes = enc.bytes();
      const centroid=currentCentroids[ci]; const hex=rgbToHex(centroid[0],centroid[1],centroid[2]);
      folder.file(`${hex}.gif`, new Blob([bytes], { type:'image/gif' }));
    }
    const content = await zip.generateAsync({type:'blob'}); const a=document.createElement('a'); a.href=URL.createObjectURL(content); a.download='color-gif-layers.zip'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),2000);
    return;
  }
  // Default: static PNGs
  const zip = new JSZip(); const folder = zip.folder('layers');
  for (let i=0;i<currentLayerData.length;i++){ const layer=currentLayerData[i]; const centroid=currentCentroids[i]; const hex=rgbToHex(centroid[0],centroid[1],centroid[2]); const canvas=document.createElement('canvas'); canvas.width=layer.width; canvas.height=layer.height; canvas.getContext('2d').putImageData(layer,0,0); const blob = await new Promise(r=>canvas.toBlob(r,'image/png')); folder.file(`${hex}.png`, blob); }
  const content = await zip.generateAsync({type:'blob'}); const a=document.createElement('a'); a.href=URL.createObjectURL(content); a.download='color-layers.zip'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),2000);
});

fileInput.addEventListener('change', e => { const f = e.target?.files?.[0]; if (f) handleFile(f); });

['dragenter','dragover','dragleave','drop'].forEach(ev=>document.body.addEventListener(ev, preventDefaults, false));
let dragCounter=0; document.body.addEventListener('dragenter', ()=>{ dragCounter++; document.body.classList.add('drag-over'); });
document.body.addEventListener('dragleave', ()=>{ dragCounter--; if(dragCounter===0) document.body.classList.remove('drag-over'); });
document.body.addEventListener('drop', e=>{ dragCounter=0; document.body.classList.remove('drag-over'); const dt=e.dataTransfer; if(dt.files.length>0) handleFile(dt.files[0]); });
window.addEventListener('paste', e=>{
  const items=(e.clipboardData||e.originalEvent?.clipboardData)?.items||[];
  for(const item of items){
    if(item.kind==='file' && item.type.startsWith('image/')){
      const file=item.getAsFile();
      if(file){ handleFile(file); }
      break;
    }
  }
});

function preventDefaults(e){ e.preventDefault(); e.stopPropagation(); }

async function handleFile(file){
  if(!file.type.startsWith('image/')) return;
  // Reset GIF state
  resetGifState();
  if (file.type === 'image/gif'){
    const ok = await tryLoadGif(file);
    if (ok) return;
  }
  await loadStaticImage(file);
}

function resetGifState(){
  isAnimatedGif = false; gifFrames = []; gifLoopCount = 0; perColorGifFrames = [];
  // Revoke any existing blob URLs
  if (originalGifUrl){ URL.revokeObjectURL(originalGifUrl); originalGifUrl = null; }
  if (processedGifUrl){ URL.revokeObjectURL(processedGifUrl); processedGifUrl = null; }
}

async function tryLoadGif(file){
  try{
    const buf = await file.arrayBuffer();
    await importGifDecode();
    const gif = gifDecode.parseGIF(buf);
    const frames = gifDecode.decompressFrames(gif, true);
    const w = gif.lsd.width, h = gif.lsd.height;
    // Try to read loop count
    try {
      const appExt=(gif.extensions||[]).find(e=>e.type==='application'&&e.identifier==='NETSCAPE'&&e.authCode==='2.0');
      if(appExt?.data?.loopCount!=null) gifLoopCount = appExt.data.loopCount;
    } catch {}
    // Composite frames honoring disposal
    const c=document.createElement('canvas'); c.width=w; c.height=h; const ctx=c.getContext('2d',{willReadFrequently:true});
    let prev = ctx.getImageData(0,0,w,h);
    for (const f of frames){
      const id = ctx.createImageData(f.dims.width, f.dims.height);
      id.data.set(f.patch);
      ctx.putImageData(id, f.dims.left, f.dims.top);
      const composed = ctx.getImageData(0,0,w,h);
      // GIF GCE delay is in hundredths of a second (centiseconds). Preserve original, including 0.
      const delayCs = Number.isFinite(f.delay) ? Math.max(0, f.delay) : 0;
      gifFrames.push({ imageData: composed, delayCs });
      if (f.disposalType===2) ctx.clearRect(f.dims.left, f.dims.top, f.dims.width, f.dims.height);
      else if (f.disposalType===3) ctx.putImageData(prev, 0, 0);
      else prev = composed;
    }
    isAnimatedGif = gifFrames.length > 1;
  // Play the original GIF in the comparison slider
  if (originalGifUrl){ URL.revokeObjectURL(originalGifUrl); }
  originalGifUrl = URL.createObjectURL(file);
  const originalImageEl = document.getElementById('original-image');
  if (originalImageEl){ originalImageEl.src = originalGifUrl; }
  // Show the first frame in the canvas preview for processing context
  await showImageDataPreview(gifFrames[0].imageData, w, h);
    return true;
  }catch(err){ console.warn('GIF decode failed, falling back to static', err); return false; }
}

async function showImageDataPreview(imageData, w, h){
  const img=new Image(); const c2=document.createElement('canvas'); c2.width=w; c2.height=h; c2.getContext('2d').putImageData(imageData,0,0);
  await new Promise(res=>{ img.onload=res; img.src=c2.toDataURL(); });
  originalImage=img; preview.style.display='block'; drawPreview(img);
}

async function loadStaticImage(file){
  const url=URL.createObjectURL(file);
  await new Promise(res=>{
    const img=new Image();
    img.onload=()=>{ originalImage=img; preview.style.display='block'; drawPreview(img); URL.revokeObjectURL(url); res(); };
    img.src=url;
  });
}

function drawPreview(img){ const ctx=preview.getContext('2d',{willReadFrequently:true}); const max=Number(downsampleSizeInput.value); let w=img.naturalWidth, h=img.naturalHeight; if(downsampleChk.checked && Math.max(w,h)>max){ const scale=max/Math.max(w,h); w=Math.round(w*scale); h=Math.round(h*scale);} preview.width=w; preview.height=h; ctx.clearRect(0,0,w,h); ctx.drawImage(img,0,0,w,h); }

function getCurrentSeed(){ if(randomSeedCheckbox.checked){ const seed=Math.floor(Math.random()*1000000); seedInput.value=seed; seedVal.textContent=seed; return seed; } return Number(seedInput.value); }

processBtn.addEventListener('click', async ()=>{
  const k=Number(colorsRange.value); if(k<1){ alert('Invalid color count'); return; }
  const seed=getCurrentSeed();
  if (!isAnimatedGif){
    if(!originalImage){ alert('Choose an image first'); return; }
    drawPreview(originalImage);
    const ctx=preview.getContext('2d',{willReadFrequently:true}); const img=ctx.getImageData(0,0,preview.width, preview.height);
    processBtn.disabled=true; processBtn.textContent='Processing...';
    const lockedCentroids = currentCentroids.filter((_,i)=>colorLocks[i]);
    if(lockedCentroids.length > k){ alert('Locked colors exceed requested color count. Increase Colors or unlock some.'); processBtn.disabled=false; processBtn.textContent='Separate'; return; }
    worker.postMessage({ type:'process', payload:{ width:img.width, height:img.height, buffer: img.data.buffer, k, algorithm: algorithmSelect.value, colorSpace: colorSpaceSelect.value, perceptualWeighting: perceptualWeightingCheckbox.checked, preprocessing: preprocessingSelect.value, blurStrength: Number(blurStrengthRange.value), strayPixelSize: Number(strayPixelSizeRange.value), seed, lockedCentroids, useCIEDE2000: ciede2000Checkbox.checked } }, [img.data.buffer]);
    return;
  }
  // Animated GIF pipeline
  processBtn.disabled=true; processBtn.textContent='Processing GIF...';
  try {
    const locked = currentCentroids.filter((_,i)=>colorLocks[i]);
    if(locked.length > k){ alert('Locked colors exceed requested color count. Increase Colors or unlock some.'); processBtn.disabled=false; processBtn.textContent='Separate'; return; }
    // First frame: compute centroids
    const firstRes = await runWorkerOnce(gifFrames[0].imageData, { k, lockedCentroids: locked, seed });
    currentCentroids = firstRes.centroids.map(c=>[...c]);
    currentLayerData = firstRes.layers.map(l => new ImageData(new Uint8ClampedArray(l.buffer), l.width, l.height));
    currentImageDimensions = { width: firstRes.width, height: firstRes.height };
    renderResult();
    // All frames: classify using locked centroids
    perColorGifFrames = currentCentroids.map(()=>[]);
    const compositeFrames = [];
    for (let fi=0; fi<gifFrames.length; fi++){
      const res = await runWorkerOnce(gifFrames[fi].imageData, { k: currentCentroids.length, lockedCentroids: currentCentroids, seed });
      const layers = res.layers.map(l => new ImageData(new Uint8ClampedArray(l.buffer), l.width, l.height));
      for (let ci=0; ci<layers.length; ci++) perColorGifFrames[ci].push({ imageData: layers[ci], delayCs: gifFrames[fi].delayCs });
      // Build blended composite for this frame
      const c=document.createElement('canvas'); c.width=res.width; c.height=res.height; const bctx=c.getContext('2d');
      for (const layer of layers){ const lc=document.createElement('canvas'); lc.width=layer.width; lc.height=layer.height; lc.getContext('2d').putImageData(layer,0,0); bctx.drawImage(lc,0,0); }
      const frameImageData = bctx.getImageData(0,0,res.width,res.height);
  compositeFrames.push({ imageData: frameImageData, delayCs: gifFrames[fi].delayCs });
      if (fi===0){ currentLayerData = layers; currentImageDimensions = { width: res.width, height: res.height }; updateBlendedImage(); }
    }
    // Encode composite quantized GIF
    try{
      await importGifEnc();
      const enc = gifEnc.GIFEncoder();
      for (const fr of compositeFrames){
        const rgba = fr.imageData.data;
        const pal = gifEnc.quantize(rgba, 256, { format: 'rgba4444', oneBitAlpha: true, clearAlpha: true });
        const index = gifEnc.applyPalette(rgba, pal, 'rgba4444');
        // gifenc expects delay in ms
        enc.writeFrame(index, fr.imageData.width, fr.imageData.height, { palette: pal, delay: Math.round(fr.delayCs * 10), transparent: true, repeat: gifLoopCount||0, dispose: 2 });
      }
      enc.finish();
      const bytes = enc.bytes();
      if (processedGifUrl){ URL.revokeObjectURL(processedGifUrl); }
      processedGifUrl = URL.createObjectURL(new Blob([bytes], { type:'image/gif' }));
      const processedImageEl = document.getElementById('processed-image');
      if (processedImageEl){ processedImageEl.src = processedGifUrl; }
    }catch(e){ console.warn('Quantized GIF encoding failed', e); }
  } catch (err) {
    alert('GIF processing failed: ' + (err?.message || err));
  } finally {
    processBtn.disabled=false; processBtn.textContent='Separate';
  }
});

function renderResult(){
  resetResultUI();
  ensureColorLocksSize();
  const blended = buildBlendedCanvas();
  updateComparisonViews(blended);
  setupHighlightOverlay(blended.width, blended.height);
  buildPaletteUI();
  computeClusterCounts();
  updateStatsPanel(true);
}

function resetResultUI(){
  preview.style.display='none';
  layersEl.innerHTML='';
  paletteEl.innerHTML='';
  mergeSelection.clear();
  updateMergeButtonState();
  clusterPixelCounts=[];
  totalClusterPixels=0;
}

function ensureColorLocksSize(){
  if(colorLocks.length !== currentCentroids.length){
    colorLocks = currentCentroids.map((_,i)=>colorLocks[i]||false);
  }
}

function buildBlendedCanvas(){
  const blended=document.createElement('canvas');
  blended.width=currentImageDimensions.width;
  blended.height=currentImageDimensions.height;
  const bctx=blended.getContext('2d');
  for(const layer of currentLayerData){
    const c=document.createElement('canvas'); c.width=layer.width; c.height=layer.height; c.getContext('2d').putImageData(layer,0,0); bctx.drawImage(c,0,0);
  }
  return blended;
}

function updateComparisonViews(blended){
  /** @type {HTMLImageElement|null} */ const originalImageEl = document.getElementById('original-image');
  /** @type {HTMLImageElement|null} */ const processedImageEl = document.getElementById('processed-image');
  /** @type {HTMLElement|null} */ const slider = document.querySelector('img-comparison-slider');
  if(slider){
    slider.style.setProperty('aspect-ratio', `${blended.width} / ${blended.height}`);
    slider.style.setProperty('--intrinsic-width', `${blended.width}px`);
  }
  if(originalImageEl){ originalImageEl.style.setProperty('aspect-ratio', `${blended.width} / ${blended.height}`); }
  if(processedImageEl){ processedImageEl.style.setProperty('aspect-ratio', `${blended.width} / ${blended.height}`); }
  if (isAnimatedGif && originalGifUrl && originalImageEl){
    // Keep the original animated GIF playing
    originalImageEl.src = originalGifUrl;
  } else if(originalImage){
    const originalCanvas=document.createElement('canvas'); originalCanvas.width=blended.width; originalCanvas.height=blended.height; const octx=originalCanvas.getContext('2d'); if(octx) octx.drawImage(originalImage,0,0,blended.width, blended.height);
    if(originalImageEl){ originalImageEl.src=originalCanvas.toDataURL(); }
  }
  if (isAnimatedGif && processedGifUrl && processedImageEl){
    // Keep the processed animated GIF playing
    processedImageEl.src = processedGifUrl;
  } else if(processedImageEl){
    processedImageEl.src=blended.toDataURL();
  }
}

function buildPaletteUI(){
  for(let i=0;i<currentCentroids.length;i++){
    const col=currentCentroids[i]; const hex=rgbToHex(col[0],col[1],col[2]);
    const cont=document.createElement('div'); cont.className='swatch-container';
    const selectBox=document.createElement('div');
    selectBox.className='merge-select-box';
    selectBox.dataset.colorIndex=i;
    selectBox.textContent='+';
    if(mergeSelection.has(i)){
      selectBox.classList.add('selected');
    }
    const sw=document.createElement('div');
    sw.className='swatch';
    if(colorLocks[i]){ sw.classList.add('locked'); }
    sw.style.background=hex; sw.dataset.colorIndex=i; sw.title=`Click to change color (dbl-click lock): ${hex}`;
    const input=document.createElement('input'); input.type='color'; input.value=hex; input.dataset.colorIndex=i;
    sw.addEventListener('click', (ev)=>{ if(ev.shiftKey){ toggleMergeSelection(i); } else { input.click(); } });
    sw.addEventListener('dblclick', ()=> toggleLock(i));
    sw.addEventListener('mouseenter',()=>highlightColorRegion(i));
    sw.addEventListener('mouseleave',()=>hideHighlight());
    input.addEventListener('change',e=>{ updatePaletteColor(Number(e.target.dataset.colorIndex), e.target.value); });
    selectBox.addEventListener('click',(e)=>{ e.stopPropagation(); toggleMergeSelection(i); });
    cont.appendChild(selectBox); cont.appendChild(sw); cont.appendChild(input); paletteEl.appendChild(cont);
  }
}

function updatePaletteColor(index,newHex){
  const rgb=hexToRgb(newHex);
  if(!rgb) return;
  currentCentroids[index]=rgb;
  const layer=currentLayerData[index];
  const d=layer.data;
  for(let i=0;i<d.length;i+=4){
    if(d[i+3]>0){ d[i]=rgb[0]; d[i+1]=rgb[1]; d[i+2]=rgb[2]; }
  }
  const sw=document.querySelector(`.swatch[data-color-index="${index}"]`);
  if(sw) sw.style.background=newHex;
  updateBlendedImage();
}
paletteEl.addEventListener('change', e=>{ if(e.target.type==='color') updateStatsPanel(false); });

function toggleLock(i){ colorLocks[i]=!colorLocks[i]; const sw=document.querySelector(`.swatch[data-color-index="${i}"]`); if(sw) sw.classList.toggle('locked', colorLocks[i]); }

function toggleMergeSelection(i){
  if(mergeSelection.has(i)){
    mergeSelection.delete(i);
  } else {
    mergeSelection.add(i);
  }
  const box=document.querySelector(`.merge-select-box[data-color-index="${i}"]`);
  if(box){ box.classList.toggle('selected', mergeSelection.has(i)); }
  updateMergeButtonState();
}

function updateMergeButtonState(){ if(mergeBtn){ mergeBtn.disabled = mergeSelection.size < 2; } }

mergeBtn?.addEventListener('click', ()=>{
  if(mergeSelection.size < 2) return;
  const indices=[...mergeSelection].sort((a,b)=>a-b);
  const counts = indices.map(idx=>{
    const d=currentLayerData[idx].data; let c=0; for(let i=0;i<d.length;i+=4){ if(d[i+3]>0) c++; }
    return c||1;
  });
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

function updateBlendedImage(){ const blended=document.createElement('canvas'); blended.width=currentImageDimensions.width; blended.height=currentImageDimensions.height; const ctx=blended.getContext('2d'); for(const layer of currentLayerData){ const c=document.createElement('canvas'); c.width=layer.width; c.height=layer.height; c.getContext('2d').putImageData(layer,0,0); ctx.drawImage(c,0,0); } const processedEl=document.getElementById('processed-image'); if (!isAnimatedGif) processedEl.src=blended.toDataURL(); }

function setupHighlightOverlay(width,height){
  const overlay=document.getElementById('highlight-overlay');
  const processed=document.getElementById('processed-image');
  const setup=()=>{
    overlay.width=processed.offsetWidth; overlay.height=processed.offsetHeight;
    overlay.style.width=processed.offsetWidth+'px'; overlay.style.height=processed.offsetHeight+'px';
    overlay.style.position='absolute'; overlay.style.top='0'; overlay.style.left='0'; overlay.style.pointerEvents='none';
  };
  processed.onload=setup;
  if(processed.complete && processed.offsetWidth>0){ setup(); }
  window.addEventListener('resize', setup);
}

function buildHighlightMask(idx, highlightOpacity, otherOpacity){
  const { width, height } = currentImageDimensions;
  const mask = new ImageData(width, height);
  for (let i = 0; i < width * height; i++){
    const o = i * 4;
    let found = false;
    for (const [l, layer] of currentLayerData.entries()){
      const src = layer.data;
      if (src[o + 3] > 0){
        if (l === idx){
          mask.data[o] = src[o];
          mask.data[o + 1] = src[o + 1];
          mask.data[o + 2] = src[o + 2];
          mask.data[o + 3] = Math.round(255 * highlightOpacity);
        } else if (!found){
          mask.data[o] = src[o];
          mask.data[o + 1] = src[o + 1];
          mask.data[o + 2] = src[o + 2];
          mask.data[o + 3] = Math.round(255 * otherOpacity);
          found = true;
        }
      }
    }
    if (!found && mask.data[o + 3] === 0){
      mask.data[o] = 0; mask.data[o + 1] = 0; mask.data[o + 2] = 0; mask.data[o + 3] = 0;
    }
  }
  return mask;
}

function highlightColorRegion(idx, highlightOpacity = 1, otherOpacity = 0.1) {
  const overlay = document.getElementById('highlight-overlay');
  const processed = document.getElementById('processed-image');
  if (!overlay || !processed || !currentLayerData[idx]) return;
  const { width, height } = currentImageDimensions;
  overlay.width = width; overlay.height = height;
  const mask = buildHighlightMask(idx, highlightOpacity, otherOpacity);
  const processedCanvas = document.createElement('canvas'); processedCanvas.width = width; processedCanvas.height = height;
  const pctx = processedCanvas.getContext('2d'); if (pctx){ pctx.putImageData(mask, 0, 0); }
  // For animated GIF playback, do not replace the processed image src
  if (!isAnimatedGif){ processed.src = processedCanvas.toDataURL(); }
  const ctx = overlay.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, width, height); ctx.putImageData(mask, 0, 0); overlay.style.opacity = '1';
}

function buildFullMask(){
  const { width, height } = currentImageDimensions;
  const mask = new ImageData(width, height);
  for (let i = 0; i < width * height; i++){
    const o = i * 4;
    let found = false;
    for (const layer of currentLayerData){
      const src = layer.data;
      if (src[o + 3] > 0 && !found){
        mask.data[o] = src[o]; mask.data[o + 1] = src[o + 1]; mask.data[o + 2] = src[o + 2]; mask.data[o + 3] = 255; found = true;
      }
    }
    if (!found){ mask.data[o] = 0; mask.data[o + 1] = 0; mask.data[o + 2] = 0; mask.data[o + 3] = 0; }
  }
  return mask;
}

function hideHighlight() {
  const overlay = document.getElementById('highlight-overlay');
  const processed = document.getElementById('processed-image');
  if (!overlay || !processed || !currentLayerData.length) return;
  const { width, height } = currentImageDimensions;
  overlay.width = width; overlay.height = height;
  const mask = buildFullMask();
  const processedCanvas = document.createElement('canvas'); processedCanvas.width = width; processedCanvas.height = height;
  const pctx = processedCanvas.getContext('2d'); if (pctx){ pctx.putImageData(mask, 0, 0); }
  if (!isAnimatedGif){ processed.src = processedCanvas.toDataURL(); }
  overlay.style.opacity = '0';
}

// Expose for potential debugging
window._cspState = () => ({ currentCentroids, currentLayerData, currentImageDimensions });

// Stats helpers
function computeClusterCounts(){ const counts=new Array(currentCentroids.length).fill(0); let total=0; currentLayerData.forEach((layer,idx)=>{ const d=layer.data; for(let i=0;i<d.length;i+=4) if(d[i+3]>0){ counts[idx]++; total++; } }); clusterPixelCounts=counts; totalClusterPixels=total; }
function updateStatsPanel(_recalc){
  const statsEl = document.getElementById('clusterStats');
  if (!statsEl) return;
  const rows = currentCentroids.map((c, i) => {
    const pct = totalClusterPixels ? (clusterPixelCounts[i] / totalClusterPixels * 100) : 0;
    const lab = rgbToLab(c[0], c[1], c[2]);
    return { i, rgb: c, pct, lab };
  });
  let html = '<table><caption>Cluster Stats</caption><thead><tr><th>#</th><th>Color</th><th>Hex</th><th>Size</th><th>%</th><th>L*</th><th>a*</th><th>b*</th></tr></thead><tbody>';
  rows.forEach(r => {
    const hex = rgbToHex(r.rgb[0], r.rgb[1], r.rgb[2]);
    html += `<tr><td>${r.i}</td><td class="cluster-swatch-cell"><div class="cluster-swatch-mini" style="background:${hex}"></div></td><td>${hex}</td><td>${clusterPixelCounts[r.i]}</td><td>${r.pct.toFixed(2)}</td><td>${r.lab[0].toFixed(1)}</td><td>${r.lab[1].toFixed(1)}</td><td>${r.lab[2].toFixed(1)}</td></tr>`;
  });
  html += '</tbody></table>';
  statsEl.innerHTML = html;
}
