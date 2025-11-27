import { ThemeToggleButton } from "../common/ThemeToggleButton";

const GalleryHeader: React.FC = () => {
  return (
    <header className="sticky top-0 flex w-full bg-white border-gray-200 z-30 dark:border-gray-800 dark:bg-gray-900 lg:border-b">
      <div className="flex flex-col items-center justify-between grow lg:flex-row lg:px-6">
        <div className="flex items-center justify-end w-full gap-2 px-3 py-3 border-b border-gray-200 dark:border-gray-800 sm:gap-4 lg:justify-end lg:border-b-0 lg:px-0 lg:py-4">
          <div className="flex items-center gap-2 2xsm:gap-3">
            <ThemeToggleButton />
          </div>
        </div>
      </div>
    </header>
  );
};

export default GalleryHeader;
