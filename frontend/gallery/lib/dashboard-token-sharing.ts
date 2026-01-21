import { getPublicDashboardUrl } from "./public-env";
import { isValidOrigin } from "../../shared-auth/origin-validation";

const TOKEN_REQUEST_MESSAGE_TYPE = "PHOTOCLOUD_TOKEN_REQUEST";
const TOKEN_RESPONSE_MESSAGE_TYPE = "PHOTOCLOUD_TOKEN_RESPONSE";
const TOKEN_REQUEST_NONCE = "PHOTOCLOUD_TOKEN_REQUEST_NONCE";
const TOKEN_RESPONSE_NONCE = "PHOTOCLOUD_TOKEN_RESPONSE_NONCE";

interface TokenRequestMessage {
  type: typeof TOKEN_REQUEST_MESSAGE_TYPE;
  source: string;
  nonce?: string;
}

interface TokenResponseMessage {
  type: typeof TOKEN_RESPONSE_MESSAGE_TYPE;
  idToken: string;
  accessToken?: string;
  refreshToken?: string;
  source: string;
  nonce?: string;
}

// Store pending nonces for handshake (prevents token exfiltration)
const pendingNonces = new Map<string, { timeout: number; resolve: (token: string) => void; reject: (err: Error) => void }>();

function generateNonce(): string {
	return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

export async function requestDashboardIdToken(options: {
  timeoutMs?: number;
}): Promise<string> {
  if (typeof window === "undefined") {
    throw new Error("requestDashboardIdToken must run in the browser");
  }

  const timeoutMs = options.timeoutMs ?? 4000;

  const dashboardUrl = getPublicDashboardUrl();
  // Validate that dashboardUrl is a valid URL format
  try {
    new URL(dashboardUrl);
  } catch {
    throw new Error("Invalid NEXT_PUBLIC_DASHBOARD_URL (must be a valid URL)");
  }

  if (!window.opener) {
    throw new Error("Missing window.opener (preview must be opened from dashboard)");
  }

  // Generate nonce for secure handshake
  const nonce = generateNonce();

  return await new Promise<string>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      pendingNonces.delete(nonce);
      window.removeEventListener("message", onMessage);
      reject(new Error("Timed out waiting for dashboard token"));
    }, timeoutMs);

    const onMessage = (event: MessageEvent<TokenResponseMessage>) => {
      if (!isValidOrigin(event.origin, dashboardUrl)) {
        return;
      }

      const data = event.data;
      if (!data || data.type !== TOKEN_RESPONSE_MESSAGE_TYPE || !data.idToken) {
        return;
      }

      // Verify nonce matches
      if (data.nonce !== nonce) {
        return; // Ignore response with wrong nonce
      }

      window.clearTimeout(timeoutId);
      pendingNonces.delete(nonce);
      window.removeEventListener("message", onMessage);
      resolve(data.idToken);
    };

    window.addEventListener("message", onMessage);

    const message: TokenRequestMessage = {
      type: TOKEN_REQUEST_MESSAGE_TYPE,
      source: window.location.origin,
      nonce,
    };

    try {
      window.opener.postMessage(message, dashboardUrl);
    } catch (e) {
      pendingNonces.delete(nonce);
      window.clearTimeout(timeoutId);
      window.removeEventListener("message", onMessage);
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

