export class GifProcessor {
  constructor() {
    this._decoderPromise = null;
    this._encoderPromise = null;
    this._decoderUrls = [
      'https://cdn.jsdelivr.net/npm/gifuct-js@2.1.2/+esm',
      'https://cdn.jsdelivr.net/npm/gifuct-js/+esm',
      'https://unpkg.com/gifuct-js@2.1.2?module',
      'https://cdn.skypack.dev/gifuct-js@2.1.2'
    ];
    this._encoderUrls = [
      'https://cdn.jsdelivr.net/npm/gifenc@1.0.3/+esm',
      'https://unpkg.com/gifenc@1.0.3?module',
      'https://cdn.skypack.dev/gifenc@1.0.3'
    ];
  }

  async loadSessionFromFile(file) {
    const buffer = await file.arrayBuffer();
    const { parseGIF, decompressFrames } = await this._loadDecoder();
    const gif = parseGIF(buffer);
  const frames = decompressFrames(gif, true);
    const width = gif.lsd.width;
    const height = gif.lsd.height;
    if (!width || !height || !frames.length) {
      throw new Error('No frames found in GIF');
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('Unable to initialize canvas context for GIF processing');
    }

    ctx.clearRect(0, 0, width, height);
    let previousFrame = ctx.getImageData(0, 0, width, height);
    const composedFrames = [];
    const paletteSet = new Set();

    for (const frame of frames) {
      const { dims, patch, disposalType, delay } = frame;
      const image = ctx.createImageData(dims.width, dims.height);
      image.data.set(patch);
      ctx.putImageData(image, dims.left, dims.top);
      const fullFrame = ctx.getImageData(0, 0, width, height);
      const delayCs = Number.isFinite(delay) ? Math.max(0, delay) : 0;
      composedFrames.push({
        imageData: fullFrame,
        delayCs,
        disposal: typeof disposalType === 'number' ? disposalType : 0
      });

      if (paletteSet.size < 256) {
        const data = fullFrame.data;
        for (let i = 0; i < data.length && paletteSet.size < 256; i += 4) {
          if (data[i + 3] < 16) continue;
          const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
          if (!paletteSet.has(key)) {
            paletteSet.add(key);
          }
        }
      }

      switch (disposalType) {
        case 2: // Restore to background
          ctx.clearRect(dims.left, dims.top, dims.width, dims.height);
          break;
        case 3: // Restore to previous
          ctx.putImageData(previousFrame, 0, 0);
          break;
        default:
          previousFrame = fullFrame;
      }
    }

    const palette = Array.from(paletteSet).map(key => [ (key >> 16) & 0xff, (key >> 8) & 0xff, key & 0xff ]);

    return {
      width,
      height,
      loopCount: this._extractLoopCount(gif),
      originalUrl: URL.createObjectURL(file),
      palette,
      frames: composedFrames
    };
  }

  releaseSession(session) {
    if (session?.originalUrl) {
      URL.revokeObjectURL(session.originalUrl);
    }
    if (session?.loopedUrl) {
      URL.revokeObjectURL(session.loopedUrl);
    }
  }

  async createLoopedGif(session, { forceOpaque = false } = {}) {
    const centroids = session.palette?.length ? session.palette : [[0, 0, 0]];
    return this.encodePaletteGif({
      frames: session.frames,
      centroids,
      loopCount: 0,
      forceOpaque
    });
  }

