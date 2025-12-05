import { StateCreator } from "zustand";

import api, { formatApiError } from "../lib/api-service";

export interface Order {
  orderId: string;
  galleryId: string;
  deliveryStatus?: string;
  paymentStatus?: string;
  selectedCount?: number;
  overageCents?: number;
  [key: string]: any;
}

export interface OrderSlice {
  currentOrder: Order | null;
  orderList: Order[];
  currentOrderId: string | null;
  currentGalleryId: string | null;
  // Cache for orders (keyed by orderId)
  orderCache: Record<string, { order: Order; timestamp: number }>;
  isLoading: boolean;
  error: string | null;
  // Loading states for order actions
  denyLoading: boolean;
  cleanupLoading: boolean;
  setCurrentOrder: (order: Order | null) => void;
  setOrderList: (orders: Order[]) => void;
  setCurrentOrderId: (orderId: string | null) => void;
  setCurrentGalleryId: (galleryId: string | null) => void;
  getCachedOrder: (orderId: string, maxAge?: number) => Order | null;
  isOrderStale: (orderId: string, maxAge?: number) => boolean;
  invalidateOrderCache: (orderId: string) => void;
  invalidateGalleryOrdersCache: (galleryId: string) => void;
  fetchOrder: (galleryId: string, orderId: string, forceRefresh?: boolean) => Promise<Order | null>;
  updateOrderFields: (orderId: string, fields: Partial<Order>) => void;
  updateOrderInList: (orderId: string, fields: Partial<Order>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearCurrentOrder: () => void;
  clearOrderList: () => void;
  clearAll: () => void;
  // Order action methods (moved from useOrderActions hook)
  approveChangeRequest: (galleryId: string, orderId: string) => Promise<void>;
  denyChangeRequest: (galleryId: string, orderId: string, reason?: string) => Promise<void>;
  markOrderPaid: (galleryId: string, orderId: string) => Promise<void>;
  downloadFinals: (galleryId: string, orderId: string) => Promise<void>;
  sendFinalsToClient: (galleryId: string, orderId: string) => Promise<void>;
  downloadZip: (galleryId: string, orderId: string) => Promise<void>;
  // Computed selectors
  hasFinals: (orderId: string) => boolean;
  canDownloadZip: (orderId: string, gallerySelectionEnabled?: boolean) => boolean;
  // Get all orders for a gallery from cache
  getOrdersByGalleryId: (galleryId: string, maxAge?: number) => Order[];
  // Add multiple orders to cache (used by fetchGalleryOrders)
  addOrdersToCache: (orders: Order[]) => void;
}

export const createOrderSlice: StateCreator<
  OrderSlice,
  [["zustand/devtools", never]],
  [],
  OrderSlice
> = (set, get) => ({
  currentOrder: null,
  orderList: [],
  currentOrderId: null,
  currentGalleryId: null,
  orderCache: {},
  isLoading: false,
  error: null,
  denyLoading: false,
  cleanupLoading: false,

  setCurrentOrder: (order: Order | null) => {
    if (order) {
      set(
        (state) => ({
          currentOrder: order,
          currentOrderId: order.orderId,
          currentGalleryId: order.galleryId,
          orderCache: {
            ...state.orderCache,
            [order.orderId]: {
              order,
              timestamp: Date.now(),
            },
          },
        }),
        undefined,
        "order/setCurrentOrder"
      );
    } else {
      set(
        {
          currentOrder: null,
          currentOrderId: null,
        },
        undefined,
        "order/clearCurrentOrder"
      );
    }
  },

  setOrderList: (orders: Order[]) => {
    set({ orderList: orders }, undefined, "order/setOrderList");
  },

  setCurrentOrderId: (orderId: string | null) => {
    set({ currentOrderId: orderId }, undefined, "order/setCurrentOrderId");
  },

  setCurrentGalleryId: (galleryId: string | null) => {
    set({ currentGalleryId: galleryId }, undefined, "order/setCurrentGalleryId");
  },

  getCachedOrder: (orderId: string, maxAge: number = 30000) => {
    const state = get();
    const cached = state.orderCache[orderId];
    if (!cached) {
      return null;
    }

    const age = Date.now() - cached.timestamp;
    if (age > maxAge) {
      return null; // Cache expired
    }

    return cached.order;
  },

  isOrderStale: (orderId: string, maxAge: number = 30000) => {
    const state = get();
    const cached = state.orderCache[orderId];
    if (!cached) {
      return true;
    }

    const age = Date.now() - cached.timestamp;
    return age > maxAge;
  },

  invalidateOrderCache: (orderId: string) => {
    set(
      (state) => {
        const newCache = { ...state.orderCache };
        delete newCache[orderId];
        return {
          orderCache: newCache,
          // Also clear current order if it matches
          currentOrder: state.currentOrderId === orderId ? null : state.currentOrder,
          currentOrderId: state.currentOrderId === orderId ? null : state.currentOrderId,
        };
      },
      undefined,
      "order/invalidateOrderCache"
    );
  },

  invalidateGalleryOrdersCache: (galleryId: string) => {
    set(
      (state) => {
        // Remove all orders for this gallery from cache
        const newCache: Record<string, { order: Order; timestamp: number }> = {};
        Object.entries(state.orderCache).forEach(([orderId, cached]) => {
          if (cached.order.galleryId !== galleryId) {
            newCache[orderId] = cached;
          }
        });
        return {
          orderCache: newCache,
          // Clear current order if it belongs to this gallery
          currentOrder: state.currentGalleryId === galleryId ? null : state.currentOrder,
          currentOrderId: state.currentGalleryId === galleryId ? null : state.currentOrderId,
        };
      },
      undefined,
      "order/invalidateGalleryOrdersCache"
    );
  },

  fetchOrder: async (galleryId: string, orderId: string, forceRefresh = false) => {
    const state = get();

    // Check cache first if not forcing refresh
    if (!forceRefresh) {
      if (!state.isOrderStale(orderId, 30000)) {
        const cached = state.getCachedOrder(orderId, 30000);
        if (cached) {
          // Update current order if it matches
          if (state.currentOrderId !== orderId) {
            state.setCurrentOrder(cached);
          }
          return cached;
        }
      }
    }

    // Fetch from API
    set({ isLoading: true, error: null }, undefined, "order/fetchOrder/start");
    try {
      const orderData = await api.orders.get(galleryId, orderId);

      // Update store
      state.setCurrentOrder(orderData as Order);

      set({ isLoading: false }, undefined, "order/fetchOrder/success");
      return orderData as Order;
    } catch (err) {
      const error = err instanceof Error ? err.message : "Failed to fetch order";
      set({ error, isLoading: false }, undefined, "order/fetchOrder/error");
      throw err;
    }
  },

  updateOrderFields: (orderId: string, fields: Partial<Order>) => {
    set(
      (state) => {
        // Update cache if order exists in cache
        const cached = state.orderCache[orderId];
        if (cached) {
          const updatedOrder = { ...cached.order, ...fields };
          const newCache = {
            ...state.orderCache,
            [orderId]: {
              order: updatedOrder,
              timestamp: Date.now(), // Update timestamp to keep cache fresh
            },
          };

          // Update current order if it matches
          const newCurrentOrder =
            state.currentOrderId === orderId ? updatedOrder : state.currentOrder;

          return {
            orderCache: newCache,
            currentOrder: newCurrentOrder,
          };
        }

        // If not in cache, just return state as-is
        return state;
      },
      undefined,
      "order/updateOrderFields"
    );
  },

  updateOrderInList: (orderId: string, fields: Partial<Order>) => {
    set(
      (state) => {
        const updatedList = state.orderList.map((order) =>
          order.orderId === orderId ? { ...order, ...fields } : order
        );

        return {
          orderList: updatedList,
        };
      },
      undefined,
      "order/updateOrderInList"
    );
  },

  setLoading: (loading: boolean) => {
    set({ isLoading: loading }, undefined, "order/setLoading");
  },

  setError: (error: string | null) => {
    set({ error }, undefined, "order/setError");
  },

  clearCurrentOrder: () => {
    set({ currentOrder: null, currentOrderId: null }, undefined, "order/clearCurrentOrder");
  },

  clearOrderList: () => {
    set({ orderList: [] }, undefined, "order/clearOrderList");
  },

  clearAll: () => {
    set(
      {
        currentOrder: null,
        orderList: [],
        currentOrderId: null,
        currentGalleryId: null,
        orderCache: {},
        isLoading: false,
        error: null,
        denyLoading: false,
        cleanupLoading: false,
      },
      undefined,
      "order/clearAll"
    );
  },

  // Order action methods
  approveChangeRequest: async (galleryId: string, orderId: string) => {
    const state = get();
    try {
      await api.orders.approveChangeRequest(galleryId, orderId);

      // Invalidate all caches to ensure fresh data on next fetch
      state.invalidateOrderCache(orderId);
      const { useGalleryStore } = await import("./hooks");
      useGalleryStore.getState().invalidateAllGalleryCaches(galleryId);
      state.invalidateGalleryOrdersCache(galleryId);

      // Show toast
      const { useToastStore } = await import("./hooks");
      useToastStore
        .getState()
        .showToast(
          "success",
          "Sukces",
          "Prośba o zmiany została zatwierdzona. Klient może teraz modyfikować wybór."
        );

      // Reload order and gallery orders
      await state.fetchOrder(galleryId, orderId, true);
      const galleryStore = useGalleryStore.getState();
      await galleryStore.fetchGalleryOrders(galleryId, true);
    } catch (err) {
      const { useToastStore } = await import("./hooks");
      useToastStore
        .getState()
        .showToast(
          "error",
          "Błąd",
          formatApiError(err) ?? "Nie udało się zatwierdzić prośby o zmiany"
        );
    }
  },

  denyChangeRequest: async (galleryId: string, orderId: string, reason?: string) => {
    const state = get();
    set({ denyLoading: true }, undefined, "order/denyChangeRequest/start");

    try {
      await api.orders.denyChangeRequest(galleryId, orderId, reason);

      // Invalidate all caches to ensure fresh data on next fetch
      state.invalidateOrderCache(orderId);
      const { useGalleryStore } = await import("./hooks");
      useGalleryStore.getState().invalidateAllGalleryCaches(galleryId);
      state.invalidateGalleryOrdersCache(galleryId);

      // Show toast
      const { useToastStore } = await import("./hooks");
      useToastStore
        .getState()
        .showToast(
          "success",
          "Sukces",
          "Prośba o zmiany została odrzucona. Zlecenie zostało przywrócone do poprzedniego statusu."
        );

      // Reload order and gallery orders
      await state.fetchOrder(galleryId, orderId, true);
      const galleryStore = useGalleryStore.getState();
      await galleryStore.fetchGalleryOrders(galleryId, true);
    } catch (err) {
      const { useToastStore } = await import("./hooks");
      useToastStore
        .getState()
        .showToast(
          "error",
          "Błąd",
          formatApiError(err) ?? "Nie udało się odrzucić prośby o zmiany"
        );
    } finally {
      set({ denyLoading: false }, undefined, "order/denyChangeRequest/complete");
    }
  },

  markOrderPaid: async (galleryId: string, orderId: string) => {
    const state = get();
    try {
      const response = await api.orders.markPaid(galleryId, orderId);
      // Merge lightweight response into cached order instead of refetching
      state.updateOrderFields(orderId, {
        paymentStatus: response.paymentStatus,
        paidAt: response.paidAt,
      });
      // Invalidate all caches to ensure fresh data on next fetch
      const { useGalleryStore } = await import("./hooks");
      useGalleryStore.getState().invalidateAllGalleryCaches(galleryId);
      state.invalidateGalleryOrdersCache(galleryId);

      // Show toast
      const { useToastStore } = await import("./hooks");
      useToastStore
        .getState()
        .showToast("success", "Sukces", "Zlecenie zostało oznaczone jako opłacone");
    } catch (err) {
      const { useToastStore } = await import("./hooks");
      useToastStore.getState().showToast("error", "Błąd", formatApiError(err));
    }
  },

  downloadFinals: async (galleryId: string, orderId: string) => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
    const { useDownloadStore } = await import("./hooks");
    const { addDownload, updateDownload, removeDownload } = useDownloadStore.getState();

    // Start download progress indicator
    const downloadId = `${galleryId}-${orderId}-${Date.now()}`;
    addDownload(downloadId, {
      orderId,
      galleryId,
      status: "generating",
    });

    const pollForZip = async (): Promise<void> => {
      try {
        // Get valid token (will refresh if needed)
        const { getValidToken } = await import("../lib/api-service");
        const idToken = await getValidToken();

        const endpoint = `${apiUrl}/galleries/${galleryId}/orders/${orderId}/final/zip`;
        const response = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${idToken}` },
        });

        // Handle 202 - ZIP is being generated
        if (response.status === 202) {
          updateDownload(downloadId, { status: "generating" });
          setTimeout(() => {
            pollForZip();
          }, 2000);
          return;
        }

        // Handle 200 - ZIP is ready
        if (response.ok && response.headers.get("content-type")?.includes("application/zip")) {
          updateDownload(downloadId, { status: "downloading" });
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;

          const contentDisposition = response.headers.get("content-disposition");
          let finalFilename = `order-${orderId}-finals.zip`;
          if (contentDisposition) {
            const filenameMatch = contentDisposition.match(
              /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/
            );
            if (filenameMatch && filenameMatch[1]) {
              finalFilename = filenameMatch[1].replace(/['"]/g, "");
            }
          }

          a.download = finalFilename;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);

          updateDownload(downloadId, { status: "success" });
          setTimeout(() => {
            removeDownload(downloadId);
          }, 3000);
        } else if (response.ok) {
          const data = await response.json();
          if (data.zip) {
            updateDownload(downloadId, { status: "downloading" });
            const zipBlob = Uint8Array.from(atob(data.zip), (c) => c.charCodeAt(0));
            const blob = new Blob([zipBlob], { type: "application/zip" });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = data.filename || `order-${orderId}-finals.zip`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            updateDownload(downloadId, { status: "success" });
            setTimeout(() => {
              removeDownload(downloadId);
            }, 3000);
          } else {
            const errorMsg = data.error || "Nie udało się pobrać pliku ZIP";
            updateDownload(downloadId, { status: "error", error: errorMsg });
          }
        } else {
          const errorData = await response.json().catch(() => ({
            error: "Nie udało się pobrać pliku ZIP",
          }));
          updateDownload(downloadId, {
            status: "error",
            error: errorData.error || "Nie udało się pobrać pliku ZIP",
          });
        }
      } catch (err) {
        const errorMsg = formatApiError(err);
        updateDownload(downloadId, { status: "error", error: errorMsg });
      }
    };

    pollForZip();
  },

  sendFinalsToClient: async (galleryId: string, orderId: string) => {
    const state = get();
    set({ cleanupLoading: true }, undefined, "order/sendFinalsToClient/start");

    try {
      const response = await api.orders.sendFinalLink(galleryId, orderId);

      const { useToastStore } = await import("./hooks");
      useToastStore
        .getState()
        .showToast("success", "Sukces", "Link do zdjęć finalnych został wysłany do klienta");

      // Merge lightweight response into cached order instead of refetching
      state.updateOrderFields(orderId, {
        deliveryStatus: "DELIVERED",
        deliveredAt: response.deliveredAt,
      });
      // Invalidate all caches to ensure fresh data on next fetch
      const { useGalleryStore } = await import("./hooks");
      useGalleryStore.getState().invalidateAllGalleryCaches(galleryId);
      state.invalidateGalleryOrdersCache(galleryId);
    } catch (err) {
      const { useToastStore } = await import("./hooks");
      useToastStore.getState().showToast("error", "Błąd", formatApiError(err));
    } finally {
      set({ cleanupLoading: false }, undefined, "order/sendFinalsToClient/complete");
    }
  },

  downloadZip: async (galleryId: string, orderId: string) => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
    const { useDownloadStore } = await import("./hooks");
    const { addDownload, updateDownload, removeDownload } = useDownloadStore.getState();

    // Start download progress indicator
    const downloadId = `${galleryId}-${orderId}-${Date.now()}`;
    addDownload(downloadId, {
      orderId,
      galleryId,
      status: "generating",
    });

    const pollForZip = async (): Promise<void> => {
      try {
        // Get valid token (will refresh if needed)
        const { getValidToken } = await import("../lib/api-service");
        const idToken = await getValidToken();

        const endpoint = `${apiUrl}/galleries/${galleryId}/orders/${orderId}/zip`;
        const response = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${idToken}` },
        });

        // Handle 202 - ZIP is being generated
        if (response.status === 202) {
          updateDownload(downloadId, { status: "generating" });
          setTimeout(() => {
            pollForZip();
          }, 2000);
          return;
        }

        // Handle 200 - ZIP is ready
        if (response.ok && response.headers.get("content-type")?.includes("application/zip")) {
          updateDownload(downloadId, { status: "downloading" });
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;

          const contentDisposition = response.headers.get("content-disposition");
          let finalFilename = `${orderId}.zip`;
          if (contentDisposition) {
            const filenameMatch = contentDisposition.match(
              /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/
            );
            if (filenameMatch && filenameMatch[1]) {
              finalFilename = filenameMatch[1].replace(/['"]/g, "");
            }
          }

          a.download = finalFilename;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);

          updateDownload(downloadId, { status: "success" });
          setTimeout(() => {
            removeDownload(downloadId);
          }, 3000);
        } else if (response.ok) {
          const data = await response.json();
          if (data.zip) {
            updateDownload(downloadId, { status: "downloading" });
            const zipBlob = Uint8Array.from(atob(data.zip), (c) => c.charCodeAt(0));
            const blob = new Blob([zipBlob], { type: "application/zip" });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = data.filename || `${orderId}.zip`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            updateDownload(downloadId, { status: "success" });
            setTimeout(() => {
              removeDownload(downloadId);
            }, 3000);
          } else {
            const errorMsg = data.error || "Nie udało się pobrać pliku ZIP";
            updateDownload(downloadId, { status: "error", error: errorMsg });
          }
        } else {
          const errorData = await response.json().catch(() => ({
            error: "Nie udało się pobrać pliku ZIP",
          }));
          updateDownload(downloadId, {
            status: "error",
            error: errorData.error || "Nie udało się pobrać pliku ZIP",
          });
        }
      } catch (err) {
        const errorMsg = formatApiError(err);
        updateDownload(downloadId, { status: "error", error: errorMsg });
      }
    };

