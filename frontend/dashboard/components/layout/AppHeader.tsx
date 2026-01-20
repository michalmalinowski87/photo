import { Menu, X, MoreVertical, Search, Globe, Wallet, Plus } from "lucide-react";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";

import { useSidebar } from "../../hooks/useSidebar";
import { getPublicLandingUrl } from "../../lib/public-env";
import { ThemeToggleButton } from "../common/ThemeToggleButton";
import NotificationDropdown from "../header/NotificationDropdown";
import Button from "../ui/button/Button";

interface AppHeaderProps {
  onCreateGallery?: () => void;
}

const AppHeader = ({ onCreateGallery }: AppHeaderProps) => {
  const [isApplicationMenuOpen, setApplicationMenuOpen] = useState(false);
  const { isMobileOpen, toggleMobileSidebar } = useSidebar();

  const toggleApplicationMenu = () => {
    setApplicationMenuOpen(!isApplicationMenuOpen);
  };

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <header className="top-0 flex w-full bg-white border-photographer-border dark:border-gray-800 dark:bg-gray-900 lg:border-b">
      <div className="flex flex-col items-center justify-between grow lg:flex-row lg:px-8">
        <div className="flex items-center justify-between w-full gap-2 px-4 py-4 border-b border-photographer-border dark:border-gray-800 sm:gap-4 lg:justify-normal lg:border-b-0 lg:px-0 lg:py-6">
          <button
            className="block w-12 h-12 text-photographer-mutedText lg:hidden dark:text-gray-400"
            onClick={toggleMobileSidebar}
          >
            {isMobileOpen ? (
              <X size={30} className="block" />
            ) : (
              <Menu size={20} className="block" />
            )}
          </button>

          <Link href="/" className="lg:hidden">
            <span className="text-xl font-bold text-photographer-accent dark:text-white">
              PhotoCloud
            </span>
          </Link>

          <button
            onClick={toggleApplicationMenu}
            className="flex items-center justify-center w-12 h-12 text-photographer-text rounded-lg z-99999 hover:bg-photographer-elevated dark:text-gray-400 dark:hover:bg-gray-800 lg:hidden"
          >
            <MoreVertical size={30} />
          </button>

          {/* Search bar - hidden until search/command palette functionality is implemented */}
          <div className="hidden">
            <div className="hidden lg:block">
              <form>
                <div className="relative">
                  <span className="absolute -translate-y-1/2 pointer-events-none left-4 top-1/2">
                    <Search size={20} className="text-gray-500 dark:text-gray-400" />
                  </span>
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder="Szukaj lub wpisz komendę..."
                    className="dark:bg-dark-900 w-full rounded-lg border border-gray-400 bg-transparent py-1.5 pl-12 pr-14 text-sm text-photographer-text shadow-theme-xs placeholder:text-photographer-mutedText focus:border-photographer-accent focus:outline-hidden focus:ring-3 focus:ring-photographer-accent/10 dark:border-gray-800 dark:bg-gray-900 dark:bg-white/[0.03] dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-photographer-accent xl:w-[430px]"
                    style={{ height: "33px", minHeight: "33px" }}
                  />

                  <button className="absolute right-2.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-0.5 rounded-lg border border-gray-400 bg-photographer-background px-[7px] py-[4.5px] text-xs -tracking-[0.2px] text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
                    <span> ⌘ </span>
                    <span> K </span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
        <div
          className={`${
            isApplicationMenuOpen ? "flex" : "hidden"
          } items-center justify-between w-full gap-4 px-5 py-4 lg:flex shadow-theme-md lg:justify-end lg:px-0 lg:shadow-none`}
        >
          <div className="flex items-center gap-2 2xsm:gap-3">
            <a
              href={getPublicLandingUrl()}
              className="relative flex items-center justify-center text-photographer-mutedText transition-colors bg-photographer-surface border border-photographer-border rounded-full hover:text-photographer-heading h-14 w-14 hover:bg-photographer-elevated hover:text-photographer-text dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
              title="Strona główna"
            >
              <Globe size={20} />
            </a>
            <Link
              href="/wallet"
              className="relative flex items-center justify-center text-photographer-mutedText transition-colors bg-photographer-surface border border-photographer-border rounded-full hover:text-photographer-heading h-14 w-14 hover:bg-photographer-elevated hover:text-photographer-text dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
              title="Portfel"
            >
              <Wallet size={20} />
            </Link>
            <ThemeToggleButton />
            {/* Notifications - hidden until notification system is implemented */}
            <div className="hidden">
              <NotificationDropdown />
            </div>
          </div>
          <div className="flex items-center gap-3">
            {onCreateGallery && (
              <Button
                onClick={onCreateGallery}
                variant="primary"
                size="md"
                startIcon={<Plus size={16} />}
              >
                Utwórz galerię
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
