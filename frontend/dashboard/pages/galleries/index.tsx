import type { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import { useEffect } from "react";

import { usePageLogger } from "../../hooks/usePageLogger";

// Prevent static generation - this page uses client hooks
export const getServerSideProps: GetServerSideProps = () => {
  return Promise.resolve({ props: {} });
};

export default function GalleriesIndex() {
  const router = useRouter();
  usePageLogger({ pageName: "GalleriesIndex" });

  useEffect(() => {
    void router.replace("/galleries/robocze");
  }, [router]);

  return null;
}
