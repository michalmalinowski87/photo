/**
 * Watermark utilities for applying watermarks to images
 * Supports both uploaded watermarks and default system "PREVIEW" watermark
 */


/**
 * Generate default "PREVIEW" SVG watermark text
 * Returns SVG string that can be used to create an image
 */
export function generateDefaultWatermarkSVG(): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="200" height="60" viewBox="0 0 200 60">
      <text
        x="100"
        y="35"
        font-family="Arial, sans-serif"
        font-size="32"
        font-weight="bold"
        fill="rgba(0, 0, 0, 0.3)"
        text-anchor="middle"
        dominant-baseline="middle"
      >PREVIEW</text>
    </svg>
  `.trim();
  return svg;
}

/**
 * Convert SVG string to ImageData for Canvas
 */
function svgToImage(svgString: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const svgBlob = new Blob([svgString], { type: "image/svg+xml" });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (error) => {
      URL.revokeObjectURL(url);
      reject(error);
    };
    img.src = url;
  });
}

/**
 * Apply default "PREVIEW" watermark with multiply blend mode
 * Tiles the watermark across the entire image at -45 degree angle
 */
export async function applyDefaultWatermark(imageBlob: Blob): Promise<Blob> {
  const svgString = generateDefaultWatermarkSVG();
  const watermarkImage = await svgToImage(svgString);

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(imageBlob);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }

      // Draw the original image
      ctx.drawImage(img, 0, 0);

      // Set multiply blend mode
      ctx.globalCompositeOperation = "multiply";

      // Calculate tile spacing (watermark size + gap)
      const watermarkWidth = watermarkImage.width;
      const watermarkHeight = watermarkImage.height;
      // Horizontal spacing: wider to prevent word overlap within a line
      const spacingX = Math.max(watermarkWidth, watermarkHeight) * 1.0;
      // Vertical spacing: tighter to create more lines/rows
      const spacingY = Math.max(watermarkWidth, watermarkHeight) * 0.5;
      const diagonal = Math.sqrt(canvas.width ** 2 + canvas.height ** 2);

      // Rotate context to -45 degrees
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((-45 * Math.PI) / 180);

      // Tile the watermark across the entire image
      // Start from top-left of rotated coordinate system
      // Cover the entire diagonal to ensure full coverage
      const startX = -diagonal / 2;
      const startY = -diagonal / 2;
      const endX = diagonal / 2;
      const endY = diagonal / 2;

      for (let x = startX; x < endX; x += spacingX) {
        for (let y = startY; y < endY; y += spacingY) {
          ctx.drawImage(watermarkImage, x - watermarkWidth / 2, y - watermarkHeight / 2);
        }
      }

      ctx.restore();

      // Convert canvas to blob
      // Note: This will fail if the canvas is tainted (image loaded without CORS)
      try {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error("Failed to convert canvas to blob - canvas may be tainted. CORS configuration required."));
            }
          },
          "image/webp",
          0.92
        );
      } catch (error) {
        reject(new Error(`Canvas export failed: ${error instanceof Error ? error.message : String(error)}. This usually means the watermark image was loaded without CORS headers.`));
      }
    };

    img.onerror = (error) => {
      URL.revokeObjectURL(url);
      reject(error);
    };
    img.src = url;
  });
}

/**
 * Load watermark image from URL
 * CloudFront now has CORS headers configured via ResponseHeadersPolicy, so we can load directly.
 * For canvas operations, we MUST have CORS. We cannot use non-CORS images as they taint the canvas.
 */
async function loadWatermarkImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    
    img.onload = () => {
      resolve(img);
    };
    
    img.onerror = (error) => {
      console.error("Failed to load watermark image:", url, error);
      reject(new Error(`Failed to load watermark image from ${url}. CORS configuration required on CloudFront for canvas operations.`));
    };
    
    img.src = url;
  });
}

/**
 * Apply uploaded watermark to image
 * Tiles the watermark in a clean grid pattern (left-to-right, top-to-bottom)
 * Fits as many rows and columns as the image allows
 */
export async function applyWatermark(
  imageBlob: Blob,
  watermarkUrl: string,
  opacity: number = 0.7
): Promise<Blob> {
  const watermarkImage = await loadWatermarkImage(watermarkUrl);

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(imageBlob);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }

      // Draw the original image
      ctx.drawImage(img, 0, 0);

      // Clamp opacity to valid range (0.0 to 1.0)
      const clampedOpacity = Math.min(1.0, Math.max(0.0, opacity));

      // Get watermark dimensions
      let watermarkWidth = watermarkImage.width;
      let watermarkHeight = watermarkImage.height;
      
      // Validate watermark dimensions
      if (watermarkWidth <= 0 || watermarkHeight <= 0) {
        reject(new Error(`Invalid watermark dimensions: ${watermarkWidth}x${watermarkHeight}`));
        return;
      }
      
      // Check if canvas is smaller than watermark * 3 (means watermark is too large to fit 3 columns/rows)
      // If canvas < watermark * 3, scale watermark down to 33% of longest edge
      // This ensures we can fit at least 3 columns and 3 rows (works well for both landscape and portrait)
      const imageLongestEdge = Math.max(canvas.width, canvas.height);
      const watermarkLargestDimension = Math.max(watermarkWidth, watermarkHeight);
      const needsScaling = canvas.width < watermarkWidth * 3 || canvas.height < watermarkHeight * 3;
      
      if (needsScaling) {
        // Scale down to 33% of image's longest edge, maintaining aspect ratio
        const targetSize = imageLongestEdge * 0.33;
        const scale = targetSize / watermarkLargestDimension;
        watermarkWidth = watermarkWidth * scale;
        watermarkHeight = watermarkHeight * scale;
      }
      
      // Calculate how many watermarks we need to cover the entire canvas (including partial ones at edges)
      // Use Math.ceil to ensure we cover the entire area, even if the last watermark extends beyond the edge
      const cols = Math.ceil(canvas.width / watermarkWidth);
      const rows = Math.ceil(canvas.height / watermarkHeight);
      
      // Ensure at least 1 column and 1 row
      const finalCols = Math.max(1, cols);
      const finalRows = Math.max(1, rows);
      
      // No gaps between watermarks - place them directly adjacent to each other
      // Start from top-left (0,0)
      // Watermarks that extend beyond canvas edges will be automatically clipped by the canvas

      // Set opacity for watermark
      ctx.globalAlpha = clampedOpacity;

      // Tile the watermark across the entire canvas (like CSS background-repeat: repeat)
      // Draw watermarks until we've covered the entire area, including edges
      let drawnCount = 0;
      for (let row = 0; row < finalRows; row++) {
        for (let col = 0; col < finalCols; col++) {
          const x = col * watermarkWidth;
          const y = row * watermarkHeight;
          ctx.drawImage(watermarkImage, x, y, watermarkWidth, watermarkHeight);
          drawnCount++;
        }
      }

      // Convert canvas to blob
      // Note: This will fail if the canvas is tainted (image loaded without CORS)
      try {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error("Failed to convert canvas to blob - canvas may be tainted. CORS configuration required."));
            }
          },
          "image/webp",
          0.92
        );
      } catch (error) {
        reject(new Error(`Canvas export failed: ${error instanceof Error ? error.message : String(error)}. This usually means the watermark image was loaded without CORS headers.`));
      }
    };

    img.onerror = (error) => {
      URL.revokeObjectURL(url);
      reject(error);
    };
    img.src = url;
  });
}
