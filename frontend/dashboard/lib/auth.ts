import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserAttribute,
  CognitoRefreshToken,
  ISignUpResult,
  CognitoUserSession,
} from "amazon-cognito-identity-js";

let userPool: CognitoUserPool | null = null;

interface TokenPayload {
  "cognito:username"?: string;
  email?: string;
  sub?: string;
  exp?: number;
  [key: string]: unknown;
}

interface TokenResponse {
  id_token: string;
  access_token: string;
  refresh_token?: string;
}

interface CognitoError extends Error {
  code?: string;
  name?: string;
}

export function initAuth(userPoolId: string, clientId: string): CognitoUserPool | null {
  if (!userPoolId || !clientId) {
    return null;
  }
  userPool ??= new CognitoUserPool({
    UserPoolId: userPoolId,
    ClientId: clientId,
  });
  return userPool;
}

export function getCurrentUser(): CognitoUser | null {
  if (!userPool) {
    return null;
  }
  return userPool.getCurrentUser();
}

/**
 * Reconstruct Cognito SDK session from localStorage tokens
 * This is needed when sessionStorage is cleared but tokens still exist
 */
function reconstructCognitoSession(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
  const idToken = localStorage.getItem("idToken");
  const accessToken = localStorage.getItem("accessToken");
  const refreshToken = localStorage.getItem("refreshToken");

  if (!clientId || !idToken) {
    return false;
  }

  try {
    const payload = JSON.parse(atob(idToken.split(".")[1])) as TokenPayload;
    const username = payload["cognito:username"] ?? payload.email ?? payload.sub;

    if (!username) {
      return false;
    }

    // Reconstruct sessionStorage entries
    sessionStorage.setItem(`CognitoIdentityServiceProvider.${clientId}.LastAuthUser`, username);
    if (idToken) {
      sessionStorage.setItem(
        `CognitoIdentityServiceProvider.${clientId}.${username}.idToken`,
        idToken
      );
    }
    if (accessToken) {
      sessionStorage.setItem(
        `CognitoIdentityServiceProvider.${clientId}.${username}.accessToken`,
        accessToken
      );
    }
    if (refreshToken) {
      sessionStorage.setItem(
        `CognitoIdentityServiceProvider.${clientId}.${username}.refreshToken`,
        refreshToken
      );
    }

    return true;
  } catch (_e) {
    return false;
  }
}

export function getIdToken(allowRefresh: boolean = true): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Cannot get token on server side"));
      return;
    }

    // First, try to get token from localStorage (fastest path)
    const storedToken = localStorage.getItem("idToken");
    if (storedToken) {
      try {
        // Check if token is expired
        const payload = JSON.parse(atob(storedToken.split(".")[1])) as TokenPayload;
        const now = Math.floor(Date.now() / 1000);

        // If token is still valid (not expired), return it
        if (payload.exp && payload.exp > now) {
          // Try to reconstruct Cognito session if missing (for future refresh capability)
          const user = getCurrentUser();
          if (!user) {
            reconstructCognitoSession();
          }
          resolve(storedToken);
          return;
        }

        // Token is expired, try to refresh if allowed
        if (allowRefresh) {
          const refreshToken = localStorage.getItem("refreshToken");
          if (refreshToken) {
            // Reconstruct session if needed before refresh
            if (!getCurrentUser()) {
              reconstructCognitoSession();
            }
            refreshIdToken()
              .then(resolve)
              .catch((refreshErr) => {
                // Refresh failed, reject with original error
                reject(
                  refreshErr instanceof Error
                    ? refreshErr
                    : new Error("Token expired and refresh failed")
                );
              });
            return;
          }
        }

        // Token expired and can't refresh
        reject(new Error("Token expired"));
        return;
      } catch (_e) {
        // Token is invalid format, continue to try Cognito SDK
      }
    }

    // Try Cognito SDK session
    let user = getCurrentUser();

    // If no user but we have tokens, try to reconstruct session
    if (!user && storedToken) {
      if (reconstructCognitoSession()) {
        user = getCurrentUser();
      }
    }

    if (!user) {
      // No user from SDK, but might have refresh token
      if (allowRefresh && typeof window !== "undefined") {
        const refreshToken = localStorage.getItem("refreshToken");
        if (refreshToken) {
          // Try to refresh using refresh token
          refreshIdToken()
            .then(resolve)
            .catch((refreshErr) => {
              reject(
                refreshErr instanceof Error
                  ? refreshErr
                  : new Error("No user logged in and refresh failed")
              );
            });
          return;
        }
      }
      reject(new Error("No user logged in"));
      return;
    }

    user.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session?.isValid()) {
        // If session is invalid and refresh is allowed, try to refresh
        if (allowRefresh && typeof window !== "undefined") {
          const refreshToken = localStorage.getItem("refreshToken");
          if (refreshToken) {
            // Try to refresh the token
            refreshIdToken()
              .then(resolve)
              .catch((refreshErr) => {
                reject(
                  refreshErr instanceof Error
                    ? refreshErr
                    : err instanceof Error
                      ? err
                      : new Error("Invalid session")
                );
              });
            return;
          }
        }
        reject(err ?? new Error("Invalid session"));
        return;
      }

      const token = session.getIdToken().getJwtToken();
      // Update localStorage to keep it in sync
      localStorage.setItem("idToken", token);
      resolve(token);
    });
  });
}

