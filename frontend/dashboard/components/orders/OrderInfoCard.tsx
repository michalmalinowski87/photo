import { Check, X, Pencil } from "lucide-react";
import { useRouter } from "next/router";

import { useGallery } from "../../hooks/queries/useGalleries";
import { useOrder } from "../../hooks/queries/useOrders";
import { formatCurrencyInput } from "../../lib/currency";
import { formatPrice } from "../../lib/format-price";
import { normalizeSelectedKeys } from "../../lib/order-utils";
import { useGalleryType } from "../hocs/withGalleryType";
import { Loading } from "../ui/loading/Loading";
import { Tooltip } from "../ui/tooltip/Tooltip";

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
  const router = useRouter();
  const { id: galleryId, orderId } = router.query;

  const galleryIdStr = Array.isArray(galleryId) ? galleryId[0] : galleryId;
  const galleryIdForQuery =
    galleryIdStr && typeof galleryIdStr === "string" ? galleryIdStr : undefined;
  const orderIdStr = Array.isArray(orderId) ? orderId[0] : orderId;
  const orderIdForQuery = orderIdStr && typeof orderIdStr === "string" ? orderIdStr : undefined;

  // Use React Query for order and gallery data
  const { data: order } = useOrder(galleryIdForQuery, orderIdForQuery);
  const { data: gallery } = useGallery(galleryIdForQuery);
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
  const totalCents = typeof order.totalCents === "number" ? order.totalCents : 0;
  const createdAt = typeof order.createdAt === "string" ? order.createdAt : undefined;
  const selectedKeys = normalizeSelectedKeys(order.selectedKeys);
  const selectedKeysCount = selectedKeys.length;
  const selectionEnabled = gallery?.selectionEnabled !== false;
  return (
    <div className="p-6 bg-white border border-gray-400 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
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
                <Tooltip content="Zapisz">
                  <button
                    onClick={onSave}
                    disabled={savingAmount}
                    className="p-1 text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Check className="w-5 h-5" strokeWidth={2} />
                  </button>
                </Tooltip>
                <Tooltip content="Anuluj">
                  <button
                    onClick={onCancelEdit}
                    disabled={savingAmount}
                    className="p-1 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <X className="w-5 h-5" strokeWidth={2} />
                  </button>
                </Tooltip>
                {savingAmount && <Loading size="sm" />}
              </>
            ) : (
              <>
                <span className="text-lg font-semibold text-gray-900 dark:text-white">
                  {formatPrice(totalCents)}
                </span>
                <Tooltip content="Edytuj kwotę">
                  <button
                    onClick={onStartEdit}
                    className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 transition-colors"
                  >
                    <Pencil className="w-4 h-4" strokeWidth={2} />
                  </button>
                </Tooltip>
              </>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">Data utworzenia</div>
          <div className="text-lg font-semibold text-gray-900 dark:text-white">
            {createdAt
              ? new Date(createdAt as string | number | Date).toLocaleDateString("pl-PL")
              : "-"}
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
