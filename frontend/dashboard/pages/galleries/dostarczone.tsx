import GalleryFilterPage from "../../components/galleries/GalleryFilterPage";
import { usePageLogger } from "../../hooks/usePageLogger";

export default function GalleriesDostarczone() {
  usePageLogger({ pageName: "GalleriesDostarczone" });
  return <GalleryFilterPage title="Dostarczone" filter="dostarczone" />;
}