/**
 * Get username from stored token or sessionStorage
 */
function getUsernameFromStoredData(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  // Try to get username from old ID token (even if expired)
  const oldIdToken = localStorage.getItem("idToken");
  if (oldIdToken) {
    try {
      const parts = oldIdToken.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1])) as TokenPayload;
        const username = payload["cognito:username"] ?? payload.email ?? payload.sub ?? null;
        if (username) {
          return username;
        }
      }
    } catch (_e) {
      // Token invalid format, continue
    }
  }

  // Try to get username from sessionStorage
  const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
  if (clientId) {
    const lastAuthUser = sessionStorage.getItem(
      `CognitoIdentityServiceProvider.${clientId}.LastAuthUser`
    );
    if (lastAuthUser) {
      return lastAuthUser;
    }
  }

  return null;
}

/**
 * Refresh the ID token using the refresh token
 * @returns {Promise<string>} The new ID token
 */
export function refreshIdToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Cannot refresh token on server side"));
      return;
    }

    // Get refresh token from localStorage
    const refreshToken = localStorage.getItem("refreshToken");
    if (!refreshToken) {
      reject(new Error("No refresh token available"));
      return;
    }

    // Ensure userPool is initialized
    const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
    const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
    if (!userPoolId || !clientId) {
      reject(new Error("Auth not initialized"));
      return;
    }

    if (!userPool) {
      initAuth(userPoolId, clientId);
      if (!userPool) {
        reject(new Error("Failed to initialize user pool"));
        return;
      }
    }

    // Try to reconstruct session from localStorage if sessionStorage is empty
    let user = getCurrentUser();
    if (!user) {
      // Try to reconstruct Cognito session from localStorage
      if (reconstructCognitoSession()) {
        user = getCurrentUser();
      }
    }

    // If still no user, try to create one from stored data
    if (!user) {
      const username = getUsernameFromStoredData();
      if (!username) {
        reject(new Error("Cannot determine username for token refresh"));
        return;
      }

      // Create a new CognitoUser instance
      if (!userPool) {
        reject(new Error("User pool not initialized"));
        return;
      }
      user = new CognitoUser({
        Username: username,
        Pool: userPool,
      });
    }

    // Use Cognito SDK to refresh the session
    user.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session?.isValid()) {
        // Session is invalid, try to refresh using refresh token
        const cognitoRefreshToken = new CognitoRefreshToken({ RefreshToken: refreshToken });

        user.refreshSession(
          cognitoRefreshToken,
          (refreshErr: Error | null, newSession: CognitoUserSession | null) => {
            if (refreshErr || !newSession) {
              reject(refreshErr ?? new Error("Failed to refresh session"));
              return;
            }

            // Update tokens in localStorage
            const newIdToken = newSession.getIdToken().getJwtToken();
            const newAccessToken = newSession.getAccessToken().getJwtToken();
            const newRefreshToken = newSession.getRefreshToken()?.getToken();

            // Store tokens in localStorage with correct keys
            localStorage.setItem("idToken", newIdToken);
            localStorage.setItem("accessToken", newAccessToken);
            if (newRefreshToken) {
              localStorage.setItem("refreshToken", newRefreshToken);
            }

            // Also update sessionStorage for Cognito SDK compatibility
            if (clientId) {
              try {
                const idTokenPayload = JSON.parse(atob(newIdToken.split(".")[1])) as TokenPayload;
                const extractedUsername =
                  idTokenPayload["cognito:username"] ?? idTokenPayload.email ?? idTokenPayload.sub;

                if (extractedUsername) {
                  sessionStorage.setItem(
                    `CognitoIdentityServiceProvider.${clientId}.LastAuthUser`,
                    extractedUsername
                  );
                  sessionStorage.setItem(
                    `CognitoIdentityServiceProvider.${clientId}.${extractedUsername}.idToken`,
                    newIdToken
                  );
                  sessionStorage.setItem(
                    `CognitoIdentityServiceProvider.${clientId}.${extractedUsername}.accessToken`,
                    newAccessToken
                  );
                  if (newRefreshToken) {
                    sessionStorage.setItem(
                      `CognitoIdentityServiceProvider.${clientId}.${extractedUsername}.refreshToken`,
                      newRefreshToken
                    );
                  }
                }
              } catch (_e) {
                // Failed to update sessionStorage, but tokens are in localStorage
              }
            }

            resolve(newIdToken);
          }
        );
      } else {
        // Session is still valid, return current token
        const currentToken = session.getIdToken().getJwtToken();
        // Update localStorage to ensure it's in sync
        localStorage.setItem("idToken", currentToken);
        resolve(currentToken);
      }
    });
  });
}

