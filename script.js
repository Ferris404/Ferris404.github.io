// Utilities
const qs = s => document.querySelector(s);
const fileInput = qs('#file');
const preview = qs('#preview');
const colorsRange = qs('#colors');
const colorsVal = qs('#colorsVal');
const processBtn = qs('#process');
const layersEl = qs('#layers');
const paletteEl = qs('#palette');
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
const randomSeedCheckbox = qs('#randomSeed');
const seedInput = qs('#seed');
const seedVal = qs('#seedVal');
const downloadBtn = qs('#download');

colorsRange.addEventListener('input', () => colorsVal.textContent = colorsRange.value);
strayPixelSizeRange.addEventListener('input', () => strayPixelSizeVal.textContent = strayPixelSizeRange.value);
blurStrengthRange.addEventListener('input', () => blurStrengthVal.textContent = blurStrengthRange.value);
seedInput.addEventListener('input', () => seedVal.textContent = seedInput.value);

downsampleChk.addEventListener('change', () => {
  downsampleOptions.style.display = downsampleChk.checked ? 'block' : 'none';
});
// Set initial state
downsampleOptions.style.display = downsampleChk.checked ? 'block' : 'none';

downloadBtn.addEventListener('click', async () => {
  if (!currentLayerData || currentLayerData.length === 0) {
    alert('Please process an image first to generate layers.');
    return;
  }

  const zip = new JSZip();
  const folder = zip.folder("layers");

  for (let i = 0; i < currentLayerData.length; i++) {
    const layer = currentLayerData[i];
    const centroid = currentCentroids[i];
    const hex = rgbToHex(centroid[0], centroid[1], centroid[2]);
    const filename = `${hex}.png`;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = layer.width;
    tempCanvas.height = layer.height;
    tempCanvas.getContext('2d').putImageData(layer, 0, 0);

    const blob = await new Promise(resolve => tempCanvas.toBlob(resolve, 'image/png'));
    folder.file(filename, blob);
  }

  zip.generateAsync({ type: "blob" }).then(content => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(content);
    a.download = 'color-layers.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
});

// Handle random seed checkbox
randomSeedCheckbox.addEventListener('change', () => {
  seedInput.disabled = randomSeedCheckbox.checked;
  if (randomSeedCheckbox.checked) {
    // Generate a new random seed when enabling random mode
    const newSeed = Math.floor(Math.random() * 1000000);
    seedInput.value = newSeed;
    seedVal.textContent = newSeed;
  }
});

let originalImage = null;
let currentCentroids = [];
let currentLayerData = [];
let currentImageDimensions = { width: 0, height: 0 };

// Seeded random number generator for reproducible results
class SeededRandom {
  constructor(seed) {
    this.seed = seed % 2147483647;
    if (this.seed <= 0) this.seed += 2147483646;
  }
  
  next() {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }
  
  // Get random integer between min (inclusive) and max (exclusive)
  randInt(min, max) {
    return Math.floor(this.next() * (max - min)) + min;
  }
}

// Global random number generator
let rng = new SeededRandom(12345);

// Function to get current seed and update RNG
function getCurrentSeed() {
  const seed = randomSeedCheckbox.checked ? 
    Math.floor(Math.random() * 1000000) : 
    Number(seedInput.value);
  
  rng = new SeededRandom(seed);
  
  if (randomSeedCheckbox.checked) {
    seedInput.value = seed;
    seedVal.textContent = seed;
  }
  
  return seed;
}

// Color space conversion functions. i have no clue how this shit works, its math
function rgbToLab(r, g, b) {
  // Convert RGB to XYZ first
  r = r / 255;
  g = g / 255;
  b = b / 255;
  
  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
  
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1.00000;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  
  const fx = x > 0.008856 ? Math.pow(x, 1/3) : (7.787 * x + 16/116);
  const fy = y > 0.008856 ? Math.pow(y, 1/3) : (7.787 * y + 16/116);
  const fz = z > 0.008856 ? Math.pow(z, 1/3) : (7.787 * z + 16/116);
  
  const L = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const B = 200 * (fy - fz);
  
  return [L, a, B];
}

function labToRgb(L, a, b) {
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;
  
  const x = fx > 0.206893 ? Math.pow(fx, 3) : (fx - 16/116) / 7.787;
  const y = fy > 0.206893 ? Math.pow(fy, 3) : (fy - 16/116) / 7.787;
  const z = fz > 0.206893 ? Math.pow(fz, 3) : (fz - 16/116) / 7.787;
  
  const X = x * 0.95047;
  const Y = y * 1.00000;
  const Z = z * 1.08883;
  
  let R = X * 3.2406 + Y * -1.5372 + Z * -0.4986;
  let G = X * -0.9689 + Y * 1.8758 + Z * 0.0415;
  let B = X * 0.0557 + Y * -0.2040 + Z * 1.0570;
  
  R = R > 0.0031308 ? 1.055 * Math.pow(R, 1/2.4) - 0.055 : 12.92 * R;
  G = G > 0.0031308 ? 1.055 * Math.pow(G, 1/2.4) - 0.055 : 12.92 * G;
  B = B > 0.0031308 ? 1.055 * Math.pow(B, 1/2.4) - 0.055 : 12.92 * B;
  
  return [
    Math.max(0, Math.min(255, Math.round(R * 255))),
    Math.max(0, Math.min(255, Math.round(G * 255))),
    Math.max(0, Math.min(255, Math.round(B * 255)))
  ];
}

function rgbToHsv(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;
  
  let h = 0;
  if (diff !== 0) {
    if (max === r) h = ((g - b) / diff) % 6;
    else if (max === g) h = (b - r) / diff + 2;
    else h = (r - g) / diff + 4;
  }
  h = (h * 60 + 360) % 360;
  
  const s = max === 0 ? 0 : diff / max;
  const v = max;
  
  return [h, s * 100, v * 100];
}

function hsvToRgb(h, s, v) {
  h /= 60;
  s /= 100;
  v /= 100;
  
  const c = v * s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const m = v - c;
  
  let r, g, b;
  if (h < 1) [r, g, b] = [c, x, 0];
  else if (h < 2) [r, g, b] = [x, c, 0];
  else if (h < 3) [r, g, b] = [0, c, x];
  else if (h < 4) [r, g, b] = [0, x, c];
  else if (h < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255)
  ];
}

function convertColorSpace(data, fromSpace, toSpace) {
  if (fromSpace === toSpace) return data;
  
  const converted = new Float32Array(data.length);
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    
    let convertedColor;
    
    if (toSpace === 'lab') {
      convertedColor = rgbToLab(r, g, b);
    } else if (toSpace === 'hsv') {
      convertedColor = rgbToHsv(r, g, b);
    } else if (toSpace === 'xyz') {
      // Simple XYZ conversion (part of RGB to LAB)
      const [L, A, B] = rgbToLab(r, g, b);
      convertedColor = [L, A, B]; // Using LAB as proxy for XYZ
    } else {
      convertedColor = [r, g, b]; // RGB
    }
    
    converted[i] = convertedColor[0];
    converted[i + 1] = convertedColor[1];
    converted[i + 2] = convertedColor[2];
    converted[i + 3] = a;
  }
  
  return converted;
}

