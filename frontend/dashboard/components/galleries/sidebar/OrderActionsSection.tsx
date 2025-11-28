import React from "react";

import Button from "../../ui/button/Button";

interface Gallery {
  selectionEnabled?: boolean;
  [key: string]: unknown;
}

interface Order {
  deliveryStatus?: string;
  paymentStatus?: string;
  [key: string]: unknown;
}

interface OrderActionsSectionProps {
  orderId: string;
  order: Order;
  gallery: Gallery | null;
  galleryLoading: boolean;
  isPaid: boolean;
  canDownloadZip?: boolean;
  hasFinals?: boolean;
  onDownloadZip?: () => void;
  onDownloadFinals?: () => void;
  onApproveChangeRequest?: () => void;
  onDenyChangeRequest?: () => void;
  onMarkOrderPaid?: () => void;
  onSendFinalsToClient?: () => void;
}

export const OrderActionsSection: React.FC<OrderActionsSectionProps> = ({
  orderId,
  order,
  gallery,
  galleryLoading,
  isPaid,
  canDownloadZip,
  hasFinals,
  onDownloadZip,
  onDownloadFinals,
  onApproveChangeRequest,
  onDenyChangeRequest,
  onMarkOrderPaid,
  onSendFinalsToClient,
}) => {
  if (!orderId || !order || !isPaid) {
    return null;
  }

  return (
    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800">
      <div className="px-3 mb-3">
        <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
          Zlecenie
        </div>
        <div className="text-sm font-medium text-gray-900 dark:text-white">{orderId}</div>
      </div>

      <div className="space-y-2 px-3">
        {/* Download Selected Originals ZIP */}
        {!galleryLoading &&
          gallery &&
          gallery.selectionEnabled !== false &&
          canDownloadZip &&
          onDownloadZip && (
            <Button
              size="sm"
              variant="outline"
              onClick={onDownloadZip}
              className="w-full justify-start"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="mr-2"
              >
                <path
                  d="M10 2.5L5 7.5H8V13.5H12V7.5H15L10 2.5ZM3 15.5V17.5H17V15.5H3Z"
                  fill="currentColor"
                />
              </svg>
              Pobierz wybrane oryginały (ZIP)
            </Button>
          )}

        {/* Download Finals - Only show if finals are uploaded */}
        {onDownloadFinals && hasFinals && (
          <Button
            size="sm"
            variant="outline"
            onClick={onDownloadFinals}
            className="w-full justify-start"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="mr-2"
            >
              <path
                d="M10 2.5L5 7.5H8V13.5H12V7.5H15L10 2.5ZM3 15.5V17.5H17V15.5H3Z"
                fill="currentColor"
              />
            </svg>
            Pobierz finały
          </Button>
        )}

        {/* Change Request Actions */}
        {order.deliveryStatus === "CHANGES_REQUESTED" &&
          onApproveChangeRequest &&
          onDenyChangeRequest && (
            <>
              <Button
                size="sm"
                variant="primary"
                onClick={onApproveChangeRequest}
                className="w-full justify-start bg-green-600 hover:bg-green-700 text-white"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 20 20"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="mr-2"
                >
                  <path
                    d="M10 18C14.4183 18 18 14.4183 18 10C18 5.58172 14.4183 2 10 2C5.58172 2 2 5.58172 2 10C2 14.4183 5.58172 18 10 18Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M7 10L9 12L13 8"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Zatwierdź prośbę o zmiany
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onDenyChangeRequest}
                className="w-full justify-start"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 20 20"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="mr-2"
                >
                  <path
                    d="M10 18C14.4183 18 18 14.4183 18 10C18 5.58172 14.4183 2 10 2C5.58172 2 2 5.58172 2 10C2 14.4183 5.58172 18 10 18Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M7 7L13 13M13 7L7 13"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Odrzuć prośbę o zmiany
              </Button>
            </>
          )}

        {/* Mark Order as Paid */}
        {onMarkOrderPaid && order.paymentStatus !== "PAID" && (
          <Button
            size="sm"
            variant="outline"
            onClick={onMarkOrderPaid}
            className="w-full justify-start"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="mr-2"
            >
              <path d="M8 13L4 9L5.41 7.59L8 10.17L14.59 3.58L16 5L8 13Z" fill="currentColor" />
            </svg>
            Oznacz jako opłacone
          </Button>
        )}

        {/* Send Finals to Client - Only show if finals are uploaded */}
        {onSendFinalsToClient && hasFinals && (
          <Button
            size="sm"
            variant="outline"
            onClick={onSendFinalsToClient}
            className="w-full justify-start"
            disabled={order.deliveryStatus === "DELIVERED"}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="mr-2"
            >
              <path
                d="M2.5 5L10 10L17.5 5M2.5 15L10 20L17.5 15M2.5 10L10 15L17.5 10"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {order.deliveryStatus === "DELIVERED"
              ? "Finały wysłane"
              : "Wyślij finały do klienta"}
          </Button>
        )}
      </div>
    </div>
  );
};

