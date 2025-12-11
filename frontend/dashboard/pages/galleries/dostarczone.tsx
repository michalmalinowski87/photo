import type { GetServerSideProps } from "next";

import GalleryFilterPage from "../../components/galleries/GalleryFilterPage";
import { usePageLogger } from "../../hooks/usePageLogger";

// Prevent static generation - this page uses client hooks
export const getServerSideProps: GetServerSideProps = () => {
  return Promise.resolve({ props: {} });
};

export default function GalleriesDostarczone() {
  usePageLogger({ pageName: "GalleriesDostarczone" });
  return <GalleryFilterPage title="Dostarczone" filter="dostarczone" />;
}