function convertBackToRgb(data, fromSpace) {
  if (fromSpace === 'rgb') return data;
  
  const converted = new Uint8ClampedArray(data.length);
  
  for (let i = 0; i < data.length; i += 4) {
    const c1 = data[i];
    const c2 = data[i + 1];
    const c3 = data[i + 2];
    const a = data[i + 3];
    
    let rgbColor;
    
    if (fromSpace === 'lab') {
      rgbColor = labToRgb(c1, c2, c3);
    } else if (fromSpace === 'hsv') {
      rgbColor = hsvToRgb(c1, c2, c3);
    } else if (fromSpace === 'xyz') {
      rgbColor = labToRgb(c1, c2, c3); // Using LAB conversion
    } else {
      rgbColor = [c1, c2, c3];
    }
    
    converted[i] = rgbColor[0];
    converted[i + 1] = rgbColor[1];
    converted[i + 2] = rgbColor[2];
    converted[i + 3] = a;
  }
  
  return converted;
}

// Advanced preprocessing filters
function applyBilateralFilter(imageData, sigmaColor = 25, sigmaSpace = 7) {
  const data = imageData.data;
  const w = imageData.width;
  const h = imageData.height;
  const result = new Uint8ClampedArray(data.length);
  const radius = Math.ceil(sigmaSpace * 2);
  
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      
      if (data[i + 3] === 0) {
        result[i + 3] = 0;
        continue;
      }
      
      let totalWeight = 0;
      let sumR = 0, sumG = 0, sumB = 0;
      
      const centerR = data[i];
      const centerG = data[i + 1];
      const centerB = data[i + 2];
      
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            const ni = (ny * w + nx) * 4;
            
            if (data[ni + 3] > 0) {
              const neighborR = data[ni];
              const neighborG = data[ni + 1];
              const neighborB = data[ni + 2];
              
              // Spatial weight
              const spatialDist = Math.sqrt(dx * dx + dy * dy);
              const spatialWeight = Math.exp(-(spatialDist * spatialDist) / (2 * sigmaSpace * sigmaSpace));
              
              // Color weight
              const colorDist = Math.sqrt(
                (centerR - neighborR) ** 2 +
                (centerG - neighborG) ** 2 +
                (centerB - neighborB) ** 2
              );
              const colorWeight = Math.exp(-(colorDist * colorDist) / (2 * sigmaColor * sigmaColor));
              
              const weight = spatialWeight * colorWeight;
              totalWeight += weight;
              
              sumR += neighborR * weight;
              sumG += neighborG * weight;
              sumB += neighborB * weight;
            }
          }
        }
      }
      
      if (totalWeight > 0) {
        result[i] = Math.round(sumR / totalWeight);
        result[i + 1] = Math.round(sumG / totalWeight);
        result[i + 2] = Math.round(sumB / totalWeight);
        result[i + 3] = data[i + 3];
      } else {
        result[i] = data[i];
        result[i + 1] = data[i + 1];
        result[i + 2] = data[i + 2];
        result[i + 3] = data[i + 3];
      }
    }
  }
  
  return new ImageData(result, w, h);
}

function applyMedianFilter(imageData, radius = 2) {
  const data = imageData.data;
  const w = imageData.width;
  const h = imageData.height;
  const result = new Uint8ClampedArray(data.length);
  
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      
      if (data[i + 3] === 0) {
        result[i + 3] = 0;
        continue;
      }
      
      const rValues = [];
      const gValues = [];
      const bValues = [];
      
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            const ni = (ny * w + nx) * 4;
            
            if (data[ni + 3] > 0) {
              rValues.push(data[ni]);
              gValues.push(data[ni + 1]);
              bValues.push(data[ni + 2]);
            }
          }
        }
      }
      
      if (rValues.length > 0) {
        rValues.sort((a, b) => a - b);
        gValues.sort((a, b) => a - b);
        bValues.sort((a, b) => a - b);
        
        const mid = Math.floor(rValues.length / 2);
        result[i] = rValues[mid];
        result[i + 1] = gValues[mid];
        result[i + 2] = bValues[mid];
        result[i + 3] = data[i + 3];
      } else {
        result[i] = data[i];
        result[i + 1] = data[i + 1];
        result[i + 2] = data[i + 2];
        result[i + 3] = data[i + 3];
      }
    }
  }
  
  return new ImageData(result, w, h);
}

// Octree quantization algorithm
function octreeQuantize(data, k, w, h) {
  class OctreeNode {
    constructor(level = 0) {
      this.level = level;
      this.children = new Array(8).fill(null);
      this.isLeaf = level === 7;
      this.pixelCount = 0;
      this.red = 0;
      this.green = 0;
      this.blue = 0;
    }
    
    addColor(r, g, b) {
      this.pixelCount++;
      this.red += r;
      this.green += g;
      this.blue += b;
      
      if (!this.isLeaf) {
        const index = this.getChildIndex(r, g, b);
        if (!this.children[index]) {
          this.children[index] = new OctreeNode(this.level + 1);
        }
        this.children[index].addColor(r, g, b);
      }
    }
    
    getChildIndex(r, g, b) {
      const shift = 7 - this.level;
      return ((r >> shift) & 1) << 2 | ((g >> shift) & 1) << 1 | ((b >> shift) & 1);
    }
    
    getLeaves() {
      if (this.isLeaf) {
        return [this];
      }
      
      const leaves = [];
      for (const child of this.children) {
        if (child) {
          leaves.push(...child.getLeaves());
        }
      }
      return leaves;
    }
    
    getColor() {
      return [
        Math.round(this.red / this.pixelCount),
        Math.round(this.green / this.pixelCount),
        Math.round(this.blue / this.pixelCount)
      ];
    }
  }
  
  const root = new OctreeNode();
  
  // Add all colors to octree
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 0) {
      root.addColor(data[i], data[i + 1], data[i + 2]);
    }
  }
  
  // Get all leaf nodes and sort by pixel count
  const leaves = root.getLeaves().sort((a, b) => b.pixelCount - a.pixelCount);
  
  // Take the k most frequent colors
  const centroids = leaves.slice(0, k).map(leaf => leaf.getColor());
  
  renderLayers(centroids, buildLayerData(data, centroids, w, h));
}

function handleFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    console.warn('Not an image file:', file);
    // You might want to show a user-friendly error message here
    return;
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    originalImage = img;
    preview.style.display = 'block'; // Show the preview canvas for new images
    drawPreview(img);
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

fileInput.addEventListener('change', e => {
  const f = e.target.files && e.target.files[0];
  if (f) {
    handleFile(f);
  }
});

// --- Drag & Drop and Paste Functionality ---

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

// Add event listeners for drag and drop
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  document.body.addEventListener(eventName, preventDefaults, false);
});

let dragCounter = 0;
document.body.addEventListener('dragenter', () => {
  dragCounter++;
  document.body.classList.add('drag-over');
});

document.body.addEventListener('dragleave', () => {
  dragCounter--;
  if (dragCounter === 0) {
    document.body.classList.remove('drag-over');
  }
});

document.body.addEventListener('drop', e => {
  dragCounter = 0;
  document.body.classList.remove('drag-over');
  const dt = e.dataTransfer;
  const files = dt.files;
  if (files.length > 0) {
    handleFile(files[0]);
  }
});

