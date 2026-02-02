import { Check, X } from "lucide-react";
import { useRouter } from "next/router";
import React, { useState, useEffect } from "react";

import Button from "../components/ui/button/Button";
import { Label } from "../components/ui/label";
import {
  initAuth,
  confirmSignUpAndClaimSubdomain,
  checkSubdomainAvailability,
  ConsentsPayload,
} from "../lib/auth";
import {
  normalizeSubdomainInput,
  validateSubdomainFormat,
  getBaseDomainFromHostname,
} from "../lib/subdomain";

interface CognitoError extends Error {
  message: string;
  code?: string;
  name: string;
}

// Prevent static generation - this page uses client hooks
export const dynamic = "force-dynamic";

export default function RegisterSubdomain() {
  const router = useRouter();
  const [code, setCode] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [subdomain, setSubdomain] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [hostname, setHostname] = useState<string>("");
  const [subdomainHint, setSubdomainHint] = useState<string>("");
  const [subdomainCheck, setSubdomainCheck] = useState<
    | {
        state: "idle" | "invalid" | "checking" | "available" | "taken" | "unknown";
        message?: string;
      }
    | undefined
  >({ state: "idle" });
  const subdomainInputRef = React.useRef<HTMLInputElement>(null);
  const [subdomainValidatorPosition, setSubdomainValidatorPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);

  useEffect(() => {
    setHostname(typeof window !== "undefined" ? window.location.hostname : "");

    const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
    const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;

    if (userPoolId && clientId) {
      initAuth(userPoolId, clientId);
    }

    // Get email and code from query params
    const emailParam = router.query.email;
    const codeParam = router.query.code;

    if (emailParam) {
      setEmail(decodeURIComponent(typeof emailParam === "string" ? emailParam : emailParam[0]));
    } else {
      // No email provided, redirect to sign-up
      void router.push("/sign-up");
    }

    if (codeParam) {
      const decodedCode = decodeURIComponent(
        typeof codeParam === "string" ? codeParam : codeParam[0]
      );
      setCode(decodedCode.replace(/\D/g, "").slice(0, 6));
    } else {
      // No code provided, redirect to verify-email
      void router.push(`/verify-email?email=${encodeURIComponent(email || "")}`);
    }

    const subdomainParam = router.query.subdomain;
    if (subdomainParam) {
      setSubdomain(
        normalizeSubdomainInput(
          decodeURIComponent(
            typeof subdomainParam === "string" ? subdomainParam : subdomainParam[0]
          )
        )
      );
    }
  }, [router, email]);

  // Subdomain availability check (best-effort)
  useEffect(() => {
    const normalized = normalizeSubdomainInput(subdomain);
    if (!normalized) {
      setSubdomainCheck({ state: "idle" });
      return;
    }

    const validation = validateSubdomainFormat(normalized);
    if (!validation.ok) {
      setSubdomainCheck({ state: "invalid", message: validation.message });
      return;
    }

    setSubdomainCheck({ state: "checking" });
    const t = setTimeout(() => {
      void (async () => {
        try {
          const result = await checkSubdomainAvailability(normalized);
          if (result.available) {
            setSubdomainCheck({ state: "available" });
            return;
          }
          if (result.reason === "TAKEN") {
            setSubdomainCheck({ state: "taken" });
            return;
          }
          setSubdomainCheck({
            state: "unknown",
            message:
              result.message ??
              (result.reason ? `Nie można sprawdzić (${result.reason})` : undefined),
          });
        } catch (_e) {
          setSubdomainCheck({ state: "unknown", message: "Nie można sprawdzić dostępności teraz" });
        }
      })();
    }, 400);

    return () => clearTimeout(t);
  }, [subdomain]);

  // Calculate subdomain validator position when subdomain changes or on scroll/resize
  useEffect(() => {
    const updatePosition = () => {
      if (subdomain && subdomainInputRef.current) {
        const inputRect = subdomainInputRef.current.getBoundingClientRect();
        setSubdomainValidatorPosition({
          top: inputRect.top + window.scrollY - 20, // Align with top of input field
          left: inputRect.right + 55, // Position to the right of input field
        });
      } else {
        setSubdomainValidatorPosition(null);
      }
    };

    updatePosition();

    if (subdomain) {
      window.addEventListener("scroll", updatePosition, true);
      window.addEventListener("resize", updatePosition);

      return () => {
        window.removeEventListener("scroll", updatePosition, true);
        window.removeEventListener("resize", updatePosition);
      };
    }

    return undefined;
  }, [subdomain]);

  const handleCompleteSubdomain = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError("");
    setSubdomainHint("");

    setLoading(true);
    try {
      let consents: ConsentsPayload | undefined;
      if (typeof window !== "undefined") {
        const raw = localStorage.getItem("pendingConsents");
        if (raw) {
          try {
            consents = JSON.parse(raw) as ConsentsPayload;
          } catch (_e) {
            consents = undefined;
          }
        }
      }

      const normalized = normalizeSubdomainInput(subdomain);
      const validation = normalized ? validateSubdomainFormat(normalized) : { ok: true as const };
      const requestedSubdomain = normalized && validation.ok ? normalized : undefined;

      if (normalized && !validation.ok) {
        setSubdomainHint(
          "Pominięto rezerwację subdomeny (niepoprawny format). Możesz ustawić ją później."
        );
      }

      // Re-verify with subdomain (this will claim the subdomain)
      const result = await confirmSignUpAndClaimSubdomain(
        email,
        code,
        requestedSubdomain,
        consents
      );
      if (typeof window !== "undefined") {
        localStorage.removeItem("pendingConsents");
      }
      setSuccess(true);
      if (result.subdomainClaimed && result.subdomain) {
        setSubdomainHint(`Zarezerwowano subdomenę: ${result.subdomain}`);
      } else if (result.subdomainError?.message) {
        setSubdomainHint(
          `Konto zweryfikowane, ale subdomena nie została zarezerwowana: ${result.subdomainError.message}`
        );
      }
      // Redirect to login after a short delay
      const returnUrl = router.query.returnUrl ?? "/";
      setTimeout(() => {
        void router.push(
          `/login?verified=true${returnUrl ? `&returnUrl=${encodeURIComponent(typeof returnUrl === "string" ? returnUrl : returnUrl[0])}` : ""}`
        );
      }, 2000);
    } catch (err) {
      const error = err as CognitoError;
      setLoading(false);
      if (error.message) {
        // Check if user is already confirmed (409 status)
        const errorMsg = error.message.toLowerCase();
        if (errorMsg.includes("already confirmed") || errorMsg.includes("already verified")) {
          // User is already verified - they can still claim subdomain, but need to sign in first
          setError("Konto jest już zweryfikowane. Zaloguj się, aby zarządzać subdomeną.");
          // Redirect to login after showing error
          setTimeout(() => {
            const returnUrl = router.query.returnUrl ?? "/";
            void router.push(
              `/login?email=${encodeURIComponent(email)}${returnUrl ? `&returnUrl=${encodeURIComponent(typeof returnUrl === "string" ? returnUrl : returnUrl[0])}` : ""}`
            );
          }, 3000);
          return;
        }
        // Translate common English error messages
        if (errorMsg.includes("failed to confirm signup") || errorMsg.includes("code mismatch")) {
          setError("Nieprawidłowy kod weryfikacyjny");
        } else if (errorMsg.includes("expired")) {
          setError("Kod weryfikacyjny wygasł. Wyślij nowy kod.");
        } else {
          setError(error.message);
        }
      } else {
        setError("Nie udało się zarezerwować subdomeny. Spróbuj ponownie.");
      }
    }
  };

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="max-w-sm md:max-w-lg w-full mx-auto px-4 md:px-8">
          <div className="text-center">
            <div className="mb-5 text-green-600 text-5xl">✓</div>
            <h2 className="text-xl md:text-2xl font-semibold mb-3 text-foreground">
              Konto zweryfikowane!
            </h2>
            {subdomainHint && (
              <p className="text-base text-muted-foreground mb-3">{subdomainHint}</p>
            )}
            <p className="text-base text-muted-foreground mb-8">
              Przekierowywanie do strony logowania...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Subdomain registration step - large and centered
  return (
    <div className="flex flex-col items-center justify-start min-h-screen px-4 pt-[25vh] md:pt-[30vh]">
      <div className="w-full max-w-lg text-center space-y-8">
        <div>
          <h1 className="text-3xl md:text-4xl font-semibold mb-3 text-foreground">
            Wybierz swoją subdomenę
          </h1>
          <p className="text-base md:text-lg text-muted-foreground">
            Utwórz unikalną subdomenę dla swojej marki
          </p>
        </div>

        {error && (
          <div className="mx-auto max-w-md p-4 bg-error-500/15 border border-error-700 rounded-lg text-base text-error-400">
            {error}
          </div>
        )}

        <form onSubmit={handleCompleteSubdomain} className="w-full space-y-6">
          <div className="space-y-3 relative">
            <Label htmlFor="subdomain">Subdomena (opcjonalnie)</Label>
            <div className="relative">
              <div className="flex items-center w-full rounded-lg border-2 border-input bg-background px-4 py-3 text-base transition-all duration-200 focus-within:border-border">
                <span className="text-muted-foreground select-none">https://</span>
                <input
                  ref={subdomainInputRef}
                  id="subdomain"
                  type="text"
                  value={subdomain}
                  onChange={(e) => setSubdomain(normalizeSubdomainInput(e.target.value))}
                  placeholder="michalphotography"
                  autoComplete="off"
                  inputMode="text"
                  className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground/50 min-w-0"
                  style={{ minWidth: "120px" }}
                />
                <span className="text-muted-foreground select-none">
                  .{hostname ? getBaseDomainFromHostname(hostname) : "lvh.me"}
                </span>
              </div>
            </div>

            {/* Subdomain Validator - Fixed Positioned Side Card */}
            {subdomain && subdomainValidatorPosition && (
              <div
                className="fixed w-72 z-50 hidden md:block pointer-events-auto"
                style={{
                  top: `${subdomainValidatorPosition.top}px`,
                  left: `${subdomainValidatorPosition.left}px`,
                  maxHeight: "calc(100vh - 2rem)",
                }}
              >
                <div className="rounded-lg border border-border bg-card p-4 shadow-lg max-h-full overflow-y-auto">
                  <div className="space-y-3">
                    {(() => {
                      const normalized = normalizeSubdomainInput(subdomain);
                      const lengthOk = normalized
                        ? normalized.length >= 3 && normalized.length <= 30
                        : false;
                      const charsOk = normalized ? /^[a-z0-9-]+$/.test(normalized) : false;
                      const edgesOk = normalized ? /^[a-z0-9].*[a-z0-9]$/.test(normalized) : false;

                      return (
                        <>
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 text-xs transition-colors">
                              {lengthOk ? (
                                <Check
                                  className="w-3.5 h-3.5 flex-shrink-0 !text-green-500"
                                  stroke="#22c55e"
                                  strokeWidth={2.5}
                                />
                              ) : (
                                <X
                                  className="w-3.5 h-3.5 flex-shrink-0 !text-red-500"
                                  stroke="#ef4444"
                                  strokeWidth={2.5}
                                />
                              )}
                              <span
                                className={lengthOk ? "text-foreground" : "text-muted-foreground"}
                              >
                                3–30 znaków
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs transition-colors">
                              {charsOk ? (
                                <Check
                                  className="w-3.5 h-3.5 flex-shrink-0 !text-green-500"
                                  stroke="#22c55e"
                                  strokeWidth={2.5}
                                />
                              ) : (
                                <X
                                  className="w-3.5 h-3.5 flex-shrink-0 !text-red-500"
                                  stroke="#ef4444"
                                  strokeWidth={2.5}
                                />
                              )}
                              <span
                                className={charsOk ? "text-foreground" : "text-muted-foreground"}
                              >
                                Dozwolone: a–z, 0–9, -
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs transition-colors">
                              {edgesOk ? (
                                <Check
                                  className="w-3.5 h-3.5 flex-shrink-0 !text-green-500"
                                  stroke="#22c55e"
                                  strokeWidth={2.5}
                                />
                              ) : (
                                <X
                                  className="w-3.5 h-3.5 flex-shrink-0 !text-red-500"
                                  stroke="#ef4444"
                                  strokeWidth={2.5}
                                />
                              )}
                              <span
                                className={edgesOk ? "text-foreground" : "text-muted-foreground"}
                              >
                                Zaczyna i kończy się literą/cyfrą
                              </span>
                            </div>
                          </div>
                          {subdomainCheck?.state === "checking" && (
                            <div className="pt-2 border-t border-border">
                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-muted-foreground">
                                  Sprawdzanie dostępności…
                                </span>
                              </div>
                            </div>
                          )}
                          {subdomainCheck?.state === "available" && (
                            <div className="pt-2 border-t border-border">
                              <div className="flex items-center gap-2 text-xs transition-colors">
                                <Check
                                  className="w-3.5 h-3.5 flex-shrink-0 !text-green-500"
                                  stroke="#22c55e"
                                  strokeWidth={2.5}
                                />
                                <span className="text-foreground">Dostępna</span>
                              </div>
                            </div>
                          )}
                          {subdomainCheck?.state === "taken" && (
                            <div className="pt-2 border-t border-border">
                              <div className="flex items-center gap-2 text-xs transition-colors">
                                <X
                                  className="w-3.5 h-3.5 flex-shrink-0 !text-red-500"
                                  stroke="#ef4444"
                                  strokeWidth={2.5}
                                />
                                <span className="text-muted-foreground">Zajęta</span>
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}

            {/* Mobile: Show below input */}
            {subdomain && (
              <div className="mt-4 md:hidden">
                <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                  <div className="space-y-3">
                    {(() => {
                      const normalized = normalizeSubdomainInput(subdomain);
                      const lengthOk = normalized
                        ? normalized.length >= 3 && normalized.length <= 30
                        : false;
                      const charsOk = normalized ? /^[a-z0-9-]+$/.test(normalized) : false;
                      const edgesOk = normalized ? /^[a-z0-9].*[a-z0-9]$/.test(normalized) : false;

                      return (
                        <>
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 text-xs transition-colors">
                              {lengthOk ? (
                                <Check
                                  className="w-3.5 h-3.5 flex-shrink-0 !text-green-500"
                                  stroke="#22c55e"
                                  strokeWidth={2.5}
                                />
                              ) : (
                                <X
                                  className="w-3.5 h-3.5 flex-shrink-0 !text-red-500"
                                  stroke="#ef4444"
                                  strokeWidth={2.5}
                                />
                              )}
                              <span
                                className={lengthOk ? "text-foreground" : "text-muted-foreground"}
                              >
                                3–30 znaków
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs transition-colors">
                              {charsOk ? (
                                <Check
                                  className="w-3.5 h-3.5 flex-shrink-0 !text-green-500"
                                  stroke="#22c55e"
                                  strokeWidth={2.5}
                                />
                              ) : (
                                <X
                                  className="w-3.5 h-3.5 flex-shrink-0 !text-red-500"
                                  stroke="#ef4444"
                                  strokeWidth={2.5}
                                />
                              )}
                              <span
                                className={charsOk ? "text-foreground" : "text-muted-foreground"}
                              >
                                Dozwolone: a–z, 0–9, -
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs transition-colors">
                              {edgesOk ? (
                                <Check
                                  className="w-3.5 h-3.5 flex-shrink-0 !text-green-500"
                                  stroke="#22c55e"
                                  strokeWidth={2.5}
                                />
                              ) : (
                                <X
                                  className="w-3.5 h-3.5 flex-shrink-0 !text-red-500"
                                  stroke="#ef4444"
                                  strokeWidth={2.5}
                                />
                              )}
                              <span
                                className={edgesOk ? "text-foreground" : "text-muted-foreground"}
                              >
                                Zaczyna i kończy się literą/cyfrą
                              </span>
                            </div>
                          </div>
                          {subdomainCheck?.state === "checking" && (
                            <div className="pt-2 border-t border-border">
                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-muted-foreground">
                                  Sprawdzanie dostępności…
                                </span>
                              </div>
                            </div>
                          )}
                          {subdomainCheck?.state === "available" && (
                            <div className="pt-2 border-t border-border">
                              <div className="flex items-center gap-2 text-xs transition-colors">
                                <Check
                                  className="w-3.5 h-3.5 flex-shrink-0 !text-green-500"
                                  stroke="#22c55e"
                                  strokeWidth={2.5}
                                />
                                <span className="text-foreground">Dostępna</span>
                              </div>
                            </div>
                          )}
                          {subdomainCheck?.state === "taken" && (
                            <div className="pt-2 border-t border-border">
                              <div className="flex items-center gap-2 text-xs transition-colors">
                                <X
                                  className="w-3.5 h-3.5 flex-shrink-0 !text-red-500"
                                  stroke="#ef4444"
                                  strokeWidth={2.5}
                                />
                                <span className="text-muted-foreground">Zajęta</span>
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}
          </div>

          <Button type="submit" variant="primary" className="w-full" disabled={loading}>
            {loading ? "Zapisywanie..." : "Zakończ rejestrację"}
          </Button>
        </form>
      </div>
    </div>
  );
}
