import GalleryList from "../../components/galleries/GalleryList";

export default function GalleriesDostarczone() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
        Dostarczone
      </h1>
      <GalleryList filter="dostarczone" />
    </div>
  );
}