// Add event listener for pasting images
window.addEventListener('paste', e => {
  const items = (e.clipboardData || e.originalEvent.clipboardData).items;
  for (const item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) {
        handleFile(file);
      }
      break; // Handle the first image file found
    }
  }
});

function drawPreview(img) {
  const ctx = preview.getContext('2d', { willReadFrequently: true });
  const max = Number(downsampleSizeInput.value); // clamp big images
  let w = img.naturalWidth, h = img.naturalHeight;
  if (downsampleChk.checked && Math.max(w, h) > max) {
    const scale = max / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }
  preview.width = w;
  preview.height = h;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
}

processBtn.addEventListener('click', async () => {
  if (!originalImage) {
    alert('Choose an image first');
    return;
  }
  
  // Initialize the random seed for reproducible results
  const currentSeed = getCurrentSeed();
  console.log(`Using seed: ${currentSeed}`);
  
  drawPreview(originalImage);
  const k = Number(colorsRange.value);
  if (k < 1) {
    alert('Please enter a valid number of colors greater than 0.');
    return;
  }

  const algorithm = document.getElementById('algorithm').value;

  processBtn.disabled = true;
  processBtn.textContent = 'Processing...';
  try {
    await vectorizeAndQuantize(preview, k, algorithm);
  } finally {
    processBtn.disabled = false;
    processBtn.textContent = 'Separate';
  }
});

function seededRandom(seed) {
  let s = seed % 2147483647;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

async function separateColorsKMeans(canvas, k) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const w = canvas.width, h = canvas.height;
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;

  // Seeded random generator
  const random = seededRandom(42); // Use a fixed seed for reproducibility

  // K-Means++ Initialization
  const samples = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = data[i + 3];
      if (a < 10) continue;
      samples.push([data[i], data[i + 1], data[i + 2]]);
    }
  }

  const centroids = [samples[Math.floor(random() * samples.length)]];
  while (centroids.length < k) {
    const distances = samples.map(sample => {
      return Math.min(...centroids.map(centroid => {
        return (sample[0] - centroid[0]) ** 2 + (sample[1] - centroid[1]) ** 2 + (sample[2] - centroid[2]) ** 2;
      }));
    });

    const totalDistance = distances.reduce((sum, d) => sum + d, 0);
    const probabilities = distances.map(d => d / totalDistance);

    let cumulativeProbability = 0;
    const rand = random();
    for (let i = 0; i < probabilities.length; i++) {
      cumulativeProbability += probabilities[i];
      if (rand < cumulativeProbability) {
        centroids.push(samples[i]);
        break;
      }
    }
  }

  const maxIter = 10;
  const labels = new Int32Array(samples.length);
  for (let iter = 0; iter < maxIter; iter++) {
    for (let i = 0; i < samples.length; i++) {
      const p = samples[i];
      let best = 0, bd = Infinity;
      for (let c = 0; c < k; c++) {
        const cc = centroids[c];
        const d = (p[0] - cc[0]) ** 2 + (p[1] - cc[1]) ** 2 + (p[2] - cc[2]) ** 2;
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      labels[i] = best;
    }

    const sums = new Array(k).fill(0).map(() => [0, 0, 0, 0]);
    for (let i = 0; i < samples.length; i++) {
      const lab = labels[i];
      const p = samples[i];
      sums[lab][0] += p[0];
      sums[lab][1] += p[1];
      sums[lab][2] += p[2];
      sums[lab][3]++;
    }

    let changed = false;
    for (let c = 0; c < k; c++) {
      if (sums[c][3] === 0) continue;
      const nx = Math.round(sums[c][0] / sums[c][3]);
      const ny = Math.round(sums[c][1] / sums[c][3]);
      const nz = Math.round(sums[c][2] / sums[c][3]);
      const cc = centroids[c];
      if (cc[0] !== nx || cc[1] !== ny || cc[2] !== nz) {
        centroids[c] = [nx, ny, nz];
        changed = true;
      }
    }
    if (!changed) break;
  }

  renderLayers(centroids, buildLayerData(data, centroids, w, h));
}

async function separateColorsMedianCut(canvas, k) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const w = canvas.width, h = canvas.height;
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;

  function medianCut(data, k) {
    const pixels = [];
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 10) {
        pixels.push([data[i], data[i + 1], data[i + 2]]);
      }
    }

    function splitBox(box) {
      const axis = box.axis;
      box.pixels.sort((a, b) => a[axis] - b[axis]);
      const mid = Math.floor(box.pixels.length / 2);
      const box1 = { pixels: box.pixels.slice(0, mid), axis: (axis + 1) % 3 };
      const box2 = { pixels: box.pixels.slice(mid), axis: (axis + 1) % 3 };
      return [box1, box2];
    }

    let boxes = [{ pixels, axis: 0 }];
    while (boxes.length < k) {
      boxes = boxes.flatMap(splitBox);
    }

    return boxes.map(box => {
      const avg = box.pixels.reduce((acc, p) => {
        acc[0] += p[0];
        acc[1] += p[1];
        acc[2] += p[2];
        return acc;
      }, [0, 0, 0]);
      return avg.map(v => Math.round(v / box.pixels.length));
    });
  }

  const centroids = medianCut(data, k);
  renderLayers(centroids, buildLayerData(data, centroids, w, h));
}

function buildLayerData(data, centroids, w, h) {
  const k = centroids.length;
  const layerData = new Array(k).fill(0).map(() => new ImageData(w, h));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = data[i + 3];
      if (a < 10) {
        for (let c = 0; c < k; c++) {
          layerData[c].data[i + 3] = 0;
        }
        continue;
      }
      const r = data[i], g = data[i + 1], b = data[i + 2];
      let best = 0, bd = Infinity;
      for (let c = 0; c < k; c++) {
        const cc = centroids[c];
        const d = (r - cc[0]) ** 2 + (g - cc[1]) ** 2 + (b - cc[2]) ** 2;
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      for (let c = 0; c < k; c++) {
        const ld = layerData[c].data;
        if (c === best) {
          ld[i] = centroids[c][0];
          ld[i + 1] = centroids[c][1];
          ld[i + 2] = centroids[c][2];
          ld[i + 3] = 255;
        } else {
          ld[i + 3] = 0;
        }
      }
    }
  }
  return layerData;
}

