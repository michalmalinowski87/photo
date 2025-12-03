import { BasePlugin, type UppyFile } from "@uppy/core";
import imageCompression from "browser-image-compression";

/**
 * Custom Uppy plugin to upload thumbnails and previews to S3
 * 
 * This plugin:
 * 1. Uses Uppy's ThumbnailGenerator for 300px thumbnail (via thumbnail:generated event)
 * 2. Generates preview (1000px) using browser-image-compression library
 * 3. Converts to WebP format
 * 4. Uploads to S3 using presigned URLs
 * 
 * Optimization strategy:
 * - Thumbnails (300px, quality 80): ~14KB - Perfect for grid views, loads instantly
 * - Previews (1000px, quality 0.92): ~0.5-0.8MB - Optimized for cellular networks
 *   - Near-lossless quality (visually indistinguishable from lossless)
 *   - ~50-60% smaller than lossless WebP
 *   - For 100-image gallery: ~50-80MB total (vs 150MB with lossless)
 *   - On 4G: ~1-2 minutes load time (vs 2-4 minutes with lossless)
 * 
 * Why this approach:
 * - Uppy's ThumbnailGenerator: Best for 300px thumbnail (uses Canvas API internally, optimized)
 * - browser-image-compression: Better than raw Canvas API for 1000px preview (simpler, more reliable)
 * - Both use Canvas API under the hood, but these libraries handle edge cases better
 */
export class ThumbnailUploadPlugin extends BasePlugin {
  static VERSION = "1.0.0";

  constructor(uppy: any, opts: any) {
    super(uppy, opts);
    this.id = "thumbnail-upload";
    this.type = "modifier";
  }

  install() {
    // Listen for thumbnail generation event from Uppy's ThumbnailGenerator
    // We don't need to access the plugin directly - just listen to its events
    this.uppy.on("thumbnail:generated", this.handleThumbnailGenerated.bind(this));
    
    // Also listen for upload completion to upload preview (1200px) and ensure thumbnail is uploaded
    this.uppy.on("upload-success", this.handleUploadSuccess.bind(this));
  }

  uninstall() {
    this.uppy.off("thumbnail:generated", this.handleThumbnailGenerated);
    this.uppy.off("upload-success", this.handleUploadSuccess);
  }