  buildReferenceImage(frames, options = {}) {
    if (!frames.length) {
      throw new Error('Cannot build reference image without frames');
    }
    const { forceOpaque = false, maxFrames = 20 } = options;
    const width = frames[0].imageData.width;
    const height = frames[0].imageData.height;
    const pixelCount = width * height;

    const composite = new ImageData(width, height);
    const accumR = new Float32Array(pixelCount);
    const accumG = new Float32Array(pixelCount);
    const accumB = new Float32Array(pixelCount);
    const weightSum = new Float32Array(pixelCount);

    const framesToUse = Math.min(frames.length, maxFrames);
    const step = Math.max(1, Math.floor(frames.length / framesToUse));
    const totalDuration = frames.reduce((acc, fr) => acc + Math.max(fr.delayCs || 0, 1), 0) || frames.length;

    for (let fi = 0; fi < frames.length; fi += step) {
      const frame = frames[fi];
      const data = frame.imageData.data;
      const frameWeight = Math.max(frame.delayCs || 0, 1) / totalDuration;
      for (let p = 0, idx = 0; p < pixelCount; p++, idx += 4) {
        const alpha = data[idx + 3];
        if (!alpha) continue;
        const effectiveAlpha = forceOpaque ? 1 : alpha / 255;
        const weight = frameWeight * effectiveAlpha;
        if (!weight) continue;
        accumR[p] += data[idx] * weight;
        accumG[p] += data[idx + 1] * weight;
        accumB[p] += data[idx + 2] * weight;
        weightSum[p] += weight;
      }
    }

    const out = composite.data;
    for (let p = 0, idx = 0; p < pixelCount; p++, idx += 4) {
      const w = weightSum[p];
      if (w > 0) {
        out[idx] = Math.round(accumR[p] / w);
        out[idx + 1] = Math.round(accumG[p] / w);
        out[idx + 2] = Math.round(accumB[p] / w);
        out[idx + 3] = forceOpaque ? 255 : Math.min(255, Math.max(32, Math.round(w * 255)));
      } else {
        out[idx] = 0;
        out[idx + 1] = 0;
        out[idx + 2] = 0;
        out[idx + 3] = 0;
      }
    }

    return composite;
  }

