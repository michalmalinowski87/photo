export interface ImageData {
  key: string;
  url: string; // Full quality URL
  previewUrl?: string; // Preview URL (1400px) for carousel main image
  thumbnailUrl?: string; // Thumbnail URL (300x300) for carousel thumbnails (may be mapped from thumbUrl)
  thumbUrl?: string; // Thumbnail URL (300x300) from backend API
  bigThumbUrl?: string; // Big thumbnail URL (600px)
  alt?: string;
  width?: number;
  height?: number;
  [key: string]: any;
}

export interface GalleryInfo {
  id: string;
  name: string;
  [key: string]: any;
}
