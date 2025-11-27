import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface Order {
  orderId: string;
  galleryId: string;
  deliveryStatus?: string;
  paymentStatus?: string;
  selectedCount?: number;
  overageCents?: number;
  [key: string]: any;
}

interface OrderState {
  currentOrder: Order | null;
  orderList: Order[];
  currentOrderId: string | null;
  currentGalleryId: string | null;
  // Cache for orders (keyed by orderId)
  orderCache: Record<string, { order: Order; timestamp: number }>;
  isLoading: boolean;
  error: string | null;
  setCurrentOrder: (order: Order | null) => void;
  setOrderList: (orders: Order[]) => void;
  setCurrentOrderId: (orderId: string | null) => void;
  setCurrentGalleryId: (galleryId: string | null) => void;
  getCachedOrder: (orderId: string, maxAge?: number) => Order | null;
  isOrderStale: (orderId: string, maxAge?: number) => boolean;
  invalidateOrderCache: (orderId: string) => void;
  invalidateGalleryOrdersCache: (galleryId: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearCurrentOrder: () => void;
  clearOrderList: () => void;
  clearAll: () => void;
}

export const useOrderStore = create<OrderState>()(
  devtools(
    (set, get) => ({
      currentOrder: null,
      orderList: [],
      currentOrderId: null,
      currentGalleryId: null,
      orderCache: {},
      isLoading: false,
      error: null,

      setCurrentOrder: (order: Order | null) => {
        if (order) {
          set((state) => ({
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
          }));
        } else {
          set({
            currentOrder: null,
            currentOrderId: null,
          });
        }
      },

      setOrderList: (orders: Order[]) => {
        set({ orderList: orders });
      },

      setCurrentOrderId: (orderId: string | null) => {
        set({ currentOrderId: orderId });
      },

      setCurrentGalleryId: (galleryId: string | null) => {
        set({ currentGalleryId: galleryId });
      },

      getCachedOrder: (orderId: string, maxAge: number = 30000) => {
        const state = get();
        const cached = state.orderCache[orderId];
        if (!cached) return null;

        const age = Date.now() - cached.timestamp;
        if (age > maxAge) return null; // Cache expired

        return cached.order;
      },

      isOrderStale: (orderId: string, maxAge: number = 30000) => {
        const state = get();
        const cached = state.orderCache[orderId];
        if (!cached) return true;

        const age = Date.now() - cached.timestamp;
        return age > maxAge;
      },

      invalidateOrderCache: (orderId: string) => {
        set((state) => {
          const newCache = { ...state.orderCache };
          delete newCache[orderId];
          return {
            orderCache: newCache,
            // Also clear current order if it matches
            currentOrder: state.currentOrderId === orderId ? null : state.currentOrder,
            currentOrderId: state.currentOrderId === orderId ? null : state.currentOrderId,
          };
        });
      },

      invalidateGalleryOrdersCache: (galleryId: string) => {
        set((state) => {
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
        });
      },

      setLoading: (loading: boolean) => {
        set({ isLoading: loading });
      },

      setError: (error: string | null) => {
        set({ error });
      },

      clearCurrentOrder: () => {
        set({ currentOrder: null, currentOrderId: null });
      },

      clearOrderList: () => {
        set({ orderList: [] });
      },

      clearAll: () => {
        set({
          currentOrder: null,
          orderList: [],
          currentOrderId: null,
          currentGalleryId: null,
          orderCache: {},
          isLoading: false,
          error: null,
        });
      },
    }),
    { name: "OrderStore" }
  )
);
