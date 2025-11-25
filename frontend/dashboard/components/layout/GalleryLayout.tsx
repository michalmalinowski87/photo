import { ThemeProvider } from "../../context/ThemeContext";
import { ToastProvider } from "../../context/ToastContext";
import GallerySidebar from "../galleries/GallerySidebar";
import GalleryHeader from "./GalleryHeader";

interface GalleryLayoutProps {
  children: React.ReactNode;
  gallery: any;
  isPaid: boolean;
  galleryUrl: string;
  onPay: () => void;
  onCopyUrl: () => void;
  onSendLink: () => void;
  onSettings: () => void;
  onCreateGallery?: () => void;
  onReloadGallery?: () => Promise<void>;
  order?: any;
  orderId?: string;
  onDownloadZip?: () => void;
  canDownloadZip?: boolean;
  onMarkOrderPaid?: () => void;
  onDownloadFinals?: () => void;
  onSendFinalsToClient?: () => void;
  hasFinals?: boolean;
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
  onCreateGallery,
  onReloadGallery,
  order,
  orderId,
  onDownloadZip,
  canDownloadZip,
  onMarkOrderPaid,
  onDownloadFinals,
  onSendFinalsToClient,
  hasFinals,
}) => {
  return (
    <ThemeProvider>
      <ToastProvider>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-dark">
          <div className="flex">
            <div>
              <GallerySidebar
                gallery={gallery}
                isPaid={isPaid}
                galleryUrl={galleryUrl}
                onPay={onPay}
                onCopyUrl={onCopyUrl}
                onSendLink={onSendLink}
                onSettings={onSettings}
                onReloadGallery={onReloadGallery}
                order={order}
                orderId={orderId}
                onDownloadZip={onDownloadZip}
                canDownloadZip={canDownloadZip}
                onMarkOrderPaid={onMarkOrderPaid}
                onDownloadFinals={onDownloadFinals}
                onSendFinalsToClient={onSendFinalsToClient}
                hasFinals={hasFinals}
              />
            </div>
            <div className="flex-1 transition-all duration-300 ease-in-out bg-gray-50 dark:bg-gray-dark lg:ml-[380px]">
              <GalleryHeader />
              <div className="p-6">
                {children}
              </div>
            </div>
          </div>
        </div>
      </ToastProvider>
    </ThemeProvider>
  );
};

export default GalleryLayout;

