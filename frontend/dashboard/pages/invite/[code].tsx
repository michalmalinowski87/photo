import Link from "next/link";
import { useRouter } from "next/router";
import React from "react";

import Button from "../../components/ui/button/Button";
import { getPublicLandingUrl } from "../../lib/public-env";

export const dynamic = "force-dynamic";

export default function InviteByCode() {
  const router = useRouter();
  const code = typeof router.query.code === "string" ? router.query.code.trim().toUpperCase() : "";

  const signUpUrl = code ? `/sign-up?ref=${encodeURIComponent(code)}` : "/sign-up";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-photographer-background dark:bg-gray-900 px-4">
      <div className="max-w-md w-full rounded-2xl border border-photographer-border dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg p-8 text-center">
        <h1 className="text-2xl font-bold text-photographer-heading dark:text-white mb-4">
          Zostałeś zaproszony
        </h1>
        <p className="text-photographer-text dark:text-gray-300 mb-6">
          Załóż konto i dostaniesz 10% zniżki na pierwszą galerię (plany 1 GB i 3 GB, 1 lub 3 miesiące).
        </p>
        <Link href={signUpUrl}>
          <Button variant="primary" className="w-full">
            Załóż konto
          </Button>
        </Link>
        <p className="mt-4 text-sm text-photographer-muted dark:text-gray-400">
          Masz już konto?{" "}
          <Link href="/login" className="text-photographer-accent hover:underline">
            Zaloguj się
          </Link>
        </p>
      </div>
    </div>
  );
}
