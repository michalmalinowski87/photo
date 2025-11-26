import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

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
  isLoading: boolean;
  error: string | null;
  setCurrentOrder: (order: Order | null) => void;
  setOrderList: (orders: Order[]) => void;
  setCurrentOrderId: (orderId: string | null) => void;
  setCurrentGalleryId: (galleryId: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearCurrentOrder: () => void;
  clearOrderList: () => void;
  clearAll: () => void;
}

export const useOrderStore = create<OrderState>()(
  devtools(
    (set) => ({
  currentOrder: null,
  orderList: [],
  currentOrderId: null,
  currentGalleryId: null,
  isLoading: false,
  error: null,

  setCurrentOrder: (order: Order | null) => {
    set({
      currentOrder: order,
      currentOrderId: order?.orderId || null,
      currentGalleryId: order?.galleryId || null,
    });
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
      isLoading: false,
      error: null,
    });
  },
    }),
    { name: 'OrderStore' }
  )
);

