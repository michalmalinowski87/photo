import { Bell, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useTheme } from "../../hooks/useTheme";
import { Dropdown } from "../ui/dropdown/Dropdown";

export default function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifying, setNotifying] = useState(true);
  const { theme } = useTheme();
  const isDarkMode = theme === "dark";

  function toggleDropdown() {
    setIsOpen(!isOpen);
  }

  function closeDropdown() {
    setIsOpen(false);
  }

  const handleClick = () => {
    toggleDropdown();
    setNotifying(false);
  };
  return (
    <div className="relative">
      <button
        className={`relative flex items-center justify-center transition-colors rounded-full dropdown-toggle h-11 w-11 ${
          isDarkMode
            ? "text-gray-400 bg-gray-900 border border-gray-800 hover:bg-gray-800 hover:text-white"
            : "text-gray-700 bg-white border border-gray-600 hover:text-gray-900 hover:bg-photographer-elevated"
        }`}
        onClick={handleClick}
      >
        <span
          className={`absolute right-0 top-0.5 z-10 h-2 w-2 rounded-full bg-orange-400 ${
            !notifying ? "hidden" : "flex"
          }`}
        >
          <span className="absolute inline-flex w-full h-full bg-orange-400 rounded-full opacity-75 animate-ping"></span>
        </span>
        <Bell size={20} />
      </button>
      <Dropdown
        isOpen={isOpen}
        onClose={closeDropdown}
        className={`absolute -right-[240px] mt-[17px] flex h-[480px] w-[350px] flex-col rounded-2xl p-3 shadow-theme-lg sm:w-[361px] lg:right-0 ${
          isDarkMode ? "border border-gray-800 bg-gray-dark" : "border border-gray-600 bg-white"
        }`}
      >
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-100 dark:border-gray-700">
          <h5 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Powiadomienia</h5>
          <button
            onClick={toggleDropdown}
            className="text-gray-500 transition dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            <X size={24} />
          </button>
        </div>
        <ul className="flex flex-col h-auto overflow-y-auto">
          {/* Placeholder - will be populated with real notifications */}
          <li>
            <div className="flex gap-3 rounded-lg border-b border-gray-100 p-3 px-4.5 py-3 hover:bg-photographer-elevated dark:border-gray-800 dark:hover:bg-white/5">
              <span className="block text-theme-sm text-gray-500 dark:text-gray-400">
                Brak nowych powiadomień
              </span>
            </div>
          </li>
        </ul>
        <Link
          href="/"
          className={`block px-4 py-2 mt-3 text-sm font-medium text-center rounded-lg ${
            isDarkMode
              ? "text-gray-400 bg-gray-800 border border-gray-700 hover:bg-gray-700"
              : "text-gray-800 bg-white border border-gray-600 hover:bg-photographer-elevated"
          }`}
        >
          Zobacz wszystkie powiadomienia
        </Link>
      </Dropdown>
    </div>
  );
}
