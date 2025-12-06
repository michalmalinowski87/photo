import { StateCreator } from "zustand";

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
  // No UI state needed - all loading states come from React Query mutations
}

export const createOrderSlice: StateCreator<
  OrderSlice,
  [["zustand/devtools", never]],
  [],
  OrderSlice
> = () => ({});
