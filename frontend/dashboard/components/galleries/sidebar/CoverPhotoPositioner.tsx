import React, { useRef, useState, useCallback, useEffect } from "react";

import type { LoginPageLayout } from "./LayoutSelector";

interface CoverPhotoPositionerProps {
  coverPhotoUrl: string;
  layout: LoginPageLayout;
  galleryName?: string | null;
  initialPosition?: {
    x?: number; // Percentage of container width (0-100, can be outside for extended positioning)
    y?: number; // Percentage of container height (0-100, can be outside for extended positioning)
    scale?: number;
    objectPosition?: string; // Legacy support - will be converted to x, y
  };
  onPositionChange: (position: {
    x?: number;
    y?: number;
    scale?: number;
    objectPosition?: string;
  }) => void;
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
  // Store as container coordinates (percentages of cover area)
  // Container uses top-left corner positioning (left/top CSS properties)
  // When container moves right (X increases), we see left side (objectPosition X decreases)
  // When container moves down (Y increases), we see top side (objectPosition Y decreases)
  const [imageState, setImageState] = useState(() => {
    // Parse initial position, default to top-left (0%, 0%)
    // Use x, y directly if available (new format), otherwise convert from objectPosition (legacy)
    if (initialPosition?.x !== undefined && initialPosition?.y !== undefined) {
      return { x: initialPosition.x, y: initialPosition.y };
    }

    // Legacy support: convert from objectPosition
    let x = 0;
    let y = 0;
    if (initialPosition?.objectPosition) {
      const match = initialPosition.objectPosition.match(/(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%/);
      if (match) {
        const objectX = parseFloat(match[1]);
        const objectY = parseFloat(match[2]);
        // Invert both X and Y: objectPosition was inverted
        x = 100 - objectX;
        y = 100 - objectY;
      }
    }
    return { x, y }; // Store as container percentages (0% = top-left corner)
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
  // Make layout 1 (split) work like layout 2 (angled-split) - full width cover area
  const getCoverAreaDimensions = useCallback(() => {
    switch (layout) {
      case "split":
        // Make layout 1 work like layout 2 - full width cover area
        return { width: containerWidth, height: containerHeight };
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
  // Position represents the top-left corner of the image container (entrypoint is white area top-left)
  // left and top CSS properties directly represent the top-left corner position
  // To ensure same position accuracy across all layouts, use full container dimensions as reference
  // BUT: The image is positioned within the cover area, so we need to ensure coordinates are relative to cover area
  // Since cover area starts at (0,0) for all layouts, container coordinates = cover area coordinates
  // 0% → top-left corner at (0, 0) relative to cover area
  // 100% → top-left corner at (containerWidth, containerHeight) - normalized across layouts
  // Values < 0% or > 100% allow positioning outside the cover area for flexibility
  const getImagePosition = useCallback(() => {
    // Use full container dimensions as reference for consistent positioning across layouts
    // This ensures the same percentage value produces the same relative position regardless of layout
    // The result is in container coordinates, which equals cover area coordinates since cover area starts at (0,0)
    const baseX = (imageState.x / 100) * containerWidth;
    const baseY = (imageState.y / 100) * containerHeight;

    return { x: baseX, y: baseY };
  }, [imageState, containerWidth, containerHeight]);

  // Handle click outside to hide transform box
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (isDragging || isResizing) return;

      const target = e.target as HTMLElement;
      
      // If container or coverArea refs are not available, hide transform box
      if (!containerRef.current || !coverAreaRef.current) {
        setShowTransformBox(false);
        setIsDragging(false);
        setIsResizing(false);
        setActiveHandle(null);
        return;
      }

      const container = containerRef.current;
      const imageContainer = imageRef.current;

      // Check if click is on the form pane
      const isFormPane = target.closest(".form-pane-overlay");
      // Check if click is on the image container or its children (handles, transform box)
      const isImage = imageContainer?.contains(target) || target.closest("[data-image-container]");
      // Check if click is on resize handles or transform box
      const isHandleOrBox = target.closest("[data-resize-handle]") || target.closest("[data-transform-box]");
      // Check if click is inside the container
      const isInsideContainer = container.contains(target);

      // Hide transform box if:
      // 1. Click is on form pane
      // 2. Click is outside the container entirely (e.g., modal background, anywhere in the modal)
      // 3. Click is inside container but not on the image, handles, or transform box
      if (isFormPane || !isInsideContainer || (isInsideContainer && !isImage && !isHandleOrBox)) {
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
    
    return undefined;
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

        // Get mouse position relative to cover area
        const mouseX = e.clientX - coverAreaRect.left;
        const mouseY = e.clientY - coverAreaRect.top;

        // currentPos is in container coordinates, but we need to track it in cover area coordinates
        // Since cover area starts at (0,0) of container, they're the same for positioning
        // But we need to ensure we're working in the same coordinate system
        setShowTransformBox(true);
        setIsDragging(true);
        dragStartRef.current = {
          x: mouseX,
          y: mouseY,
          startX: currentPos.x, // This is in container coordinates (pixels)
          startY: currentPos.y, // This is in container coordinates (pixels)
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
      // currentPos is the top-left corner
      const nwCorner = {
        x: currentPos.x,
        y: currentPos.y,
      };
      const seCorner = {
        x: currentPos.x + currentImageWidth,
        y: currentPos.y + currentImageHeight,
      };
      const neCorner = {
        x: currentPos.x + currentImageWidth,
        y: currentPos.y,
      };
      const swCorner = {
        x: currentPos.x,
        y: currentPos.y + currentImageHeight,
      };

      setIsResizing(true);
      setActiveHandle(handle);
      resizeStartRef.current = {
        startX: e.clientX - coverAreaRect.left,
        startY: e.clientY - coverAreaRect.top,
        startScale: scale,
        startImageX: currentPos.x,
        startImageY: currentPos.y,
        // Store opposite corner/edge to keep it fixed
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
                    ? {
                        x: currentPos.x + currentImageWidth / 2,
                        y: currentPos.y + currentImageHeight,
                      }
                    : handle === "s"
                      ? { x: currentPos.x + currentImageWidth / 2, y: currentPos.y }
                      : handle === "w"
                        ? {
                            x: currentPos.x + currentImageWidth,
                            y: currentPos.y + currentImageHeight / 2,
                          }
                        : handle === "e"
                          ? { x: currentPos.x, y: currentPos.y + currentImageHeight / 2 }
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

        // startX and startY are in container coordinates (from getImagePosition)
        // deltaX and deltaY are in cover area coordinates (mouse movement relative to cover area)
        // Since cover area starts at (0,0) of container for all layouts, cover area coordinates = container coordinates
        // So we can add them directly
        const newX = dragStartRef.current.startX + deltaX;
        const newY = dragStartRef.current.startY + deltaY;

        // Convert top-left position back to percentages (reverse of getImagePosition)
        // Use full container dimensions as reference for consistent positioning across layouts
        // x = (percent / 100) * containerWidth
        // Solving for percent: percent = (x / containerWidth) * 100
        // Allow values outside 0-100% for extended positioning
        const xPercent = (newX / containerWidth) * 100;
        const yPercent = (newY / containerHeight) * 100;

        // Don't clamp - allow free movement outside bounds
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

        // Calculate new top-left position based on fixed corner and new dimensions
        // fixedCorner is the corner/edge that stays in place during resize
        let newTopLeftX: number;
        let newTopLeftY: number;

        if (activeHandle === "nw") {
          // Fixed corner is SE (bottom-right), new top-left is at fixedCorner - (scaledWidth, scaledHeight)
          newTopLeftX = fixedCorner.x - scaledWidth;
          newTopLeftY = fixedCorner.y - scaledHeight;
        } else if (activeHandle === "ne") {
          // Fixed corner is SW (bottom-left)
          newTopLeftX = fixedCorner.x;
          newTopLeftY = fixedCorner.y - scaledHeight;
        } else if (activeHandle === "sw") {
          // Fixed corner is NE (top-right)
          newTopLeftX = fixedCorner.x - scaledWidth;
          newTopLeftY = fixedCorner.y;
        } else if (activeHandle === "se") {
          // Fixed corner is NW (top-left), so top-left stays at fixedCorner
          newTopLeftX = fixedCorner.x;
          newTopLeftY = fixedCorner.y;
        } else if (activeHandle === "n") {
          // Fixed edge is bottom, new top-left Y is fixedCorner.y - scaledHeight
          newTopLeftX = fixedCorner.x - scaledWidth / 2;
          newTopLeftY = fixedCorner.y - scaledHeight;
        } else if (activeHandle === "s") {
          // Fixed edge is top, top-left Y stays at fixedCorner.y
          newTopLeftX = fixedCorner.x - scaledWidth / 2;
          newTopLeftY = fixedCorner.y;
        } else if (activeHandle === "w") {
          // Fixed edge is right, new top-left X is fixedCorner.x - scaledWidth
          newTopLeftX = fixedCorner.x - scaledWidth;
          newTopLeftY = fixedCorner.y - scaledHeight / 2;
        } else {
          // "e" - Fixed edge is left, top-left X stays at fixedCorner.x
          newTopLeftX = fixedCorner.x;
          newTopLeftY = fixedCorner.y - scaledHeight / 2;
        }

        setScale(newScale);

        // Convert top-left position to percentages (same formula as drag)
        // Use full container dimensions as reference for consistent positioning across layouts
        // x = (percent / 100) * containerWidth
        // percent = (x / containerWidth) * 100
        // Allow values outside 0-100% for extended positioning
        const xPercent = (newTopLeftX / containerWidth) * 100;
        const yPercent = (newTopLeftY / containerHeight) * 100;

        // Don't clamp - allow free movement outside bounds
        setImageState({ x: xPercent, y: yPercent });
      }
    },
    [isDragging, isResizing, activeHandle, coverAreaDims]
  );

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    if (isDragging || isResizing) {
      // Save final position
      // Use x, y percentages directly (same coordinate system as Personalizacja)
      // No inversion needed - these are the actual container coordinates
      onPositionChange({
        x: imageState.x,
        y: imageState.y,
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
    
    return undefined;
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

      // startX and startY are in container coordinates (from getImagePosition)
      // deltaX and deltaY are in cover area coordinates (touch movement relative to cover area)
      // Since cover area starts at (0,0) of container for all layouts, cover area coordinates = container coordinates
      // So we can add them directly
      const newX = dragStartRef.current.startX + deltaX;
      const newY = dragStartRef.current.startY + deltaY;

      // Convert top-left position back to percentages (reverse of getImagePosition)
      // Use full container dimensions as reference for consistent positioning across layouts
      // x = (percent / 100) * containerWidth
      // Solving for percent: percent = (x / containerWidth) * 100
      // Allow values outside 0-100% for extended positioning
      const xPercent = (newX / containerWidth) * 100;
      const yPercent = (newY / containerHeight) * 100;

      // Don't clamp - allow free movement outside bounds
      setImageState({ x: xPercent, y: yPercent });
    },
    [isDragging, coverAreaDims]
  );

  const handleTouchEnd = useCallback(() => {
    if (isDragging) {
      // Use x, y percentages directly (same coordinate system as Personalizacja)
      onPositionChange({
        x: imageState.x,
        y: imageState.y,
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
    
    return undefined;
  }, [isDragging, handleTouchMove, handleTouchEnd]);

  // Update scale when initialPosition changes
  useEffect(() => {
    if (initialPosition?.scale !== undefined) {
      setScale(initialPosition.scale);
    }
  }, [initialPosition?.scale]);

  // Reset image position to default (top-left at 0,0) and scale to 1 when layout changes
  useEffect(() => {
    // With top-left positioning, 0% means top-left corner at (0, 0)
    // For a centered default, we need to calculate based on scale
    // When scale = 1, to center: top-left should be at (coverWidth - scaledWidth) / 2
    // As percentage: ((coverWidth - scaledWidth) / 2) / coverWidth * 100
    // When scale = 1: ((coverWidth - coverWidth) / 2) / coverWidth * 100 = 0%
    // So for scale = 1, 0% actually centers it (since container = cover area)
    // But to have it fill the area nicely, we'll use 0% which positions at top-left
    // For a more centered look, we could use a small offset, but 0% is the simplest default
    setImageState({ x: 0, y: 0 });
    setScale(1);
    setShowTransformBox(true);
    // Reset initialization flag when layout changes
    hasInitializedRef.current = false;
    lastInitialPositionRef.current = undefined;
    // Notify parent of the reset position (0% = top-left)
    onPositionChange({
      x: 0,
      y: 0,
      scale: 1,
    });
  }, [layout, onPositionChange]);

  // Track if we've initialized from initialPosition to avoid resetting during user interaction
  const hasInitializedRef = useRef(false);
  const lastInitialPositionRef = useRef<{ x?: number; y?: number; scale?: number; objectPosition?: string } | undefined>(undefined);
  
  // Update position when initialPosition changes (only on mount or when modal reopens)
  // Don't update during user interaction (dragging/resizing)
  useEffect(() => {
    // Skip if user is currently interacting
    if (isDragging || isResizing) {
      return;
    }
    
    // Check if initialPosition actually changed (not just a reference change)
    const currentPos = initialPosition ? { 
      x: initialPosition.x, 
      y: initialPosition.y, 
      scale: initialPosition.scale,
      objectPosition: initialPosition.objectPosition 
    } : undefined;
    
    const lastPos = lastInitialPositionRef.current;
    const positionChanged = !lastPos || 
      lastPos.x !== currentPos?.x || 
      lastPos.y !== currentPos?.y || 
      lastPos.scale !== currentPos?.scale ||
      lastPos.objectPosition !== currentPos?.objectPosition;
    
    if (!positionChanged && hasInitializedRef.current) {
      return; // Position hasn't changed, skip update
    }
    
    // Use x, y directly if available (new format)
    if (initialPosition?.x !== undefined && initialPosition?.y !== undefined) {
      setImageState({ x: initialPosition.x, y: initialPosition.y });
      // Also update scale if provided
      if (initialPosition.scale !== undefined) {
        setScale(initialPosition.scale);
      }
      hasInitializedRef.current = true;
      lastInitialPositionRef.current = currentPos;
      return;
    }

    // Legacy support: convert from objectPosition
    if (initialPosition?.objectPosition && !hasInitializedRef.current) {
      const match = initialPosition.objectPosition.match(/(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%/);
      if (match) {
        // Invert both X and Y: objectPosition was inverted
        const objectX = parseFloat(match[1]);
        const objectY = parseFloat(match[2]);
        const xPercent = 100 - objectX;
        const yPercent = 100 - objectY;
        setImageState({ x: xPercent, y: yPercent });
        // Also update scale if provided
        if (initialPosition.scale !== undefined) {
          setScale(initialPosition.scale);
        }
        hasInitializedRef.current = true;
        lastInitialPositionRef.current = currentPos;
      }
    }
  }, [initialPosition?.x, initialPosition?.y, initialPosition?.scale, initialPosition?.objectPosition, isDragging, isResizing]);

  const imagePos = getImagePosition();

  // Handle mousedown on form pane - check if click is within image bounds and initiate drag
  const handleFormPaneMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!coverAreaRef.current || !imageRef.current || isDragging || isResizing) return;

      const coverArea = coverAreaRef.current;
      const coverAreaRect = coverArea.getBoundingClientRect();
      
      // Get click position relative to cover area
      const clickX = e.clientX - coverAreaRect.left;
      const clickY = e.clientY - coverAreaRect.top;

      // Calculate image bounds
      const baseImageWidth = coverAreaDims.width;
      const baseImageHeight = coverAreaDims.height;
      const scaledWidth = baseImageWidth * scale;
      const scaledHeight = baseImageHeight * scale;

      const imageLeft = imagePos.x;
      const imageTop = imagePos.y;
      const imageRight = imageLeft + scaledWidth;
      const imageBottom = imageTop + scaledHeight;

      // Check if click is within image bounds
      if (
        clickX >= imageLeft &&
        clickX <= imageRight &&
        clickY >= imageTop &&
        clickY <= imageBottom
      ) {
        // Click is on the image (even though form is on top) - show transform box and start dragging
        e.preventDefault();
        e.stopPropagation();
        
        setShowTransformBox(true);
        setIsDragging(true);
        
        const currentPos = getImagePosition();
        dragStartRef.current = {
          x: clickX,
          y: clickY,
          startX: currentPos.x,
          startY: currentPos.y,
        };
      }
    },
    [imagePos, scale, coverAreaDims, isDragging, isResizing, getImagePosition]
  );

  // Render form pane based on layout
  const renderFormPane = () => {
    const displayName = galleryName || "Galeria";

    switch (layout) {
      case "split":
        return (
          <div 
            className="absolute right-0 top-0 bottom-0 w-[36%] bg-white flex items-center justify-center px-6 py-10 form-pane-overlay"
            onMouseDown={handleFormPaneMouseDown}
          >
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
            onMouseDown={handleFormPaneMouseDown}
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
          <div 
            className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center px-6 py-10 form-pane-overlay z-10"
            onMouseDown={handleFormPaneMouseDown}
          >
            <div className="w-full max-w-md">
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
          <div 
            className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center px-6 py-10 form-pane-overlay z-10"
            onMouseDown={handleFormPaneMouseDown}
          >
            <div className="w-full max-w-md">
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

    // Calculate image bounds - imagePos is now the top-left corner, scaled
    const baseImageWidth = coverAreaDims.width;
    const baseImageHeight = coverAreaDims.height;
    const scaledWidth = baseImageWidth * scale;
    const scaledHeight = baseImageHeight * scale;

    // imagePos is the top-left corner (relative to cover area)
    const left = imagePos.x;
    const top = imagePos.y;
    const right = left + scaledWidth;
    const bottom = top + scaledHeight;

    return (
      <>
        {/* Corner handles */}
        <div
          className={`${handleStyle} cursor-nwse-resize`}
          data-resize-handle
          style={{ left: left - handleSize / 2, top: top - handleSize / 2, zIndex: 9999 }}
          onMouseDown={(e) => handleResizeStart(e, "nw")}
        />
        <div
          className={`${handleStyle} cursor-nesw-resize`}
          data-resize-handle
          style={{ left: right - handleSize / 2, top: top - handleSize / 2, zIndex: 9999 }}
          onMouseDown={(e) => handleResizeStart(e, "ne")}
        />
        <div
          className={`${handleStyle} cursor-nesw-resize`}
          data-resize-handle
          style={{ left: left - handleSize / 2, top: bottom - handleSize / 2, zIndex: 9999 }}
          onMouseDown={(e) => handleResizeStart(e, "sw")}
        />
        <div
          className={`${handleStyle} cursor-nwse-resize`}
          data-resize-handle
          style={{ left: right - handleSize / 2, top: bottom - handleSize / 2, zIndex: 9999 }}
          onMouseDown={(e) => handleResizeStart(e, "se")}
        />

        {/* Edge handles */}
        <div
          className={`${edgeHandleStyle} cursor-ns-resize`}
          data-resize-handle
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
          data-resize-handle
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
          data-resize-handle
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
          data-resize-handle
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
          data-transform-box
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
              transform: `scale(${scale})`,
              width: coverAreaDims.width,
              height: coverAreaDims.height,
              transformOrigin: "top left",
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
            transform: `scale(${scale})`,
            width: coverAreaDims.width,
            height: coverAreaDims.height,
            transformOrigin: "top left",
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
