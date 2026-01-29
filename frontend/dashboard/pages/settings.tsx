import { useRouter } from "next/router";
import { useEffect } from "react";

// Prevent static generation - this page uses client hooks
export const dynamic = "force-dynamic";

export default function Settings() {
  const router = useRouter();

  // Redirect to account tab by default
  useEffect(() => {
    if (router.isReady) {
      void router.replace("/settings/account");
    }
  }, [router]);

  return null;
}