function renderLayers(centroids, layerData) {
  // Store current data for interactive editing
  currentCentroids = centroids.map(c => [...c]); // Deep copy
  currentLayerData = layerData;
  currentImageDimensions = { width: layerData[0].width, height: layerData[0].height };
  
  // Hide the preview canvas after processing
  preview.style.display = 'none';
  
  layersEl.innerHTML = ''; paletteEl.innerHTML = '';

  // Create a single canvas to blend all layers
  const blendedCanvas = document.createElement('canvas');
  const blendedCtx = blendedCanvas.getContext('2d');
  blendedCanvas.width = layerData[0].width;
  blendedCanvas.height = layerData[0].height;

  // Blend each layer on the canvas
  for (let c = 0; c < layerData.length; c++) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = layerData[c].width;
    tempCanvas.height = layerData[c].height;
    tempCanvas.getContext('2d').putImageData(layerData[c], 0, 0);
    blendedCtx.drawImage(tempCanvas, 0, 0);
  }

  // Update comparison slider
  const originalImageEl = document.getElementById('original-image');
  const processedImageEl = document.getElementById('processed-image');

  const originalCanvas = document.createElement('canvas');
  originalCanvas.width = blendedCanvas.width;
  originalCanvas.height = blendedCanvas.height;
  originalCanvas.getContext('2d').drawImage(originalImage, 0, 0, blendedCanvas.width, blendedCanvas.height);

  originalImageEl.src = originalCanvas.toDataURL();
  processedImageEl.src = blendedCanvas.toDataURL();

  // Setup highlight overlay
  setupHighlightOverlay(blendedCanvas.width, blendedCanvas.height);

  // Interactive Palette
  for (let c = 0; c < centroids.length; c++) {
    const col = centroids[c];
    const hex = rgbToHex(col[0], col[1], col[2]);
    
    const swatchContainer = document.createElement('div');
    swatchContainer.className = 'swatch-container';
    
    const sw = document.createElement('div');
    sw.className = 'swatch';
    sw.style.background = hex;
    sw.title = `Click to change color: ${hex}`;
    sw.style.cursor = 'pointer';
    sw.dataset.colorIndex = c;
    
    // Create positioned color input
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = hex;
    colorInput.dataset.colorIndex = c;
    
    // Add click event to swatch
    sw.addEventListener('click', () => {
      colorInput.click();
    });
    
    // Add hover events for color highlighting
    sw.addEventListener('mouseenter', () => {
      highlightColorRegion(c);
    });
    
    sw.addEventListener('mouseleave', () => {
      hideHighlight();
    });
    
    // Add change event to color input
    colorInput.addEventListener('change', (e) => {
      const newColor = e.target.value;
      const colorIndex = parseInt(e.target.dataset.colorIndex);
      updatePaletteColor(colorIndex, newColor);
    });
    
    swatchContainer.appendChild(sw);
    swatchContainer.appendChild(colorInput);
    paletteEl.appendChild(swatchContainer);
  }
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16)
  ] : null;
}

function updatePaletteColor(colorIndex, newHexColor) {
  console.log(`Updating color ${colorIndex} to ${newHexColor}`);
  
  const newRgb = hexToRgb(newHexColor);
  if (!newRgb) return;
  
  // Update the centroid
  currentCentroids[colorIndex] = newRgb;
  
  // Update the corresponding layer data
  const layerData = currentLayerData[colorIndex];
  const data = layerData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 0) { // Only update non-transparent pixels
      data[i] = newRgb[0];     // Red
      data[i + 1] = newRgb[1]; // Green
      data[i + 2] = newRgb[2]; // Blue
      // Keep alpha unchanged
    }
  }
  
  // Update the swatch appearance
  const swatch = document.querySelector(`[data-color-index="${colorIndex}"]`);
  if (swatch && swatch.classList.contains('swatch')) {
    swatch.style.background = newHexColor;
    swatch.title = `Click to change color: ${newHexColor}`;
  }
  
  // Regenerate the blended image and update comparison slider
  updateBlendedImage();
}

function updateBlendedImage() {
  // Create a new blended canvas
  const blendedCanvas = document.createElement('canvas');
  const blendedCtx = blendedCanvas.getContext('2d');
  blendedCanvas.width = currentImageDimensions.width;
  blendedCanvas.height = currentImageDimensions.height;

  // Blend all layers
  for (let c = 0; c < currentLayerData.length; c++) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = currentLayerData[c].width;
    tempCanvas.height = currentLayerData[c].height;
    tempCanvas.getContext('2d').putImageData(currentLayerData[c], 0, 0);
    blendedCtx.drawImage(tempCanvas, 0, 0);
  }

  // Update the processed image in comparison slider
  const processedImageEl = document.getElementById('processed-image');
  processedImageEl.src = blendedCanvas.toDataURL();
  
  console.log('Updated blended image with new colors');
}

function setupHighlightOverlay(width, height) {
  const highlightOverlay = document.getElementById('highlight-overlay');
  const processedImage = document.getElementById('processed-image');
  
  if (highlightOverlay && processedImage) {
    // Function to set up overlay positioning
    const setupOverlay = () => {
      const displayWidth = processedImage.offsetWidth;
      const displayHeight = processedImage.offsetHeight;
      
      // Set canvas size to match processed image display size
      highlightOverlay.width = displayWidth;
      highlightOverlay.height = displayHeight;
      
      // Position overlay to match processed image exactly
      highlightOverlay.style.width = displayWidth + 'px';
      highlightOverlay.style.height = displayHeight + 'px';
      highlightOverlay.style.position = 'absolute';
      highlightOverlay.style.top = '0';
      highlightOverlay.style.left = '0';
      highlightOverlay.style.pointerEvents = 'none';
    };
    
    // Set up when image loads
    processedImage.onload = setupOverlay;
    
    // If image is already loaded, set up immediately
    if (processedImage.complete && processedImage.offsetWidth > 0) {
      setupOverlay();
    }
    
    // Also listen for resize events
    window.addEventListener('resize', setupOverlay);
  }
}

function highlightColorRegion(colorIndex) {
  const highlightOverlay = document.getElementById('highlight-overlay');
  const processedImage = document.getElementById('processed-image');
  if (!highlightOverlay || !processedImage || !currentLayerData[colorIndex]) return;
  
  const ctx = highlightOverlay.getContext('2d');
  const layerData = currentLayerData[colorIndex];
  const width = currentImageDimensions.width;
  const height = currentImageDimensions.height;
  
  // Get the display dimensions of the processed image
  const rect = processedImage.getBoundingClientRect();
  const displayWidth = processedImage.offsetWidth;
  const displayHeight = processedImage.offsetHeight;
  
  // Calculate scaling factors
  const scaleX = displayWidth / width;
  const scaleY = displayHeight / height;
  
  // Set the canvas size to match the display size
  highlightOverlay.width = displayWidth;
  highlightOverlay.height = displayHeight;
  
  // Clear the overlay
  ctx.clearRect(0, 0, displayWidth, displayHeight);
  
  // Scale the context to match the image data
  ctx.scale(scaleX, scaleY);
  
  // Create outline by detecting edges with thicker border
  const outlineData = new ImageData(width, height);
  const outline = outlineData.data;
  const original = layerData.data;
  
  // Create a temporary mask for the selected color
  const colorMask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      colorMask[y * width + x] = original[i + 3] > 0 ? 1 : 0;
    }
  }
  
  // Dilate the mask to create a thicker outline
  const outlineThickness = 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      
      if (colorMask[y * width + x] === 1) { // Current pixel belongs to this color
        // Check if this pixel is near the edge
        let isNearEdge = false;
        
        // Check in a radius around the pixel
        for (let dy = -outlineThickness; dy <= outlineThickness; dy++) {
          for (let dx = -outlineThickness; dx <= outlineThickness; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              if (colorMask[ny * width + nx] === 0) { // Neighbor doesn't belong to this color
                isNearEdge = true;
                break;
              }
            } else {
              // Outside image bounds, consider as edge
              isNearEdge = true;
              break;
            }
          }
          if (isNearEdge) break;
        }
        
        if (isNearEdge) {
          // Draw white outline with slight glow effect
          outline[i] = 255;     // Red
          outline[i + 1] = 255; // Green  
          outline[i + 2] = 255; // Blue
          outline[i + 3] = 200; // Alpha (slightly transparent for glow)
        }
      }
    }
  }
  
  // Draw the outline
  ctx.putImageData(outlineData, 0, 0);
  
  // Add a subtle glow effect
  ctx.shadowColor = 'white';
  ctx.shadowBlur = 2;
  ctx.drawImage(highlightOverlay, 0, 0);
  ctx.shadowBlur = 0;
  
  // Show the overlay with animation
  highlightOverlay.style.opacity = '1';
}

