import { BasePlugin } from "@uppy/core";
import Uppy from "@uppy/core";

/**
 * Custom Uppy plugin to prevent compression of small images in thumbnails
 *
 * Uppy's ThumbnailGenerator compresses ALL images at quality 80 (hardcoded),
 * which causes quality degradation for small images. This plugin prevents
 * ThumbnailGenerator from processing small images by setting preview early
 * and making it non-writable.
 *
 * Strategy:
 * - Load dimensions immediately when files are added
 * - For small images (< 300px), set preview to original blob URL immediately
 * - Make preview non-writable to prevent ThumbnailGenerator from overwriting
 * - For large images, allow ThumbnailGenerator to generate compressed thumbnails
 * - This avoids compression artifacts on small images while maintaining efficiency for large ones
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class NoUpscaleThumbnailPlugin extends BasePlugin<any, any, any> {
  static VERSION = "1.0.0";

  private imageDimensionsMap = new Map<string, { width: number; height: number }>();
  private blobUrlCache = new Map<string, string>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(uppy: Uppy, opts: Record<string, unknown>) {
    super(uppy, opts);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    this.id = "no-upscale-thumbnail";
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    this.type = "modifier";
  }

  override install() {
    // CRITICAL: Run BEFORE ThumbnailGenerator by using file-added event
    // We need to set preview and make it non-writable BEFORE ThumbnailGenerator processes the file
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    (this.uppy as Uppy).on("file-added", this.handleFileAdded.bind(this));

    // Backup: Intercept thumbnail generation in case ThumbnailGenerator still runs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    (this.uppy as Uppy).on("thumbnail:generated", this.handleThumbnailGenerated.bind(this));

    // Clean up when files are removed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    (this.uppy as Uppy).on("file-removed", this.handleFileRemoved.bind(this));
  }

  override uninstall() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/unbound-method
    (this.uppy as Uppy).off("file-added", this.handleFileAdded);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/unbound-method
    (this.uppy as Uppy).off("thumbnail:generated", this.handleThumbnailGenerated);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/unbound-method
    (this.uppy as Uppy).off("file-removed", this.handleFileRemoved);
    // Clean up blob URLs
    this.blobUrlCache.forEach((url) => URL.revokeObjectURL(url));
    this.blobUrlCache.clear();
    this.imageDimensionsMap.clear();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleFileAdded(file: any) {
    if (!file.data || !(file.data instanceof File) || !file.type?.startsWith("image/")) {
      return;
    }

    // Create blob URL immediately
    const blobUrl = URL.createObjectURL(file.data);
    this.blobUrlCache.set(file.id, blobUrl);

    // STRATEGY: Set preview immediately for ALL images to block ThumbnailGenerator
    // Then load dimensions and adjust - if large, clear preview to allow ThumbnailGenerator
    // This ensures small images are protected BEFORE ThumbnailGenerator can process them
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    (file as any).preview = blobUrl;

    // Try to make preview non-writable immediately (will adjust after dimensions load)
    try {
      Object.defineProperty(file, "preview", {
        value: blobUrl,
        writable: false,
        configurable: true, // Keep configurable so we can adjust for large images
        enumerable: true,
      });
    } catch (_error) {
      // If defineProperty fails, preview is still set - backup handler will monitor
    }

    // Load dimensions to determine final strategy
    const img = new Image();
    img.onload = () => {
      const dimensions = {
        width: img.width,
        height: img.height,
      };
      this.imageDimensionsMap.set(file.id, dimensions);

      const maxDimension = Math.max(dimensions.width, dimensions.height);
      const THUMBNAIL_MAX_SIZE = 300;

      if (maxDimension < THUMBNAIL_MAX_SIZE) {
        // Image is SMALL - keep blob URL, ensure preview is non-writable
        try {
          Object.defineProperty(file, "preview", {
            value: blobUrl,
            writable: false,
            configurable: false, // Make non-configurable for extra protection
            enumerable: true,
          });
        } catch (_error) {
          // If reconfiguration fails, preview is already set correctly
        }
      } else {
        // Image is LARGE - allow ThumbnailGenerator to generate compressed thumbnail
        // Make preview writable and clear it so ThumbnailGenerator can set it
        try {
          Object.defineProperty(file, "preview", {
            value: blobUrl,
            writable: true,
            configurable: true,
            enumerable: true,
          });
          // Clear preview so ThumbnailGenerator will generate it
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
          delete (file as any).preview;
        } catch (_error) {
          // If reconfiguration fails, ThumbnailGenerator will handle it
        }
      }
    };
    img.onerror = () => {
      // If image load fails, assume it's small and keep blob URL protected
      try {
        Object.defineProperty(file, "preview", {
          value: blobUrl,
          writable: false,
          configurable: false,
          enumerable: true,
        });
      } catch (_error) {
        // Fallback - preview is already set
      }
    };
    img.src = blobUrl;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
  private handleThumbnailGenerated(file: any, _preview?: string) {
    this.replacePreviewIfSmall(file);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private replacePreviewIfSmall(file: any) {
    const dimensions = this.imageDimensionsMap.get(file.id);
    const blobUrl = this.blobUrlCache.get(file.id);

    if (!dimensions || !blobUrl) {
      return; // No dimensions or blob URL, use default thumbnail
    }

    const { width, height } = dimensions;
    const maxDimension = Math.max(width, height);
    const THUMBNAIL_MAX_SIZE = 300; // Match ThumbnailGenerator config

    // If image is smaller than thumbnail size, ensure blob URL is used
    if (maxDimension < THUMBNAIL_MAX_SIZE) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      const currentPreview = (file as any).preview;
      
      // If preview is not our blob URL (or doesn't exist), replace it and make non-writable
      if (currentPreview !== blobUrl) {
        // Use requestAnimationFrame to ensure this happens after any synchronous updates
        requestAnimationFrame(() => {
          // Double-check dimensions still exist (file might have been removed)
          if (this.imageDimensionsMap.has(file.id) && this.blobUrlCache.has(file.id)) {
            try {
              // Try to make it non-writable first
              Object.defineProperty(file, "preview", {
                value: blobUrl,
                writable: false,
                configurable: true,
                enumerable: true,
              });
            } catch (_error) {
              // If defineProperty fails, just set it (fallback)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
              (file as any).preview = blobUrl;
            }
          }
        });
      }
    } else {
      // Image is large enough, use default thumbnail (already generated)
      // Clean up blob URL since we're using the generated thumbnail
      URL.revokeObjectURL(blobUrl);
      this.blobUrlCache.delete(file.id);
      this.imageDimensionsMap.delete(file.id);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleFileRemoved(file: any) {
    const blobUrl = this.blobUrlCache.get(file.id);
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      this.blobUrlCache.delete(file.id);
    }
    this.imageDimensionsMap.delete(file.id);
  }
}
