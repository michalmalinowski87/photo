import { useRouter } from "next/router";
import { useEffect } from "react";

export default function GalleriesIndex() {
  const router = useRouter();

  useEffect(() => {
    void router.replace("/galleries/robocze");
  }, [router]);

  return null;
}
