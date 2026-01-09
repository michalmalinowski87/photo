import { useState, useEffect, useRef } from "react";
import type React from "react";
import type { FC } from "react";

interface TypeformInputProps {
  type?: string;
  id?: string;
  name?: string;
  placeholder?: string;
  value?: string | number;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
  className?: string;
  containerClassName?: string;
  errorContainerClassName?: string;
  inputClassName?: string;
  min?: string;
  max?: string;
  step?: number;
  disabled?: boolean;
  error?: boolean;
  errorMessage?: string;
  required?: boolean;
  autoComplete?: string;
  autoFocus?: boolean;
  label?: string;
  hint?: string;
  maxLength?: number;
}

/**
 * Floating label input with Material Design-style underline
 * Label animates smoothly above the input when focused or has value
 */
const TypeformInput: FC<TypeformInputProps> = ({
  type = "text",
  id,
  name,
  placeholder = "Type your answer here...",
  value,
  onChange,
  onBlur,
  onFocus,
  className = "",
  containerClassName = "",
  errorContainerClassName = "",
  inputClassName = "",
  min,
  max,
  step,
  disabled = false,
  error = false,
  errorMessage,
  required,
  autoComplete,
  autoFocus,
  label,
  hint,
  maxLength,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasValue = value !== undefined && value !== null && value !== "";

  // Determine if label should be floating
  const isLabelFloating = isFocused || hasValue;

  // Generate unique ID if not provided
  const inputId = id ?? `floating-input-${name ?? Math.random().toString(36).substr(2, 9)}`;

  // Use label if provided, otherwise use placeholder as the floating label
  const labelText = label ?? placeholder;
  // When label is provided, use placeholder as the actual placeholder text; otherwise empty
  const actualPlaceholder = label ? placeholder : "";

  // Handle focus events
  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    onFocus?.(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);
    onBlur?.(e);
  };

  // Auto-focus handling
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
      setIsFocused(true);
    }
  }, [autoFocus]);

  return (
    <div className={`relative w-full ${containerClassName}`}>
      <div className="relative">
        {/* Floating Label */}
        <label
          htmlFor={inputId}
          className={`
            absolute left-0 pointer-events-none
            transition-all duration-300 ease-in-out
            origin-left
            ${
              isLabelFloating
                ? "top-0 text-sm scale-90 -translate-y-0 text-photographer-mutedText dark:text-gray-400"
                : "top-6 text-lg scale-100 translate-y-0 text-photographer-mutedText dark:text-gray-500"
            }
            ${error ? "text-error-500 dark:text-error-400" : ""}
            ${disabled ? "opacity-50" : ""}
          `}
        >
          {labelText}
          {required && <span className="text-error-500 ml-1">*</span>}
        </label>

        {/* Input Field */}
        <input
          ref={inputRef}
          type={type}
          id={inputId}
          name={name}
          placeholder={isLabelFloating ? actualPlaceholder : ""}
          value={value ?? ""}
          onChange={onChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          required={required}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          maxLength={maxLength}
          {...(autoComplete === "off" ? { "data-1p-ignore": "true" } : {})}
          style={{
            WebkitBoxShadow: "0 0 0 1000px transparent inset",
            WebkitTextFillColor: "inherit",
            boxShadow: "0 0 0 1000px transparent inset",
            backgroundColor: "transparent",
            caretColor: "inherit", // Caret color matches text color
            transition: "background-color 5000s ease-in-out 0s, color 5000s ease-in-out 0s",
          }}
          className={`
            w-full bg-transparent dark:bg-gray-900
            border-0 border-b-2
            pb-2 pt-6
            px-0
            text-lg font-medium
            text-photographer-text dark:text-white
            placeholder:text-transparent
            focus:outline-none focus:ring-0
            transition-colors duration-200
            disabled:opacity-50 disabled:cursor-not-allowed
            ${
              error
                ? "border-error-500 dark:border-error-400 focus:border-error-500 dark:focus:border-error-400"
                : "border-photographer-border dark:border-gray-600 focus:border-photographer-accent dark:focus:border-photographer-accent"
            }
            ${inputClassName}
            ${className}
          `}
        />

        {/* Underline accent (optional, for focus state) */}
        {!error && (
          <div
            className={`
              absolute bottom-0 left-0 h-0.5 bg-photographer-accent dark:bg-photographer-accentLight
              transition-all duration-300 ease-in-out
              ${isFocused ? "w-full opacity-100" : "w-0 opacity-0"}
            `}
          />
        )}
      </div>

      {/* Reserved space for error messages and helper text to prevent layout shifts */}
      <div className={`min-h-[15px] mt-3 ${errorContainerClassName}`}>
        {errorMessage ? (
          <p className="text-sm text-error-500 dark:text-error-400">{errorMessage}</p>
        ) : hint ? (
          <p className="text-xs text-photographer-mutedText dark:text-gray-400">{hint}</p>
        ) : null}
      </div>
    </div>
  );
};

export default TypeformInput;
