export function requirePublicEnv(name: string): string {
  const value = process.env[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        "This must be provided via environment variables (no defaults/fallbacks)."
    );
  }
  return value;
}

export function getPublicLandingUrl(): string {
  return requirePublicEnv("NEXT_PUBLIC_LANDING_URL");
}

export function getPublicDashboardUrl(): string {
  return requirePublicEnv("NEXT_PUBLIC_DASHBOARD_URL");
}

export function getPublicApiUrl(): string {
  return requirePublicEnv("NEXT_PUBLIC_API_URL");
}