export function signIn(email: string, password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!userPool) {
      reject(new Error("Auth not initialized"));
      return;
    }
    const authenticationDetails = new AuthenticationDetails({
      Username: email,
      Password: password,
    });
    const cognitoUser = new CognitoUser({
      Username: email,
      Pool: userPool,
    });
    cognitoUser.authenticateUser(authenticationDetails, {
      onSuccess: (result) => {
        const idToken = result.getIdToken().getJwtToken();
        const accessToken = result.getAccessToken().getJwtToken();
        const refreshToken = result.getRefreshToken().getToken();

        // Store tokens in localStorage
        localStorage.setItem("idToken", idToken);
        localStorage.setItem("accessToken", accessToken);
        if (refreshToken) {
          localStorage.setItem("refreshToken", refreshToken);
        }

        // Set up Cognito SDK session in sessionStorage for SDK compatibility
        try {
          const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
          if (clientId && typeof window !== "undefined") {
            const idTokenPayload = JSON.parse(atob(idToken.split(".")[1])) as TokenPayload;
            const username =
              idTokenPayload["cognito:username"] ?? idTokenPayload.email ?? idTokenPayload.sub;

            if (username) {
              sessionStorage.setItem(
                `CognitoIdentityServiceProvider.${clientId}.LastAuthUser`,
                username
              );
              sessionStorage.setItem(
                `CognitoIdentityServiceProvider.${clientId}.${username}.idToken`,
                idToken
              );
              sessionStorage.setItem(
                `CognitoIdentityServiceProvider.${clientId}.${username}.accessToken`,
                accessToken
              );
              if (refreshToken) {
                sessionStorage.setItem(
                  `CognitoIdentityServiceProvider.${clientId}.${username}.refreshToken`,
                  refreshToken
                );
              }
            }
          }
        } catch (_e) {
          // Session setup failed, but tokens are still stored
        }

        resolve(idToken);
      },
      onFailure: (err: Error) => {
        reject(err);
      },
    });
  });
}

