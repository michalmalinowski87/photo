import { useState, useEffect } from "react";

import Button from "../components/ui/button/Button";
import Input from "../components/ui/input/InputField";
import { useAuth } from "../context/AuthProvider";
import { useChangePassword, useUpdateBusinessInfo } from "../hooks/mutations/useAuthMutations";
import { useBusinessInfo } from "../hooks/queries/useAuth";
import { useToast } from "../hooks/useToast";
import { formatApiError } from "../lib/api-service";

interface PasswordForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface BusinessForm {
  businessName: string;
  email: string;
  phone: string;
  address: string;
  nip: string;
}

export default function Settings() {
  const { showToast } = useToast();
  const { user } = useAuth();

  // React Query hooks
  const { data: businessInfo, isLoading: loading } = useBusinessInfo();
  const changePasswordMutation = useChangePassword();
  const updateBusinessInfoMutation = useUpdateBusinessInfo();

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

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Ustawienia</h1>

      {loading ? (
        <>
          {/* Email logowania Skeleton */}
          <div className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700 h-[93.33px] animate-fade-in-out"></div>

          {/* Zmiana hasła Skeleton */}
          <div className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700 h-[349.33px] animate-fade-in-out"></div>

          {/* Informacje kontaktowe Skeleton */}
          <div className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700 h-96 animate-fade-in-out"></div>
        </>
      ) : (
        <>
          <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
            <div className="space-y-1" style={{ minHeight: "60px" }}>
              <label className="block text-base font-medium text-gray-700 dark:text-gray-300">
                Email logowania
              </label>
              <p className="text-base text-gray-900 dark:text-white">
                {loginEmail ?? "Ładowanie danych..."}
              </p>
            </div>
          </div>

          <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
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
                <Button type="submit" variant="primary" disabled={changePasswordMutation.isPending}>
                  {changePasswordMutation.isPending ? "Zapisywanie..." : "Zmień hasło"}
                </Button>
              </div>
            </form>
          </div>

          <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
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
                  {updateBusinessInfoMutation.isPending ? "Zapisywanie..." : "Zapisz informacje"}
                </Button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
