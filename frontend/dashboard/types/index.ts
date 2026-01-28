/**
 * Shared type definitions for the PhotoCloud dashboard
 * These types are used across multiple components and should be imported from here
 * instead of being redeclared in individual files.
 */

export interface GalleryImage {
  id?: string;
  key?: string;
  filename?: string;
  url?: string;
  thumbUrl?: string;
  thumbUrlFallback?: string;
  previewUrl?: string;
  previewUrlFallback?: string;
  bigThumbUrl?: string;
  bigThumbUrlFallback?: string;
  finalUrl?: string;
  isPlaceholder?: boolean;
  uploadTimestamp?: number;
  uploadIndex?: number;
  size?: number;
  lastModified?: number | string;
  [key: string]: unknown;
}

export interface Gallery {
  galleryId: string;
  originalsLimitBytes?: number;
  finalsLimitBytes?: number;
  originalsBytesUsed?: number;
  finalsBytesUsed?: number;
  state?: string;
  paymentStatus?: string;
  selectionEnabled?: boolean;
  nextStepsCompleted?: boolean;
  nextStepsOverlayDismissed?: boolean; // User explicitly dismissed the overlay
  createdAt?: string;
  clientFirstName?: string;
  clientLastName?: string;
  ownerSubdomain?: string | null;
  loginPageLayout?: string;
  coverPhotoPosition?: {
    x?: number;
    y?: number;
    scale?: number;
    objectPosition?: string;
  };
  watermarkUrl?: string; // Only used for custom watermarks
  watermarkPosition?: {
    // New pattern-based system
    pattern?: string; // Watermark pattern ID: "none", "sample", "podglad", "tile-ph", "custom"
    opacity?: number; // Opacity 0.1-1.0
    // Legacy: old positioning system (for backward compatibility)
    corner?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "top" | "bottom" | "left" | "right" | "center";
    offsetX?: number;
    offsetY?: number;
    x?: number;
    y?: number;
    scale?: number;
    position?: string;
  };
  [key: string]: unknown;
}

// Order type definition (single source of truth)
export interface Order {
  orderId: string;
  galleryId: string;
  deliveryStatus?: string;
  paymentStatus?: string;
  selectedKeys?: string[] | string;
  selectedCount?: number;
  overageCents?: number;
  createdAt?: string;
  deliveredAt?: string;
  orderNumber?: string | number;
  [key: string]: unknown;
}

export interface Client {
  clientId: string;
  ownerId: string;
  name?: string;
  email?: string;
  phone?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface Package {
  packageId: string;
  ownerId: string;
  name?: string;
  description?: string;
  priceCents?: number;
  imageCount?: number;
  createdAt?: string;
  [key: string]: unknown;
}
