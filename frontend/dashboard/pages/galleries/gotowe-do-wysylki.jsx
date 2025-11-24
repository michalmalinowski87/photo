import GalleryList from "../../components/galleries/GalleryList";

export default function GalleriesGotoweDoWysylki() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
        Gotowe do wysyłki
      </h1>
      <GalleryList filter="gotowe-do-wysylki" />
    </div>
  );
}