function hideHighlight() {
  const highlightOverlay = document.getElementById('highlight-overlay');
  if (highlightOverlay) {
    highlightOverlay.style.opacity = '0';
  }
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

function downloadCanvas(canvas, name) {
  canvas.toBlob(b => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, 'image/png');
}

async function vectorizeAndQuantize(canvas, k, algorithm) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const w = canvas.width, h = canvas.height;
  const img = ctx.getImageData(0, 0, w, h);
  let data = img.data;

  // Step 1: Apply preprocessing filter
  const preprocessing = preprocessingSelect.value;
  const blurStrength = Number(blurStrengthRange.value);
  
  console.log(`Applying preprocessing: ${preprocessing} with blur strength: ${blurStrength}`);
  
  let processedImageData = img;
  
  if (preprocessing === 'blur') {
    processedImageData = applyGaussianBlurToImageData(processedImageData, blurStrength);
  } else if (preprocessing === 'bilateral') {
    processedImageData = applyBilateralFilter(processedImageData, 25, blurStrength);
  } else if (preprocessing === 'median') {
    processedImageData = applyMedianFilter(processedImageData, Math.ceil(blurStrength));
  }
  
  data = processedImageData.data;

  // Step 2: Convert to selected color space for better quantization
  const colorSpace = colorSpaceSelect.value;
  const usePerceptualWeighting = perceptualWeightingCheckbox.checked;
  
  console.log(`Using color space: ${colorSpace}, perceptual weighting: ${usePerceptualWeighting}`);
  
  let workingData = data;
  if (colorSpace !== 'rgb') {
    workingData = convertColorSpace(data, 'rgb', colorSpace);
  }
  
  // Step 3: Quantize colors using selected algorithm
  let centroids;
  console.log(`Quantizing with algorithm: ${algorithm}`);
  
  if (algorithm === 'octree') {
    // Convert back to RGB for octree (it works in RGB space)
    const rgbData = colorSpace !== 'rgb' ? convertBackToRgb(workingData, colorSpace) : workingData;
    return octreeQuantize(rgbData, k, w, h);
  } else if (algorithm === 'lab') {
    // Force LAB color space for LAB K-Means
    const labData = convertColorSpace(data, 'rgb', 'lab');
    centroids = await quantizeColorsKMeansAdvanced(labData, k, 'lab', usePerceptualWeighting);
    // Convert centroids back to RGB
    centroids = centroids.map(centroid => labToRgb(centroid[0], centroid[1], centroid[2]));
  } else if (algorithm === 'kmeans') {
    centroids = await quantizeColorsKMeansAdvanced(workingData, k, colorSpace, usePerceptualWeighting);
    // Convert centroids back to RGB if needed
    if (colorSpace !== 'rgb') {
      centroids = centroids.map(centroid => {
        const rgb = convertBackToRgb([centroid[0], centroid[1], centroid[2], 255], colorSpace);
        return [rgb[0], rgb[1], rgb[2]];
      });
    }
  } else if (algorithm === 'medianCut') {
    // Median cut works best in RGB space
    const rgbData = colorSpace !== 'rgb' ? convertBackToRgb(workingData, colorSpace) : workingData;
    centroids = quantizeColorsMedianCut(rgbData, k);
  }

  // Step 4: Create smooth vector-like representation
  const vectorizedData = createVectorizedRepresentation(data, centroids, w, h);
  
  // Step 5: Render result
  renderVectorizedLayers(centroids, vectorizedData, w, h);
}

function applyGaussianBlurToImageData(imageData, sigma) {
  const data = imageData.data;
  const w = imageData.width;
  const h = imageData.height;
  const result = new Uint8ClampedArray(data.length);
  
  const radius = Math.ceil(sigma * 3);
  const kernel = [];
  let kernelSum = 0;
  
  // Generate Gaussian kernel
  for (let i = -radius; i <= radius; i++) {
    const value = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel.push(value);
    kernelSum += value;
  }
  
  // Normalize kernel
  for (let i = 0; i < kernel.length; i++) {
    kernel[i] /= kernelSum;
  }
  
  // Horizontal pass
  const temp = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      
      if (data[i + 3] === 0) {
        temp[i + 3] = 0;
        continue;
      }
      
      let sumR = 0, sumG = 0, sumB = 0, sumA = 0;
      
      for (let k = 0; k < kernel.length; k++) {
        const nx = x + k - radius;
        const ni = (y * w + Math.max(0, Math.min(w - 1, nx))) * 4;
        
        if (data[ni + 3] > 0) {
          sumR += data[ni] * kernel[k];
          sumG += data[ni + 1] * kernel[k];
          sumB += data[ni + 2] * kernel[k];
          sumA += data[ni + 3] * kernel[k];
        }
      }
      
      temp[i] = Math.round(sumR);
      temp[i + 1] = Math.round(sumG);
      temp[i + 2] = Math.round(sumB);
      temp[i + 3] = Math.round(sumA);
    }
  }
  
  // Vertical pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      
      if (temp[i + 3] === 0) {
        result[i + 3] = 0;
        continue;
      }
      
      let sumR = 0, sumG = 0, sumB = 0, sumA = 0;
      
      for (let k = 0; k < kernel.length; k++) {
        const ny = y + k - radius;
        const ni = (Math.max(0, Math.min(h - 1, ny)) * w + x) * 4;
        
        if (temp[ni + 3] > 0) {
          sumR += temp[ni] * kernel[k];
          sumG += temp[ni + 1] * kernel[k];
          sumB += temp[ni + 2] * kernel[k];
          sumA += temp[ni + 3] * kernel[k];
        }
      }
      
      result[i] = Math.round(sumR);
      result[i + 1] = Math.round(sumG);
      result[i + 2] = Math.round(sumB);
      result[i + 3] = Math.round(sumA);
    }
  }
  
  return new ImageData(result, w, h);
}

