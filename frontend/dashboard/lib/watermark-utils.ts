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
 * Tiles the watermark across the entire image with opacity
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

      // Calculate tile spacing
      const watermarkWidth = watermarkImage.width;
      const watermarkHeight = watermarkImage.height;
      
      // Spacing: allow some overlap for better coverage
      const spacingX = watermarkWidth * 0.8;
      const spacingY = watermarkHeight * 0.8;
      
      // Calculate diagonal coverage (for rotated patterns)
      const diagonal = Math.sqrt(canvas.width ** 2 + canvas.height ** 2);

      // Rotate context to -45 degrees for diagonal tiling
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((-45 * Math.PI) / 180);

      // Set opacity for watermark (real alpha)
      ctx.globalAlpha = clampedOpacity;

      // Tile the watermark across the entire image
      const startX = -diagonal / 2;
      const startY = -diagonal / 2;
      const endX = diagonal / 2;
      const endY = diagonal / 2;

      for (let x = startX; x < endX; x += spacingX) {
        for (let y = startY; y < endY; y += spacingY) {
          ctx.drawImage(
            watermarkImage,
            x - watermarkWidth / 2,
            y - watermarkHeight / 2
          );
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
