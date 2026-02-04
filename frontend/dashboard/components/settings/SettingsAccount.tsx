import { PostHogActions } from "@photocloud/posthog-types";
import { useState, useEffect } from "react";

import { useAuth } from "../../context/AuthProvider";
import { useUpdateBusinessInfo } from "../../hooks/mutations/useAuthMutations";
import {
  useRequestDeletion,
  useCancelDeletion,
} from "../../hooks/mutations/useUserDeletionMutations";
import { useBusinessInfo, useDeletionStatus } from "../../hooks/queries/useAuth";
import { useToast } from "../../hooks/useToast";
import { formatApiError } from "../../lib/api-service";
import Button from "../ui/button/Button";
import Input from "../ui/input/InputField";
import { DeleteAccountModal } from "../ui/modal/DeleteAccountModal";
import { DeletionPendingBanner } from "../ui/modal/DeletionPendingBanner";

interface BusinessForm {
  businessName: string;
  email: string;
  phone: string;
  address: string;
  nip: string;
}

export default function SettingsAccount() {
  const { showToast } = useToast();
  const { user } = useAuth();

  const { data: businessInfo, isLoading: loading } = useBusinessInfo();
  const { data: deletionStatus } = useDeletionStatus();
  const updateBusinessInfoMutation = useUpdateBusinessInfo();
  const requestDeletionMutation = useRequestDeletion();
  const cancelDeletionMutation = useCancelDeletion();

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [loginEmail, setLoginEmail] = useState<string>("");
  const [businessForm, setBusinessForm] = useState<BusinessForm>({
    businessName: "",
    email: "",
    phone: "",
    address: "",
    nip: "",
  });

  useEffect(() => {
    if (businessInfo) {
      setBusinessForm({
        businessName: businessInfo.businessName ?? "",
        email: businessInfo.email ?? "",
        phone: businessInfo.phone ?? "",
        address: businessInfo.address ?? "",
        nip: businessInfo.nip ?? "",
      });
    }
  }, [businessInfo]);

  useEffect(() => {
    if (user?.email) {
      setLoginEmail(user.email);
      if (!businessInfo?.email && user.email) {
        setBusinessForm((prev) => ({
          ...prev,
          email: user.email ?? prev.email,
        }));
      }
    }
  }, [user?.email, businessInfo?.email]);

  const handleBusinessInfoUpdate = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();

    try {
      await updateBusinessInfoMutation.mutateAsync(businessForm);
      showToast("success", "Sukces", "Informacje biznesowe zostały zaktualizowane");
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err as Error));
    }
  };

  const handleDeleteAccount = async (confirmationPhrase: string): Promise<void> => {
    try {
      await requestDeletionMutation.mutateAsync({ confirmationPhrase });
      setShowDeleteModal(false);
      showToast(
        "success",
        "Sukces",
        "Prośba o usunięcie konta została wysłana. Sprawdź email. Możesz anulować usunięcie w ustawieniach."
      );
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err as Error));
    }
  };

  const handleCancelDeletion = async (): Promise<void> => {
    try {
      await cancelDeletionMutation.mutateAsync();
      showToast(
        "success",
        "Sukces",
        "Usunięcie konta zostało anulowane. Twoje konto pozostaje aktywne."
      );
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err as Error));
    }
  };

  if (loading) {
    return (
      <>
        <div className="p-4 bg-white border border-gray-400 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700 h-[93.33px] animate-fade-in-out"></div>
        <div className="p-4 bg-white border border-gray-400 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700 h-96 animate-fade-in-out"></div>
      </>
    );
  }

  if (deletionStatus?.status === "pendingDeletion") {
    return (
      <DeletionPendingBanner
        deletionScheduledAt={deletionStatus.deletionScheduledAt ?? new Date().toISOString()}
        deletionReason={deletionStatus.deletionReason}
        onUndo={handleCancelDeletion}
        loading={cancelDeletionMutation.isPending}
      />
    );
  }

  return (
    <div className="space-y-4 pb-8">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Ustawienia</h1>

      <div className="p-6 bg-white border border-gray-400 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
        <div className="space-y-1" style={{ minHeight: "60px" }}>
          <label className="block text-base font-medium text-gray-700 dark:text-gray-300">
            Email logowania
          </label>
          <p className="text-base text-gray-900 dark:text-white">
            {loginEmail ?? "Ładowanie danych..."}
          </p>
        </div>
      </div>

      <div className="p-6 bg-white border border-gray-400 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2.5">
          Informacje kontaktowe
        </h2>

        <form onSubmit={handleBusinessInfoUpdate}>
          <div className="mb-1.5">
            <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Email kontaktowy
            </label>
            <Input
              type="email"
              placeholder="email@example.com"
              value={businessForm.email}
              onChange={(e) =>
                setBusinessForm({
                  ...businessForm,
                  email: e.target.value,
                })
              }
            />
          </div>

          <div className="mb-1.5">
            <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Nazwa firmy
            </label>
            <Input
              type="text"
              placeholder="Nazwa firmy"
              value={businessForm.businessName}
              onChange={(e) =>
                setBusinessForm({
                  ...businessForm,
                  businessName: e.target.value,
                })
              }
            />
          </div>

          <div className="mb-1.5">
            <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Telefon
            </label>
            <Input
              type="tel"
              placeholder="+48 123 456 789"
              value={businessForm.phone}
              onChange={(e) =>
                setBusinessForm({
                  ...businessForm,
                  phone: e.target.value,
                })
              }
            />
          </div>

          <div className="mb-1.5">
            <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Adres
            </label>
            <Input
              type="text"
              placeholder="Ulica, kod pocztowy, miasto"
              value={businessForm.address}
              onChange={(e) =>
                setBusinessForm({
                  ...businessForm,
                  address: e.target.value,
                })
              }
            />
          </div>

          <div className="mb-1.5">
            <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              NIP
            </label>
            <Input
              type="text"
              placeholder="NIP"
              value={businessForm.nip}
              onChange={(e) =>
                setBusinessForm({
                  ...businessForm,
                  nip: e.target.value,
                })
              }
            />
          </div>

          <div className="flex justify-end">
            <Button type="submit" variant="primary" disabled={updateBusinessInfoMutation.isPending}>
              {updateBusinessInfoMutation.isPending ? "Zapisywanie..." : "Zapisz informacje"}
            </Button>
          </div>
        </form>
      </div>

      <div className="p-6 bg-white border border-gray-400 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2.5">Usuń konto</h2>
        <p className="text-base text-gray-600 dark:text-gray-400 mb-4">
          Usunięcie konta jest operacją nieodwracalną. Wszystkie dane zostaną trwale usunięte.
        </p>
        <Button
          variant="danger"
          onClick={() => setShowDeleteModal(true)}
          data-ph-action={PostHogActions.settings.accountDeleteClick}
        >
          Usuń konto
        </Button>
      </div>

      <DeleteAccountModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteAccount}
        loading={requestDeletionMutation.isPending}
      />
    </div>
  );
}
