/**
 * Web Worker for parallel thumbnail generation using browser-image-compression
 * Uses proven library for better quality and reliability
 * 
 * Note: browser-image-compression library is loaded via importScripts from CDN
 * This ensures the library is available in the Web Worker context
 */

// Import browser-image-compression from CDN (UMD build works in Web Workers)
importScripts('https://cdn.jsdelivr.net/npm/browser-image-compression@2.0.2/dist/browser-image-compression.umd.js');

// Configuration - Ultra-aggressively optimized for maximum performance
// browser-image-compression uses better algorithms than Canvas.toDataURL()
// This is why 0.55 quality looks better than Uppy's 0.8 quality
// Quality limit reached at 0.20, now optimizing dimensions
const THUMBNAIL_WIDTH = 96; // Reduced by 20% from 120px (120 * 0.8 = 96px) for even faster processing
const THUMBNAIL_QUALITY = 0.20; // Quality limit reached - maintaining at 0.20

/**
 * Generate thumbnail using browser-image-compression library
 * This library handles edge cases better than raw Canvas API:
 * - Proper EXIF handling
 * - Better color space conversion
 * - Handles various image formats reliably
 * - Better quality scaling algorithms
 */
async function generateThumbnail(fileData, fileName, fileType) {
  try {
    // Detect or use provided MIME type
    let mimeType = fileType || 'image/jpeg';
    
    // If no type provided, try to detect from file name
    if (!mimeType || mimeType === 'application/octet-stream') {
      const ext = fileName.toLowerCase().split('.').pop();
      const typeMap = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'webp': 'image/webp',
        'gif': 'image/gif',
      };
      mimeType = typeMap[ext] || 'image/jpeg';
    }
    
    // Create blob from file data with proper MIME type
    const blob = new Blob([fileData], { type: mimeType });
    
    // Use browser-image-compression for better quality and reliability
    // This library handles EXIF, color space, and edge cases better than raw Canvas
    // Note: browser-image-compression is available globally after importScripts
    // In Web Workers, it's available as imageCompression (not window.imageCompression)
    const imageCompressionFn = typeof imageCompression !== 'undefined' ? imageCompression : self.imageCompression;
    const compressedBlob = await imageCompressionFn(blob, {
      maxWidthOrHeight: THUMBNAIL_WIDTH,
      useWebWorker: false, // We're already in a Web Worker, don't spawn another
      fileType: 'image/jpeg',
      initialQuality: THUMBNAIL_QUALITY,
      alwaysKeepResolution: false, // Allow downscaling
      preserveExif: false, // Don't need EXIF for thumbnails (faster)
      // Ultra-aggressive performance optimizations - targeting 10KB file size
      maxSizeMB: 0.01, // Target 10KB file size (reduced from 30KB) for fastest processing and smaller files
      exifOrientation: 1, // Skip EXIF orientation processing (faster)
      // Additional optimizations for maximum speed
      maxIteration: 1, // Limit compression iterations for speed (default is 10)
      // Skip unnecessary processing
      resizeType: 'contain', // Faster than 'fill' or other options
    });
    
    // Convert blob to data URL for transfer back to main thread
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        // Get dimensions from the compressed image
        const img = new Image();
        img.onload = () => {
          resolve({
            thumbnail: reader.result, // data URL
            width: img.width,
            height: img.height,
          });
        };
        img.onerror = () => {
          // If we can't get dimensions, use defaults
          resolve({
            thumbnail: reader.result,
            width: THUMBNAIL_WIDTH,
            height: THUMBNAIL_WIDTH,
          });
        };
        img.src = reader.result;
      };
      reader.onerror = () => {
        reject(new Error('Failed to read compressed thumbnail blob'));
      };
      reader.readAsDataURL(compressedBlob);
    });
  } catch (error) {
    throw new Error(`Thumbnail generation failed: ${error.message}`);
  }
}

// Listen for messages from main thread
self.addEventListener('message', async (event) => {
  const { fileId, fileData, fileName, fileType, command } = event.data;
  
  if (command === 'generate') {
    try {
      const startTime = performance.now();
      const result = await generateThumbnail(fileData, fileName, fileType);
      const duration = performance.now() - startTime;
      
      // Send result back to main thread
      self.postMessage({
        fileId,
        success: true,
        thumbnail: result.thumbnail,
        width: result.width,
        height: result.height,
        duration,
      });
    } catch (error) {
      self.postMessage({
        fileId,
        success: false,
        error: error.message || 'Thumbnail generation failed',
      });
    }
  }
});
