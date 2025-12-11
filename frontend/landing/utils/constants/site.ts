export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "PhotoCloud";

export const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN 
  ? `https://${process.env.NEXT_PUBLIC_APP_DOMAIN}`
  : process.env.NEXT_PUBLIC_LANDING_URL || "http://localhost:3002";

export const APP_HOSTNAMES = new Set([
  process.env.NEXT_PUBLIC_APP_DOMAIN,
  process.env.NEXT_PUBLIC_APP_DOMAIN ? `www.${process.env.NEXT_PUBLIC_APP_DOMAIN}` : "localhost:3000",
].filter(Boolean));

