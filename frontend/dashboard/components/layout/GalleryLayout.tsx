import { useGalleryStore } from "../../store/gallerySlice";
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
  galleryId?: string;
}

const GalleryLayout: React.FC<GalleryLayoutProps> = ({
  children,
  gallery,
  isPaid: _isPaid,
  galleryUrl: _galleryUrl,
  onCopyUrl: _onCopyUrl,
  onSendLink: _onSendLink,
  onSettings: _onSettings,
  onCreateGallery: _onCreateGallery,
  onReloadGallery: _onReloadGallery,
  order: _order,
  orderId,
  onDownloadZip,
  canDownloadZip,
  onMarkOrderPaid,
  onDownloadFinals,
  onSendFinalsToClient,
  onApproveChangeRequest,
  onDenyChangeRequest,
  hasFinals,
  hasDeliveredOrders: _hasDeliveredOrders,
  galleryLoading,
  sendLinkLoading: _sendLinkLoading,
  galleryId,
}) => {
  // Get loading state and gallery directly from store (sidebar subscribes to store)
  const storeIsLoading = useGalleryStore((state) => state.isLoading);
  const storeGallery = useGalleryStore((state) => state.currentGallery);

  // Show sidebar when:
  // 1. Gallery is loaded (has data), OR
  // 2. Gallery is loading (shows loading states), OR
  // 3. We have galleryId from URL (gallery should be loading/loaded, sidebar will show loading states)
  // The sidebar subscribes to store directly and handles loading states automatically
  const isLoading = galleryLoading ?? storeIsLoading ?? false;
  const hasGallery = Boolean(gallery?.galleryId ?? storeGallery?.galleryId);
  const shouldShowSidebar = hasGallery || isLoading || Boolean(galleryId);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-dark">
      <div className="flex">
        <div>
          {shouldShowSidebar && (
            <GallerySidebar
              orderId={orderId}
              onDownloadZip={onDownloadZip}
              canDownloadZip={canDownloadZip}
              onMarkOrderPaid={onMarkOrderPaid}
              onDownloadFinals={onDownloadFinals}
              onSendFinalsToClient={onSendFinalsToClient}
              onApproveChangeRequest={onApproveChangeRequest}
              onDenyChangeRequest={onDenyChangeRequest}
              hasFinals={hasFinals}
            />
          )}
        </div>
        <div className="flex-1 transition-all duration-300 ease-in-out bg-gray-50 dark:bg-gray-dark lg:ml-[380px]">
          <GalleryHeader />
          <div className="p-6">{children}</div>
        </div>
      </div>
    </div>
  );
};

export default GalleryLayout;
