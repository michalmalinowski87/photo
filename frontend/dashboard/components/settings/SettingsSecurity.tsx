import { useState, useEffect } from "react";

import { useAuth } from "../../context/AuthProvider";
import { useChangePassword } from "../../hooks/mutations/useAuthMutations";
import { useBusinessInfo } from "../../hooks/queries/useAuth";
import { useToast } from "../../hooks/useToast";
import { formatApiError } from "../../lib/api-service";
import Button from "../ui/button/Button";
import Input from "../ui/input/InputField";

interface PasswordForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export default function SettingsSecurity() {
  const { showToast } = useToast();
  const { user } = useAuth();

  const { isLoading: loading } = useBusinessInfo();
  const changePasswordMutation = useChangePassword();

  const [loginEmail, setLoginEmail] = useState<string>("");
  const [passwordForm, setPasswordForm] = useState<PasswordForm>({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  useEffect(() => {
    if (user?.email) {
      setLoginEmail(user.email);
    }
  }, [user?.email]);

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

  if (loading) {
    return (
      <div className="p-4 bg-white border border-gray-400 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700 h-[349.33px] animate-fade-in-out"></div>
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
    </div>
  );
}
