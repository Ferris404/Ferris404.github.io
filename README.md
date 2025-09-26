# Color Separator Website

A web application for separating colors in images using various quantization algorithms.

## Features

- **Multiple image processing**: Upload and process multiple images at once
- **Color quantization algorithms**: K-Means++, Median Cut, Octree, and LAB color space clustering
- **Multiple color spaces**: RGB, LAB, XYZ, HSV support
- **Preprocessing options**: Gaussian blur, bilateral filter, median filter
- **Interactive color palette**: Lock colors, merge colors, adjust individual colors
- **Smart export**: 
  - Single image: Creates a ZIP with color layers
  - Multiple images: Creates a ZIP with folders named after each image containing their color layers
- **Real-time preview**: Compare original vs processed images with an interactive slider

## Usage

1. **Upload Images**: Click "Choose files" or drag and drop one or more images
2. **Configure Settings**: Adjust color count, algorithm, and preprocessing options
3. **Process**: Click "Separate" to process all uploaded images
4. **Download**: Click "Download Layers" to get your results
   - Single image: `color-layers.zip` 
   - Multiple images: `color-separation-results.zip` with folders for each image

## Technical Details

- Pure JavaScript implementation (no TypeScript dependencies)
- Web Workers for non-blocking image processing
- Canvas API for image manipulation
- JSZip for archive creation
- Vitest for testing