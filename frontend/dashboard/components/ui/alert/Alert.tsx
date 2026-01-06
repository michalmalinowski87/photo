import Link from "next/link";

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
  // Tailwind classes for each variant
  const variantClasses = {
    success: {
      container:
        "border-success-600 bg-success-50 dark:border-success-500/30 dark:bg-success-500/15",
      icon: "text-success-700 dark:text-success-500",
    },
    error: {
      container: "border-error-600 bg-error-50 dark:border-error-500/30 dark:bg-error-500/15",
      icon: "text-error-700 dark:text-error-500",
    },
    warning: {
      container:
        "border-warning-600 bg-warning-50 dark:border-warning-500/30 dark:bg-warning-500/15",
      icon: "text-warning-700 dark:text-warning-500",
    },
    info: {
      container:
        "border-blue-light-600 bg-blue-light-50 dark:border-blue-light-500/30 dark:bg-blue-light-500/15",
      icon: "text-blue-light-700 dark:text-blue-light-500",
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
    <div className={`rounded-xl border p-4 ${variantClasses[variant].container}`}>
      <div className="flex items-start gap-3">
        <div className={`-mt-0.5 flex-shrink-0 ${variantClasses[variant].icon}`}>
          {icons[variant]}
        </div>

        <div>
          <h4 className="mb-1 text-sm font-semibold text-gray-800 dark:text-white/90">{title}</h4>

          <p className="text-sm text-gray-600 dark:text-gray-400">{message}</p>

          {showLink && (
            <Link
              href={linkHref}
              className="inline-block mt-3 text-sm font-medium text-gray-600 underline dark:text-gray-400"
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
