// Web Worker for heavy color processing
import { processImage } from './quantization.js';

self.onmessage = (e) => {
  const { type, payload } = e.data;
  if (type === 'process') {
    try {
      // Reconstruct ImageData
  const { width, height, buffer, k, algorithm, colorSpace, perceptualWeighting, preprocessing, blurStrength, strayPixelSize, seed, lockedCentroids, useCIEDE2000 } = payload;
      const data = new Uint8ClampedArray(buffer);
      const imageData = new ImageData(data, width, height);
  const result = processImage({ imageData, k, algorithm, colorSpace, perceptualWeighting, preprocessing, blurStrength, strayPixelSize, seed, lockedCentroids, useCIEDE2000 });
      // Prepare transferable layer buffers
      const layers = result.layers.map(ld => ({ width: ld.width, height: ld.height, buffer: ld.data.buffer }));
      const transfer = layers.map(l => l.buffer);
      self.postMessage({ type: 'done', centroids: result.centroids, width: result.width, height: result.height, layers }, transfer);
    } catch (err) {
      self.postMessage({ type: 'error', message: err.message, stack: err.stack });
    }
  }
};
