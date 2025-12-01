import { useRouter } from "next/router";
import React from "react";

import { signOut } from "../../lib/auth";
import Button from "../ui/button/Button";
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
    >
      <div className="p-4">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4">
            <svg
              className="w-16 h-16 text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>

          <h2 className="text-2xl font-semibold mb-2 text-foreground">Twoja sesja wygasła</h2>

          <p className="text-muted-foreground mb-6">
            Twoja sesja wygasła ze względów bezpieczeństwa. Zaloguj się ponownie, aby kontynuować.
          </p>

          <Button variant="primary" size="md" onClick={handleGoToLogin} className="w-full">
            Przejdź do logowania
          </Button>
        </div>
      </div>
    </Modal>
  );
}
