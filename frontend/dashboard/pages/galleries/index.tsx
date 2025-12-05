import { useRouter } from "next/router";
import { useEffect } from "react";

import { usePageLogger } from "../../hooks/usePageLogger";

export default function GalleriesIndex() {
  const router = useRouter();
  usePageLogger({ pageName: "GalleriesIndex" });

  useEffect(() => {
    void router.replace("/galleries/robocze");
  }, [router]);

  return null;
}
