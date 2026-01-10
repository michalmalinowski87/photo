import { BasePlugin } from "@uppy/core";
import Uppy from "@uppy/core";

/**
 * Custom Uppy plugin to prevent upscaling of small images
 *
 * ThumbnailGenerator upscales small images to thumbnail size, causing blur.
 * This plugin prevents that by using original blob URL for small images.
 * Large images are handled by ThumbnailGenerator with optimized settings.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class NoUpscaleThumbnailPlugin extends BasePlugin<any, any, any> {
  static VERSION = "1.0.0";

  private blobUrlCache = new Map<string, string>();
  private readonly THUMBNAIL_SIZE = 150; // Match ThumbnailGenerator config

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(uppy: Uppy, opts: Record<string, unknown>) {
    super(uppy, opts);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    this.id = "no-upscale-thumbnail";
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    this.type = "modifier";
  }

  override install() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    (this.uppy as Uppy).on("file-added", this.handleFileAdded.bind(this));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    (this.uppy as Uppy).on("file-removed", this.handleFileRemoved.bind(this));
  }

  override uninstall() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/unbound-method
    (this.uppy as Uppy).off("file-added", this.handleFileAdded);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/unbound-method
    (this.uppy as Uppy).off("file-removed", this.handleFileRemoved);
    this.blobUrlCache.forEach((url) => URL.revokeObjectURL(url));
    this.blobUrlCache.clear();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleFileAdded(file: any) {
    if (!file.data || !(file.data instanceof File) || !file.type?.startsWith("image/")) {
      return;
    }

    const blobUrl = URL.createObjectURL(file.data);
    this.blobUrlCache.set(file.id, blobUrl);

    // Set preview immediately to block ThumbnailGenerator
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    (file as any).preview = blobUrl;

    // Check dimensions - if small, keep blob URL (no upscaling)
    const img = new Image();
    img.onload = () => {
      const maxDimension = Math.max(img.width, img.height);
      if (maxDimension >= this.THUMBNAIL_SIZE) {
        // Large image: clear preview to let ThumbnailGenerator handle it
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
        delete (file as any).preview;
      }
      // Small image: preview already set to blob URL, keep it
    };
    img.src = blobUrl;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleFileRemoved(file: any) {
    const blobUrl = this.blobUrlCache.get(file.id);
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      this.blobUrlCache.delete(file.id);
    }
  }
}
