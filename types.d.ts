// Type declarations for core utilities (lightweight)
export interface RGB extends Array<number> { 0:number; 1:number; 2:number; }
export interface Lab extends Array<number> { 0:number; 1:number; 2:number; }

export declare function rgbToLab(r:number,g:number,b:number): Lab;
export declare function labToRgb(L:number,a:number,b:number): RGB;
export declare function rgbToHsv(r:number,g:number,b:number): [number, number, number];
export declare function hsvToRgb(h:number,s:number,v:number): RGB;
export declare function convertColorSpace(data:Uint8ClampedArray, toSpace:string): Float32Array | Uint8ClampedArray;
export declare function convertBackToRgb(data:Float32Array | Uint8ClampedArray, fromSpace:string): Uint8ClampedArray;
export declare function rgbToHex(r:number,g:number,b:number): string;
export declare function hexToRgb(hex:string): RGB | null;

export declare class SeededRandom {
  constructor(seed:number);
  next(): number;
  randInt(min:number,max:number): number;
}

export declare function quantizeColorsKMeansAdvanced(
  data: Uint8ClampedArray | Float32Array,
  k: number,
  colorSpace?: string,
  usePerceptualWeighting?: boolean,
  rng?: SeededRandom,
  useCIEDE2000?: boolean
): number[][];

export declare function deltaE2000(l1:number,a1:number,b1:number,l2:number,a2:number,b2:number): number;

export declare function processImage(opts: {
  imageData: ImageData,
  k: number,
  algorithm: string,
  colorSpace: string,
  perceptualWeighting: boolean,
  preprocessing: string,
  blurStrength: number,
  strayPixelSize: number,
  seed: number,
  lockedCentroids?: number[][],
  useCIEDE2000?: boolean
}): { centroids: number[][], layers: ImageData[], width: number, height: number };