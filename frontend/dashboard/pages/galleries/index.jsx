import { useEffect } from "react";
import { useRouter } from "next/router";

export default function GalleriesIndex() {
  const router = useRouter();
  
  useEffect(() => {
    router.replace("/galleries/robocze");
  }, [router]);
  
  return null;
}

