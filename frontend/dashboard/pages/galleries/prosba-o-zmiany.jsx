import GalleryList from "../../components/galleries/GalleryList";

export default function GalleriesProsbaOZmiany() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
        Prośba o zmiany
      </h1>
      <GalleryList filter="prosba-o-zmiany" />
    </div>
  );
}

