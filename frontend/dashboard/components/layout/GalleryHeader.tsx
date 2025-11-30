import Link from "next/link";
import { useRouter } from "next/router";

import { ThemeToggleButton } from "../common/ThemeToggleButton";
import { StorageUsageInfo } from "../galleries/sidebar/StorageUsageInfo";

const GalleryHeader: React.FC = () => {
  const router = useRouter();
  const { orderId: orderIdFromQuery } = router.query;
  const orderId: string | undefined = Array.isArray(orderIdFromQuery)
    ? orderIdFromQuery[0]
    : (orderIdFromQuery);

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
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M2.5 5C2.5 4.17157 3.17157 3.5 4 3.5H16C16.8284 3.5 17.5 4.17157 17.5 5V15C17.5 15.8284 16.8284 16.5 16 16.5H4C3.17157 16.5 2.5 15.8284 2.5 15V5Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M2.5 7.5H17.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M13.75 11.25C14.1642 11.25 14.5 10.9142 14.5 10.5C14.5 10.0858 14.1642 9.75 13.75 9.75C13.3358 9.75 13 10.0858 13 10.5C13 10.9142 13.3358 11.25 13.75 11.25Z"
                  fill="currentColor"
                />
              </svg>
            </Link>
            <ThemeToggleButton />
          </div>
        </div>
      </div>
    </header>
  );
};

export default GalleryHeader;