export function signUp(email: string, password: string): Promise<ISignUpResult["user"]> {
  return new Promise(async (resolve, reject) => {
    // Use backend API for signup with rate limiting
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) {
      reject(new Error("API URL not configured"));
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/auth/public/signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Sign up failed" }));
        
        // Handle rate limit error
        if (response.status === 429) {
          const rateLimitError = new Error(errorData.error || "Rate limit exceeded") as CognitoError;
          rateLimitError.code = errorData.code || "RateLimitExceeded";
          rateLimitError.name = "RateLimitExceeded";
          (rateLimitError as any).resetAt = errorData.resetAt;
          (rateLimitError as any).minutesUntilReset = errorData.minutesUntilReset;
          reject(rateLimitError);
          return;
        }

        // Handle other errors
        if (response.status === 409) {
          const error = new Error(errorData.error || "User already exists") as CognitoError;
          error.code = "UsernameExistsException";
          reject(error);
          return;
        }

        if (response.status === 400) {
          const error = new Error(errorData.error || "Invalid parameters") as CognitoError;
          error.code = "InvalidPasswordException";
          reject(error);
          return;
        }

        const error = new Error(errorData.error || "Sign up failed") as CognitoError;
        reject(error);
        return;
      }

      // Signup successful - create a mock user object for compatibility
      // The actual user is created in Cognito, but we need to return a user-like object
      const mockUser = {
        getUsername: () => email,
      } as ISignUpResult["user"];

      resolve(mockUser);
    } catch (err) {
      reject(err instanceof Error ? err : new Error("Sign up failed"));
    }
  });
}

