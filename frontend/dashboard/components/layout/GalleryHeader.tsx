import { Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";

import { ThemeToggleButton } from "../common/ThemeToggleButton";
import { StorageUsageInfo } from "../galleries/sidebar/StorageUsageInfo";

const GalleryHeader: React.FC = () => {
  const router = useRouter();
  const { orderId: orderIdFromQuery } = router.query;
  const orderId: string | undefined = Array.isArray(orderIdFromQuery)
    ? orderIdFromQuery[0]
    : orderIdFromQuery;

  return (
    <header className="top-0 flex w-full bg-white border-gray-200 dark:border-gray-800 dark:bg-gray-900 lg:border-b">
      <div className="flex flex-col items-center justify-between grow lg:flex-row lg:px-6">
        <div className="flex items-center justify-between w-full gap-4 px-3 py-3 border-b border-gray-200 dark:border-gray-800 sm:gap-4 lg:justify-between lg:border-b-0 lg:px-0 lg:py-4">
          <div className="flex items-center">
            <StorageUsageInfo orderId={orderId} />
          </div>
          <div className="flex items-center gap-2 2xsm:gap-3">
            <Link
              href="/wallet"
              className="relative flex items-center justify-center text-gray-500 transition-colors bg-white border border-gray-200 rounded-full hover:text-dark-900 h-11 w-11 hover:bg-gray-100 hover:text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
              title="Portfel"
            >
              <Wallet size={20} />
            </Link>
            <ThemeToggleButton />
          </div>
        </div>
      </div>
    </header>
  );
};

export default GalleryHeader;
