import GalleryFilterPage from "../../components/galleries/GalleryFilterPage";
import { usePageLogger } from "../../hooks/usePageLogger";

export default function GalleriesWybrano() {
  usePageLogger({ pageName: "GalleriesWybrano" });
  return <GalleryFilterPage title="Wybrano zdjęcia" filter="wybrano" />;
}
