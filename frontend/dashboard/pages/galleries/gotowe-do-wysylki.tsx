import GalleryFilterPage from "../../components/galleries/GalleryFilterPage";
import { usePageLogger } from "../../hooks/usePageLogger";

export default function GalleriesGotoweDoWysylki() {
  usePageLogger({ pageName: "GalleriesGotoweDoWysylki" });
  return <GalleryFilterPage title="Gotowe do wysyłki" filter="gotowe-do-wysylki" />;
}
