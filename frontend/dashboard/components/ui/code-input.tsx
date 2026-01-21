import * as React from "react";

import { cn } from "../../utils/cn";

interface CodeInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
  error?: boolean;
}

export const CodeInput: React.FC<CodeInputProps> = ({
  length = 6,
  value,
  onChange,
  autoFocus = false,
  disabled = false,
  error = false,
}) => {
  const inputRefs = React.useRef<(HTMLInputElement | null)[]>([]);
  const [focusedIndex, setFocusedIndex] = React.useState<number>(0);

  // Split value into individual digits
  const digits = value.split("").slice(0, length);
  while (digits.length < length) {
    digits.push("");
  }

  const handleChange = (index: number, newValue: string) => {
    // Only allow digits
    const digit = newValue.replace(/\D/g, "").slice(0, 1);
    if (digit || newValue === "") {
      const newDigits = [...digits];
      newDigits[index] = digit;
      const newCode = newDigits.join("");
      onChange(newCode);

      // Auto-focus next input
      if (digit && index < length - 1) {
        inputRefs.current[index + 1]?.focus();
        setFocusedIndex(index + 1);
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
      setFocusedIndex(index - 1);
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
      setFocusedIndex(index - 1);
    } else if (e.key === "ArrowRight" && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
      setFocusedIndex(index + 1);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (pastedData) {
      onChange(pastedData);
      const nextIndex = Math.min(pastedData.length, length - 1);
      inputRefs.current[nextIndex]?.focus();
      setFocusedIndex(nextIndex);
    }
  };

  React.useEffect(() => {
    if (autoFocus && inputRefs.current[0]) {
      inputRefs.current[0].focus();
      setFocusedIndex(0);
    }
  }, [autoFocus]);

  return (
    <div className="flex items-center justify-center gap-3">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            inputRefs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          onFocus={() => setFocusedIndex(index)}
          disabled={disabled}
          className={cn(
            "w-14 h-14 md:w-16 md:h-16 text-center text-2xl md:text-3xl font-semibold",
            "rounded-lg border-2 transition-all duration-200",
            "bg-background text-foreground",
            "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
            error
              ? "border-red-500 focus:border-red-500 focus:ring-red-500"
              : "border-border focus:border-primary",
            disabled && "opacity-50 cursor-not-allowed",
            focusedIndex === index && !error && "border-primary shadow-md"
          )}
        />
      ))}
    </div>
  );
};
