import { useState, useEffect } from "react";

import { useUpdateBusinessInfo } from "../../hooks/mutations/useAuthMutations";
import { useBusinessInfo } from "../../hooks/queries/useAuth";
import { useWalletBalance, useWalletTransactions } from "../../hooks/queries/useWallet";

import { WelcomePopup } from "./WelcomePopup";

interface WelcomePopupWrapperProps {
  onCreateGallery?: () => void;
}

export const WelcomePopupWrapper = ({ onCreateGallery }: WelcomePopupWrapperProps) => {
  const { data: businessInfo, isLoading: isLoadingBusinessInfo } = useBusinessInfo();
  const { data: walletTransactionsData, refetch: refetchTransactions } = useWalletTransactions({
    limit: "10",
  });
  const { refetch: refetchBalance } = useWalletBalance();
  const updateBusinessInfoMutation = useUpdateBusinessInfo();
  const [showPopup, setShowPopup] = useState(false);
  const [welcomeBonusCents, setWelcomeBonusCents] = useState(900); // Default to 9 PLN (900 cents)
  const [checking, setChecking] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const [hasBeenClosed, setHasBeenClosed] = useState(false);
  const [hasCheckedOnce, setHasCheckedOnce] = useState(false);

  // Ensure component only renders on client to prevent hydration mismatch
  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    // Only check on client side
    if (typeof window === "undefined" || !isMounted) {
      return;
    }

    // Wait for businessInfo to load before checking - prevents flicker
    if (isLoadingBusinessInfo) {
      return;
    }

    // Don't check again if popup has been closed
    if (hasBeenClosed) {
      setChecking(false);
      return;
    }

    // Check if popup was already shown - if so, never show it
    if (businessInfo?.welcomePopupShown === true) {
      setChecking(false);
      setHasCheckedOnce(true);
      return;
    }

    // Don't check again if we've already checked once and popup is not shown
    if (hasCheckedOnce && !showPopup) {
      return;
    }

    // Check for welcome bonus on mount
    // ProtectedRoute ensures user is authenticated before this component renders
    const checkWelcomeBonus = async () => {
      try {
        // Double-check welcomePopupShown flag - if it's true, don't show popup
        if (businessInfo?.welcomePopupShown === true) {
          setChecking(false);
          setHasCheckedOnce(true);
          return;
        }

        // Check transactions immediately
        const transactions = walletTransactionsData?.transactions ?? [];

        // Find WELCOME_BONUS transaction
        const welcomeBonusTransaction = transactions.find((tx) => tx.type === "WELCOME_BONUS");

        // If welcome bonus exists and is the only transaction, show popup immediately
        if (welcomeBonusTransaction && transactions.length === 1) {
          // Final check before showing popup
          if (businessInfo?.welcomePopupShown === true) {
            setChecking(false);
            setHasCheckedOnce(true);
            return;
          }

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
          setHasCheckedOnce(true);
          return;
        }

        // If no welcome bonus transaction yet, trigger it and check again
        if (!welcomeBonusTransaction && !hasCheckedOnce) {
          // Load wallet balance (this triggers welcome bonus if user is new)
          await refetchBalance();

          // Check transactions again after a short delay (transaction creation is fast)
          await new Promise((resolve) => setTimeout(resolve, 500));

          // Check welcomePopupShown again after refetch
          if (businessInfo?.welcomePopupShown === true) {
            setChecking(false);
            setHasCheckedOnce(true);
            return;
          }

          const retryResult = await refetchTransactions();
          const retryTransactions = retryResult.data?.transactions ?? [];

          const retryWelcomeBonus = retryTransactions.find((tx) => tx.type === "WELCOME_BONUS");

          // Check if welcome bonus is the only transaction
          if (retryWelcomeBonus && retryTransactions.length === 1) {
            // Final check before showing popup
            if (businessInfo?.welcomePopupShown === true) {
              setChecking(false);
              setHasCheckedOnce(true);
              return;
            }

            const bonusAmount =
              retryWelcomeBonus.amountCents ??
              (typeof retryWelcomeBonus.amount === "number" ? retryWelcomeBonus.amount * 100 : 900);
            if (typeof bonusAmount === "number") {
              setWelcomeBonusCents(bonusAmount);
            }
            setShowPopup(true);
            setHasCheckedOnce(true);
          }
        }
      } catch (_err) {
        // Error fetching wallet/transactions - don't show popup
        
      } finally {
        setChecking(false);
        if (!hasCheckedOnce) {
          setHasCheckedOnce(true);
        }
      }
    };

    void checkWelcomeBonus();
  }, [businessInfo?.welcomePopupShown, isLoadingBusinessInfo, walletTransactionsData, refetchBalance, refetchTransactions, isMounted, hasBeenClosed, hasCheckedOnce, showPopup]);

  const handleClose = async () => {
    setShowPopup(false);
    setHasBeenClosed(true);

    // Update user settings to mark popup as shown
    try {
      await updateBusinessInfoMutation.mutateAsync({ welcomePopupShown: true });
    } catch (_err) {
      // Log error but don't block - settings update is not critical
      
    }
  };

  // Don't render anything on server or while checking or if popup shouldn't be shown
  // Also check welcomePopupShown flag as final safeguard
  // Wait for businessInfo to load to prevent flicker
  if (!isMounted || isLoadingBusinessInfo || checking || !showPopup || businessInfo?.welcomePopupShown === true) {
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
