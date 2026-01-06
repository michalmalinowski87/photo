import type { Order } from "../types";

/**
 * Formats an order for display purposes.
 * Returns the orderNumber if available, otherwise falls back to the last 8 characters of orderId.
 *
 * @param order - The order object to format
 * @returns A string representation of the order number for display
 */
export function formatOrderDisplay(
  order: Order | { orderId?: string; orderNumber?: string | number }
): string {
  // Prefer orderNumber if available
  if (order.orderNumber !== undefined && order.orderNumber !== null) {
    return String(order.orderNumber);
  }

  // Fallback to last 8 characters of orderId
  if (order.orderId && typeof order.orderId === "string") {
    return order.orderId.slice(-8);
  }

  // Final fallback
  return "";
}
