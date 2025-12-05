import GalleryFilterPage from "../../components/galleries/GalleryFilterPage";
import { usePageLogger } from "../../hooks/usePageLogger";

export default function GalleriesWyslano() {
  usePageLogger({ pageName: "GalleriesWyslano" });
  return <GalleryFilterPage title="Wysłano do klienta" filter="wyslano" />;
}
