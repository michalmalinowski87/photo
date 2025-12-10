import { CheckCircle2, AlertTriangle } from "lucide-react";

import { formatPrice } from "../../lib/format-price";
import { WalletTopUpSection } from "../wallet/WalletTopUpSection";

interface PaymentMethodInfo {
  paymentMethod?: "WALLET" | "STRIPE";
  walletAmountCents?: number;
  stripeAmountCents?: number;
  stripeFeeCents?: number;
  totalAmountCents?: number;
}

interface PaymentMethodGuidanceProps {
  paymentMethodInfo: PaymentMethodInfo | null;
  onTopUpComplete?: () => void;
}

export const PaymentMethodGuidance = ({
  paymentMethodInfo,
  onTopUpComplete,
}: PaymentMethodGuidanceProps) => {
  if (!paymentMethodInfo) {
    return null;
  }

  if (paymentMethodInfo.paymentMethod === "WALLET") {
    return (
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-5 mb-6 border border-blue-200 dark:border-blue-800/30">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/40">
            <CheckCircle2 className="w-5 h-5 text-blue-600 dark:text-blue-400" strokeWidth={2} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
              Płatność z portfela
            </p>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Masz wystarczające środki w portfelu. Płatność zostanie wykonana automatycznie z
              portfela bez dodatkowych opłat transakcyjnych.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (paymentMethodInfo.paymentMethod === "STRIPE") {
    return (
      <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-5 mb-6 border border-amber-200 dark:border-amber-800/30">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/40">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" strokeWidth={2} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
              Niewystarczające saldo portfela
            </p>
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
              Płatność zostanie wykonana przez Stripe, co wiąże się z dodatkowymi opłatami
              transakcyjnymi ({formatPrice(paymentMethodInfo.stripeFeeCents ?? 0)}).
            </p>
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
              <strong>Tańsze rozwiązanie:</strong> Doładuj portfel, aby uniknąć opłat transakcyjnych
              Stripe.
            </p>

            {/* Wallet Top-up Form */}
            <div className="mt-4">
              <WalletTopUpSection onTopUp={onTopUpComplete} quickAmounts={[2000, 5000, 10000]} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
