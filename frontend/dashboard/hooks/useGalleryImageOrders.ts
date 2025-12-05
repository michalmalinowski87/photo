import { useState, useCallback } from "react";

import { useGalleryStore } from "../store";

interface GalleryOrder {
  orderId?: string;
  orderNumber?: string | number;
  deliveryStatus?: string;
  selectedKeys?: string[] | string;
  createdAt?: string;
  deliveredAt?: string;
  [key: string]: unknown;
}

interface UseGalleryImageOrdersResult {
  orders: GalleryOrder[];
  approvedSelectionKeys: Set<string>;
  allOrderSelectionKeys: Set<string>;
  imageOrderStatus: Map<string, string>;
  loadApprovedSelections: () => Promise<void>;
}

/**
 * Hook to manage gallery orders and their relationship with images
 * Tracks which images are in approved orders, all orders, and their status
 */
export function useGalleryImageOrders(
  galleryId: string | string[] | undefined
): UseGalleryImageOrdersResult {
  const { fetchGalleryOrders } = useGalleryStore();
  const [orders, setOrders] = useState<GalleryOrder[]>([]);
  const [approvedSelectionKeys, setApprovedSelectionKeys] = useState<Set<string>>(new Set());
  const [allOrderSelectionKeys, setAllOrderSelectionKeys] = useState<Set<string>>(new Set());
  const [imageOrderStatus, setImageOrderStatus] = useState<Map<string, string>>(new Map());

  const normalizeOrderSelectedKeys = (selectedKeys: string[] | string | undefined): string[] => {
    if (!selectedKeys) {
      return [];
    }
    if (Array.isArray(selectedKeys)) {
      return selectedKeys.map((k) => k.toString().trim());
    }
    if (typeof selectedKeys === "string") {
      try {
        const parsed: unknown = JSON.parse(selectedKeys);
        return Array.isArray(parsed) ? parsed.map((k: unknown) => String(k).trim()) : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  const loadApprovedSelections = useCallback(async (): Promise<void> => {
    if (!galleryId) {
      return;
    }

    try {
      const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : galleryId;
      if (!galleryIdStr || typeof galleryIdStr !== "string") {
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const ordersDataRaw = await fetchGalleryOrders(galleryIdStr);
      const ordersData = ordersDataRaw as GalleryOrder[];

      setOrders(ordersData);

      // Find orders with CLIENT_APPROVED or PREPARING_DELIVERY status (cannot delete)
      const approvedOrders = ordersData.filter(
        (o) => o.deliveryStatus === "CLIENT_APPROVED" || o.deliveryStatus === "PREPARING_DELIVERY"
      );

      // Collect all selected keys from approved orders
      const approvedKeys = new Set<string>();
      approvedOrders.forEach((order) => {
        const selectedKeys = normalizeOrderSelectedKeys(order.selectedKeys);
        selectedKeys.forEach((key: string) => approvedKeys.add(key));
      });

      setApprovedSelectionKeys(approvedKeys);

      // Collect all selected keys from ANY order (for "Selected" display)
      // Also track order delivery status for each image
      const allOrderKeys = new Set<string>();
      const imageStatusMap = new Map<string, string>();

      ordersData.forEach((order) => {
        const selectedKeys = normalizeOrderSelectedKeys(order.selectedKeys);
        const orderStatus = order.deliveryStatus || "";

        selectedKeys.forEach((key: string) => {
          allOrderKeys.add(key);
          // Track the highest priority status for each image
          // Priority: DELIVERED > PREPARING_DELIVERY > PREPARING_FOR_DELIVERY > CLIENT_APPROVED
          const currentStatus = imageStatusMap.get(key);
          if (!currentStatus) {
            imageStatusMap.set(key, orderStatus);
          } else if (orderStatus === "DELIVERED") {
            imageStatusMap.set(key, "DELIVERED");
          } else if (orderStatus === "PREPARING_DELIVERY" && currentStatus !== "DELIVERED") {
            imageStatusMap.set(key, "PREPARING_DELIVERY");
          } else if (
            orderStatus === "PREPARING_FOR_DELIVERY" &&
            currentStatus !== "DELIVERED" &&
            currentStatus !== "PREPARING_DELIVERY"
          ) {
            imageStatusMap.set(key, "PREPARING_FOR_DELIVERY");
          } else if (
            orderStatus === "CLIENT_APPROVED" &&
            currentStatus !== "DELIVERED" &&
            currentStatus !== "PREPARING_DELIVERY" &&
            currentStatus !== "PREPARING_FOR_DELIVERY"
          ) {
            imageStatusMap.set(key, "CLIENT_APPROVED");
          }
        });
      });

      setAllOrderSelectionKeys(allOrderKeys);
      setImageOrderStatus(imageStatusMap);
    } catch (err) {
      // Check if error is 404 (gallery not found/deleted) - handle silently
      const apiError = err as { status?: number };
      if (apiError.status === 404) {
        // Gallery doesn't exist (deleted) - silently return empty state
        setOrders([]);
        setApprovedSelectionKeys(new Set());
        setAllOrderSelectionKeys(new Set());
        setImageOrderStatus(new Map());
        return;
      }

      // For other errors, log but don't show toast - this is not critical
      // eslint-disable-next-line no-console
      console.error("[useGalleryImageOrders] loadApprovedSelections: Error", err);
    }
  }, [galleryId, fetchGalleryOrders]);

  return {
    orders,
    approvedSelectionKeys,
    allOrderSelectionKeys,
    imageOrderStatus,
    loadApprovedSelections,
  };
}
