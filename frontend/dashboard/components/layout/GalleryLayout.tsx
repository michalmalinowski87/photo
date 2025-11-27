import { ThemeProvider } from "../../context/ThemeContext";
import { ToastProvider } from "../../context/ToastContext";
import GallerySidebar from "../galleries/GallerySidebar";

import GalleryHeader from "./GalleryHeader";

interface Gallery {
  galleryId?: string;
  galleryName?: string;
  orders?: unknown[];
  [key: string]: unknown;
}

interface Order {
  deliveryStatus?: string;
  [key: string]: unknown;
}

interface GalleryLayoutProps {
  children: React.ReactNode;
  gallery: Gallery | null;
  isPaid: boolean;
  galleryUrl: string;
  onPay: () => void;
  onCopyUrl: () => void;
  onSendLink: () => void;
  onSettings: () => void;
  onCreateGallery?: () => void;
  onReloadGallery?: () => Promise<void>;
  order?: Order | null;
  orderId?: string;
  sendLinkLoading?: boolean;
  onDownloadZip?: () => void;
  canDownloadZip?: boolean;
  onMarkOrderPaid?: () => void;
  onDownloadFinals?: () => void;
  onSendFinalsToClient?: () => void;
  onApproveChangeRequest?: () => void;
  onDenyChangeRequest?: () => void;
  hasFinals?: boolean;
  hasDeliveredOrders?: boolean | undefined;
  galleryLoading?: boolean;
}

const GalleryLayout: React.FC<GalleryLayoutProps> = ({
  children,
  gallery,
  isPaid,
  galleryUrl,
  onPay,
  onCopyUrl,
  onSendLink,
  onSettings,
  onCreateGallery: _onCreateGallery,
  onReloadGallery,
  order,
  orderId,
  onDownloadZip,
  canDownloadZip,
  onMarkOrderPaid,
  onDownloadFinals,
  onSendFinalsToClient,
  onApproveChangeRequest,
  onDenyChangeRequest,
  hasFinals,
  hasDeliveredOrders,
  galleryLoading,
  sendLinkLoading,
}) => {
  return (
    <ThemeProvider>
      <ToastProvider>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-dark">
          <div className="flex">
            <div>
              {gallery?.galleryId && (
                <GallerySidebar
                  gallery={{ ...gallery, galleryId: gallery.galleryId }}
                  isPaid={isPaid}
                  galleryUrl={galleryUrl}
                  onPay={onPay}
                  onCopyUrl={onCopyUrl}
                  onSendLink={onSendLink}
                  sendLinkLoading={sendLinkLoading}
                  onSettings={onSettings}
                  onReloadGallery={onReloadGallery}
                  order={order ? (order as { orderId: string; galleryId: string; [key: string]: unknown }) : undefined}
                  orderId={orderId}
                  onDownloadZip={onDownloadZip}
                  canDownloadZip={canDownloadZip}
                  onMarkOrderPaid={onMarkOrderPaid}
                  onDownloadFinals={onDownloadFinals}
                  onSendFinalsToClient={onSendFinalsToClient}
                  onApproveChangeRequest={onApproveChangeRequest}
                  onDenyChangeRequest={onDenyChangeRequest}
                  hasFinals={hasFinals}
                  hasDeliveredOrders={hasDeliveredOrders}
                  galleryLoading={galleryLoading}
                />
              )}
            </div>
            <div className="flex-1 transition-all duration-300 ease-in-out bg-gray-50 dark:bg-gray-dark lg:ml-[380px]">
              <GalleryHeader />
              <div className="p-6">{children}</div>
            </div>
          </div>
        </div>
      </ToastProvider>
    </ThemeProvider>
  );
};

export default GalleryLayout;
