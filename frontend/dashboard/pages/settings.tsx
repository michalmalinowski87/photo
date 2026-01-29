import { useRouter } from "next/router";
import { useEffect } from "react";

// Prevent static generation - this page uses client hooks
export const dynamic = "force-dynamic";

export default function Settings() {
  const router = useRouter();

  // Redirect to account tab by default
  useEffect(() => {
    if (router.isReady) {
      router.replace("/settings/account");
    }
  }, [router]);

  return null;

  const [loginEmail, setLoginEmail] = useState<string>("");
  const [passwordForm, setPasswordForm] = useState<PasswordForm>({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [businessForm, setBusinessForm] = useState<BusinessForm>({
    businessName: "",
    email: "",
    phone: "",
    address: "",
    nip: "",
  });

  // Update form when business info loads
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

  // Set login email from user context
  useEffect(() => {
    if (user?.email) {
      setLoginEmail(user.email);
      // If business info doesn't have email, use login email
      if (!businessInfo?.email && user.email) {
        setBusinessForm((prev) => ({
          ...prev,
          email: user.email ?? prev.email,
        }));
      }
    }
  }, [user?.email, businessInfo?.email]);

  const handlePasswordChange = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();

    if (passwordForm.newPassword.length < 8) {
      showToast("error", "Błąd", "Nowe hasło musi mieć minimum 8 znaków");
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      showToast("error", "Błąd", "Nowe hasła nie są identyczne");
      return;
    }

    try {
      await changePasswordMutation.mutateAsync({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });

      showToast("success", "Sukces", "Hasło zostało zmienione pomyślnie");
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err as Error));
    }
  };

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

  return (
    <div className="space-y-4 pb-8">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Ustawienia</h1>

      {/* Sub-settings tabs */}
      <div className="flex gap-2 border-b border-gray-300 dark:border-gray-700">
        <button
          onClick={() => setActiveTab("account")}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === "account"
              ? "border-b-2 border-photographer-accent text-photographer-accent"
              : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
          }`}
        >
          Konto
        </button>
        <button
          onClick={() => setActiveTab("security")}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === "security"
              ? "border-b-2 border-photographer-accent text-photographer-accent"
              : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
          }`}
        >
          Bezpieczeństwo
        </button>
        <button
          onClick={() => setActiveTab("gallery")}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === "gallery"
              ? "border-b-2 border-photographer-accent text-photographer-accent"
              : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
          }`}
        >
          Galeria
        </button>
      </div>

      {loading ? (
        <>
          {/* Email logowania Skeleton */}
          <div className="p-4 bg-white border border-gray-400 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700 h-[93.33px] animate-fade-in-out"></div>

          {/* Zmiana hasła Skeleton */}
          <div className="p-4 bg-white border border-gray-400 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700 h-[349.33px] animate-fade-in-out"></div>

          {/* Informacje kontaktowe Skeleton */}
          <div className="p-4 bg-white border border-gray-400 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700 h-96 animate-fade-in-out"></div>
        </>
      ) : deletionStatus?.status === "pendingDeletion" ? (
        // Show only undo deletion banner when pending deletion
        <DeletionPendingBanner
          deletionScheduledAt={deletionStatus.deletionScheduledAt ?? new Date().toISOString()}
          deletionReason={deletionStatus.deletionReason}
          onUndo={handleCancelDeletion}
          loading={cancelDeletionMutation.isPending}
        />
      ) : (
        <>
          {activeTab === "account" && (
            <>
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
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={updateBusinessInfoMutation.isPending}
                    >
                      {updateBusinessInfoMutation.isPending
                        ? "Zapisywanie..."
                        : "Zapisz informacje"}
                    </Button>
                  </div>
                </form>
              </div>

              {/* Delete Account Section */}
              <div className="p-6 bg-white border border-gray-400 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2.5">
                  Usuń konto
                </h2>
                <p className="text-base text-gray-600 dark:text-gray-400 mb-4">
                  Usunięcie konta jest operacją nieodwracalną. Wszystkie dane zostaną trwale
                  usunięte.
                </p>
                <Button variant="danger" onClick={() => setShowDeleteModal(true)}>
                  Usuń konto
                </Button>
              </div>
            </>
          )}

          {activeTab === "security" && (
            <>
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
                  Zmiana hasła
                </h2>

                <form onSubmit={handlePasswordChange}>
                  <div className="mb-1.5">
                    <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Obecne hasło *
                    </label>
                    <Input
                      type="password"
                      placeholder="Wprowadź obecne hasło"
                      value={passwordForm.currentPassword}
                      onChange={(e) =>
                        setPasswordForm({
                          ...passwordForm,
                          currentPassword: e.target.value,
                        })
                      }
                      required
                    />
                  </div>

                  <div className="mb-1.5">
                    <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Nowe hasło *
                    </label>
                    <Input
                      type="password"
                      placeholder="Wprowadź nowe hasło (min. 8 znaków)"
                      value={passwordForm.newPassword}
                      onChange={(e) =>
                        setPasswordForm({
                          ...passwordForm,
                          newPassword: e.target.value,
                        })
                      }
                      required
                    />
                  </div>

                  <div className="mb-1.5">
                    <label className="block text-base font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Potwierdź nowe hasło *
                    </label>
                    <Input
                      type="password"
                      placeholder="Potwierdź nowe hasło"
                      value={passwordForm.confirmPassword}
                      onChange={(e) =>
                        setPasswordForm({
                          ...passwordForm,
                          confirmPassword: e.target.value,
                        })
                      }
                      required
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={changePasswordMutation.isPending}
                    >
                      {changePasswordMutation.isPending ? "Zapisywanie..." : "Zmień hasło"}
                    </Button>
                  </div>
                </form>
              </div>
            </>
          )}

          {activeTab === "gallery" && <GallerySettingsTab />}
        </>
      )}

      <DeleteAccountModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteAccount}
        loading={requestDeletionMutation.isPending}
      />
    </div>
  );
}
