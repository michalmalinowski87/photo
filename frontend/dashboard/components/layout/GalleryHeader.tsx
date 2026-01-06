import { Globe, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";

import { ThemeToggleButton } from "../common/ThemeToggleButton";
import { StorageUsageInfo } from "../galleries/sidebar/StorageUsageInfo";

const GalleryHeader = () => {
  const router = useRouter();
  const { orderId: orderIdFromQuery } = router.query;
  const orderId: string | undefined = Array.isArray(orderIdFromQuery)
    ? orderIdFromQuery[0]
    : orderIdFromQuery;

  return (
    <header className="top-0 flex w-full bg-white border-gray-400 dark:border-gray-800 dark:bg-gray-900 lg:border-b">
      <div className="flex flex-col items-center justify-between grow lg:flex-row lg:px-8">
        <div className="flex items-center justify-between w-full gap-4 px-4 py-4 border-b border-gray-400 dark:border-gray-800 sm:gap-4 lg:justify-between lg:border-b-0 lg:px-0 lg:py-2">
          <div className="flex items-center">
            <StorageUsageInfo orderId={orderId} />
          </div>
          <div className="flex items-center gap-2 2xsm:gap-3">
            <a
              href={process.env.NEXT_PUBLIC_LANDING_URL ?? "http://localhost:3002"}
              className="relative flex items-center justify-center text-gray-500 transition-colors bg-white border border-gray-400 rounded-full hover:text-dark-900 h-14 w-14 hover:bg-gray-100 hover:text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
              title="Strona główna"
            >
              <Globe size={26} />
            </a>
            <Link
              href="/wallet"
              className="relative flex items-center justify-center text-gray-500 transition-colors bg-white border border-gray-400 rounded-full hover:text-dark-900 h-14 w-14 hover:bg-gray-100 hover:text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
              title="Portfel"
            >
              <Wallet size={26} />
            </Link>
            <ThemeToggleButton />
          </div>
        </div>
      </div>
    </header>
  );
};

export default GalleryHeader;