async function quantizeColorsKMeansAdvanced(data, k, colorSpace = 'rgb', usePerceptualWeighting = true) {
  const pixels = [];
  
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 0) {
      let pixel = [data[i], data[i + 1], data[i + 2]];
      
      // Apply perceptual weighting for RGB
      if (usePerceptualWeighting && colorSpace === 'rgb') {
        // Human eye is more sensitive to green, less to blue
        pixel = [pixel[0] * 0.299, pixel[1] * 0.587, pixel[2] * 0.114];
      }
      
      pixels.push(pixel);
    }
  }
  
  if (pixels.length === 0) return [];
  
  // K-Means++ initialization for better starting centroids
  const centroids = [];
  centroids.push(pixels[rng.randInt(0, pixels.length)]);
  
  for (let c = 1; c < k; c++) {
    const distances = pixels.map(pixel => {
      let minDist = Infinity;
      for (const centroid of centroids) {
        const dist = pixel.reduce((sum, val, i) => sum + (val - centroid[i]) ** 2, 0);
        minDist = Math.min(minDist, dist);
      }
      return minDist;
    });
    
    const totalDist = distances.reduce((sum, d) => sum + d, 0);
    const threshold = rng.next() * totalDist;
    
    let cumSum = 0;
    for (let i = 0; i < distances.length; i++) {
      cumSum += distances[i];
      if (cumSum >= threshold) {
        centroids.push([...pixels[i]]);
        break;
      }
    }
  }
  
  // K-Means iterations
  for (let iter = 0; iter < 50; iter++) {
    const clusters = new Array(k).fill(0).map(() => []);
    
    // Assign pixels to nearest centroid
    for (const pixel of pixels) {
      let bestCluster = 0;
      let bestDist = Infinity;
      
      for (let c = 0; c < k; c++) {
        const dist = pixel.reduce((sum, val, i) => sum + (val - centroids[c][i]) ** 2, 0);
        if (dist < bestDist) {
          bestDist = dist;
          bestCluster = c;
        }
      }
      
      clusters[bestCluster].push(pixel);
    }
    
    // Update centroids
    let changed = false;
    for (let c = 0; c < k; c++) {
      if (clusters[c].length > 0) {
        const newCentroid = [0, 0, 0];
        for (const pixel of clusters[c]) {
          newCentroid[0] += pixel[0];
          newCentroid[1] += pixel[1];
          newCentroid[2] += pixel[2];
        }
        newCentroid[0] /= clusters[c].length;
        newCentroid[1] /= clusters[c].length;
        newCentroid[2] /= clusters[c].length;
        
        if (Math.abs(newCentroid[0] - centroids[c][0]) > 1 ||
            Math.abs(newCentroid[1] - centroids[c][1]) > 1 ||
            Math.abs(newCentroid[2] - centroids[c][2]) > 1) {
          changed = true;
        }
        
        centroids[c] = newCentroid;
      }
    }
    
    if (!changed) break;
  }
  
  // Convert back from perceptual weighting if applied
  if (usePerceptualWeighting && colorSpace === 'rgb') {
    return centroids.map(centroid => [
      Math.round(centroid[0] / 0.299),
      Math.round(centroid[1] / 0.587),
      Math.round(centroid[2] / 0.114)
    ]);
  }
  
  return centroids.map(centroid => centroid.map(Math.round));
}

function applyGaussianBlur(data, w, h) {
  const blurred = new Uint8ClampedArray(data.length);
  // Lighter 3x3 kernel for edge preservation
  const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1];
  const kernelSum = 16;
  const radius = 1;
  
  // Apply edge-preserving blur
  for (let y = radius; y < h - radius; y++) {
    for (let x = radius; x < w - radius; x++) {
      const i = (y * w + x) * 4;
      
      // Calculate local variance to detect edges
      let variance = 0;
      const centerColor = [data[i], data[i + 1], data[i + 2]];
      
      for (let ky = -radius; ky <= radius; ky++) {
        for (let kx = -radius; kx <= radius; kx++) {
          const ki = ((y + ky) * w + (x + kx)) * 4;
          const diff = Math.abs(data[ki] - centerColor[0]) + 
                      Math.abs(data[ki + 1] - centerColor[1]) + 
                      Math.abs(data[ki + 2] - centerColor[2]);
          variance += diff;
        }
      }
      
      // If edge detected, reduce blur effect
      const edgeThreshold = 50;
      const blurStrength = variance > edgeThreshold ? 0.3 : 1.0;
      
      for (let c = 0; c < 3; // RGB channels
        c++) {
        let sum = 0;
        for (let ky = -radius; ky <= radius; ky++) {
          for (let kx = -radius; kx <= radius; kx++) {
            const ki = ((y + ky) * w + (x + kx)) * 4 + c;
            sum += data[ki] * kernel[(ky + radius) * 3 + (kx + radius)];
          }
        }
        const blurredValue = sum / kernelSum;
        blurred[i + c] = data[i + c] * (1 - blurStrength) + blurredValue * blurStrength;
      }
      blurred[i + 3] = data[i + 3]; // Alpha channel
    }
  }
  
  return blurred;
}

function extractSmoothRegions(data, w, h) {
  const regions = [];
  const visited = new Set();
  
  function floodFill(startX, startY, targetColor) {
    const stack = [[startX, startY]];
    const region = [];
    
    while (stack.length > 0) {
      const [x, y] = stack.pop();
      const key = `${x},${y}`;
      
      if (visited.has(key) || x < 0 || x >= w || y < 0 || y >= h) continue;
      
      const i = (y * w + x) * 4;
      const currentColor = [data[i], data[i + 1], data[i + 2]];
      
      // Balanced color similarity for sharp but clean regions
      const colorDistance = Math.sqrt(
        (currentColor[0] - targetColor[0]) ** 2 +
        (currentColor[1] - targetColor[1]) ** 2 +
        (currentColor[2] - targetColor[2]) ** 2
      );
      
      if (colorDistance > 25) continue; // Balanced threshold
      
      visited.add(key);
      region.push({ x, y, color: currentColor });
      
      // Add neighboring pixels
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    
    return region;
  }
  
  for (let y = 0; y < h; y += 4) { // Sample every 4 pixels for balance
    for (let x = 0; x < w; x += 4) {
      const key = `${x},${y}`;
      if (!visited.has(key)) {
        const i = (y * w + x) * 4;
        if (data[i + 3] > 10) { // Skip transparent pixels
          const targetColor = [data[i], data[i + 1], data[i + 2]];
          const region = floodFill(x, y, targetColor);
          if (region.length > 8) { // Balanced region size
            regions.push(region);
          }
        }
      }
    }
  }
  
  return regions;
}

async function quantizeColorsKMeans(regions, k) {
  // Extract representative colors from regions
  const colors = regions.map(region => {
    const avgColor = region.reduce((acc, pixel) => {
      acc[0] += pixel.color[0];
      acc[1] += pixel.color[1];
      acc[2] += pixel.color[2];
      return acc;
    }, [0, 0, 0]);
    return avgColor.map(c => Math.round(c / region.length));
  });
  
  if (colors.length === 0) return [];
  
  // K-Means++ initialization using global RNG
  const centroids = [colors[rng.randInt(0, colors.length)]];
  while (centroids.length < k && centroids.length < colors.length) {
    const distances = colors.map(color => {
      return Math.min(...centroids.map(centroid => {
        return (color[0] - centroid[0]) ** 2 + (color[1] - centroid[1]) ** 2 + (color[2] - centroid[2]) ** 2;
      }));
    });
    
    const totalDistance = distances.reduce((sum, d) => sum + d, 0);
    if (totalDistance === 0) break;
    
    const probabilities = distances.map(d => d / totalDistance);
    
    let cumulativeProbability = 0;
    const rand = rng.next();
    for (let i = 0; i < probabilities.length; i++) {
      cumulativeProbability += probabilities[i];
      if (rand < cumulativeProbability) {
        centroids.push([...colors[i]]);
        break;
      }
    }
  }
  
  // K-Means clustering
  const maxIter = 10;
  for (let iter = 0; iter < maxIter; iter++) {
    const assignments = colors.map(color => {
      let best = 0, minDist = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const dist = (color[0] - centroids[c][0]) ** 2 + 
                     (color[1] - centroids[c][1]) ** 2 + 
                     (color[2] - centroids[c][2]) ** 2;
        if (dist < minDist) {
          minDist = dist;
          best = c;
        }
      }
      return best;
    });
    
    const newCentroids = new Array(centroids.length).fill(0).map(() => [0, 0, 0, 0]);
    for (let i = 0; i < colors.length; i++) {
      const cluster = assignments[i];
      newCentroids[cluster][0] += colors[i][0];
      newCentroids[cluster][1] += colors[i][1];
      newCentroids[cluster][2] += colors[i][2];
      newCentroids[cluster][3]++;
    }
    
    let changed = false;
    for (let c = 0; c < centroids.length; c++) {
      if (newCentroids[c][3] > 0) {
        const newColor = [
          Math.round(newCentroids[c][0] / newCentroids[c][3]),
          Math.round(newCentroids[c][1] / newCentroids[c][3]),
          Math.round(newCentroids[c][2] / newCentroids[c][3])
        ];
        if (centroids[c][0] !== newColor[0] || centroids[c][1] !== newColor[1] || centroids[c][2] !== newColor[2]) {
          centroids[c] = newColor;
          changed = true;
        }
      }
    }
    
    if (!changed) break;
  }
  
  return centroids;
}

