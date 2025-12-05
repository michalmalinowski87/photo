import { useState, useEffect } from "react";

import api from "../../lib/api-service";

import { WelcomePopup } from "./WelcomePopup";

interface WelcomePopupWrapperProps {
  onCreateGallery?: () => void;
}

export const WelcomePopupWrapper: React.FC<WelcomePopupWrapperProps> = ({ onCreateGallery }) => {
  const [showPopup, setShowPopup] = useState(false);
  const [welcomeBonusCents, setWelcomeBonusCents] = useState(900); // Default to 9 PLN (900 cents)
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Only check on client side
    if (typeof window === "undefined") {
      return;
    }

    // Check for welcome bonus on mount
    // ProtectedRoute ensures user is authenticated before this component renders
    const checkWelcomeBonus = async () => {
      try {
        // Check user settings and transactions in parallel for faster response
        const [businessInfoResult, transactionsResult] = await Promise.allSettled([
          api.auth.getBusinessInfo(),
          api.wallet.getTransactions({ limit: "10" }),
        ]);

        // Check if popup was already shown
        if (
          businessInfoResult.status === "fulfilled" &&
          businessInfoResult.value.welcomePopupShown === true
        ) {
          // User has already seen the popup, don't show again
          setChecking(false);
          return;
        }

        // Check transactions immediately
        interface Transaction {
          type?: string;
          amountCents?: number;
          amount?: number;
        }
        let transactions: Transaction[] = [];
        if (transactionsResult.status === "fulfilled") {
          const resultValue = transactionsResult.value as { transactions?: Transaction[] };
          transactions = resultValue.transactions ?? [];
        }

        // Find WELCOME_BONUS transaction
        const welcomeBonusTransaction = transactions.find((tx) => tx.type === "WELCOME_BONUS");

        // If welcome bonus exists and is the only transaction, show popup immediately
        if (welcomeBonusTransaction && transactions.length === 1) {
          const bonusAmount =
            welcomeBonusTransaction.amountCents ??
            (welcomeBonusTransaction.amount ? welcomeBonusTransaction.amount * 100 : 900);
          setWelcomeBonusCents(bonusAmount);
          setShowPopup(true);
          setChecking(false);
          return;
        }

        // If no welcome bonus transaction yet, trigger it and check again
        if (!welcomeBonusTransaction) {
          // Load wallet balance (this triggers welcome bonus if user is new)
          await api.wallet.getBalance();

          // Check transactions again after a short delay (transaction creation is fast)
          await new Promise((resolve) => setTimeout(resolve, 500));

          const retryTransactionsData = await api.wallet.getTransactions({ limit: "10" });
          const retryTransactionsTyped = retryTransactionsData as {
            transactions?: Transaction[];
          };
          const retryTransactions = retryTransactionsTyped.transactions ?? [];

          const retryWelcomeBonus = retryTransactions.find((tx) => tx.type === "WELCOME_BONUS");

          // Check if welcome bonus is the only transaction
          if (retryWelcomeBonus && retryTransactions.length === 1) {
            const bonusAmount =
              retryWelcomeBonus.amountCents ??
              (retryWelcomeBonus.amount ? retryWelcomeBonus.amount * 100 : 900);
            setWelcomeBonusCents(bonusAmount);
            setShowPopup(true);
          }
        }
      } catch (_err) {
        // Error fetching wallet/transactions - don't show popup
        console.error("Welcome popup check failed:", _err);
      } finally {
        setChecking(false);
      }
    };

    void checkWelcomeBonus();
  }, []);

  const handleClose = async () => {
    setShowPopup(false);

    // Update user settings to mark popup as shown
    try {
      await api.auth.updateBusinessInfo({ welcomePopupShown: true });
    } catch (_err) {
      // Log error but don't block - settings update is not critical
      console.error("Failed to update business info:", _err);
    }
  };

  // Don't render anything while checking or if popup shouldn't be shown
  if (checking || !showPopup) {
    return null;
  }

  return (
    <WelcomePopup
      isOpen={showPopup}
      onClose={handleClose}
      welcomeBonusCents={welcomeBonusCents}
      onCreateGallery={onCreateGallery}
    />
  );
};