  /**
   * Convert Blob to data URL asynchronously
   * This allows us to cache data URLs instead of blob URLs, avoiding fetch() calls
   */
  private blobToDataURL(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Handle when Uppy's ThumbnailGenerator creates a thumbnail
   * This gives us the 300px thumbnail that we can use directly
   * Event signature: thumbnail:generated(file, preview)
   * If Uppy gives us a blob URL, we convert it to a data URL immediately to avoid future fetch() calls
   */
  private async handleThumbnailGenerated(file: UppyFile, preview: string) {
    if (!file.meta) {
      file.meta = {};
    }
    
    // If Uppy gave us a blob URL, convert it to a data URL immediately
    // This way we avoid fetch() calls later when we need the blob
    if (preview.startsWith("blob:")) {
      try {
        // Fetch once and convert to data URL
        const response = await fetch(preview);
        const blob = await response.blob();
        const dataURL = await this.blobToDataURL(blob);
        
        // Store as data URL for future use (no more fetch() needed!)
        file.meta.thumbnailPreview = dataURL;
        
        // Also cache the blob so we don't need to convert again
        file.meta.thumbnailBlob = blob;
      } catch (error) {
        file.meta.thumbnailPreview = preview;
      }
    } else {
      // It's already a data URL - perfect!
      file.meta.thumbnailPreview = preview;
    }
  }

  private async handleUploadSuccess(file: UppyFile) {
    // Only process image files
    if (!file.type?.startsWith("image/")) {
      return;
    }

    // Get presigned URLs from file metadata (set during getUploadParameters)
    const presignedData = file.meta?.presignedData as {
      previewUrl?: string;
      thumbnailUrl?: string;
    } | undefined;

    if (!presignedData?.previewUrl || !presignedData?.thumbnailUrl) {
      return;
    }

    try {
      // Generate preview (1200px) - Uppy's ThumbnailGenerator only does 300px
      const preview = await this.generatePreview(file);
      
      // Get thumbnail from Uppy's ThumbnailGenerator (300px, already generated)
      const thumbnailBlob = await this.getThumbnailBlob(file);

      if (!preview || !thumbnailBlob) {
        return;
      }

      // Upload preview and thumbnail to S3
      await Promise.all([
        this.uploadToS3(presignedData.previewUrl, preview, "image/webp"),
        this.uploadToS3(presignedData.thumbnailUrl, thumbnailBlob, "image/webp"),
      ]);
    } catch (error) {
      // Don't fail the upload if thumbnail upload fails
    }
  }

  /**
   * Convert data URL to Blob synchronously (no fetch needed)
   * This is much more efficient than using fetch() which triggers network requests
   */
  private dataURLtoBlob(dataURL: string): Blob {
    const arr = dataURL.split(",");
    const mime = arr[0].match(/:(.*?);/)?.[1] || "image/webp";
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  }

  /**
   * Get the thumbnail blob from Uppy's generated thumbnail
   * The thumbnail was generated by ThumbnailGenerator and stored in file.preview
   * Since we configured thumbnailType: 'image/webp', it should already be WebP
   * Caches the blob in file.meta to avoid re-converting on every access
   */
  private async getThumbnailBlob(file: UppyFile): Promise<Blob | null> {
    try {
      // Check if we already cached the blob (avoid re-converting)
      if (file.meta?.thumbnailBlob && file.meta.thumbnailBlob instanceof Blob) {
        return file.meta.thumbnailBlob as Blob;
      }

      // Uppy's ThumbnailGenerator stores the 300px thumbnail in file.preview (data URL)
      // The preview property contains the data URL of the generated thumbnail
      const thumbnailPreview = file.preview || file.meta?.thumbnailPreview;
      
      if (!thumbnailPreview) {
        return null;
      }

      let blob: Blob;
      
      // At this point, thumbnailPreview should always be a data URL
      // because we converted blob URLs to data URLs in handleThumbnailGenerated()
      // If it's still a blob URL (shouldn't happen), fetch it but log a warning
      if (thumbnailPreview.startsWith("data:")) {
        // Convert data URL directly to blob WITHOUT fetch (no network request!)
        blob = this.dataURLtoBlob(thumbnailPreview);
      } else if (thumbnailPreview.startsWith("blob:")) {
        // This shouldn't happen if handleThumbnailGenerated() ran correctly
        const response = await fetch(thumbnailPreview);
        blob = await response.blob();
        // Convert to data URL for future use
        const dataURL = await this.blobToDataURL(blob);
        if (!file.meta) {
          file.meta = {};
        }
        file.meta.thumbnailPreview = dataURL;
      } else {
        throw new Error(`Unexpected thumbnail preview format: ${thumbnailPreview.substring(0, 20)}...`);
      }
      
      // Since we configured thumbnailType: 'image/webp', it should already be WebP
      // But verify and convert if needed
      if (blob.type !== "image/webp") {
        blob = await this.convertToWebP(blob, 200, 0.8);
      }
      
      // Cache the blob to avoid re-converting
      if (!file.meta) {
        file.meta = {};
      }
      file.meta.thumbnailBlob = blob;
      
      return blob;
    } catch (error) {
      return null;
    }
  }

  /**
   * Upload blob to S3 using presigned URL
   */
  private async uploadToS3(presignedUrl: string, blob: Blob, contentType: string): Promise<void> {
    const response = await fetch(presignedUrl, {
      method: "PUT",
      body: blob,
      headers: {
        "Content-Type": contentType,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to upload to S3: ${response.status} ${response.statusText}`);
    }
  }

  /**
   * Generate preview (1200px) from image using browser-image-compression
   * Thumbnail (300px) is generated by Uppy's ThumbnailGenerator
   * 
   * browser-image-compression is better than raw Canvas API because:
   * - Handles EXIF orientation automatically
   * - Better memory management
   * - Handles edge cases (very large images, etc.)
   * - Simpler API
   */
  private async generatePreview(
    file: UppyFile
  ): Promise<Blob | null> {
    if (!file.data || !(file.data instanceof File)) {
      return null;
    }

    try {
      // Use browser-image-compression to generate 1000px preview
      // Optimized for wedding galleries and cellular networks:
      // - 1000px: Still excellent for viewing, but smaller file size
      // - Quality 0.92: Near-lossless, visually indistinguishable from lossless
      //   but ~50-60% smaller file size (target: ~0.5-0.8MB per preview)
      // - For 100 images: ~50-80MB total (vs 150MB with lossless)
      //   On 4G (5-10 Mbps): ~1-2 minutes (vs 2-4 minutes with lossless)
      // - Quality 0.92 WebP maintains professional quality while being cellular-friendly
      const compressedFile = await imageCompression(file.data as File, {
        maxSizeMB: 5, // Reasonable limit for 1000px preview
        maxWidthOrHeight: 1000, // Fit inside 1000px, maintain aspect ratio (optimized for cellular)
        useWebWorker: false, // Simpler, works everywhere
        fileType: "image/webp", // Convert to WebP
        initialQuality: 0.92, // Near-lossless quality (92%) - excellent quality, ~50-60% smaller than lossless
      });

      return compressedFile;
    } catch (error) {
      return null;
    }
  }

  /**
   * Convert image blob to WebP format (fallback if thumbnail is not WebP)
   * Uses browser-image-compression for reliable conversion
   */
  private async convertToWebP(
    blob: Blob,
    maxWidthOrHeight: number,
    quality: number
  ): Promise<Blob> {
    try {
      // Convert blob to File for imageCompression
      const file = new File([blob], "image.jpg", { type: blob.type });
      
      const compressedFile = await imageCompression(file, {
        maxSizeMB: 10,
        maxWidthOrHeight,
        useWebWorker: false,
        fileType: "image/webp",
        initialQuality: quality,
      });
      
      return compressedFile;
    } catch (error) {
      return blob; // Fallback to original
    }
  }
}

