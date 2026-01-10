import Link from "next/link";

import { useTheme } from "../../../hooks/useTheme";
import { Icons } from "../icons";

interface AlertProps {
  variant: "success" | "error" | "warning" | "info"; // Alert type
  title: string; // Title of the alert
  message: string; // Message of the alert
  showLink?: boolean; // Whether to show the "Learn More" link
  linkHref?: string; // Link URL
  linkText?: string; // Link text
}

const Alert = ({
  variant,
  title,
  message,
  showLink = false,
  linkHref = "#",
  linkText = "Dowiedz się więcej",
}: AlertProps) => {
  const { theme } = useTheme();
  const isDarkMode = theme === "dark";

  // Tailwind classes for each variant - light theme uses more vibrant colors
  const variantClasses = {
    success: {
      container: isDarkMode
        ? "border-success-500/30 bg-success-500/50"
        : "border-success-500 bg-success-200",
      icon: isDarkMode ? "text-success-500" : "text-success-700",
    },
    error: {
      container: isDarkMode
        ? "border-error-500/30 bg-error-500/50"
        : "border-error-300 bg-error-100",
      icon: isDarkMode ? "text-error-500" : "text-error-700",
    },
    warning: {
      container: isDarkMode
        ? "border-warning-500/30 bg-warning-500/50"
        : "border-warning-300 bg-warning-100",
      icon: isDarkMode ? "text-warning-500" : "text-warning-700",
    },
    info: {
      container: isDarkMode
        ? "border-blue-light-500/30 bg-blue-light-500/50"
        : "border-blue-light-300 bg-blue-light-100",
      icon: isDarkMode ? "text-blue-light-500" : "text-blue-light-700",
    },
  };

  // Icon for each variant from icons library
  const icons = {
    success: <Icons.success size={24} />,
    error: <Icons.error size={24} />,
    warning: <Icons.warning size={24} />,
    info: <Icons.info size={24} />,
  };

  return (
    <div
      className={`rounded-xl border p-4 ${variantClasses[variant].container} backdrop-blur-0 relative z-10`}
    >
      <div className="flex items-start gap-3 relative z-10">
        <div className={`-mt-0.5 flex-shrink-0 ${variantClasses[variant].icon}`}>
          {icons[variant]}
        </div>

        <div>
          <h4
            className={`mb-1 text-sm font-semibold ${
              isDarkMode ? "text-white/90" : "text-gray-900"
            }`}
          >
            {title}
          </h4>

          <p className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-700"}`}>{message}</p>

          {showLink && (
            <Link
              href={linkHref}
              className={`inline-block mt-3 text-sm font-medium underline ${
                isDarkMode ? "text-gray-400" : "text-gray-700"
              }`}
            >
              {linkText}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
};

export default Alert;
