import type { GetServerSideProps } from "next";
import { useRouter } from "next/router";

import { GallerySettingsForm } from "../../../../../components/galleries/GallerySettingsForm";

// Prevent static generation - this page uses client hooks
export const getServerSideProps: GetServerSideProps = () => {
  return Promise.resolve({ props: {} });
};

export default function OrderSettings() {
  const router = useRouter();
  const { id: galleryId, orderId } = router.query;

  // Auth is handled by AuthProvider/ProtectedRoute - no initialization needed

  const galleryIdStr = Array.isArray(galleryId) ? (galleryId[0] ?? "") : (galleryId ?? "");
  const orderIdStr = Array.isArray(orderId) ? (orderId[0] ?? "") : (orderId ?? "");

  if (!galleryIdStr || !orderIdStr) {
    return null;
  }

  return <GallerySettingsForm galleryId={galleryIdStr} />;
}
