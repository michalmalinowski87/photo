function requirePublicEnvValue(name: string, value: string | undefined): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        "This must be provided via environment variables (no defaults/fallbacks)."
    );
  }
  return value;
}

export function getPublicLandingUrl(): string {
  // IMPORTANT: must be a static env reference for Next.js client bundles
  return requirePublicEnvValue("NEXT_PUBLIC_LANDING_URL", process.env.NEXT_PUBLIC_LANDING_URL);
}

export function getPublicDashboardUrl(): string {
  // IMPORTANT: must be a static env reference for Next.js client bundles
  return requirePublicEnvValue("NEXT_PUBLIC_DASHBOARD_URL", process.env.NEXT_PUBLIC_DASHBOARD_URL);
}

export function getPublicGalleryUrl(): string {
  // IMPORTANT: must be a static env reference for Next.js client bundles
  return requirePublicEnvValue("NEXT_PUBLIC_GALLERY_URL", process.env.NEXT_PUBLIC_GALLERY_URL);
}

export function getPublicApiUrl(): string {
  // IMPORTANT: must be a static env reference for Next.js client bundles
  return requirePublicEnvValue("NEXT_PUBLIC_API_URL", process.env.NEXT_PUBLIC_API_URL);
}
