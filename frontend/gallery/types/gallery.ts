export interface ImageData {
  key: string;
  /** Full quality URL — never exposed in gallery app (clients); only dashboard/owners may have it */
  url?: string;
  previewUrl?: string; // Preview URL (1400px) for carousel main image
  thumbnailUrl?: string; // Thumbnail URL (600px) for carousel thumbnails (may be mapped from thumbUrl)
  thumbUrl?: string; // Thumbnail URL (600px) from backend API
  bigThumbUrl?: string; // Big thumbnail URL (600px)
  size?: number; // bytes (when provided by API)
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

export interface PricingPackage {
  includedCount: number;
  extraPriceCents: number;
  packagePriceCents: number;
  packageName?: string;
  photoBookCount?: number;
  photoPrintCount?: number;
}

export interface SelectionState {
  selectedKeys: string[];
  photoBookKeys?: string[];
  photoPrintKeys?: string[];
  approved: boolean;
  selectedCount: number;
  overageCount: number;
  overageCents: number;
  canSelect: boolean;
  changeRequestPending: boolean;
  hasClientApprovedOrder: boolean;
  changeRequestsBlocked: boolean;
  hasDeliveredOrder: boolean;
  selectionEnabled: boolean;
  pricingPackage: PricingPackage;
}

export interface DeliveredOrder {
  orderId: string;
  orderNumber?: number;
  deliveredAt: string;
  selectedCount: number;
  createdAt: string;
}

export interface DeliveredOrdersResponse {
  items: DeliveredOrder[];
}

export interface ClientApprovedOrder {
  orderId: string;
  orderNumber?: number;
  selectedKeys: string[];
  selectedCount: number;
  createdAt: string;
}

export interface ClientApprovedOrdersResponse {
  items: ClientApprovedOrder[];
}
