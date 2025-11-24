import { useState, useEffect } from "react";
import { apiFetch, formatApiError } from "../lib/api";
import { getIdToken } from "../lib/auth";
import { initializeAuth, redirectToLandingSignIn } from "../lib/auth-init";
import Button from "../components/ui/button/Button";
import Input from "../components/ui/input/InputField";
import { Alert } from "../components/ui/alert/Alert";

export default function Settings() {
  const [apiUrl, setApiUrl] = useState("");
  const [idToken, setIdToken] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [businessForm, setBusinessForm] = useState({
    businessName: "",
    email: "",
    phone: "",
    address: "",
    nip: "",
  });

  // Helper function to decode JWT and extract email
  const decodeTokenEmail = (token) => {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const payload = JSON.parse(atob(parts[1]));
      return payload.email || null;
    } catch (e) {
      return null;
    }
  };

  useEffect(() => {
    setApiUrl(process.env.NEXT_PUBLIC_API_URL || "");
    initializeAuth(
      (token) => {
        setIdToken(token);
        const email = decodeTokenEmail(token);
        if (email) {
          setLoginEmail(email);
          // Initialize contact email with login email if not set
          setBusinessForm(prev => {
            if (!prev.email) {
              return { ...prev, email: email };
            }
            return prev;
          });
        }
      },
      () => {
        redirectToLandingSignIn("/settings");
      }
    );
  }, []);

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (!apiUrl || !idToken) return;

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError("Nowe hasła nie są identyczne");
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      setError("Hasło musi mieć co najmniej 8 znaków");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      // Note: This endpoint needs to be created in the backend
      // For now, we'll use Cognito's change password API
      // In a real implementation, you'd call your backend which calls Cognito
      await apiFetch(`${apiUrl}/auth/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });

      setSuccess("Hasło zostało zmienione pomyślnie");
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleBusinessInfoUpdate = async (e) => {
    e.preventDefault();
    if (!apiUrl || !idToken) return;

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      // Note: This endpoint needs to be created in the backend
      // It should update user attributes in Cognito
      await apiFetch(`${apiUrl}/auth/business-info`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(businessForm),
      });

      setSuccess("Informacje biznesowe zostały zaktualizowane");
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
        Ustawienia
      </h1>

      {error && (
        <Alert
          variant="error"
          title="Błąd"
          message={error}
        />
      )}

      {success && (
        <Alert
          variant="success"
          title="Sukces"
          message={success}
        />
      )}

      {/* Login Email Display */}
      <div className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
        <div className="space-y-1" style={{ minHeight: '60px' }}>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Email logowania
          </label>
          <p className="text-sm text-gray-900 dark:text-white">
            {loginEmail || "Ładowanie danych..."}
          </p>
        </div>
      </div>

      {/* Password Change Section */}
      <div className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
          Zmiana hasła
        </h2>

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
              minLength={8}
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
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? "Zapisywanie..." : "Zmień hasło"}
            </Button>
          </div>
        </form>
      </div>

      {/* Business Information Section */}
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
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? "Zapisywanie..." : "Zapisz informacje"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

