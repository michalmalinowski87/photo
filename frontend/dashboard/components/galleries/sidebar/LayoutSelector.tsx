import { Check } from "lucide-react";
import React from "react";

export type LoginPageLayout = "split" | "angled-split" | "centered" | "full-cover";

interface LayoutOption {
  id: LoginPageLayout;
  name: string;
}

const layoutOptions: LayoutOption[] = [
  {
    id: "split",
    name: "Podział klasyczny",
  },
  {
    id: "angled-split",
    name: "Podział ukośny",
  },
  {
    id: "centered",
    name: "Wyśrodkowany",
  },
  {
    id: "full-cover",
    name: "Pełne tło",
  },
];

interface LayoutSelectorProps {
  selectedLayout: LoginPageLayout;
  onLayoutChange: (layout: LoginPageLayout) => void;
  coverPhotoUrl?: string;
  galleryName?: string | null;
}

// Miniature preview component for each layout
const LayoutPreview: React.FC<{
  layout: LoginPageLayout;
  coverPhotoUrl?: string;
  galleryName?: string | null;
}> = ({ layout, coverPhotoUrl, galleryName }) => {
  const displayName = galleryName ?? "Galeria";
  const previewHeight = 120;
  const previewWidth = 200;

  const renderPreview = () => {
    switch (layout) {
      case "split":
        return (
          <div className="flex h-full w-full">
            {/* Cover photo area - 64% */}
            <div className="relative w-[64%] bg-gradient-to-br from-gray-300 to-gray-400 overflow-hidden">
              {coverPhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- layout preview thumbnail
                <img src={coverPhotoUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-gray-300 to-gray-400" />
              )}
            </div>
            {/* Form area - 36% (20% shorter than 45%) */}
            <div className="w-[36%] bg-white flex items-center justify-center p-1.5">
              <div className="w-full">
                <div
                  className="text-[9px] leading-tight text-gray-900 mb-0.5 truncate text-left"
                  style={{ fontFamily: "'The Wedding Signature', cursive" }}
                >
                  {displayName}
                </div>
                <div className="space-y-1">
                  <label className="block text-[4px] font-medium mb-0.5 text-gray-700 text-left">
                    Hasło
                  </label>
                  <div
                    className="h-3 w-full border border-gray-300 bg-white px-1"
                    style={{ borderRadius: "0.125rem" }}
                  ></div>
                  <div className="h-2.5 w-full bg-black" style={{ borderRadius: 0 }}></div>
                </div>
              </div>
            </div>
          </div>
        );

      case "angled-split":
        return (
          <div className="relative h-full w-full">
            {/* Cover photo area - full width (image extends behind form) */}
            <div className="absolute inset-0 bg-gradient-to-br from-gray-300 to-gray-400 overflow-hidden">
              {coverPhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- layout preview thumbnail
                <img src={coverPhotoUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-gray-300 to-gray-400" />
              )}
            </div>
            {/* Form area - 45% with filled angled triangle */}
            <div
              className="absolute right-0 top-0 bottom-0 w-[45%] bg-white flex items-center justify-center p-1.5"
              style={{
                clipPath: "polygon(25% 0%, 100% 0%, 100% 100%, 0% 100%)",
              }}
            >
              <div className="w-full max-w-[66%] ml-auto mr-2 relative z-10">
                <div className="mb-1.5">
                  <div
                    className="text-[9px] leading-tight text-gray-900 truncate text-left"
                    style={{ fontFamily: "'The Wedding Signature', cursive" }}
                  >
                    {displayName}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="block text-[4px] font-medium mb-0.5 text-gray-700 text-left">
                    Hasło
                  </label>
                  <div
                    className="h-3 w-full border border-gray-300 bg-white px-1"
                    style={{ borderRadius: "0.125rem" }}
                  ></div>
                  <div className="h-2.5 w-full bg-black" style={{ borderRadius: 0 }}></div>
                </div>
              </div>
            </div>
          </div>
        );

      case "centered":
        return (
          <div className="relative h-full w-full">
            {/* Cover photo background */}
            <div className="absolute inset-0 bg-gradient-to-br from-gray-300 to-gray-400 overflow-hidden">
              {coverPhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- layout preview thumbnail
                <img src={coverPhotoUrl} alt="" className="w-full h-full object-cover opacity-60" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-gray-300 to-gray-400" />
              )}
            </div>
            {/* Form overlay with blur */}
            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center p-1.5">
              <div className="w-full max-w-[60%]">
                <div
                  className="text-[9px] leading-tight text-gray-900 mb-0.5 truncate text-center"
                  style={{ fontFamily: "'The Wedding Signature', cursive" }}
                >
                  {displayName}
                </div>
                <div className="space-y-1">
                  <label className="block text-[4px] font-medium mb-0.5 text-gray-700 text-left">
                    Hasło
                  </label>
                  <div
                    className="h-3 w-full border border-gray-300 bg-white px-1"
                    style={{ borderRadius: "0.125rem" }}
                  ></div>
                  <div className="h-2.5 w-full bg-black" style={{ borderRadius: 0 }}></div>
                </div>
              </div>
            </div>
          </div>
        );

      case "full-cover":
        return (
          <div className="relative h-full w-full">
            {/* Cover photo background */}
            <div className="absolute inset-0 bg-gradient-to-br from-gray-300 to-gray-400 overflow-hidden">
              {coverPhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- layout preview thumbnail
                <img src={coverPhotoUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-gray-300 to-gray-400" />
              )}
            </div>
            {/* Form overlay */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-1.5">
              <div className="w-full max-w-[60%]">
                <div
                  className="text-[9px] leading-tight text-white mb-0.5 truncate text-center"
                  style={{ fontFamily: "'The Wedding Signature', cursive" }}
                >
                  {displayName}
                </div>
                <div className="space-y-1">
                  <label className="block text-[4px] font-medium mb-0.5 text-white text-left">
                    Hasło
                  </label>
                  <div
                    className="h-3 w-full border border-white/30 bg-white/90 px-1"
                    style={{ borderRadius: "0.125rem" }}
                  ></div>
                  <div className="h-2 w-full bg-black" style={{ borderRadius: 0 }}></div>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="rounded overflow-hidden" style={{ width: previewWidth, height: previewHeight }}>
      {renderPreview()}
    </div>
  );
};

export const LayoutSelector: React.FC<LayoutSelectorProps> = ({
  selectedLayout,
  onLayoutChange,
  coverPhotoUrl,
  galleryName,
}) => {
  return (
    <div className="space-y-4">
      <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
        Wybierz układ strony logowania
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {layoutOptions.map((layout) => (
          <button
            key={layout.id}
            onClick={() => onLayoutChange(layout.id)}
            className={`relative transition-all ${
              selectedLayout === layout.id
                ? "ring-2 ring-photographer-accent ring-offset-2"
                : "opacity-60 hover:opacity-100"
            }`}
          >
            {selectedLayout === layout.id && (
              <div className="absolute top-1 right-1 z-10">
                <div className="w-4 h-4 rounded-full bg-photographer-accent flex items-center justify-center shadow-lg">
                  <Check size={10} className="text-white" />
                </div>
              </div>
            )}
            <LayoutPreview
              layout={layout.id}
              coverPhotoUrl={coverPhotoUrl}
              galleryName={galleryName}
            />
          </button>
        ))}
      </div>
    </div>
  );
};
