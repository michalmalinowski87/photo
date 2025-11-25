import { useState, useEffect } from "react";
import { apiFetch, formatApiError } from "../lib/api";
import { getIdToken } from "../lib/auth";
import { initializeAuth, redirectToLandingSignIn } from "../lib/auth-init";
import Button from "../components/ui/button/Button";
import Input from "../components/ui/input/InputField";
import { useToast } from "../hooks/useToast";

export default function Settings() {
  const { showToast } = useToast();
  const [apiUrl, setApiUrl] = useState("");
  const [idToken, setIdToken] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [businessInfoLoading, setBusinessInfoLoading] = useState(false);
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
        }
      },
      () => {
        redirectToLandingSignIn("/settings");
      }
    );
  }, []);

  useEffect(() => {
    if (apiUrl && idToken) {
      loadBusinessInfo();
    }
  }, [apiUrl, idToken]);

  const loadBusinessInfo = async () => {
    if (!apiUrl || !idToken) return;
    
    try {
      const { data } = await apiFetch(`${apiUrl}/auth/business-info`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      
      // Update business form with loaded data
      setBusinessForm({
        businessName: data.businessName || "",
        email: data.email || "",
        phone: data.phone || "",
        address: data.address || "",
        nip: data.nip || "",
      });
      
      // If email is not set in business info, use login email as default
      if (!data.email && loginEmail) {
        setBusinessForm(prev => ({
          ...prev,
          email: loginEmail
        }));
      }
    } catch (err) {
      // If 404 or no data, that's okay - user just hasn't set business info yet
      // Use login email as default for contact email
      if (loginEmail) {
        setBusinessForm(prev => ({
          ...prev,
          email: loginEmail
        }));
      }
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (!apiUrl || !idToken) return;

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

      showToast("success", "Sukces", "Hasło zostało zmienione pomyślnie");
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err));
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleBusinessInfoUpdate = async (e) => {
    e.preventDefault();
    if (!apiUrl || !idToken) return;

    setBusinessInfoLoading(true);

    try {
      await apiFetch(`${apiUrl}/auth/business-info`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(businessForm),
      });

      showToast("success", "Sukces", "Informacje biznesowe zostały zaktualizowane");
    } catch (err) {
      showToast("error", "Błąd", formatApiError(err));
    } finally {
      setBusinessInfoLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
        Ustawienia
      </h1>

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
            <Button type="submit" variant="primary" disabled={passwordLoading}>
              {passwordLoading ? "Zapisywanie..." : "Zmień hasło"}
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
            <Button type="submit" variant="primary" disabled={businessInfoLoading}>
              {businessInfoLoading ? "Zapisywanie..." : "Zapisz informacje"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

