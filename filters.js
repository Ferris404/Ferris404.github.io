// Image preprocessing filters - optimized versions
export function applyGaussianBlurToImageData(imageData, sigma) {
  const data = imageData.data, w = imageData.width, h = imageData.height;
  const result = new Uint8ClampedArray(data.length);
  const radius = Math.ceil(sigma * 3);

  // Pre-compute kernel for better performance
  const kernelSize = radius * 2 + 1;
  const kernel = new Float32Array(kernelSize);
  let sum = 0;

  for (let i = 0; i < kernelSize; i++) {
    const x = i - radius;
    const value = Math.exp(-(x * x) / (2 * sigma * sigma));
    kernel[i] = value;
    sum += value;
  }

  // Normalize kernel
  for (let i = 0; i < kernelSize; i++) {
    kernel[i] /= sum;
  }

  const temp = new Uint8ClampedArray(data.length);

  // Horizontal pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      if (data[idx + 3] === 0) {
        temp[idx + 3] = 0;
        continue;
      }

      let sr = 0, sg = 0, sb = 0, sa = 0, weightSum = 0;

      for (let k = 0; k < kernelSize; k++) {
        const nx = Math.max(0, Math.min(w - 1, x + k - radius));
        const ni = (y * w + nx) * 4;

        if (data[ni + 3] > 0) {
          const weight = kernel[k];
          sr += data[ni] * weight;
          sg += data[ni + 1] * weight;
          sb += data[ni + 2] * weight;
          sa += data[ni + 3] * weight;
          weightSum += weight;
        }
      }

      if (weightSum > 0) {
        temp[idx] = (sr / weightSum) | 0;
        temp[idx + 1] = (sg / weightSum) | 0;
        temp[idx + 2] = (sb / weightSum) | 0;
        temp[idx + 3] = (sa / weightSum) | 0;
      } else {
        temp[idx] = data[idx];
        temp[idx + 1] = data[idx + 1];
        temp[idx + 2] = data[idx + 2];
        temp[idx + 3] = data[idx + 3];
      }
    }
  }

  // Vertical pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      if (temp[idx + 3] === 0) {
        result[idx + 3] = 0;
        continue;
      }

      let sr = 0, sg = 0, sb = 0, sa = 0, weightSum = 0;

      for (let k = 0; k < kernelSize; k++) {
        const ny = Math.max(0, Math.min(h - 1, y + k - radius));
        const ni = (ny * w + x) * 4;

        if (temp[ni + 3] > 0) {
          const weight = kernel[k];
          sr += temp[ni] * weight;
          sg += temp[ni + 1] * weight;
          sb += temp[ni + 2] * weight;
          sa += temp[ni + 3] * weight;
          weightSum += weight;
        }
      }

      if (weightSum > 0) {
        result[idx] = (sr / weightSum) | 0;
        result[idx + 1] = (sg / weightSum) | 0;
        result[idx + 2] = (sb / weightSum) | 0;
        result[idx + 3] = (sa / weightSum) | 0;
      } else {
        result[idx] = temp[idx];
        result[idx + 1] = temp[idx + 1];
        result[idx + 2] = temp[idx + 2];
        result[idx + 3] = temp[idx + 3];
      }
    }
  }

  return new ImageData(result, w, h);
}

export function applyMedianFilter(imageData, radius = 2) {
  const { data, width: w, height: h } = imageData;
  const out = new Uint8ClampedArray(data.length);
  const windowSize = (radius * 2 + 1) ** 2;

  // Pre-allocate arrays for the window
  const rWindow = new Uint8ClampedArray(windowSize);
  const gWindow = new Uint8ClampedArray(windowSize);
  const bWindow = new Uint8ClampedArray(windowSize);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] === 0) {
        out[i + 3] = 0;
        continue;
      }

      let count = 0;

      // Collect window values
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            const ni = (ny * w + nx) * 4;
            if (data[ni + 3] > 0) {
              rWindow[count] = data[ni];
              gWindow[count] = data[ni + 1];
              bWindow[count] = data[ni + 2];
              count++;
            }
          }
        }
      }

      if (count > 0) {
        // Sort and pick median
        const mid = count >> 1; // Faster than Math.floor(count / 2)

        // Simple insertion sort for small arrays
        for (let j = 1; j < count; j++) {
          const rVal = rWindow[j], gVal = gWindow[j], bVal = bWindow[j];
          let k = j - 1;
          while (k >= 0 && rWindow[k] > rVal) {
            rWindow[k + 1] = rWindow[k];
            gWindow[k + 1] = gWindow[k];
            bWindow[k + 1] = bWindow[k];
            k--;
          }
          rWindow[k + 1] = rVal;
          gWindow[k + 1] = gVal;
          bWindow[k + 1] = bVal;
        }

        out[i] = rWindow[mid];
        out[i + 1] = gWindow[mid];
        out[i + 2] = bWindow[mid];
        out[i + 3] = data[i + 3];
      } else {
        out[i] = data[i];
        out[i + 1] = data[i + 1];
        out[i + 2] = data[i + 2];
        out[i + 3] = data[i + 3];
      }
    }
  }

  return new ImageData(out, w, h);
}

export function applyBilateralFilter(imageData, sigmaColor = 25, sigmaSpace = 7) {
  const { data, width: w, height: h } = imageData;
  const result = new Uint8ClampedArray(data.length);
  const radius = Math.ceil(sigmaSpace * 2);

  // Pre-compute spatial weights
  const spatialWeights = new Float32Array((radius * 2 + 1) ** 2);
  let spatialIdx = 0;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const spatialDist = Math.sqrt(dx * dx + dy * dy);
      spatialWeights[spatialIdx++] = Math.exp(-(spatialDist * spatialDist) / (2 * sigmaSpace * sigmaSpace));
    }
  }

  const invSigmaColor2 = 1 / (2 * sigmaColor * sigmaColor);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] === 0) {
        result[i + 3] = 0;
        continue;
      }

      let tw = 0, sr = 0, sg = 0, sb = 0;
      const cr = data[i], cg = data[i + 1], cb = data[i + 2];
      let weightIdx = 0;

      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            const ni = (ny * w + nx) * 4;
            if (data[ni + 3] > 0) {
              const dr = cr - data[ni], dg = cg - data[ni + 1], db = cb - data[ni + 2];
              const colorDist = dr * dr + dg * dg + db * db;
              const colorWeight = Math.exp(-colorDist * invSigmaColor2);
              const totalWeight = spatialWeights[weightIdx] * colorWeight;

              tw += totalWeight;
              sr += data[ni] * totalWeight;
              sg += data[ni + 1] * totalWeight;
              sb += data[ni + 2] * totalWeight;
            }
          }
          weightIdx++;
        }
      }

      if (tw > 0) {
        result[i] = Math.round(sr / tw);
        result[i + 1] = Math.round(sg / tw);
        result[i + 2] = Math.round(sb / tw);
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