export function confirmSignUp(email: string, code: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!userPool) {
      reject(new Error("Auth not initialized"));
      return;
    }

    const cognitoUser = new CognitoUser({
      Username: email,
      Pool: userPool,
    });

    cognitoUser.confirmRegistration(code, true, (err: Error | null) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

export function resendConfirmationCode(email: string): Promise<void> {
  return new Promise(async (resolve, reject) => {
    // Use backend API for resending code with rate limiting
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) {
      reject(new Error("API URL not configured"));
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/auth/public/resend-verification-code`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to resend code" }));
        
        // Handle rate limit error
        if (response.status === 429) {
          const rateLimitError = new Error(errorData.error || "Rate limit exceeded") as CognitoError;
          rateLimitError.code = errorData.code || "RateLimitExceeded";
          rateLimitError.name = "RateLimitExceeded";
          (rateLimitError as any).resetAt = errorData.resetAt;
          (rateLimitError as any).minutesUntilReset = errorData.minutesUntilReset;
          reject(rateLimitError);
          return;
        }

        // Handle other errors
        if (response.status === 404) {
          const error = new Error(errorData.error || "User not found") as CognitoError;
          error.code = "UserNotFoundException";
          reject(error);
          return;
        }

        const error = new Error(errorData.error || "Failed to resend code") as CognitoError;
        reject(error);
        return;
      }

      resolve();
    } catch (err) {
      reject(err instanceof Error ? err : new Error("Failed to resend code"));
    }
  });
}

/**
 * Check if a user exists and if their email is verified
 * @param email The email to check
 * @returns Promise resolving to 'verified' if user exists and is verified, 'unverified' if user exists but is not verified, or 'not_found' if user doesn't exist
 */
export function checkUserVerificationStatus(email: string): Promise<"verified" | "unverified" | "not_found"> {
  return new Promise((resolve) => {
    if (!userPool) {
      resolve("not_found");
      return;
    }

    // Try to sign in with a dummy password to check user status
    // This is the most reliable way to check verification status
    const authenticationDetails = new AuthenticationDetails({
      Username: email,
      Password: "dummy-password-to-check-status",
    });
    const cognitoUser = new CognitoUser({
      Username: email,
      Pool: userPool,
    });

    cognitoUser.authenticateUser(authenticationDetails, {
      onSuccess: () => {
        // This shouldn't happen with a dummy password, but if it does, user is verified
        resolve("verified");
      },
      onFailure: (err: Error) => {
        const cognitoError = err as CognitoError;
        if (cognitoError.code === "UserNotConfirmedException") {
          // User exists but email is not verified
          resolve("unverified");
        } else if (cognitoError.code === "NotAuthorizedException" || cognitoError.code === "UserNotFoundException") {
          // User doesn't exist or wrong password - but since we're checking with dummy password,
          // NotAuthorizedException means user exists and is verified (wrong password)
          // UserNotFoundException means user doesn't exist
          if (cognitoError.code === "UserNotFoundException") {
            resolve("not_found");
          } else {
            resolve("verified");
          }
        } else {
          // Unknown error, assume user doesn't exist
          resolve("not_found");
        }
      },
    });
  });
}

export function forgotPassword(email: string): Promise<void> {
  return new Promise(async (resolve, reject) => {
    // Use backend API for password reset with rate limiting
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) {
      reject(new Error("API URL not configured"));
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/auth/public/forgot-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Password reset failed" }));
        
        // Handle rate limit error
        if (response.status === 429) {
          const rateLimitError = new Error(errorData.error || "Rate limit exceeded") as CognitoError;
          rateLimitError.code = errorData.code || "RateLimitExceeded";
          rateLimitError.name = "RateLimitExceeded";
          (rateLimitError as any).resetAt = errorData.resetAt;
          (rateLimitError as any).minutesUntilReset = errorData.minutesUntilReset;
          reject(rateLimitError);
          return;
        }

        // Handle other errors
        const error = new Error(errorData.error || "Password reset failed") as CognitoError;
        reject(error);
        return;
      }

      resolve();
    } catch (err) {
      reject(err instanceof Error ? err : new Error("Password reset failed"));
    }
  });
}

export function resendResetCode(email: string): Promise<void> {
  return new Promise(async (resolve, reject) => {
    // Use backend API for resending reset code with rate limiting
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) {
      reject(new Error("API URL not configured"));
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/auth/public/resend-reset-code`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to resend code" }));
        
        // Handle rate limit error
        if (response.status === 429) {
          const rateLimitError = new Error(errorData.error || "Rate limit exceeded") as CognitoError;
          rateLimitError.code = errorData.code || "RateLimitExceeded";
          rateLimitError.name = "RateLimitExceeded";
          (rateLimitError as any).resetAt = errorData.resetAt;
          (rateLimitError as any).minutesUntilReset = errorData.minutesUntilReset;
          reject(rateLimitError);
          return;
        }

        // Handle other errors
        if (response.status === 404) {
          const error = new Error(errorData.error || "User not found") as CognitoError;
          error.code = "UserNotFoundException";
          reject(error);
          return;
        }

        const error = new Error(errorData.error || "Failed to resend code") as CognitoError;
        reject(error);
        return;
      }

      resolve();
    } catch (err) {
      reject(err instanceof Error ? err : new Error("Failed to resend code"));
    }
  });
}

export function confirmForgotPassword(email: string, code: string, password: string): Promise<void> {
  return new Promise(async (resolve, reject) => {
    // Use backend API for confirming password reset
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) {
      reject(new Error("API URL not configured"));
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/auth/public/confirm-forgot-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, code, password }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to reset password" }));
        
        // Handle Cognito errors
        if (response.status === 400) {
          const error = new Error(errorData.error || "Invalid code or password") as CognitoError;
          if (errorData.error?.includes("Nieprawidłowy kod")) {
            error.code = "CodeMismatchException";
          } else if (errorData.error?.includes("wygasł")) {
            error.code = "ExpiredCodeException";
          } else if (errorData.error?.includes("Hasło nie spełnia")) {
            error.code = "InvalidPasswordException";
          }
          reject(error);
          return;
        }

        if (response.status === 404) {
          const error = new Error(errorData.error || "User not found") as CognitoError;
          error.code = "UserNotFoundException";
          reject(error);
          return;
        }

        const error = new Error(errorData.error || "Failed to reset password") as CognitoError;
        reject(error);
        return;
      }

      resolve();
    } catch (err) {
      reject(err instanceof Error ? err : new Error("Failed to reset password"));
    }
  });
}

