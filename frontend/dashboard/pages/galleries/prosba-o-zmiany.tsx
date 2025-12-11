import type { GetServerSideProps } from "next";

import GalleryFilterPage from "../../components/galleries/GalleryFilterPage";
import { usePageLogger } from "../../hooks/usePageLogger";

// Prevent static generation - this page uses client hooks
export const getServerSideProps: GetServerSideProps = () => {
  return Promise.resolve({ props: {} });
};

export default function GalleriesProsbaOZmiany() {
  usePageLogger({ pageName: "GalleriesProsbaOZmiany" });
  return <GalleryFilterPage title="Prośba o zmiany" filter="prosba-o-zmiany" />;
}
