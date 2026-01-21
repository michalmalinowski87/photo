const RESERVED_SUBDOMAINS = new Set([
  "dashboard",
  "photocloud",
  "api",
  "auth",
  "www",
  "gallery",
  "landing",
  "static",
  "cdn",
]);

export function normalizeSubdomainInput(input: string): string {
  return input.trim().toLowerCase();
}

export function validateSubdomainFormat(
  subdomain: string
): { ok: true } | { ok: false; code: string; message: string } {
  if (!subdomain) {
    return { ok: false, code: "MISSING", message: "Subdomena jest opcjonalna" };
  }
  if (subdomain.length < 3 || subdomain.length > 30) {
    return { ok: false, code: "INVALID_LENGTH", message: "3–30 znaków" };
  }
  if (!/^[a-z0-9-]+$/.test(subdomain)) {
    return { ok: false, code: "INVALID_CHARS", message: "Dozwolone: a–z, 0–9, -" };
  }
  if (!/^[a-z0-9].*[a-z0-9]$/.test(subdomain)) {
    return { ok: false, code: "INVALID_EDGE", message: "Musi zaczynać i kończyć się literą/cyfrą" };
  }
  if (RESERVED_SUBDOMAINS.has(subdomain)) {
    return { ok: false, code: "RESERVED", message: "Ta subdomena jest zarezerwowana" };
  }
  return { ok: true };
}

export function getBaseDomainFromHostname(hostname: string): string {
  // Local dev wildcard
  if (hostname.endsWith(".lvh.me")) {
    return "lvh.me";
  }

  const parts = hostname.split(".").filter(Boolean);
  if (parts.length >= 2) {
    return parts.slice(-2).join(".");
  }
  return hostname;
}

export function buildSubdomainPreviewUrl(subdomain: string, hostname: string): string {
  const baseDomain = getBaseDomainFromHostname(hostname);
  return `https://${subdomain}.${baseDomain}`;
}

