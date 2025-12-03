import { AlertTriangle } from "lucide-react";
import { useRouter } from "next/router";
import React from "react";

import { signOut } from "../../lib/auth";
import { Modal } from "../ui/modal";

interface SessionExpiredModalProps {
  isOpen: boolean;
  returnUrl?: string;
}

export default function SessionExpiredModal({ isOpen, returnUrl }: SessionExpiredModalProps) {
  const router = useRouter();

  const handleGoToLogin = () => {
    // Store return URL before signing out
    if (returnUrl && typeof window !== "undefined") {
      sessionStorage.setItem("authReturnUrl", returnUrl);
    }

    // Sign out to clear all tokens
    signOut();

    // Redirect to login with return URL
    const loginUrl = returnUrl ? `/login?returnUrl=${encodeURIComponent(returnUrl)}` : "/login";
    void router.push(loginUrl);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {}} // Prevent closing by clicking outside or ESC
      showCloseButton={false}
      className="max-w-[45rem]"
    >
      <div className="p-12 sm:p-16">
        <div className="flex flex-col items-center text-center">
          {/* Yellow warning triangle with exclamation mark */}
          <div className="mb-10">
            <AlertTriangle
              size={80}
              className="text-warning-500 dark:text-warning-400 fill-current"
            />
          </div>

          <h2 className="text-3xl sm:text-4xl font-semibold mb-4 text-gray-900 dark:text-white tracking-tight">
            Sesja wygasła
          </h2>

          <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-400 mb-10 max-w-lg leading-relaxed">
            Z powodów bezpieczeństwa wylogowaliśmy Cię.
            <br />
            Zaloguj się ponownie, aby kontynuować pracę.
          </p>

          <button
            onClick={handleGoToLogin}
            className="w-full sm:w-auto min-w-[240px] px-10 py-5 text-base font-medium bg-brand-500 text-white rounded-lg shadow-lg shadow-brand-500/25 dark:shadow-brand-500/20 hover:bg-brand-600 hover:shadow-xl hover:shadow-brand-500/30 dark:hover:shadow-brand-500/25 transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Zaloguj się ponownie
          </button>
        </div>
      </div>
    </Modal>
  );
}
