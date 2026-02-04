"use client";

import { OrderZipButtonWithStatus } from "./OrderZipButtonWithStatus";
import type { DeliveredOrder } from "@/types/gallery";
import { PostHogActions } from "@photocloud/posthog-types";

interface DeliveredOrderCardProps {
  order: DeliveredOrder;
  galleryId: string | null;
  isOwnerPreview: boolean;
  onViewClick: (orderId: string) => void;
  onZipError: (orderId: string) => void;
  onZipGenerating: (orderId: string) => void;
}

export function DeliveredOrderCard({
  order,
  galleryId,
  isOwnerPreview,
  onViewClick,
  onZipError,
  onZipGenerating,
}: DeliveredOrderCardProps) {
  return (
    <div
      key={order.orderId}
      className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors focus-within:ring-2 focus-within:ring-black focus-within:ring-offset-2"
    >
      <div className="flex items-center justify-between gap-4">
        <div
          className="flex-1 cursor-pointer"
          onClick={() => {
            // TODO: Add PostHog tracking for orderSelect when PostHog is installed
            // posthog.capture('gallery_app:order_select', {
            //   order_id: order.orderId,
            //   order_number: order.orderNumber,
            // });
            onViewClick(order.orderId);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              // TODO: Add PostHog tracking for orderSelect when PostHog is installed
              // posthog.capture('gallery_app:order_select', {
              //   order_id: order.orderId,
              //   order_number: order.orderNumber,
              // });
              onViewClick(order.orderId);
            }
          }}
          tabIndex={0}
          role="button"
          aria-label={`Zobacz zamówienie ${order.orderNumber || order.orderId.slice(0, 8)}`}
          data-ph-action={PostHogActions.galleryApp.orderSelect}
        >
          <p className="font-semibold">
            Zamówienie #{order.orderNumber || order.orderId.slice(0, 8)}
          </p>
          <p className="text-sm text-gray-600">
            {new Date(order.deliveredAt).toLocaleDateString("pl-PL")} • Zdjęcia: {order.selectedCount}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!isOwnerPreview && (
            <div onClick={(e) => e.stopPropagation()}>
              <OrderZipButtonWithStatus
                galleryId={galleryId}
                orderId={order.orderId}
                isOwnerPreview={isOwnerPreview}
                onError={() => onZipError(order.orderId)}
                onGenerating={() => onZipGenerating(order.orderId)}
              />
            </div>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              // TODO: Add PostHog tracking for orderSelect when PostHog is installed
              // posthog.capture('gallery_app:order_select', {
              //   order_id: order.orderId,
              //   order_number: order.orderNumber,
              // });
              onViewClick(order.orderId);
            }}
            className="btn-primary touch-manipulation min-h-[44px]"
            aria-label={`Zobacz zamówienie ${order.orderNumber || order.orderId.slice(0, 8)}`}
            data-ph-action={PostHogActions.galleryApp.orderSelect}
          >
            Zobacz
          </button>
        </div>
      </div>
    </div>
  );
}
