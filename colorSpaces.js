// Color space conversion utilities
export function rgbToLab(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1.00000;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const fx = x > 0.008856 ? Math.pow(x, 1/3) : (7.787 * x + 16/116);
  const fy = y > 0.008856 ? Math.pow(y, 1/3) : (7.787 * y + 16/116);
  const fz = z > 0.008856 ? Math.pow(z, 1/3) : (7.787 * z + 16/116);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function labToRgb(L, a, b) {
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
  return [R, G, B].map(v => Math.max(0, Math.min(255, Math.round(v * 255))));
}

export function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const diff = max - min; let h = 0;
  if (diff !== 0) {
    if (max === r) h = ((g - b) / diff) % 6; else if (max === g) h = (b - r) / diff + 2; else h = (r - g) / diff + 4;
  }
  h = (h * 60 + 360) % 360; const s = max === 0 ? 0 : diff / max; const v = max;
  return [h, s * 100, v * 100];
}

export function hsvToRgb(h, s, v) {
  h /= 60; s /= 100; v /= 100;
  const c = v * s; const x = c * (1 - Math.abs((h % 2) - 1)); const m = v - c;
  let r,g,b; if (h < 1) [r,g,b]=[c,x,0]; else if (h<2)[r,g,b]=[x,c,0]; else if (h<3)[r,g,b]=[0,c,x]; else if (h<4)[r,g,b]=[0,x,c]; else if(h<5)[r,g,b]=[x,0,c]; else [r,g,b]=[c,0,x];
  return [r,g,b].map(v=>Math.round((v+m)*255));
}

export function convertColorSpace(data, toSpace) {
  if (toSpace === 'rgb') return data;
  const converted = new Float32Array(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
    let out;
    if (toSpace === 'lab') out = rgbToLab(r,g,b);
    else if (toSpace === 'hsv') out = rgbToHsv(r,g,b);
    else if (toSpace === 'xyz') out = rgbToLab(r,g,b); // proxy
    else out = [r,g,b];
    converted[i]=out[0]; converted[i+1]=out[1]; converted[i+2]=out[2]; converted[i+3]=a;
  }
  return converted;
}

export function convertBackToRgb(data, fromSpace) {
  if (fromSpace === 'rgb') return data;
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i+=4) {
    const c1=data[i], c2=data[i+1], c3=data[i+2], a=data[i+3];
    let rgb;
    if (fromSpace === 'lab' || fromSpace === 'xyz') rgb = labToRgb(c1,c2,c3);
    else if (fromSpace === 'hsv') rgb = hsvToRgb(c1,c2,c3);
    else rgb=[c1,c2,c3];
    out[i]=rgb[0]; out[i+1]=rgb[1]; out[i+2]=rgb[2]; out[i+3]=a;
  }
  return out;
}

export const hexToRgb = (hex) => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? [parseInt(m[1],16), parseInt(m[2],16), parseInt(m[3],16)] : null;
};
export const rgbToHex = (r,g,b) => '#' + [r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('');
