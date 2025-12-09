import Link from "next/link";
import type React from "react";

interface DropdownItemProps {
  tag?: "a" | "button";
  to?: string;
  href?: string;
  onClick?: () => void;
  onItemClick?: () => void;
  baseClassName?: string;
  className?: string;
  disabled?: boolean;
  children: React.ReactNode;
}

export const DropdownItem: React.FC<DropdownItemProps> = ({
  tag = "button",
  to,
  href,
  onClick,
  onItemClick,
  baseClassName = "block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900",
  className = "",
  disabled = false,
  children,
}) => {
  const disabledClasses = disabled
    ? "opacity-50 cursor-not-allowed hover:bg-transparent hover:text-gray-700"
    : "";
  const combinedClasses = `${baseClassName} ${disabledClasses} ${className}`.trim();

  const handleClick = (event: React.MouseEvent) => {
    if (disabled) {
      event.preventDefault();
      return;
    }
    if (tag === "button") {
      event.preventDefault();
    }
    if (onClick) {
      onClick();
    }
    if (onItemClick) {
      onItemClick();
    }
  };

  const linkHref = to ?? href;

  if (tag === "a" && linkHref) {
    return (
      <Link
        href={disabled ? "#" : linkHref}
        className={combinedClasses}
        onClick={handleClick}
        aria-disabled={disabled}
      >
        {children}
      </Link>
    );
  }

  return (
    <button onClick={handleClick} className={combinedClasses} disabled={disabled}>
      {children}
    </button>
  );
};
