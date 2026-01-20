import { getPublicLandingUrl } from "../../lib/public-env";

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "PhotoCloud";

export const APP_DOMAIN = getPublicLandingUrl();
// NOTE: We intentionally do not maintain a www/non-www allowlist here.
// If you need host validation later, derive it from APP_DOMAIN where it’s actually used.