export function signOut(): void {
  // Clear Cognito SDK session
  const user = getCurrentUser();
  if (user) {
    user.signOut();
  }

  // Clear all tokens from localStorage
  if (typeof window !== "undefined") {
    localStorage.removeItem("idToken");
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");

    // Clear Cognito sessionStorage items
    const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
    if (clientId) {
      // Clear all CognitoIdentityServiceProvider keys
      const keysToRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key?.startsWith(`CognitoIdentityServiceProvider.${clientId}`)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => sessionStorage.removeItem(key));
    }

    // Clear PKCE verifier if present
    sessionStorage.removeItem("pkce_code_verifier");
  }
}

/**
 * Invalidate the current session by corrupting the token and clearing Cognito session
 * Useful for testing session expiration flow
 */
export function invalidateSession(keepRefreshToken: boolean = false): void {
  if (typeof window === "undefined") {
    return;
  }

  // Clear Cognito SDK session first
  const user = getCurrentUser();
  if (user) {
    user.signOut();
  }

  // Clear Cognito sessionStorage items
  const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
  if (clientId) {
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(`CognitoIdentityServiceProvider.${clientId}`)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => sessionStorage.removeItem(key));
  }

  // Corrupt the ID token to simulate expiration
  const idToken = localStorage.getItem("idToken");
  if (idToken) {
    // Replace with an invalid/expired token
    localStorage.setItem("idToken", "invalid.token.here");
  }

  // Remove access token
  localStorage.removeItem("accessToken");

  // Clear refresh token unless testing refresh flow
  if (!keepRefreshToken) {
    localStorage.removeItem("refreshToken");
  }
}

/**
 * Test helper: Directly trigger session expired event
 * This can be called from the browser console for testing
 */
export function triggerSessionExpired(): void {
  if (typeof window === "undefined") {
    console.error("This function can only be called in the browser");
    return;
  }

  // Directly dispatch the session-expired event that the modal listens for
  window.dispatchEvent(
    new CustomEvent("session-expired", {
      detail: { returnUrl: window.location.pathname + window.location.search },
    })
  );
}

export function getHostedUILoginUrl(
  userPoolDomain: string,
  clientId: string,
  redirectUri: string,
  returnUrl: string | null = null,
  codeChallenge: string | null = null
): string {
  if (!redirectUri || redirectUri.trim() === "") {
    throw new Error("redirectUri is required");
  }

  if (!clientId || clientId.trim() === "") {
    throw new Error("clientId is required");
  }

  if (!userPoolDomain || userPoolDomain.trim() === "") {
    throw new Error("userPoolDomain is required");
  }

  // userPoolDomain might be:
  // - Full domain: "photocloud-dev.auth.eu-west-1.amazonaws.com" or "photocloud-dev.auth.eu-west-1.amazoncognito.com"
  // - With https://: "https://photocloud-dev.auth.eu-west-1.amazonaws.com"
  // - Just prefix: "photocloud-dev"

  // Remove https:// if present
  let domain = userPoolDomain.replace(/^https?:\/\//, "");

  // Convert amazonaws.com to amazoncognito.com for OAuth endpoints
  if (domain.includes(".amazonaws.com")) {
    domain = domain.replace(".amazonaws.com", ".amazoncognito.com");
  }

  // If domain doesn't include .amazoncognito.com, construct it
  if (!domain.includes(".amazoncognito.com") && !domain.includes(".amazonaws.com")) {
    // Extract region if possible, otherwise default to eu-west-1
    const parts = domain.split(".");
    const region = parts.length > 2 ? parts[parts.length - 2] : "eu-west-1";
    domain = `${domain}.auth.${region}.amazoncognito.com`;
  }

  const baseUrl = `https://${domain}`;
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    scope: "openid email profile",
    redirect_uri: redirectUri,
  });

  // Add PKCE challenge if provided
  if (codeChallenge) {
    params.append("code_challenge", codeChallenge);
    params.append("code_challenge_method", "S256");
  }

  // Add state parameter with returnUrl if provided
  if (returnUrl) {
    params.append("state", encodeURIComponent(returnUrl));
  }

  return `${baseUrl}/oauth2/authorize?${params.toString()}`;
}

