import GalleryList from "../../components/galleries/GalleryList";

export default function GalleriesWybrano() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
        Wybrano zdjęcia
      </h1>
      <GalleryList filter="wybrano" />
    </div>
  );
}

