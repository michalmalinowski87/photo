import { Check, X, Pencil } from "lucide-react";

import { formatCurrencyInput, centsToPlnString } from "../../lib/currency";
import { formatPrice } from "../../lib/format-price";
import { normalizeSelectedKeys } from "../../lib/order-utils";
import { useGalleryStore } from "../../store/gallerySlice";
import { useOrderStore } from "../../store/orderSlice";
import { useGalleryType } from "../hocs/withGalleryType";
import { Loading } from "../ui/loading/Loading";

interface OrderInfoCardProps {
  isEditingAmount: boolean;
  editingAmountValue: string;
  savingAmount: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onAmountChange: (value: string) => void;
}

export function OrderInfoCard({
  isEditingAmount,
  editingAmountValue,
  savingAmount,
  onStartEdit,
  onCancelEdit,
  onSave,
  onAmountChange,
}: OrderInfoCardProps) {
  // Subscribe to stores for order and gallery data
  const order = useOrderStore((state) => state.currentOrder);
  const gallery = useGalleryStore((state) => state.currentGallery);
  const { isNonSelectionGallery } = useGalleryType();

  // Defensive check: don't render until order is loaded
  if (!order) {
    return null;
  }

  // Hide for non-selection galleries
  if (isNonSelectionGallery) {
    return null;
  }

  // Get data from order
  const totalCents = order.totalCents ?? 0;
  const createdAt = order.createdAt;
  const selectedKeys = normalizeSelectedKeys(order.selectedKeys);
  const selectedKeysCount = selectedKeys.length;
  const selectionEnabled = gallery?.selectionEnabled !== false;
  return (
    <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
      <div className="flex justify-between items-start">
        <div>
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            Kwota dodatkowych usług
          </div>
          <div className="flex items-center gap-2">
            {isEditingAmount ? (
              <>
                <input
                  type="text"
                  value={editingAmountValue}
                  onChange={(e) => {
                    const formatted = formatCurrencyInput(e.target.value);
                    onAmountChange(formatted);
                  }}
                  className="text-lg font-semibold text-gray-900 dark:text-white bg-transparent border-0 border-b-2 border-gray-400 dark:border-gray-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400 px-0 py-0 max-w-[150px]"
                  autoFocus
                  disabled={savingAmount}
                />
                <span className="text-lg font-semibold text-gray-900 dark:text-white">PLN</span>
                <button
                  onClick={onSave}
                  disabled={savingAmount}
                  className="p-1 text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Zapisz"
                >
                  <Check className="w-5 h-5" strokeWidth={2} />
                </button>
                <button
                  onClick={onCancelEdit}
                  disabled={savingAmount}
                  className="p-1 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Anuluj"
                >
                  <X className="w-5 h-5" strokeWidth={2} />
                </button>
                {savingAmount && <Loading size="sm" />}
              </>
            ) : (
              <>
                <span className="text-lg font-semibold text-gray-900 dark:text-white">
                  {formatPrice(totalCents)}
                </span>
                <button
                  onClick={onStartEdit}
                  className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 transition-colors"
                  title="Edytuj kwotę"
                >
                  <Pencil className="w-4 h-4" strokeWidth={2} />
                </button>
              </>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">Data utworzenia</div>
          <div className="text-lg font-semibold text-gray-900 dark:text-white">
            {createdAt ? new Date(createdAt).toLocaleDateString("pl-PL") : "-"}
          </div>
        </div>
        {selectionEnabled && selectedKeysCount !== undefined && (
          <div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Wybrane zdjęcia</div>
            <div className="text-lg font-semibold text-gray-900 dark:text-white">
              {selectedKeysCount} zdjęć
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
