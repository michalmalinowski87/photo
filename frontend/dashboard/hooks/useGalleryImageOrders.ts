import { useState, useCallback, useEffect, useRef, useMemo } from "react";

import { useOrders } from "./queries/useOrders";

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
  const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : galleryId;
  const galleryIdForQuery =
    galleryIdStr && typeof galleryIdStr === "string" ? galleryIdStr : undefined;

  const { data: ordersData, refetch } = useOrders(galleryIdForQuery);
  // Use a stable empty array reference to prevent unnecessary re-renders
  const stableEmptyArray = useMemo(() => [], []);
  const ordersDataArray = ordersData ?? stableEmptyArray;

  const [orders, setOrders] = useState<GalleryOrder[]>([]);
  const [approvedSelectionKeys, setApprovedSelectionKeys] = useState<Set<string>>(new Set());
  const [allOrderSelectionKeys, setAllOrderSelectionKeys] = useState<Set<string>>(new Set());
  const [imageOrderStatus, setImageOrderStatus] = useState<Map<string, string>>(new Map());

  // Track previous ordersData to avoid unnecessary state updates
  const previousOrdersDataRef = useRef<GalleryOrder[] | undefined>(undefined);
  const previousOrdersDataHashRef = useRef<string>("");

  // Helper function to compute derived data from orders
  const computeDerivedData = useCallback((ordersData: GalleryOrder[]) => {
    // Normalize order selected keys helper (defined inside to avoid dependency issues)
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
        // Priority: DELIVERED > PREPARING_DELIVERY > CLIENT_APPROVED
        const currentStatus = imageStatusMap.get(key);
        if (!currentStatus) {
          imageStatusMap.set(key, orderStatus);
        } else if (orderStatus === "DELIVERED") {
          imageStatusMap.set(key, "DELIVERED");
        } else if (orderStatus === "PREPARING_DELIVERY" && currentStatus !== "DELIVERED") {
          imageStatusMap.set(key, "PREPARING_DELIVERY");
        } else if (
          orderStatus === "CLIENT_APPROVED" &&
          currentStatus !== "DELIVERED" &&
          currentStatus !== "PREPARING_DELIVERY"
        ) {
          imageStatusMap.set(key, "CLIENT_APPROVED");
        }
      });
    });

    return {
      approvedKeys,
      allOrderKeys,
      imageStatusMap,
    };
  }, []);

  // Helper to create a simple hash of orders data for comparison
  const createOrdersHash = useCallback((orders: GalleryOrder[]): string => {
    if (orders.length === 0) {
      return "";
    }
    return orders
      .map(
        (o) =>
          `${o.orderId ?? ""}:${o.deliveryStatus ?? ""}:${
            Array.isArray(o.selectedKeys)
              ? o.selectedKeys.join(",")
              : typeof o.selectedKeys === "string"
                ? o.selectedKeys
                : ""
          }`
      )
      .join("|");
  }, []);

  const loadApprovedSelections = useCallback(async (): Promise<void> => {
    if (!galleryIdForQuery) {
      return;
    }

    try {
      // Refetch orders from React Query
      const result = await refetch();
      const ordersData = (result.data || []) as GalleryOrder[];

      setOrders(ordersData);

      const { approvedKeys, allOrderKeys, imageStatusMap } = computeDerivedData(ordersData);

      setApprovedSelectionKeys(approvedKeys);
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
      
    }
  }, [galleryIdForQuery, refetch, computeDerivedData]);

  // Sync React Query data with local state when it changes
  // Only update if the data actually changed (using hash comparison to avoid reference-based loops)
  useEffect(() => {
    // Skip if no data or data hasn't actually changed
    if (!ordersDataArray || ordersDataArray.length === 0) {
      // Only clear state if we previously had data
      if (previousOrdersDataRef.current && previousOrdersDataRef.current.length > 0) {
        previousOrdersDataRef.current = undefined;
        previousOrdersDataHashRef.current = "";
        setOrders([]);
        setApprovedSelectionKeys(new Set());
        setAllOrderSelectionKeys(new Set());
        setImageOrderStatus(new Map());
      }
      return;
    }

    // Create hash of current data to compare with previous
    const currentHash = createOrdersHash(ordersDataArray);

    // Only update if hash changed (data actually changed)
    if (currentHash === previousOrdersDataHashRef.current) {
      return;
    }

    // Data has changed - update state
    previousOrdersDataRef.current = ordersDataArray;
    previousOrdersDataHashRef.current = currentHash;

    setOrders(ordersDataArray);

    const { approvedKeys, allOrderKeys, imageStatusMap } = computeDerivedData(ordersDataArray);

    // Only update state if the Sets/Maps actually changed
    // Compare by converting to arrays and checking equality
    setApprovedSelectionKeys((prev) => {
      const prevArray = Array.from(prev).sort();
      const newArray = Array.from(approvedKeys).sort();
      if (
        prevArray.length === newArray.length &&
        prevArray.every((val, idx) => val === newArray[idx])
      ) {
        return prev; // Return previous Set to maintain reference stability
      }
      return approvedKeys;
    });

    setAllOrderSelectionKeys((prev) => {
      const prevArray = Array.from(prev).sort();
      const newArray = Array.from(allOrderKeys).sort();
      if (
        prevArray.length === newArray.length &&
        prevArray.every((val, idx) => val === newArray[idx])
      ) {
        return prev; // Return previous Set to maintain reference stability
      }
      return allOrderKeys;
    });

    setImageOrderStatus((prev) => {
      const prevEntries = Array.from(prev.entries()).sort((a, b) => a[0].localeCompare(b[0]));
      const newEntries = Array.from(imageStatusMap.entries()).sort((a, b) =>
        a[0].localeCompare(b[0])
      );
      if (
        prevEntries.length === newEntries.length &&
        prevEntries.every(
          (entry, idx) => entry[0] === newEntries[idx][0] && entry[1] === newEntries[idx][1]
        )
      ) {
        return prev; // Return previous Map to maintain reference stability
      }
      return imageStatusMap;
    });
  }, [ordersDataArray, createOrdersHash, computeDerivedData]);

  return {
    orders,
    approvedSelectionKeys,
    allOrderSelectionKeys,
    imageOrderStatus,
    loadApprovedSelections,
  };
}
