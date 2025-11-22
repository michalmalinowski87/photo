import { Providers } from "@/components";
import { Toaster } from "@/components/ui/sonner";
import { AuthTokenListener } from "@/components/auth-token-listener";
import "@/styles/globals.css";
import { aeonik, cn, generateMetadata, inter } from "@/utils";

export const metadata = generateMetadata({
  title: "PhotoHub - Prosty sposób na udostępnianie zdjęć klientom",
  description: "PhotoHub to prosty i opłacalny sposób na udostępnianie zdjęć klientom. Łączymy fotografów z ich klientami w bezpieczny i wygodny sposób.",
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pl" className="scrollbar">
      <body
        className={cn(
          "min-h-screen bg-background text-foreground antialiased !font-default overflow-x-hidden",
          aeonik.variable,
          inter.variable,
        )}
      >
        <Providers>
          <AuthTokenListener />
          <Toaster richColors theme="dark" position="top-right" />
          {children}
        </Providers>
      </body>
    </html>
  );
}

