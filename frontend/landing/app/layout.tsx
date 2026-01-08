import React from "react";
import Script from "next/script";
import { Providers } from "@/components";
import { Toaster } from "@/components/ui/sonner";
// Business-template CSS is loaded in <head> - globals.css only has minimal overrides
import "@/styles/globals.css";
// Critical CSS - loaded immediately by Next.js
import "@/styles/bootstrap.min.css";
import "@/styles/style.css";
// Non-critical CSS - Next.js will optimize loading
import "@/styles/lineicons.css";
import "@/styles/tiny-slider.css";
// glightbox.min.css kept as link tag due to third-party asset dependencies
import { cn, generateMetadata, inter } from "@/utils";
import { WebPCompatibilityCheck } from "@shared-auth/webp-check";

export const metadata = generateMetadata({
  title: "PhotoCloud - Prosty sposób na udostępnianie zdjęć klientom",
  description: "PhotoCloud to prosty i opłacalny sposób na udostępnianie zdjęć klientom. Łączymy fotografów z ich klientami w bezpieczny i wygodny sposób.",
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pl" className="scrollbar" data-scroll-behavior="smooth">
      <head>
        {/* Third-party CSS - loaded as link tag due to asset dependencies */}
        <link rel="stylesheet" href="/assets/css/glightbox.min.css" />
        {/* CSS variables for business-template styles */}
        <style dangerouslySetInnerHTML={{
          __html: `
            /* Ensure business-template styles take precedence */
            :root {
              --primary: #8B6F57 !important;
              --primary-dark: #7A5F4A !important;
              --primary-light: #D2B79A !important;
              --white: #FFFFFF !important;
              --black: #1E1A17 !important;
              --dark-1: #1E1A17 !important;
              --dark-2: #2D241F !important;
              --dark-3: #5A4D42 !important;
              --gray-3: #E3D3C4 !important;
              --gray-4: #F0E4D7 !important;
              --light-1: #FCF8F4 !important;
              --light-3: #FFFAF5 !important;
            }
          `
        }} />
      </head>
      <body
        className={cn(
          "min-h-screen antialiased overflow-x-hidden",
          inter.variable,
        )}
      >
        <WebPCompatibilityCheck>
          <Providers>
            <Toaster richColors theme="dark" position="top-right" />
            {children}
          </Providers>
        </WebPCompatibilityCheck>
        {/* Optimized script loading with Next.js Script component */}
        <Script src="/assets/js/bootstrap.bundle.min.js" strategy="afterInteractive" />
        <Script src="/assets/js/glightbox.min.js" strategy="afterInteractive" />
        <Script src="/assets/js/main.js" strategy="afterInteractive" />
        <Script src="/assets/js/tiny-slider.js" strategy="lazyOnload" />
      </body>
    </html>
  );
}

