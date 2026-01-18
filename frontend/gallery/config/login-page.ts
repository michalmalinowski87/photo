export interface LoginPageConfig {
  welcomeMessage: string;
  passwordLabel: string;
  passwordPlaceholder: string;
  submitLabel: string;
  submitLoadingLabel: string;
}

/**
 * Hardcoded defaults (for now).
 * In the future this can be replaced by a per-gallery editable config fetched from the API.
 */
export const defaultLoginPageConfig: LoginPageConfig = {
  welcomeMessage: "",
  passwordLabel: "Hasło",
  passwordPlaceholder: "Wpisz hasło do galerii",
  submitLabel: "Zaloguj się",
  submitLoadingLabel: "Logowanie…"
};

