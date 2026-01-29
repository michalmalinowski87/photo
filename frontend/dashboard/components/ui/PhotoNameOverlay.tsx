/**
 * Persistent photo name bar at the bottom of the image.
 * Uses semi-transparent grey background for visibility on any photo colour.
 * Scales with layout: compact padding, small font, truncation with ellipsis when name is too long.
 * Must be placed inside a relative parent (e.g. image wrapper); does not participate in layout.
 */
export function PhotoNameOverlay({
  displayName,
  className = "",
}: {
  displayName: string;
  className?: string;
}) {
  return (
    <div
      className={`absolute bottom-0 left-0 right-0 bg-gray-900/70 px-2 py-1.5 text-xs text-white min-w-0 overflow-hidden text-ellipsis whitespace-nowrap ${className}`}
      title={displayName}
    >
      {displayName || "\u00A0"}
    </div>
  );
}
