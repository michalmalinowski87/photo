import { useRouter } from "next/router";
import { useEffect } from "react";

import { FullPageLoading } from "../../components/ui/loading/Loading";

export const dynamic = "force-dynamic";

export default function InviteByCode() {
  const router = useRouter();
  const code = typeof router.query.code === "string" ? router.query.code.trim().toUpperCase() : "";

  useEffect(() => {
    if (router.isReady) {
      const signUpUrl = code ? `/sign-up?ref=${encodeURIComponent(code)}` : "/sign-up";
      void router.replace(signUpUrl);
    }
  }, [router, code]);

  return <FullPageLoading text="Przekierowywanie..." />;
}