function quantizeColorsMedianCut(regions, k) {
  const colors = regions.map(region => {
    const avgColor = region.reduce((acc, pixel) => {
      acc[0] += pixel.color[0];
      acc[1] += pixel.color[1];
      acc[2] += pixel.color[2];
      return acc;
    }, [0, 0, 0]);
    return avgColor.map(c => Math.round(c / region.length));
  });
  
  if (colors.length === 0) return [];
  
  function splitBox(box) {
    const axis = box.axis;
    box.colors.sort((a, b) => a[axis] - b[axis]);
    const mid = Math.floor(box.colors.length / 2);
    const box1 = { colors: box.colors.slice(0, mid), axis: (axis + 1) % 3 };
    const box2 = { colors: box.colors.slice(mid), axis: (axis + 1) % 3 };
    return [box1, box2];
  }
  
  let boxes = [{ colors, axis: 0 }];
  while (boxes.length < k && boxes.length < colors.length) {
    boxes = boxes.flatMap(box => box.colors.length > 1 ? splitBox(box) : [box]);
  }
  
  return boxes.map(box => {
    const avg = box.colors.reduce((acc, color) => {
      acc[0] += color[0];
      acc[1] += color[1];
      acc[2] += color[2];
      return acc;
    }, [0, 0, 0]);
    return avg.map(v => Math.round(v / box.colors.length));
  });
}

function createVectorizedRepresentation(data, centroids, w, h) {
  const layerData = new Array(centroids.length).fill(0).map(() => new ImageData(w, h));
  
  // Direct quantization with minimal smoothing to preserve sharpness
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = data[i + 3];
      
      if (a < 10) {
        for (let c = 0; c < centroids.length; c++) {
          layerData[c].data[i + 3] = 0;
        }
        continue;
      }
      
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      let best = 0, minDist = Infinity;
      
      for (let c = 0; c < centroids.length; c++) {
        const dist = (r - centroids[c][0]) ** 2 + 
                     (g - centroids[c][1]) ** 2 + 
                     (b - centroids[c][2]) ** 2;
        if (dist < minDist) {
          minDist = dist;
          best = c;
        }
      }
      
      for (let c = 0; c < centroids.length; c++) {
        const ld = layerData[c].data;
        if (c === best) {
          ld[i] = centroids[c][0];
          ld[i + 1] = centroids[c][1];
          ld[i + 2] = centroids[c][2];
          ld[i + 3] = 255;
        } else {
          ld[i + 3] = 0;
        }
      }
    }
  }
  
  // Remove stray pixels (artifact cleanup)
  const strayPixelThreshold = Number(strayPixelSizeRange.value);
  if (strayPixelThreshold > 0) {
    console.log(`Starting stray pixel removal with threshold: ${strayPixelThreshold} pixels`);
    
    // First, create a blended image from all layers to detect artifacts properly
    const blendedImageData = new ImageData(w, h);
    const blendedData = blendedImageData.data;
    
    // Initialize as transparent
    for (let i = 0; i < blendedData.length; i += 4) {
      blendedData[i + 3] = 0;
    }
    
    // Blend all layers together
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        
        // Find the topmost non-transparent pixel
        for (let layer = layerData.length - 1; layer >= 0; layer--) {
          const layerData_layer = layerData[layer];
          if (layerData_layer.data[i + 3] > 0) {
            blendedData[i] = layerData_layer.data[i];
            blendedData[i + 1] = layerData_layer.data[i + 1];
            blendedData[i + 2] = layerData_layer.data[i + 2];
            blendedData[i + 3] = layerData_layer.data[i + 3];
            break;
          }
        }
      }
    }
    
    // Apply stray pixel removal to the blended image
    const pixelsChanged = removeStrayPixels(blendedImageData, w, h, strayPixelThreshold);
    console.log(`Blended image: ${pixelsChanged} pixels covered up`);
    
    // Now redistribute the cleaned pixels back to the appropriate layers
    if (pixelsChanged > 0) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          
          if (blendedData[i + 3] > 0) {
            const cleanedColor = [blendedData[i], blendedData[i + 1], blendedData[i + 2]];
            
            // Find which layer this color belongs to and update it
            let bestLayer = 0;
            let bestDistance = Infinity;
            
            for (let layer = 0; layer < centroids.length; layer++) {
              const centroid = centroids[layer];
              const distance = Math.sqrt(
                (cleanedColor[0] - centroid[0]) ** 2 +
                (cleanedColor[1] - centroid[1]) ** 2 +
                (cleanedColor[2] - centroid[2]) ** 2
              );
              
              if (distance < bestDistance) {
                bestDistance = distance;
                bestLayer = layer;
              }
            }
            
            // Clear this pixel from all layers first
            for (let layer = 0; layer < layerData.length; layer++) {
              layerData[layer].data[i + 3] = 0;
            }
            
            // Set the pixel in the best matching layer
            layerData[bestLayer].data[i] = cleanedColor[0];
            layerData[bestLayer].data[i + 1] = cleanedColor[1];
            layerData[bestLayer].data[i + 2] = cleanedColor[2];
            layerData[bestLayer].data[i + 3] = 255;
          }
        }
      }
    }
    
    if (pixelsChanged === 0) {
      console.log('No stray pixels found. Try lowering the threshold or the image may already be clean.');
    }
  }
  
  return layerData;
}