    pollForZip();
  },

  // Computed selectors
  hasFinals: (orderId: string) => {
    const state = get();
    // Check if this is the current order
    if (state.currentOrderId !== orderId) {
      // Try cache
      const cached = state.orderCache[orderId];
      if (!cached) {
        return false;
      }
      const order = cached.order;
      return (
        order.deliveryStatus === "PREPARING_FOR_DELIVERY" ||
        order.deliveryStatus === "PREPARING_DELIVERY" ||
        order.deliveryStatus === "DELIVERED"
      );
    }
    // Use current order
    const order = state.currentOrder;
    if (!order) {
      return false;
    }
    return (
      order.deliveryStatus === "PREPARING_FOR_DELIVERY" ||
      order.deliveryStatus === "PREPARING_DELIVERY" ||
      order.deliveryStatus === "DELIVERED"
    );
  },

  canDownloadZip: (orderId: string, gallerySelectionEnabled?: boolean) => {
    const state = get();
    const selectionEnabled = gallerySelectionEnabled !== false;

    // Check if this is the current order
    if (state.currentOrderId !== orderId) {
      // Try cache
      const cached = state.orderCache[orderId];
      if (!cached) {
        return false;
      }
      const order = cached.order;
      // Allow downloads for selection galleries with valid statuses (not CANCELLED)
      return (
        selectionEnabled &&
        order.deliveryStatus !== "CANCELLED" &&
        order.selectedKeys &&
        (Array.isArray(order.selectedKeys) ? order.selectedKeys.length > 0 : true)
      );
    }
    // Use current order
    const order = state.currentOrder;
    if (!order) {
      return false;
    }
    // Allow downloads for selection galleries with valid statuses (not CANCELLED)
    return (
      selectionEnabled &&
      order.deliveryStatus !== "CANCELLED" &&
      order.selectedKeys &&
      (Array.isArray(order.selectedKeys) ? order.selectedKeys.length > 0 : true)
    );
  },

  getOrdersByGalleryId: (galleryId: string, maxAge: number = 30000) => {
    const state = get();
    const now = Date.now();
    const orders: Order[] = [];

    // Iterate through orderCache and filter by galleryId
    for (const [orderId, cached] of Object.entries(state.orderCache)) {
      if (cached.order.galleryId === galleryId) {
        const age = now - cached.timestamp;
        if (age <= maxAge) {
          orders.push(cached.order);
        }
      }
    }

    // Sort by orderNumber if available, otherwise by createdAt
    return orders.sort((a, b) => {
      if (a.orderNumber !== undefined && b.orderNumber !== undefined) {
        return b.orderNumber - a.orderNumber; // Descending
      }
      if (a.createdAt && b.createdAt) {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); // Descending
      }
      return 0;
    });
  },

  addOrdersToCache: (orders: Order[]) => {
    const state = get();
    const now = Date.now();
    const newCache: Record<string, { order: Order; timestamp: number }> = { ...state.orderCache };

    // Add each order to cache
    for (const order of orders) {
      if (order && order.orderId) {
        newCache[order.orderId] = {
          order,
          timestamp: now,
        };
      }
    }

    set({ orderCache: newCache }, undefined, "order/addOrdersToCache");
  },
});
