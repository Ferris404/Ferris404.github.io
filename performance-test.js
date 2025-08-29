// Performance benchmark for color separation optimizations
import { quantizeColorsKMeansAdvanced, SeededRandom } from './quantization.js';

// Create test data
function createTestImage(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  const rng = new SeededRandom(42);

  for (let i = 0; i < data.length; i += 4) {
    // Create some colorful test data
    data[i] = Math.floor(rng.next() * 256);     // R
    data[i + 1] = Math.floor(rng.next() * 256); // G
    data[i + 2] = Math.floor(rng.next() * 256); // B
    data[i + 3] = 255; // Alpha
  }

  return data;
}

// Benchmark function
function benchmark(name, fn, iterations = 5) {
  const times = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    const end = performance.now();
    times.push(end - start);
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);

  console.log(`${name}:`);
  console.log(`  Average: ${avg.toFixed(2)}ms`);
  console.log(`  Min: ${min.toFixed(2)}ms`);
  console.log(`  Max: ${max.toFixed(2)}ms`);
  console.log('');

  return avg;
}

// Run benchmarks
console.log('Color Separation Performance Benchmark');
console.log('=====================================');

const testData = createTestImage(200, 200); // 40,000 pixels
const rng = new SeededRandom(12345);

benchmark('K-Means RGB (5 colors)', () => {
  quantizeColorsKMeansAdvanced(testData, 5, 'rgb', false, rng);
});

benchmark('K-Means RGB with Perceptual Weighting (5 colors)', () => {
  quantizeColorsKMeansAdvanced(testData, 5, 'rgb', true, rng);
});

benchmark('K-Means LAB (5 colors)', () => {
  quantizeColorsKMeansAdvanced(testData, 5, 'lab', false, rng);
});

benchmark('K-Means LAB with CIEDE2000 (5 colors)', () => {
  quantizeColorsKMeansAdvanced(testData, 5, 'lab', false, rng, true);
});

console.log('Benchmark complete!');
