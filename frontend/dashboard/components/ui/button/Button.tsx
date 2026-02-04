import type { PostHogActionName } from "@photocloud/posthog-types";
import { ReactNode } from "react";

interface ButtonProps {
  children: ReactNode; // Button text or content
  size?: "sm" | "md"; // Button size
  variant?: "primary" | "outline" | "secondary" | "danger"; // Button variant
  startIcon?: ReactNode; // Icon before the text
  endIcon?: ReactNode; // Icon after the text
  onClick?: () => void; // Click handler
  disabled?: boolean; // Disabled state
  className?: string; // Disabled state
  type?: "button" | "submit" | "reset";
  "data-ph-action"?: PostHogActionName; // PostHog action name for tracking
}

const Button = ({
  children,
  size = "md",
  variant = "primary",
  startIcon,
  endIcon,
  onClick,
  className = "",
  disabled = false,
  type = "button",
  "data-ph-action": dataPhAction,
}: ButtonProps) => {
  // Size Classes
  const sizeClasses = {
    sm: "px-5 h-10 text-base",
    md: "px-6 h-12 text-base font-medium",
  };

  // Variant Classes
  const variantClasses = {
    primary:
      "bg-photographer-accent text-white hover:bg-photographer-accentHover disabled:bg-photographer-accentLight",
    outline:
      "bg-photographer-surface text-photographer-heading border border-photographer-accent hover:bg-photographer-accentLight/20 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 dark:hover:bg-white/[0.03] dark:hover:text-gray-300",
    secondary:
      "bg-photographer-surface text-photographer-heading border border-photographer-accent hover:bg-photographer-accentLight/20 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 dark:hover:bg-white/[0.03] dark:hover:text-gray-300",
    danger:
      "bg-photographer-error text-white shadow-theme-xs hover:bg-photographer-error/90 disabled:bg-photographer-error/50 dark:bg-red-600 dark:hover:bg-red-700",
  };

  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-lg transition active:scale-[0.98] ${
        sizeClasses[size]
      } ${variantClasses[variant]} ${disabled ? "cursor-not-allowed opacity-50" : ""} ${className}`}
      onClick={onClick}
      disabled={disabled}
      {...(dataPhAction ? { "data-ph-action": dataPhAction } : {})}
    >
      {startIcon && <span className="flex items-center">{startIcon}</span>}
      {children}
      {endIcon && <span className="flex items-center">{endIcon}</span>}
    </button>
  );
};

export default Button;
