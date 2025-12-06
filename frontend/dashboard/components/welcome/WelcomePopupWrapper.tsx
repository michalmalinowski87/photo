import { useState, useEffect } from "react";

import { useUpdateBusinessInfo } from "../../hooks/mutations/useAuthMutations";
import { useBusinessInfo } from "../../hooks/queries/useAuth";
import { useWalletBalance, useWalletTransactions } from "../../hooks/queries/useWallet";

import { WelcomePopup } from "./WelcomePopup";

interface WelcomePopupWrapperProps {
  onCreateGallery?: () => void;
}

export const WelcomePopupWrapper: React.FC<WelcomePopupWrapperProps> = ({ onCreateGallery }) => {
  const { data: businessInfo } = useBusinessInfo();
  const { data: walletTransactionsData, refetch: refetchTransactions } = useWalletTransactions({
    limit: "10",
  });
  const { refetch: refetchBalance } = useWalletBalance();
  const updateBusinessInfoMutation = useUpdateBusinessInfo();
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
        // Check if popup was already shown
        if (businessInfo?.welcomePopupShown === true) {
          // User has already seen the popup, don't show again
          setChecking(false);
          return;
        }

        // Check transactions immediately
        const transactions = walletTransactionsData?.transactions ?? [];

        // Find WELCOME_BONUS transaction
        const welcomeBonusTransaction = transactions.find((tx) => tx.type === "WELCOME_BONUS");

        // If welcome bonus exists and is the only transaction, show popup immediately
        if (welcomeBonusTransaction && transactions.length === 1) {
          const bonusAmount =
            welcomeBonusTransaction.amountCents ??
            (typeof welcomeBonusTransaction.amount === "number"
              ? welcomeBonusTransaction.amount * 100
              : 900);
          if (typeof bonusAmount === "number") {
            setWelcomeBonusCents(bonusAmount);
          }
          setShowPopup(true);
          setChecking(false);
          return;
        }

        // If no welcome bonus transaction yet, trigger it and check again
        if (!welcomeBonusTransaction) {
          // Load wallet balance (this triggers welcome bonus if user is new)
          await refetchBalance();

          // Check transactions again after a short delay (transaction creation is fast)
          await new Promise((resolve) => setTimeout(resolve, 500));

          const retryResult = await refetchTransactions();
          const retryTransactions = retryResult.data?.transactions ?? [];

          const retryWelcomeBonus = retryTransactions.find((tx) => tx.type === "WELCOME_BONUS");

          // Check if welcome bonus is the only transaction
          if (retryWelcomeBonus && retryTransactions.length === 1) {
            const bonusAmount =
              retryWelcomeBonus.amountCents ??
              (typeof retryWelcomeBonus.amount === "number" ? retryWelcomeBonus.amount * 100 : 900);
            if (typeof bonusAmount === "number") {
              setWelcomeBonusCents(bonusAmount);
            }
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
  }, [businessInfo, walletTransactionsData, refetchBalance, refetchTransactions]);

  const handleClose = async () => {
    setShowPopup(false);

    // Update user settings to mark popup as shown
    try {
      await updateBusinessInfoMutation.mutateAsync({ welcomePopupShown: true });
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
