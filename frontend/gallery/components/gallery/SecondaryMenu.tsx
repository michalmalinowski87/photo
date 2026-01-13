"use client";

import { useState, useRef, useEffect } from "react";

export function SecondaryMenu() {
  const [activeItem, setActiveItem] = useState<string | null>("wybor");
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [indicatorStyle, setIndicatorStyle] = useState<{ left: number; width: number } | null>(null);
  const buttonRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});

  const menuItems = [
    { id: "wybor", label: "WYBÓR ZDJĘĆ" },
  ];

  const handleItemClick = (itemId: string) => {
    setActiveItem(itemId);
  };

  const handleItemHover = (itemId: string | null) => {
    setHoveredItem(itemId);
  };

  // Determine which item should show the indicator (hover takes precedence over active)
  const getIndicatorItem = () => {
    return hoveredItem || activeItem;
  };

  // Update indicator position when active/hovered item changes
  useEffect(() => {
    const indicatorItemId = getIndicatorItem();
    if (!indicatorItemId) {
      setIndicatorStyle(null);
      return;
    }

    const button = buttonRefs.current[indicatorItemId];
    const container = button?.closest('.menu-container');
    
    if (button && container) {
      const containerRect = container.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      
      setIndicatorStyle({
        left: buttonRect.left - containerRect.left,
        width: buttonRect.width,
      });
    }
  }, [activeItem, hoveredItem]);

  return (
    <nav className="w-full bg-white relative">
      {/* Separator line at the top with indicator inside */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gray-200 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
        {indicatorStyle && (
          <div
            className="absolute top-0 h-full bg-gray-400 opacity-60 transition-all duration-200"
            style={{
              left: `${indicatorStyle.left}px`,
              width: `${indicatorStyle.width}px`,
            }}
          />
        )}
      </div>
      <div className="w-full mx-auto px-8 md:px-12 lg:px-16 menu-container">
        <div className="flex items-center gap-8 md:gap-12 relative">
          {menuItems.map((item) => {
            const isActive = activeItem === item.id;
            const isHovered = hoveredItem === item.id;
            
            return (
              <button
                key={item.id}
                ref={(el) => {
                  buttonRefs.current[item.id] = el;
                }}
                onClick={() => handleItemClick(item.id)}
                onMouseEnter={() => handleItemHover(item.id)}
                onMouseLeave={() => handleItemHover(null)}
                className="relative py-4 uppercase text-sm transition-all"
                style={{
                  color: isActive || isHovered ? "#666666" : "#AAAAAA",
                  fontWeight: isActive || isHovered ? "700" : "500",
                  letterSpacing: "0.05em",
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
