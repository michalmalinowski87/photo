import { getPublicDashboardUrl } from "./public-env";

const TOKEN_REQUEST_MESSAGE_TYPE = "PHOTOCLOUD_TOKEN_REQUEST";
const TOKEN_RESPONSE_MESSAGE_TYPE = "PHOTOCLOUD_TOKEN_RESPONSE";

interface TokenRequestMessage {
  type: typeof TOKEN_REQUEST_MESSAGE_TYPE;
  source: string;
}

interface TokenResponseMessage {
  type: typeof TOKEN_RESPONSE_MESSAGE_TYPE;
  idToken: string;
  accessToken?: string;
  refreshToken?: string;
  source: string;
}

function normalizeOrigin(urlOrOrigin: string): string | null {
  try {
    // If it's already an origin (e.g. "https://x.com"), URL() still works.
    return new URL(urlOrOrigin).origin;
  } catch {
    return null;
  }
}

function isTrustedOrigin(eventOrigin: string, trustedOrigin: string): boolean {
  try {
    const trusted = new URL(trustedOrigin);
    const eventUrl = new URL(eventOrigin);
    return (
      trusted.hostname === eventUrl.hostname ||
      eventUrl.hostname.endsWith(trusted.hostname.replace(/^https?:\/\//, ""))
    );
  } catch {
    return eventOrigin === trustedOrigin || eventOrigin.startsWith(trustedOrigin);
  }
}

export async function requestDashboardIdToken(options: {
  timeoutMs?: number;
}): Promise<string> {
  if (typeof window === "undefined") {
    throw new Error("requestDashboardIdToken must run in the browser");
  }

  const timeoutMs = options.timeoutMs ?? 4000;

  const dashboardUrl = getPublicDashboardUrl();
  const dashboardOrigin = normalizeOrigin(dashboardUrl);
  if (!dashboardOrigin) {
    throw new Error("Invalid NEXT_PUBLIC_DASHBOARD_URL (must be a valid URL)");
  }

  if (!window.opener) {
    throw new Error("Missing window.opener (preview must be opened from dashboard)");
  }

  const message: TokenRequestMessage = {
    type: TOKEN_REQUEST_MESSAGE_TYPE,
    source: window.location.origin,
  };

  return await new Promise<string>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("Timed out waiting for dashboard token"));
    }, timeoutMs);

    const onMessage = (event: MessageEvent<TokenResponseMessage>) => {
      if (!isTrustedOrigin(event.origin, dashboardOrigin)) {
        return;
      }

      const data = event.data;
      if (!data || data.type !== TOKEN_RESPONSE_MESSAGE_TYPE || !data.idToken) {
        return;
      }

      window.clearTimeout(timeoutId);
      window.removeEventListener("message", onMessage);
      resolve(data.idToken);
    };

    window.addEventListener("message", onMessage);

    try {
      window.opener.postMessage(message, dashboardOrigin);
    } catch (e) {
      window.clearTimeout(timeoutId);
      window.removeEventListener("message", onMessage);
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

