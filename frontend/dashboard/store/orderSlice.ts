import { StateCreator } from "zustand";

import api, { formatApiError } from "../lib/api-service";
import { storeLogger } from "../lib/store-logger";

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
  ordersByGalleryId: Record<string, Order[]>; // Simple map of galleryId to orders array
  isLoading: boolean;
  error: string | null;
  // Loading states for order actions
  denyLoading: boolean;
  setCurrentOrder: (order: Order | null) => void;
  setOrderList: (orders: Order[]) => void;
  setOrdersByGalleryId: (galleryId: string, orders: Order[]) => void;
  fetchOrder: (galleryId: string, orderId: string) => Promise<Order | null>;
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
  // Get all orders for a gallery
  getOrdersByGalleryId: (galleryId: string) => Order[];
}

export const createOrderSlice: StateCreator<
  OrderSlice,
  [["zustand/devtools", never]],
  [],
  OrderSlice
> = (set, get) => ({
  currentOrder: null,
  orderList: [],
  ordersByGalleryId: {},
  isLoading: false,
  error: null,
  denyLoading: false,

  setCurrentOrder: (order: Order | null) => {
    set({ currentOrder: order }, undefined, "order/setCurrentOrder");
  },

  setOrderList: (orders: Order[]) => {
    set({ orderList: orders }, undefined, "order/setOrderList");
  },

  setOrdersByGalleryId: (galleryId: string, orders: Order[]) => {
    set(
      (state) => ({
        ordersByGalleryId: {
          ...state.ordersByGalleryId,
          [galleryId]: orders,
        },
      }),
      undefined,
      "order/setOrdersByGalleryId"
    );
  },

  fetchOrder: async (galleryId: string, orderId: string) => {
    // If we already have this order, return it
    const state = get();
    if (state.currentOrder?.orderId === orderId) {
      return state.currentOrder;
    }

    set({ isLoading: true, error: null }, undefined, "order/fetchOrder/start");
    try {
      const orderData = await api.orders.get(galleryId, orderId);
      state.setCurrentOrder(orderData as Order);
      set({ isLoading: false }, undefined, "order/fetchOrder/success");
      return orderData as Order;
    } catch (err) {
      const error = err instanceof Error ? err.message : "Failed to fetch order";
      set({ error, isLoading: false }, undefined, "order/fetchOrder/error");
      throw err;
    }
  },

  setLoading: (loading: boolean) => {
    storeLogger.logLoadingState("order", "setLoading", loading);
    set({ isLoading: loading }, undefined, "order/setLoading");
  },

  setError: (error: string | null) => {
    set({ error }, undefined, "order/setError");
  },

  clearCurrentOrder: () => {
    set({ currentOrder: null }, undefined, "order/clearCurrentOrder");
  },

  clearOrderList: () => {
    set({ orderList: [] }, undefined, "order/clearOrderList");
  },

  clearAll: () => {
    set(
      {
        currentOrder: null,
        orderList: [],
        ordersByGalleryId: {},
        isLoading: false,
        error: null,
        denyLoading: false,
      },
      undefined,
      "order/clearAll"
    );
  },

  // Order action methods
  approveChangeRequest: async (galleryId: string, orderId: string) => {
    const state = get();
    try {
      const response = await api.orders.approveChangeRequest(galleryId, orderId);

      // Merge state update instead of reloading
      if (state.currentOrder?.orderId === orderId) {
        state.setCurrentOrder({
          ...state.currentOrder,
          deliveryStatus: response.deliveryStatus ?? state.currentOrder.deliveryStatus,
          // Update any other fields from response
          ...(response as Partial<Order>),
        });
      }

      // Update orders list if needed
      const galleryStore = useGalleryStore.getState();
      await galleryStore.fetchGalleryOrders(galleryId);

      // Show toast
      const { useToastStore } = await import("./hooks");
      useToastStore
        .getState()
        .showToast(
          "success",
          "Sukces",
          "Prośba o zmiany została zatwierdzona. Klient może teraz modyfikować wybór."
        );
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
      const response = await api.orders.denyChangeRequest(galleryId, orderId, reason);

      // Merge state update instead of reloading
      if (state.currentOrder?.orderId === orderId) {
        state.setCurrentOrder({
          ...state.currentOrder,
          deliveryStatus: response.deliveryStatus ?? state.currentOrder.deliveryStatus,
          // Update any other fields from response
          ...(response as Partial<Order>),
        });
      }

      // Update orders list if needed
      const galleryStore = useGalleryStore.getState();
      await galleryStore.fetchGalleryOrders(galleryId);

      // Show toast
      const { useToastStore } = await import("./hooks");
      useToastStore
        .getState()
        .showToast(
          "success",
          "Sukces",
          "Prośba o zmiany została odrzucona. Zlecenie zostało przywrócone do poprzedniego statusu."
        );
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
    try {
      const response = await api.orders.markPaid(galleryId, orderId);

      // Update current order if it matches
      const state = get();
      if (state.currentOrder?.orderId === orderId) {
        state.setCurrentOrder({
          ...state.currentOrder,
          paymentStatus: response.paymentStatus,
          paidAt: response.paidAt,
        });
      }

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
        const result = await api.orders.downloadFinalZip(galleryId, orderId);

        // Handle 202 - ZIP is being generated
        if (result.status === 202 || result.generating) {
          updateDownload(downloadId, { status: "generating" });
          setTimeout(() => {
            pollForZip();
          }, 2000);
          return;
        }

        // Handle successful download
        updateDownload(downloadId, { status: "downloading" });

        let blob: Blob;
        let filename: string;

        if (result.blob) {
          // Binary blob response
          blob = result.blob;
          filename = result.filename || `order-${orderId}-finals.zip`;
        } else if (result.zip) {
          // Base64 ZIP response (backward compatibility)
          const zipBlob = Uint8Array.from(atob(result.zip), (c) => c.charCodeAt(0));
          blob = new Blob([zipBlob], { type: "application/zip" });
          filename = result.filename || `order-${orderId}-finals.zip`;
        } else {
          throw new Error("No ZIP data available");
        }

        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        updateDownload(downloadId, { status: "success" });
        setTimeout(() => {
          removeDownload(downloadId);
        }, 3000);
      } catch (err) {
        const errorMsg = formatApiError(err);
        updateDownload(downloadId, { status: "error", error: errorMsg });
      }
    };

    pollForZip();
  },

  sendFinalsToClient: async (galleryId: string, orderId: string) => {
    const state = get();

    try {
      const response = await api.orders.sendFinalLink(galleryId, orderId);

      const { useToastStore } = await import("./hooks");
      useToastStore
        .getState()
        .showToast("success", "Sukces", "Link do zdjęć finalnych został wysłany do klienta");

      // Update current order if it matches
      if (state.currentOrder?.orderId === orderId) {
        state.setCurrentOrder({
          ...state.currentOrder,
          deliveryStatus: "DELIVERED",
          deliveredAt: response.deliveredAt,
        });
      }
    } catch (err) {
      const { useToastStore } = await import("./hooks");
      useToastStore.getState().showToast("error", "Błąd", formatApiError(err));
    }
  },

  downloadZip: async (galleryId: string, orderId: string) => {
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
        const result = await api.orders.downloadZip(galleryId, orderId);

        // Handle 202 - ZIP is being generated
        if (result.status === 202 || result.generating) {
          updateDownload(downloadId, { status: "generating" });
          setTimeout(() => {
            pollForZip();
          }, 2000);
          return;
        }

        // Handle successful download
        updateDownload(downloadId, { status: "downloading" });

        let blob: Blob;
        let filename: string;

        if (result.blob) {
          // Binary blob response
          blob = result.blob;
          filename = result.filename || `${orderId}.zip`;
        } else if (result.zip) {
          // Base64 ZIP response (backward compatibility)
          const zipBlob = Uint8Array.from(atob(result.zip), (c) => c.charCodeAt(0));
          blob = new Blob([zipBlob], { type: "application/zip" });
          filename = result.filename || `${orderId}.zip`;
        } else {
          throw new Error("No ZIP data available");
        }

        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        updateDownload(downloadId, { status: "success" });
        setTimeout(() => {
          removeDownload(downloadId);
        }, 3000);
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
    const order = state.currentOrder;
    if (!order || order.orderId !== orderId) {
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
    const order = state.currentOrder;
    if (!order || order.orderId !== orderId) {
      return false;
    }
    return (
      selectionEnabled &&
      order.deliveryStatus !== "CANCELLED" &&
      order.selectedKeys &&
      (Array.isArray(order.selectedKeys) ? order.selectedKeys.length > 0 : true)
    );
  },

  getOrdersByGalleryId: (galleryId: string) => {
    const state = get();
    const orders = state.ordersByGalleryId[galleryId] || [];

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
});
