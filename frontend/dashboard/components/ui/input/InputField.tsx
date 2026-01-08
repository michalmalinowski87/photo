import type React from "react";
import type { FC } from "react";

interface InputProps {
  type?: string;
  id?: string;
  name?: string;
  placeholder?: string;
  value?: string | number;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  className?: string;
  min?: string;
  max?: string;
  step?: number;
  maxLength?: number;
  disabled?: boolean;
  success?: boolean;
  error?: boolean;
  hint?: string;
  errorMessage?: string;
  required?: boolean;
  autoComplete?: string;
  autoFocus?: boolean;
  hideErrorSpace?: boolean;
}

const Input: FC<InputProps> = ({
  type = "text",
  id,
  name,
  placeholder,
  value,
  onChange,
  onBlur,
  className = "",
  min,
  max,
  step,
  maxLength,
  disabled = false,
  success = false,
  error = false,
  hint,
  errorMessage,
  required,
  autoComplete,
  autoFocus,
  hideErrorSpace = false,
}) => {
  let inputClasses = ` h-11 w-full rounded-lg border appearance-none px-4 py-2.5 text-sm shadow-theme-xs placeholder:text-photographer-mutedText focus:outline-hidden focus:ring-3  dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 ${className}`;

  if (disabled) {
    inputClasses += ` text-photographer-mutedText border-photographer-border opacity-40 bg-photographer-elevated cursor-not-allowed dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 opacity-40`;
  } else if (error) {
    inputClasses += `  border-error-500 focus:border-error-300 focus:ring-error-500/20 dark:text-error-400 dark:border-error-500 dark:focus:border-error-800`;
  } else if (success) {
    inputClasses += `  border-success-500 focus:border-success-300 focus:ring-success-500/20 dark:text-success-400 dark:border-success-500 dark:focus:border-success-800`;
  } else {
    inputClasses += ` bg-white text-photographer-text border-photographer-border focus:border-photographer-accent focus:ring-photographer-accent/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-photographer-accent dark:focus:ring-photographer-accent/20`;
  }

  return (
    <div className="relative">
      <input
        type={type}
        id={id}
        name={name}
        placeholder={placeholder}
        value={value ?? ""}
        onChange={onChange}
        onBlur={onBlur}
        min={min}
        max={max}
        step={step}
        maxLength={maxLength}
        disabled={disabled}
        required={required}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        className={inputClasses}
        style={{ minHeight: "44px" }}
        {...(autoComplete === "off" || !autoComplete
          ? { "data-1p-ignore": "true", "data-lpignore": "true" }
          : {})}
      />

      {/* Reserved space for error messages or hints to prevent layout shifts */}
      {!hideErrorSpace && (
        <div className="min-h-[15px] mt-1.5">
          {errorMessage ? (
            <p className="text-xs text-error-500 opacity-70">{errorMessage}</p>
          ) : hint ? (
            <p
              className={`text-xs ${
                error
                  ? "text-error-500"
                  : success
                    ? "text-success-500"
                    : "text-photographer-mutedText dark:text-gray-400"
              }`}
            >
              {hint}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default Input;