// Track if we're already redirecting to prevent multiple calls (React Strict Mode)
let isRedirectingToCognito = false;

export async function redirectToCognito(returnUrl: string | null = null): Promise<void> {
  // Prevent multiple redirects (React Strict Mode calls effects twice)
  if (isRedirectingToCognito) {
    return;
  }

  const userPoolDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
  const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;

  if (!userPoolDomain || !clientId) {
    return;
  }

  // Mark as redirecting
  isRedirectingToCognito = true;

  // Ensure we're in browser environment
  if (typeof window === "undefined") {
    console.error("redirectToCognito can only be called in browser environment");
    return;
  }

  // Use /auth/auth-callback as the redirect URI
  const redirectUri = `${window.location.origin}/auth/auth-callback`;

  if (!redirectUri || redirectUri.trim() === "") {
    console.error("Cannot redirect to Cognito: redirectUri is empty");
    return;
  }

  // If no returnUrl provided, use current path
  returnUrl ??= window.location.pathname + window.location.search;

  // Generate PKCE challenge
  const codeVerifier = generateRandomString(128);
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // Store verifier in sessionStorage (domain-specific, cleared on close)
  sessionStorage.setItem("pkce_code_verifier", codeVerifier);

  const loginUrl = getHostedUILoginUrl(
    userPoolDomain,
    clientId,
    redirectUri,
    returnUrl,
    codeChallenge
  );
  window.location.href = loginUrl;
}

// Generate random string for PKCE
function generateRandomString(length: number): string {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  let random = "";
  const values = new Uint8Array(length);
  crypto.getRandomValues(values);
  for (let i = 0; i < length; i++) {
    random += charset[values[i] % charset.length];
  }
  return random;
}

// Generate code challenge from verifier
async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...Array.from(new Uint8Array(digest))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export function redirectToCognitoSignUp(returnUrl: string | null = null): Promise<void> {
  // Same as redirectToCognito - Cognito Hosted UI shows sign-up option on the authorize page
  // Users can click "Sign up" on the Cognito page
  return redirectToCognito(returnUrl);
}

export async function redirectToLandingSignIn(returnUrl: string | null = null): Promise<void> {
  // Redirect directly to Cognito Hosted UI (not via landing sign-in page)
  // This ensures users go straight to Cognito login without intermediate pages
  await redirectToCognito(returnUrl);
}

