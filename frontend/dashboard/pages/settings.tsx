import { useState, useEffect, useCallback } from "react";

import Button from "../components/ui/button/Button";
import Input from "../components/ui/input/InputField";
import { useToast } from "../hooks/useToast";
import api, { formatApiError } from "../lib/api-service";
import { initializeAuth, redirectToLandingSignIn } from "../lib/auth-init";

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
  const [loading, setLoading] = useState<boolean>(true);
  const [loginEmail, setLoginEmail] = useState<string>("");
  const [passwordLoading, setPasswordLoading] = useState<boolean>(false);
  const [businessInfoLoading, setBusinessInfoLoading] = useState<boolean>(false);
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

  const decodeTokenEmail = (token: string): string | null => {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) {
        return null;
      }
      const payload = JSON.parse(atob(parts[1])) as { email?: string };
      return payload.email ?? null;
    } catch (_e) {
      return null;
    }
  };

  const loadBusinessInfo = useCallback(async (): Promise<void> => {
    try {
      const data = await api.auth.getBusinessInfo();

      setBusinessForm({
        businessName: data.businessName ?? "",
        email: data.email ?? "",
        phone: data.phone ?? "",
        address: data.address ?? "",
        nip: data.nip ?? "",
      });

      if (!data.email && loginEmail) {
        setBusinessForm((prev) => ({
          ...prev,
          email: loginEmail,
        }));
      }
    } catch (_err) {
      if (loginEmail) {
        setBusinessForm((prev) => ({
          ...prev,
          email: loginEmail,
        }));
      }
    } finally {
      setLoading(false);
    }
  }, [loginEmail]);

  useEffect(() => {
    initializeAuth(
      async (token: string) => {
        const email = decodeTokenEmail(token);
        if (email) {
          setLoginEmail(email);
        }
        await loadBusinessInfo();
      },
      () => {
        redirectToLandingSignIn("/settings");
      }
    );
  }, [loadBusinessInfo]);

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

    if (passwordForm.newPassword.length < 8) {
      showToast("error", "Błąd", "Hasło musi mieć co najmniej 8 znaków");
      return;
    }

    setPasswordLoading(true);

    try {
      await api.auth.changePassword(passwordForm.currentPassword, passwordForm.newPassword);

      showToast("success", "Sukces", "Hasło zostało zmienione pomyślnie");
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err as Error));
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleBusinessInfoUpdate = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();

    setBusinessInfoLoading(true);

    try {
      await api.auth.updateBusinessInfo(businessForm);

      showToast("success", "Sukces", "Informacje biznesowe zostały zaktualizowane");
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err as Error));
    } finally {
      setBusinessInfoLoading(false);
    }
  };

  return (
    <div className="space-y-6">
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
          <div className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
            <div className="space-y-1" style={{ minHeight: "60px" }}>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Email logowania
              </label>
              <p className="text-sm text-gray-900 dark:text-white">
                {loginEmail ?? "Ładowanie danych..."}
              </p>
            </div>
          </div>

          <div className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">Zmiana hasła</h2>

        <form onSubmit={handlePasswordChange}>
          <div className="mb-1.5">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
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
            <Button type="submit" variant="primary" disabled={passwordLoading}>
              {passwordLoading ? "Zapisywanie..." : "Zmień hasło"}
            </Button>
          </div>
        </form>
      </div>

      <div className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
          Informacje kontaktowe
        </h2>

        <form onSubmit={handleBusinessInfoUpdate}>
          <div className="mb-1.5">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
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
            <Button type="submit" variant="primary" disabled={businessInfoLoading}>
              {businessInfoLoading ? "Zapisywanie..." : "Zapisz informacje"}
            </Button>
          </div>
        </form>
      </div>
        </>
      )}
    </div>
  );
}
