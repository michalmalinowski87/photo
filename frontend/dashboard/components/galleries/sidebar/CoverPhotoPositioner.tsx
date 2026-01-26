import React, { useRef, useState, useCallback, useEffect } from "react";

import type { LoginPageLayout } from "./LayoutSelector";

interface CoverPhotoPositionerProps {
  coverPhotoUrl: string;
  layout: LoginPageLayout;
  galleryName?: string | null;
  initialPosition?: {
    objectPosition?: string;
    scale?: number;
  };
  onPositionChange: (position: { objectPosition: string; scale?: number }) => void;
  containerWidth: number;
  containerHeight: number;
}

type HandleType = "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w" | null;

export const CoverPhotoPositioner: React.FC<CoverPhotoPositionerProps> = ({
  coverPhotoUrl,
  layout,
  galleryName,
  initialPosition,
  onPositionChange,
  containerWidth,
  containerHeight,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const coverAreaRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [activeHandle, setActiveHandle] = useState<HandleType>(null);
  const [scale, setScale] = useState(initialPosition?.scale || 1);
  const [showTransformBox, setShowTransformBox] = useState(true);

  // Image position and dimensions
  const [imageState, setImageState] = useState(() => {
    // Parse initial position, default to center (50%, 50%)
    let x = 50;
    let y = 50;
    if (initialPosition?.objectPosition) {
      const match = initialPosition.objectPosition.match(/(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%/);
      if (match) {
        x = parseFloat(match[1]);
        y = parseFloat(match[2]);
      }
    }
    return { x, y }; // Store as percentages
  });

  const dragStartRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(
    null
  );
  const resizeStartRef = useRef<{
    startX: number;
    startY: number;
    startScale: number;
    startImageX: number;
    startImageY: number;
    fixedCorner: { x: number; y: number } | null;
  } | null>(null);

  // Calculate cover area dimensions based on layout
  const getCoverAreaDimensions = useCallback(() => {
    switch (layout) {
      case "split":
        return { width: containerWidth * 0.64, height: containerHeight };
      case "angled-split":
        // For angled-split, image should extend full width behind the form pane
        return { width: containerWidth, height: containerHeight };
      case "centered":
      case "full-cover":
        return { width: containerWidth, height: containerHeight };
      default:
        return { width: containerWidth * 0.55, height: containerHeight };
    }
  }, [layout, containerWidth, containerHeight]);

  const coverAreaDims = getCoverAreaDimensions();

  // Convert percentage position to pixels for display
  const getImagePosition = useCallback(() => {
    const x = (imageState.x / 100) * coverAreaDims.width;
    const y = (imageState.y / 100) * coverAreaDims.height;
    return { x, y };
  }, [imageState, coverAreaDims]);

  // Handle click outside to hide transform box
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!containerRef.current || !coverAreaRef.current || isDragging || isResizing) return;

      const target = e.target as HTMLElement;
      const container = containerRef.current;
      const coverArea = coverAreaRef.current;

      // Check if click is on the form pane or outside the container
      const isFormPane = target.closest(".form-pane-overlay");
      const isCoverArea = coverArea.contains(target);
      const isImage = target.closest("[data-image-container]");

      // Hide transform box if clicking on form pane, outside container, or outside cover area (but inside container)
      if (isFormPane || (!isCoverArea && !isImage && container.contains(target))) {
        setShowTransformBox(false);
        setIsDragging(false);
        setIsResizing(false);
        setActiveHandle(null);
      }
    };

    if (showTransformBox) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showTransformBox, isDragging, isResizing]);

  // Handle image drag start
  const handleImageMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!coverAreaRef.current || e.target === e.currentTarget) {
        const coverArea = coverAreaRef.current;
        if (!coverArea) return;

        const coverAreaRect = coverArea.getBoundingClientRect();
        const currentPos = getImagePosition();

        setShowTransformBox(true);
        setIsDragging(true);
        dragStartRef.current = {
          x: e.clientX - coverAreaRect.left,
          y: e.clientY - coverAreaRect.top,
          startX: currentPos.x,
          startY: currentPos.y,
        };
      }
    },
    [getImagePosition]
  );

  // Handle resize start
  const handleResizeStart = useCallback(
    (e: React.MouseEvent, handle: HandleType) => {
      e.preventDefault();
      e.stopPropagation();
      if (!coverAreaRef.current || !imageRef.current) return;

      const coverArea = coverAreaRef.current;
      const coverAreaRect = coverArea.getBoundingClientRect();
      const currentPos = getImagePosition();
      const currentImageWidth = coverAreaDims.width * scale;
      const currentImageHeight = coverAreaDims.height * scale;

      // Calculate corner positions relative to cover area
      const nwCorner = {
        x: currentPos.x - currentImageWidth / 2,
        y: currentPos.y - currentImageHeight / 2,
      };
      const seCorner = {
        x: currentPos.x + currentImageWidth / 2,
        y: currentPos.y + currentImageHeight / 2,
      };
      const neCorner = {
        x: currentPos.x + currentImageWidth / 2,
        y: currentPos.y - currentImageHeight / 2,
      };
      const swCorner = {
        x: currentPos.x - currentImageWidth / 2,
        y: currentPos.y + currentImageHeight / 2,
      };

      setIsResizing(true);
      setActiveHandle(handle);
      resizeStartRef.current = {
        startX: e.clientX - coverAreaRect.left,
        startY: e.clientY - coverAreaRect.top,
        startScale: scale,
        startImageX: currentPos.x,
        startImageY: currentPos.y,
        // Store opposite corner to keep it fixed
        fixedCorner:
          handle === "nw"
            ? seCorner
            : handle === "ne"
              ? swCorner
              : handle === "sw"
                ? neCorner
                : handle === "se"
                  ? nwCorner
                  : handle === "n"
                    ? { x: currentPos.x, y: currentPos.y + currentImageHeight / 2 }
                    : handle === "s"
                      ? { x: currentPos.x, y: currentPos.y - currentImageHeight / 2 }
                      : handle === "w"
                        ? { x: currentPos.x + currentImageWidth / 2, y: currentPos.y }
                        : handle === "e"
                          ? { x: currentPos.x - currentImageWidth / 2, y: currentPos.y }
                          : null,
      };
    },
    [scale, getImagePosition, coverAreaDims]
  );

  // Handle mouse move for dragging
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!coverAreaRef.current) return;

      if (isDragging && dragStartRef.current) {
        const coverArea = coverAreaRef.current;
        const coverAreaRect = coverArea.getBoundingClientRect();

        const currentX = e.clientX - coverAreaRect.left;
        const currentY = e.clientY - coverAreaRect.top;

        const deltaX = currentX - dragStartRef.current.x;
        const deltaY = currentY - dragStartRef.current.y;

        const newX = dragStartRef.current.startX + deltaX;
        const newY = dragStartRef.current.startY + deltaY;

        // Convert back to percentages
        const xPercent = (newX / coverAreaDims.width) * 100;
        const yPercent = (newY / coverAreaDims.height) * 100;

        setImageState({ x: xPercent, y: yPercent });
      } else if (
        isResizing &&
        resizeStartRef.current &&
        activeHandle &&
        resizeStartRef.current.fixedCorner
      ) {
        const coverArea = coverAreaRef.current;
        const coverAreaRect = coverArea.getBoundingClientRect();

        const currentX = e.clientX - coverAreaRect.left;
        const currentY = e.clientY - coverAreaRect.top;

        const fixedCorner = resizeStartRef.current.fixedCorner;

        // Calculate distance from fixed corner to current mouse position
        const newWidth = Math.abs(currentX - fixedCorner.x);
        const newHeight = Math.abs(currentY - fixedCorner.y);

        // Calculate new scale
        let newScale: number;
        if (["nw", "ne", "sw", "se"].includes(activeHandle)) {
          // For corners, maintain aspect ratio by using average
          const scaleX = newWidth / coverAreaDims.width;
          const scaleY = newHeight / coverAreaDims.height;
          newScale = (scaleX + scaleY) / 2;
        } else {
          // For edges, scale based on the dimension being changed
          if (["n", "s"].includes(activeHandle)) {
            newScale = newHeight / coverAreaDims.height;
          } else {
            newScale = newWidth / coverAreaDims.width;
          }
        }

        newScale = Math.max(0.5, Math.min(3, newScale));

        // Calculate new image dimensions with the new scale
        const scaledWidth = coverAreaDims.width * newScale;
        const scaledHeight = coverAreaDims.height * newScale;

        // Calculate new center position based on fixed corner and new dimensions
        let newCenterX: number;
        let newCenterY: number;

        if (activeHandle === "nw") {
          // Fixed corner is SE, new center is fixedCorner - (scaledWidth/2, scaledHeight/2)
          newCenterX = fixedCorner.x - scaledWidth / 2;
          newCenterY = fixedCorner.y - scaledHeight / 2;
        } else if (activeHandle === "ne") {
          // Fixed corner is SW
          newCenterX = fixedCorner.x + scaledWidth / 2;
          newCenterY = fixedCorner.y - scaledHeight / 2;
        } else if (activeHandle === "sw") {
          // Fixed corner is NE
          newCenterX = fixedCorner.x - scaledWidth / 2;
          newCenterY = fixedCorner.y + scaledHeight / 2;
        } else if (activeHandle === "se") {
          // Fixed corner is NW
          newCenterX = fixedCorner.x + scaledWidth / 2;
          newCenterY = fixedCorner.y + scaledHeight / 2;
        } else if (activeHandle === "n") {
          // Fixed edge is bottom
          newCenterX = fixedCorner.x;
          newCenterY = fixedCorner.y - scaledHeight / 2;
        } else if (activeHandle === "s") {
          // Fixed edge is top
          newCenterX = fixedCorner.x;
          newCenterY = fixedCorner.y + scaledHeight / 2;
        } else if (activeHandle === "w") {
          // Fixed edge is right
          newCenterX = fixedCorner.x - scaledWidth / 2;
          newCenterY = fixedCorner.y;
        } else {
          // "e"
          // Fixed edge is left
          newCenterX = fixedCorner.x + scaledWidth / 2;
          newCenterY = fixedCorner.y;
        }

        setScale(newScale);

        // Convert to percentages
        const xPercent = (newCenterX / coverAreaDims.width) * 100;
        const yPercent = (newCenterY / coverAreaDims.height) * 100;

        setImageState({ x: xPercent, y: yPercent });
      }
    },
    [isDragging, isResizing, activeHandle, coverAreaDims]
  );

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    if (isDragging || isResizing) {
      // Save final position
      const xPercent = Math.max(0, Math.min(100, imageState.x));
      const yPercent = Math.max(0, Math.min(100, imageState.y));
      const objectPosition = `${xPercent}% ${yPercent}%`;

      onPositionChange({
        objectPosition,
        scale,
      });
    }

    setIsDragging(false);
    setIsResizing(false);
    setActiveHandle(null);
    dragStartRef.current = null;
    resizeStartRef.current = null;
  }, [isDragging, isResizing, imageState, scale, onPositionChange]);

  // Add global mouse event listeners
  useEffect(() => {
    if (isDragging || isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "none";
      document.body.style.cursor = isResizing ? "nwse-resize" : "move";

      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
      };
    }
  }, [isDragging, isResizing, handleMouseMove, handleMouseUp]);

  // Touch event handlers
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      if (!coverAreaRef.current) return;

      const touch = e.touches[0];
      const coverArea = coverAreaRef.current;
      const coverAreaRect = coverArea.getBoundingClientRect();
      const currentPos = getImagePosition();

      setIsDragging(true);
      dragStartRef.current = {
        x: touch.clientX - coverAreaRect.left,
        y: touch.clientY - coverAreaRect.top,
        startX: currentPos.x,
        startY: currentPos.y,
      };
    },
    [getImagePosition]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!isDragging || !dragStartRef.current || !coverAreaRef.current) return;

      const touch = e.touches[0];
      const coverArea = coverAreaRef.current;
      const coverAreaRect = coverArea.getBoundingClientRect();

      const currentX = touch.clientX - coverAreaRect.left;
      const currentY = touch.clientY - coverAreaRect.top;

      const deltaX = currentX - dragStartRef.current.x;
      const deltaY = currentY - dragStartRef.current.y;

      const newX = dragStartRef.current.startX + deltaX;
      const newY = dragStartRef.current.startY + deltaY;

      const xPercent = (newX / coverAreaDims.width) * 100;
      const yPercent = (newY / coverAreaDims.height) * 100;

      setImageState({ x: xPercent, y: yPercent });
    },
    [isDragging, coverAreaDims]
  );

  const handleTouchEnd = useCallback(() => {
    if (isDragging) {
      const xPercent = Math.max(0, Math.min(100, imageState.x));
      const yPercent = Math.max(0, Math.min(100, imageState.y));
      const objectPosition = `${xPercent}% ${yPercent}%`;

      onPositionChange({
        objectPosition,
        scale,
      });
    }

    setIsDragging(false);
    dragStartRef.current = null;
  }, [isDragging, imageState, scale, onPositionChange]);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener("touchmove", handleTouchMove, { passive: false });
      document.addEventListener("touchend", handleTouchEnd);

      return () => {
        document.removeEventListener("touchmove", handleTouchMove);
        document.removeEventListener("touchend", handleTouchEnd);
      };
    }
  }, [isDragging, handleTouchMove, handleTouchEnd]);

  // Update scale when initialPosition changes
  useEffect(() => {
    if (initialPosition?.scale !== undefined) {
      setScale(initialPosition.scale);
    }
  }, [initialPosition?.scale]);

  // Reset image position to center and scale to 1 when layout changes
  useEffect(() => {
    setImageState({ x: 50, y: 50 });
    setScale(1);
    setShowTransformBox(true);
    // Notify parent of the reset position
    onPositionChange({
      objectPosition: "50% 50%",
      scale: 1,
    });
  }, [layout, onPositionChange]);

  // Update position when initialPosition changes (but only if layout hasn't changed)
  useEffect(() => {
    if (initialPosition?.objectPosition) {
      const match = initialPosition.objectPosition.match(/(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%/);
      if (match) {
        const xPercent = parseFloat(match[1]);
        const yPercent = parseFloat(match[2]);
        setImageState({ x: xPercent, y: yPercent });
      }
    }
  }, [initialPosition?.objectPosition]);

  const imagePos = getImagePosition();

  // Render form pane based on layout
  const renderFormPane = () => {
    const displayName = galleryName || "Galeria";

    switch (layout) {
      case "split":
        return (
          <div className="absolute right-0 top-0 bottom-0 w-[36%] bg-white flex items-center justify-center px-6 py-10">
            <div className="w-full max-w-md">
              <div className="mb-8">
                <h1
                  className="mt-5 text-5xl md:text-6xl text-gray-900 truncate"
                  style={{ fontFamily: "'The Wedding Signature', cursive" }}
                >
                  {displayName}
                </h1>
                <p className="mt-4 text-base text-gray-600">
                  {/* Welcome message would go here if configured */}
                </p>
              </div>
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700">Hasło</label>
                  <div className="h-12 w-full border border-gray-300 rounded-lg bg-white px-4"></div>
                </div>
                <div className="h-10 w-full bg-black text-white flex items-center justify-center text-xs font-medium uppercase tracking-wider">
                  ZALOGUJ SIĘ
                </div>
              </div>
            </div>
          </div>
        );

      case "angled-split":
        return (
          <div
            className="absolute right-0 top-0 bottom-0 w-[45%] bg-white flex items-center justify-center px-6 py-10 form-pane-overlay z-10"
            style={{
              clipPath: "polygon(25% 0%, 100% 0%, 100% 100%, 0% 100%)",
            }}
          >
            <div className="w-full max-w-[20rem] ml-auto mr-8 relative z-10">
              <div className="mb-8">
                <h1
                  className="mt-5 text-4xl md:text-5xl text-gray-900 truncate"
                  style={{ fontFamily: "'The Wedding Signature', cursive" }}
                >
                  {displayName}
                </h1>
              </div>
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700">Hasło</label>
                  <div className="h-12 w-full border border-gray-300 rounded-lg bg-white px-4"></div>
                </div>
                <div className="h-10 w-full bg-black text-white flex items-center justify-center text-xs font-medium uppercase tracking-wider">
                  ZALOGUJ SIĘ
                </div>
              </div>
            </div>
          </div>
        );

      case "centered":
        return (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center px-6 py-10 z-10 pointer-events-none">
            <div className="w-full max-w-md pointer-events-auto">
              <div className="mb-8">
                <h1
                  className="mt-5 text-5xl md:text-6xl text-gray-900 truncate text-center"
                  style={{ fontFamily: "'The Wedding Signature', cursive" }}
                >
                  {displayName}
                </h1>
                <p className="mt-4 text-base text-gray-600 text-center">
                  {/* Welcome message would go here if configured */}
                </p>
              </div>
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700">Hasło</label>
                  <div className="h-12 w-full border border-gray-300 rounded-lg bg-white px-4"></div>
                </div>
                <div className="h-10 w-full bg-black text-white flex items-center justify-center text-xs font-medium uppercase tracking-wider">
                  ZALOGUJ SIĘ
                </div>
              </div>
            </div>
          </div>
        );

      case "full-cover":
        return (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center px-6 py-10 z-10 pointer-events-none">
            <div className="w-full max-w-md pointer-events-auto">
              <div className="mb-8">
                <h1
                  className="mt-5 text-5xl md:text-6xl text-white truncate text-center"
                  style={{ fontFamily: "'The Wedding Signature', cursive" }}
                >
                  {displayName}
                </h1>
                <p className="mt-4 text-base text-white/90 text-center">
                  {/* Welcome message would go here if configured */}
                </p>
              </div>
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium mb-2 text-white">Hasło</label>
                  <div className="h-12 w-full border border-white/30 rounded-lg bg-white/90 px-4"></div>
                </div>
                <div className="h-10 w-full bg-black text-white flex items-center justify-center text-xs font-medium uppercase tracking-wider">
                  ZALOGUJ SIĘ
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // Render resize handles
  const renderHandles = () => {
    if (!showTransformBox) return null;

    const handleSize = 12;
    const handleStyle =
      "absolute w-3 h-3 bg-white border-2 border-photographer-accent rounded-full cursor-pointer shadow-lg hover:scale-110 transition-transform";
    const edgeHandleStyle =
      "absolute bg-white border-2 border-photographer-accent shadow-lg hover:scale-110 transition-transform";

    // Calculate image bounds - image is centered at imagePos and scaled
    const baseImageWidth = coverAreaDims.width;
    const baseImageHeight = coverAreaDims.height;
    const scaledWidth = baseImageWidth * scale;
    const scaledHeight = baseImageHeight * scale;

    // Image center is at imagePos (relative to cover area), so calculate corners
    // Since handles are now at container level, positions are already relative to container
    const left = imagePos.x - scaledWidth / 2;
    const top = imagePos.y - scaledHeight / 2;
    const right = left + scaledWidth;
    const bottom = top + scaledHeight;

    return (
      <>
        {/* Corner handles */}
        <div
          className={`${handleStyle} cursor-nwse-resize`}
          style={{ left: left - handleSize / 2, top: top - handleSize / 2, zIndex: 9999 }}
          onMouseDown={(e) => handleResizeStart(e, "nw")}
        />
        <div
          className={`${handleStyle} cursor-nesw-resize`}
          style={{ left: right - handleSize / 2, top: top - handleSize / 2, zIndex: 9999 }}
          onMouseDown={(e) => handleResizeStart(e, "ne")}
        />
        <div
          className={`${handleStyle} cursor-nesw-resize`}
          style={{ left: left - handleSize / 2, top: bottom - handleSize / 2, zIndex: 9999 }}
          onMouseDown={(e) => handleResizeStart(e, "sw")}
        />
        <div
          className={`${handleStyle} cursor-nwse-resize`}
          style={{ left: right - handleSize / 2, top: bottom - handleSize / 2, zIndex: 9999 }}
          onMouseDown={(e) => handleResizeStart(e, "se")}
        />

        {/* Edge handles */}
        <div
          className={`${edgeHandleStyle} cursor-ns-resize`}
          style={{
            left: (left + right) / 2 - handleSize / 2,
            top: top - handleSize / 2,
            width: handleSize,
            height: handleSize,
            zIndex: 9999,
          }}
          onMouseDown={(e) => handleResizeStart(e, "n")}
        />
        <div
          className={`${edgeHandleStyle} cursor-ns-resize`}
          style={{
            left: (left + right) / 2 - handleSize / 2,
            top: bottom - handleSize / 2,
            width: handleSize,
            height: handleSize,
            zIndex: 9999,
          }}
          onMouseDown={(e) => handleResizeStart(e, "s")}
        />
        <div
          className={`${edgeHandleStyle} cursor-ew-resize`}
          style={{
            left: left - handleSize / 2,
            top: (top + bottom) / 2 - handleSize / 2,
            width: handleSize,
            height: handleSize,
            zIndex: 9999,
          }}
          onMouseDown={(e) => handleResizeStart(e, "w")}
        />
        <div
          className={`${edgeHandleStyle} cursor-ew-resize`}
          style={{
            left: right - handleSize / 2,
            top: (top + bottom) / 2 - handleSize / 2,
            width: handleSize,
            height: handleSize,
            zIndex: 9999,
          }}
          onMouseDown={(e) => handleResizeStart(e, "e")}
        />

        {/* Transform box outline */}
        <div
          className="absolute border-2 border-photographer-accent border-dashed pointer-events-none"
          style={{
            left,
            top,
            width: scaledWidth,
            height: scaledHeight,
            zIndex: 9999,
          }}
        />
      </>
    );
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-gray-100 dark:bg-gray-800 rounded-lg"
      style={{ width: containerWidth, height: containerHeight }}
    >
      {/* Cover photo area */}
      <div
        ref={coverAreaRef}
        className="absolute inset-0 z-0"
        style={{
          width: coverAreaDims.width,
          height: coverAreaDims.height,
        }}
      >
        {/* Image shadow when dragging - shows even under form elements */}
        {isDragging && (
          <div
            className="absolute pointer-events-none opacity-60"
            style={{
              left: imagePos.x,
              top: imagePos.y,
              transform: `translate(-50%, -50%) scale(${scale})`,
              width: coverAreaDims.width,
              height: coverAreaDims.height,
              transformOrigin: "center center",
              filter: "drop-shadow(0 0 20px rgba(0, 0, 0, 0.8))",
              zIndex: layout === "angled-split" ? 5 : 50,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coverPhotoUrl}
              alt=""
              className="w-full h-full object-cover"
              style={{
                objectPosition: "50% 50%", // Keep centered - matches main image
              }}
              draggable={false}
            />
          </div>
        )}

        {/* Cover photo image - draggable */}
        <div
          ref={imageRef}
          data-image-container
          className={`absolute select-none ${isDragging ? "opacity-50" : "opacity-100 cursor-move"}`}
          style={{
            left: imagePos.x,
            top: imagePos.y,
            transform: `translate(-50%, -50%) scale(${scale})`,
            width: coverAreaDims.width,
            height: coverAreaDims.height,
            transformOrigin: "center center",
            zIndex:
              layout === "angled-split"
                ? 0
                : layout === "full-cover" || layout === "centered"
                  ? 5
                  : 10,
          }}
          onMouseDown={(e) => {
            setShowTransformBox(true);
            handleImageMouseDown(e);
          }}
          onTouchStart={handleTouchStart}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverPhotoUrl}
            alt="Cover photo preview"
            className="w-full h-full object-cover pointer-events-none"
            style={{
              objectPosition: "50% 50%", // Keep centered - we move the container, not the image content
            }}
            draggable={false}
          />
        </div>
      </div>

      {/* Form pane overlay */}
      {renderFormPane()}

      {/* Resize handles and transform box - rendered at container level to appear above form */}
      {renderHandles()}
    </div>
  );
};
