import GalleryFilterPage from "../../components/galleries/GalleryFilterPage";
import { usePageLogger } from "../../hooks/usePageLogger";

export default function GalleriesRobocze() {
  usePageLogger({ pageName: "GalleriesRobocze" });
  return <GalleryFilterPage title="Wersje robocze" filter="unpaid" />;
}