function removeStrayPixels(imageData, w, h, threshold = 5) {
  const data = imageData.data;
  const visited = new Set();
  const regionsToFill = [];
  let totalPixelsChanged = 0;
  
  // Find connected components (regions)
  function floodFillRegion(startX, startY) {
    const stack = [[startX, startY]];
    const region = [];
    const startI = (startY * w + startX) * 4;
    
    // Allow some color variation for better region detection
    const targetColor = [data[startI], data[startI + 1], data[startI + 2]];
    const colorTolerance = 30; // Allow slight color variations
    
    while (stack.length > 0) {
      const [x, y] = stack.pop();
      const key = `${x},${y}`;
      
      if (visited.has(key) || x < 0 || x >= w || y < 0 || y >= h) continue;
      
      const i = (y * w + x) * 4;
      if (data[i + 3] === 0) continue; // Skip transparent pixels
      
      const currentColor = [data[i], data[i + 1], data[i + 2]];
      
      // Check if colors are similar (not exact match)
      const colorDiff = Math.sqrt(
        (currentColor[0] - targetColor[0]) ** 2 +
        (currentColor[1] - targetColor[1]) ** 2 +
        (currentColor[2] - targetColor[2]) ** 2
      );
      
      if (colorDiff > colorTolerance) continue;
      
      visited.add(key);
      region.push({ x, y, i });
      
      // Add neighbors
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    
    return region;
  }
  
  // Find all regions
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const key = `${x},${y}`;
      const i = (y * w + x) * 4;
      
      if (!visited.has(key) && data[i + 3] > 0) {
        const region = floodFillRegion(x, y);
        
        // If region is smaller than threshold, mark for filling
        if (region.length <= threshold && region.length > 0) {
          regionsToFill.push(region);
        }
      }
    }
  }
  
  console.log(`Found ${regionsToFill.length} stray regions to cover up (${regionsToFill.reduce((sum, r) => sum + r.length, 0)} total pixels)`);
  
  // Cover up small regions with surrounding colors
  for (const region of regionsToFill) {
    const surroundingColor = findDominantSurroundingColor(data, w, h, region);
    
    if (surroundingColor) {
      for (const pixel of region) {
        // Store original color for debugging
        const originalColor = [data[pixel.i], data[pixel.i + 1], data[pixel.i + 2]];
        
        data[pixel.i] = surroundingColor[0];
        data[pixel.i + 1] = surroundingColor[1];
        data[pixel.i + 2] = surroundingColor[2];
        data[pixel.i + 3] = 255; // Keep opaque
        
        totalPixelsChanged++;
      }
      console.log(`Covered region of ${region.length} pixels with color [${surroundingColor.join(',')}]`);
    } else {
      console.log(`No suitable surrounding color found for region of ${region.length} pixels - trying fallback`);
      
      // Fallback: use the most common color in the entire image
      const fallbackColor = getMostCommonColor(data, w, h);
      if (fallbackColor) {
        for (const pixel of region) {
          data[pixel.i] = fallbackColor[0];
          data[pixel.i + 1] = fallbackColor[1];
          data[pixel.i + 2] = fallbackColor[2];
          data[pixel.i + 3] = 255;
          totalPixelsChanged++;
        }
        console.log(`Used fallback color [${fallbackColor.join(',')}] for region of ${region.length} pixels`);
      }
    }
  }
  
  return totalPixelsChanged;
}

function findDominantSurroundingColor(data, w, h, region) {
  const colorCounts = new Map();
  const radius = 4; // Increased radius for better sampling
  
  // For each pixel in the region, sample the surrounding area
  for (const pixel of region) {
    const { x, y } = pixel;
    
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        
        if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
          const ni = (ny * w + nx) * 4;
          
          // Skip if this pixel is part of the region we're trying to fill
          const isInRegion = region.some(p => p.x === nx && p.y === ny);
          
          if (!isInRegion && data[ni + 3] > 0) { // Not transparent and not in current region
            const colorKey = `${data[ni]},${data[ni + 1]},${data[ni + 2]}`;
            colorCounts.set(colorKey, (colorCounts.get(colorKey) || 0) + 1);
          }
        }
      }
    }
  }
  
  // Find most common surrounding color
  let maxCount = 0;
  let dominantColor = null;
  
  for (const [color, count] of colorCounts) {
    if (count > maxCount) {
      maxCount = count;
      dominantColor = color;
    }
  }
  
  // Lowered threshold for better coverage
  if (dominantColor && maxCount >= 1) {
    return dominantColor.split(',').map(Number);
  }
  
  return null;
}

function getMostCommonColor(data, w, h) {
  const colorCounts = new Map();
  
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 0) { // Only count non-transparent pixels
      const colorKey = `${data[i]},${data[i + 1]},${data[i + 2]}`;
      colorCounts.set(colorKey, (colorCounts.get(colorKey) || 0) + 1);
    }
  }
  
  let maxCount = 0;
  let mostCommonColor = null;
  
  for (const [color, count] of colorCounts) {
    if (count > maxCount) {
      maxCount = count;
      mostCommonColor = color;
    }
  }
  
  return mostCommonColor ? mostCommonColor.split(',').map(Number) : null;
}

function renderVectorizedLayers(centroids, layerData, w, h) {
  // Store current data for interactive editing
  currentCentroids = centroids.map(c => [...c]); // Deep copy
  currentLayerData = layerData;
  currentImageDimensions = { width: w, height: h };
  
  // Hide the preview canvas after processing
  preview.style.display = 'none';
  
  layersEl.innerHTML = ''; paletteEl.innerHTML = '';

  // Create a single canvas to blend all layers
  const blendedCanvas = document.createElement('canvas');
  const blendedCtx = blendedCanvas.getContext('2d');
  blendedCanvas.width = w;
  blendedCanvas.height = h;

  // Blend each layer on the canvas
  for (let c = 0; c < layerData.length; c++) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = w;
    tempCanvas.height = h;
    tempCanvas.getContext('2d').putImageData(layerData[c], 0, 0);
    blendedCtx.drawImage(tempCanvas, 0, 0);
  }

  // Update comparison slider
  const originalImageEl = document.getElementById('original-image');
  const processedImageEl = document.getElementById('processed-image');

  const originalCanvas = document.createElement('canvas');
  originalCanvas.width = w;
  originalCanvas.height = h;
  originalCanvas.getContext('2d').drawImage(originalImage, 0, 0, w, h);

  originalImageEl.src = originalCanvas.toDataURL();
  processedImageEl.src = blendedCanvas.toDataURL();

  // Setup highlight overlay
  setupHighlightOverlay(w, h);

  // Interactive Palette
  for (let c = 0; c < centroids.length; c++) {
    const col = centroids[c];
    const hex = rgbToHex(col[0], col[1], col[2]);
    
    const swatchContainer = document.createElement('div');
    swatchContainer.className = 'swatch-container';
    
    const sw = document.createElement('div');
    sw.className = 'swatch';
    sw.style.background = hex;
    sw.title = `Click to change color: ${hex}`;
    sw.style.cursor = 'pointer';
    sw.dataset.colorIndex = c;
    
    // Create positioned color input
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = hex;
    colorInput.dataset.colorIndex = c;
    
    // Add click event to swatch
    sw.addEventListener('click', () => {
      colorInput.click();
    });
    
    // Add hover events for color highlighting
    sw.addEventListener('mouseenter', () => {
      highlightColorRegion(c);
    });
    
    sw.addEventListener('mouseleave', () => {
      hideHighlight();
    });
    
    // Add change event to color input
    colorInput.addEventListener('change', (e) => {
      const newColor = e.target.value;
      const colorIndex = parseInt(e.target.dataset.colorIndex);
      updatePaletteColor(colorIndex, newColor);
    });
    
    swatchContainer.appendChild(sw);
    swatchContainer.appendChild(colorInput);
    paletteEl.appendChild(swatchContainer);
  }
}