  composeLayers(layers, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to compose GIF frame');
    }
    ctx.clearRect(0, 0, width, height);
    for (const layer of layers) {
      const temp = document.createElement('canvas');
      temp.width = layer.width;
      temp.height = layer.height;
      const layerCtx = temp.getContext('2d');
      if (!layerCtx) continue;
      layerCtx.putImageData(layer, 0, 0);
      ctx.drawImage(temp, 0, 0);
    }
    return ctx.getImageData(0, 0, width, height);
  }

  async encodePaletteGif({ frames, centroids, loopCount = 0, forceOpaque = false }) {
    if (!frames.length) {
      throw new Error('No frames provided for GIF encoding');
    }
    const encoderLib = await this._loadEncoder();
    const encoder = encoderLib.GIFEncoder();
    frames.forEach((frame, index) => {
      const { width, height } = frame.imageData;
      const { indexes, options } = this._quantizeFrame({
        frame,
        centroids,
        loopCount,
        includeRepeat: index === 0,
        forceOpaque
      });
      encoder.writeFrame(indexes, width, height, options);
    });
    encoder.finish();
    return new Blob([encoder.bytes()], { type: 'image/gif' });
  }

  async encodeSingleColorGif({ frames, color, loopCount = 0, forceOpaque = false }) {
    const encoderLib = await this._loadEncoder();
    const encoder = encoderLib.GIFEncoder();
    frames.forEach((frame, index) => {
      const { width, height } = frame.imageData;
      const decoratedFrame = { ...frame, layers: [frame.imageData] };
      const { indexes, options } = this._quantizeFrame({
        frame: decoratedFrame,
        centroids: [color],
        loopCount,
        includeRepeat: index === 0,
        forceOpaque
      });
      encoder.writeFrame(indexes, width, height, options);
    });
    encoder.finish();
    return new Blob([encoder.bytes()], { type: 'image/gif' });
  }

  _extractLoopCount(gif) {
    try {
      const ext = (gif.extensions || []).find(
        (e) => e.type === 'application' && e.identifier === 'NETSCAPE' && e.authCode === '2.0'
      );
      if (ext?.data?.loopCount != null) {
        return ext.data.loopCount;
      }
    } catch (err) {
      console.warn('Failed to extract GIF loop count', err);
    }
    return 0;
  }

  async _loadDecoder() {
    if (this._decoderPromise) {
      return this._decoderPromise;
    }
    this._decoderPromise = this._loadFromFallback(this._decoderUrls, (mod) => {
      const parseGIF = mod.parseGIF || mod.default?.parseGIF;
      const decompressFrames = mod.decompressFrames || mod.default?.decompressFrames;
      if (parseGIF && decompressFrames) {
        return { parseGIF, decompressFrames };
      }
      return null;
    });
    return this._decoderPromise;
  }

  async _loadEncoder() {
    if (this._encoderPromise) {
      return this._encoderPromise;
    }
    this._encoderPromise = this._loadFromFallback(this._encoderUrls, (mod) => {
      const GIFEncoder = mod.GIFEncoder || mod.default?.GIFEncoder;
      const quantize = mod.quantize || mod.default?.quantize;
      const applyPalette = mod.applyPalette || mod.default?.applyPalette;
      if (GIFEncoder && quantize && applyPalette) {
        return { GIFEncoder, quantize, applyPalette };
      }
      return null;
    });
    return this._encoderPromise;
  }

  async _loadFromFallback(urls, projector) {
    let lastErr;
    for (const url of urls) {
      try {
        const mod = await import(/* @vite-ignore */ url);
        const projected = projector(mod);
        if (projected) {
          return projected;
        }
      } catch (err) {
        lastErr = err;
      }
    }
    throw new Error(lastErr?.message || 'Failed to load required GIF helper library');
  }

  _quantizeFrame({ frame, centroids, loopCount, includeRepeat, forceOpaque }) {
    if (!centroids.length) {
      throw new Error('Cannot build GIF frame without palette colors');
    }
    const { imageData, layers = null, disposal, delayCs } = frame;
    const { width, height } = imageData;
    const pixelCount = width * height;
    const alphaThreshold = forceOpaque ? 1 : 128;

    const hasTransparentPixels = this._hasTransparentPixels({ imageData, layers, pixelCount, alphaThreshold, forceOpaque });
    const { palette, transparentIndex } = this._buildPalette({ centroids, hasTransparentPixels });
    const indexes = this._buildIndexes({
      imageData,
      layers,
      centroids,
      pixelCount,
      alphaThreshold,
      forceOpaque,
      transparentIndex
    });

    const rawDelayCs = Number.isFinite(delayCs) ? delayCs : 0;
    const frameDelay = Math.max(0, Math.round(rawDelayCs));
    const frameOptions = {
      palette,
      delay: frameDelay,
      dispose: this._normalizeDisposal(disposal, hasTransparentPixels)
    };
    if (includeRepeat) {
      frameOptions.repeat = loopCount || 0;
    }
    if (transparentIndex !== null) {
      frameOptions.transparent = true;
      frameOptions.transparentIndex = transparentIndex;
    }
    return { indexes, options: frameOptions };
  }

  _hasTransparentPixels({ imageData, layers, pixelCount, alphaThreshold, forceOpaque }) {
    if (forceOpaque) {
      return false;
    }
    if (layers && layers.length) {
      for (let p = 0; p < pixelCount; p++) {
        let visible = false;
        const offset = p * 4;
        for (const layer of layers) {
          if (layer.data[offset + 3] >= alphaThreshold) {
            visible = true;
            break;
          }
        }
        if (!visible) {
          return true;
        }
      }
      return false;
    }
    const data = imageData.data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 128) {
        return true;
      }
    }
    return false;
  }

  _buildPalette({ centroids, hasTransparentPixels }) {
    const palette = [];
    let transparentIndex = null;
    if (hasTransparentPixels) {
      transparentIndex = palette.length;
      palette.push([0, 0, 0, 0]);
    }
    centroids.forEach(([r, g, b]) => {
      palette.push([r, g, b, 255]);
    });
    if (palette.length > 256) {
      throw new Error('GIF palette exceeds 256 colors');
    }
    return { palette, transparentIndex };
  }

  _buildIndexes({ imageData, layers, centroids, pixelCount, alphaThreshold, forceOpaque, transparentIndex }) {
    const indexes = new Uint8Array(pixelCount);
    if (transparentIndex !== null) {
      indexes.fill(transparentIndex);
    }
    const paletteOffset = transparentIndex !== null ? 1 : 0;
    if (layers && layers.length === centroids.length) {
      for (let ci = 0; ci < layers.length; ci++) {
        const layerData = layers[ci].data;
        const targetIndex = ci + paletteOffset;
        for (let p = 0, offset = 0; p < pixelCount; p++, offset += 4) {
          if (layerData[offset + 3] >= alphaThreshold) {
            indexes[p] = targetIndex;
          }
        }
      }
      return indexes;
    }

    const data = imageData.data;
    for (let p = 0, offset = 0; p < pixelCount; p++, offset += 4) {
      const alpha = data[offset + 3];
      if (!forceOpaque && alpha < alphaThreshold) {
        continue;
      }
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const [cr, cg, cb] = centroids[c];
        const dr = r - cr;
        const dg = g - cg;
        const db = b - cb;
        const dist = dr * dr + dg * dg + db * db;
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = c;
          if (dist === 0) break;
        }
      }
      indexes[p] = bestIdx + paletteOffset;
    }
    return indexes;
  }

  _normalizeDisposal(disposal, hasTransparentPixels) {
    if (typeof disposal === 'number' && disposal >= 0 && disposal <= 3) {
      return disposal;
    }
    return hasTransparentPixels ? 1 : 2;
  }
}
