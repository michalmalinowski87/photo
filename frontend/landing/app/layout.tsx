import React from "react";
import { Providers } from "@/components";
import { Toaster } from "@/components/ui/sonner";
// Business-template CSS is loaded in <head> - globals.css only has minimal overrides
import "@/styles/globals.css";
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
    <html lang="pl" className="scrollbar">
      <head>
        {/* Critical CSS - load immediately */}
        <link rel="stylesheet" href="/assets/css/bootstrap.min.css" />
        <link rel="stylesheet" href="/assets/css/style.css" />
        {/* Non-critical CSS - load asynchronously */}
        <link rel="preload" href="/assets/css/lineicons.css" as="style" />
        <link rel="preload" href="/assets/css/tiny-slider.css" as="style" />
        <link rel="preload" href="/assets/css/glightbox.min.css" as="style" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                function loadCSS(href) {
                  var link = document.createElement('link');
                  link.rel = 'stylesheet';
                  link.href = href;
                  document.head.appendChild(link);
                }
                window.addEventListener('load', function() {
                  loadCSS('/assets/css/lineicons.css');
                  loadCSS('/assets/css/tiny-slider.css');
                  loadCSS('/assets/css/glightbox.min.css');
                });
              })();
            `,
          }}
        />
        <noscript>
          <link rel="stylesheet" href="/assets/css/lineicons.css" />
          <link rel="stylesheet" href="/assets/css/tiny-slider.css" />
          <link rel="stylesheet" href="/assets/css/glightbox.min.css" />
        </noscript>
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
        {/* Defer non-critical scripts to improve initial load */}
        <script src="/assets/js/bootstrap.bundle.min.js" defer></script>
        <script src="/assets/js/glightbox.min.js" defer></script>
        <script src="/assets/js/main.js" defer></script>
        <script src="/assets/js/tiny-slider.js" defer></script>
      </body>
    </html>
  );
}

