import GalleryFilterPage from "../../components/galleries/GalleryFilterPage";
import { usePageLogger } from "../../hooks/usePageLogger";

export default function GalleriesProsbaOZmiany() {
  usePageLogger({ pageName: "GalleriesProsbaOZmiany" });
  return <GalleryFilterPage title="Prośba o zmiany" filter="prosba-o-zmiany" />;
}
