import GalleryList from "../../components/galleries/GalleryList";

export default function GalleriesWyslano() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
        Wysłano do klienta
      </h1>
      <GalleryList filter="wyslano" />
    </div>
  );
}