export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<string> {
  // Exchange authorization code for tokens
  const userPoolDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
  const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;

  if (!userPoolDomain || !clientId) {
    throw new Error("Cognito configuration missing");
  }

  if (!redirectUri || redirectUri.trim() === "") {
    throw new Error("redirect_uri parameter is required");
  }

  if (!code || code.trim() === "") {
    throw new Error("Authorization code is required");
  }

  // Get PKCE verifier from sessionStorage (don't remove it yet - only remove after successful exchange)
  let codeVerifier: string | null = null;
  if (typeof window !== "undefined") {
    codeVerifier = sessionStorage.getItem("pkce_code_verifier");
    // Don't remove here - remove only after successful token exchange
  }

  if (!codeVerifier) {
    throw new Error("PKCE verifier not found. Please restart the authentication flow.");
  }

  // Remove https:// if present and convert to amazoncognito.com
  let domain = userPoolDomain.replace(/^https?:\/\//, "");
  if (domain.includes(".amazonaws.com")) {
    domain = domain.replace(".amazonaws.com", ".amazoncognito.com");
  }
  if (!domain.includes(".amazoncognito.com")) {
    const parts = domain.split(".");
    const region = parts.length > 2 ? parts[parts.length - 2] : "eu-west-1";
    domain = `${domain}.auth.${region}.amazoncognito.com`;
  }

  const tokenUrl = `https://${domain}/oauth2/token`;

  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
  }

  const tokens = (await response.json()) as TokenResponse;

  // Remove PKCE verifier AFTER successful token exchange (use once)
  if (typeof window !== "undefined" && codeVerifier) {
    sessionStorage.removeItem("pkce_code_verifier");
  }

  // Reset redirect flag after successful token exchange
  isRedirectingToCognito = false;

  // Store tokens in localStorage
  if (tokens.id_token) {
    localStorage.setItem("idToken", tokens.id_token);
  }
  if (tokens.access_token) {
    localStorage.setItem("accessToken", tokens.access_token);
  }
  if (tokens.refresh_token) {
    localStorage.setItem("refreshToken", tokens.refresh_token);
  }

  // Also set up CognitoUser session so getIdToken() works
  // Parse the ID token to get username
  try {
    const idTokenPayload = JSON.parse(atob(tokens.id_token.split(".")[1])) as TokenPayload;
    const username =
      idTokenPayload["cognito:username"] ?? idTokenPayload.email ?? idTokenPayload.sub;

    // Initialize user pool if not already done
    const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
    if (userPoolId && clientId && username) {
      initAuth(userPoolId, clientId);

      // Store user in sessionStorage for Cognito SDK
      if (typeof window !== "undefined") {
        sessionStorage.setItem(`CognitoIdentityServiceProvider.${clientId}.LastAuthUser`, username);
        sessionStorage.setItem(
          `CognitoIdentityServiceProvider.${clientId}.${username}.idToken`,
          tokens.id_token
        );
        sessionStorage.setItem(
          `CognitoIdentityServiceProvider.${clientId}.${username}.accessToken`,
          tokens.access_token
        );
        if (tokens.refresh_token) {
          sessionStorage.setItem(
            `CognitoIdentityServiceProvider.${clientId}.${username}.refreshToken`,
            tokens.refresh_token
          );
        }
      }
    }
  } catch (_err) {
    // Tokens are still stored in localStorage, so manual token usage will work
  }

  return tokens.id_token;
}

export function getHostedUILogoutUrl(userPoolDomain: string, redirectUri: string): string {
  // userPoolDomain might be:
  // - Full domain: "photocloud-dev.auth.eu-west-1.amazonaws.com" or "photocloud-dev.auth.eu-west-1.amazoncognito.com"
  // - With https://: "https://photocloud-dev.auth.eu-west-1.amazonaws.com"
  // - Just prefix: "photocloud-dev"

  // Remove https:// if present
  let domain = userPoolDomain.replace(/^https?:\/\//, "");

  // Convert amazonaws.com to amazoncognito.com for OAuth endpoints
  if (domain.includes(".amazonaws.com")) {
    domain = domain.replace(".amazonaws.com", ".amazoncognito.com");
  }

  // If domain doesn't include .amazoncognito.com, construct it
  if (!domain.includes(".amazoncognito.com") && !domain.includes(".amazonaws.com")) {
    // Extract region if possible, otherwise default to eu-west-1
    const parts = domain.split(".");
    const region = parts.length > 2 ? parts[parts.length - 2] : "eu-west-1";
    domain = `${domain}.auth.${region}.amazoncognito.com`;
  }

  // Ensure redirectUri is properly formatted (remove trailing slash if present, as Cognito is strict about URL matching)
  const cleanRedirectUri = redirectUri.replace(/\/$/, "");

  const baseUrl = `https://${domain}`;
  const params = new URLSearchParams({
    client_id: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ?? "",
    logout_uri: cleanRedirectUri,
  });
  return `${baseUrl}/logout?${params.toString()}`;
}
