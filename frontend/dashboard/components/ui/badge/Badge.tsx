import { useTheme } from "../../../hooks/useTheme";

type BadgeVariant = "light" | "solid";
type BadgeSize = "sm" | "md";
type BadgeColor = "primary" | "success" | "error" | "warning" | "info" | "light" | "dark";

interface BadgeProps {
  variant?: BadgeVariant; // Light or solid variant
  size?: BadgeSize; // Badge size
  color?: BadgeColor; // Badge color
  startIcon?: React.ReactNode; // Icon at the start
  endIcon?: React.ReactNode; // Icon at the end
  children: React.ReactNode; // Badge content
}

const Badge = ({
  variant = "light",
  color = "primary",
  size = "md",
  startIcon,
  endIcon,
  children,
}: BadgeProps) => {
  const { theme } = useTheme();
  const isDarkMode = theme === "dark";

  const baseStyles =
    "inline-flex items-center px-2.5 py-0.5 justify-center gap-1 rounded-full font-medium whitespace-nowrap";

  // Define size styles
  const sizeStyles = {
    sm: "text-theme-xs", // Smaller padding and font size
    md: "text-sm", // Default padding and font size
  };

  // Define color styles for variants - light theme uses more vibrant colors
  const variants = {
    light: {
      primary: isDarkMode
        ? "bg-photographer-accent/15 text-photographer-accent"
        : "bg-brand-100 text-brand-800 border border-brand-200",
      success: isDarkMode
        ? "bg-success-500/15 text-success-500"
        : "bg-success-100 text-success-800 border border-success-200",
      error: isDarkMode
        ? "bg-error-500/15 text-error-500"
        : "bg-error-100 text-error-800 border border-error-200",
      warning: isDarkMode
        ? "bg-warning-500/15 text-orange-400"
        : "bg-warning-100 text-warning-800 border border-warning-200",
      info: isDarkMode
        ? "bg-blue-light-500/15 text-blue-light-500"
        : "bg-blue-light-100 text-blue-light-800 border border-blue-light-200",
      light: isDarkMode
        ? "bg-white/5 text-white/80"
        : "bg-gray-100 text-gray-900 border border-gray-300",
      dark: isDarkMode
        ? "bg-white/5 text-white"
        : "bg-photographer-accent text-white border border-photographer-accent",
    },
    solid: {
      primary: "bg-brand-500 text-white dark:text-white",
      success: "bg-success-500 text-white dark:text-white",
      error: "bg-error-500 text-white dark:text-white",
      warning: "bg-warning-500 text-white dark:text-white",
      info: "bg-blue-light-500 text-white dark:text-white",
      light: "bg-gray-400 dark:bg-white/5 text-white dark:text-white/80",
      dark: "bg-gray-700 text-white dark:text-white",
    },
  };

  // Get styles based on size and color variant
  const sizeClass = sizeStyles[size];
  const colorStyles = variants[variant][color];

  return (
    <span className={`${baseStyles} ${sizeClass} ${colorStyles}`}>
      {startIcon && <span className="mr-1">{startIcon}</span>}
      {children}
      {endIcon && <span className="ml-1">{endIcon}</span>}
    </span>
  );
};

export default Badge;
