function requirePublicEnvValue(name: string, value: string | undefined): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        "This must be provided via environment variables (no defaults/fallbacks)."
    );
  }
  return value;
}

export function getPublicDashboardUrl(): string {
  // IMPORTANT: must be a static env reference for Next.js client bundles
  return requirePublicEnvValue(
    "NEXT_PUBLIC_DASHBOARD_URL",
    process.env.NEXT_PUBLIC_DASHBOARD_URL
  );
}

/**
 * Landing/website base URL.
 */
export function getPublicLandingUrl(): string {
  // IMPORTANT: must be a static env reference for Next.js client bundles
  return requirePublicEnvValue(
    "NEXT_PUBLIC_LANDING_URL",
    process.env.NEXT_PUBLIC_LANDING_URL
  );
}

