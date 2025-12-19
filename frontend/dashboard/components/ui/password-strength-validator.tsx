import { Eye, EyeOff, Check, X } from "lucide-react";
import React, { useMemo, useState, useEffect } from "react";

import { cn } from "../../utils/cn";

export interface PasswordRequirements {
  minLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  hasSpecialChar: boolean;
}

export interface PasswordStrengthResult {
  strength: "weak" | "fair" | "good" | "strong";
  score: number; // 0-100
  requirements: PasswordRequirements;
  meetsMinimum: boolean;
}

interface PasswordStrengthValidatorProps {
  password: string;
  minLength?: number;
  onStrengthChange?: (result: PasswordStrengthResult) => void;
  showToggle?: boolean;
  className?: string;
}

const calculatePasswordStrength = (
  password: string,
  minLength: number = 8
): PasswordStrengthResult => {
  const requirements: PasswordRequirements = {
    minLength: password.length >= minLength,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
  };

  // Calculate score based on requirements and length
  let score = 0;
  const requirementCount = Object.values(requirements).filter(Boolean).length;
  const totalRequirements = 5;

  // Base score from requirements (60% weight)
  score += (requirementCount / totalRequirements) * 60;

  // Length bonus (40% weight)
  if (password.length >= minLength) {
    const lengthBonus = Math.min((password.length - minLength) / 12, 1) * 40;
    score += lengthBonus;
  }

  // Determine strength level
  let strength: "weak" | "fair" | "good" | "strong";
  if (score < 40) {
    strength = "weak";
  } else if (score < 60) {
    strength = "fair";
  } else if (score < 80) {
    strength = "good";
  } else {
    strength = "strong";
  }

  const meetsMinimum = requirements.minLength && requirementCount >= 3;

  return {
    strength,
    score: Math.min(Math.round(score), 100),
    requirements,
    meetsMinimum,
  };
};

const strengthConfig = {
  weak: {
    label: "Słabe",
    color: "bg-red-500",
    textColor: "text-red-500",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/30",
  },
  fair: {
    label: "Słabe",
    color: "bg-orange-500",
    textColor: "text-orange-500",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/30",
  },
  good: {
    label: "Dobre",
    color: "bg-yellow-500",
    textColor: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
    borderColor: "border-yellow-500/30",
  },
  strong: {
    label: "Silne",
    color: "bg-green-500",
    textColor: "text-green-500",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/30",
  },
};

export const PasswordStrengthValidator: React.FC<PasswordStrengthValidatorProps> = ({
  password,
  minLength = 8,
  onStrengthChange,
  className,
}) => {
  const strengthResult = useMemo(
    () => calculatePasswordStrength(password, minLength),
    [password, minLength]
  );

  useEffect(() => {
    if (onStrengthChange) {
      onStrengthChange(strengthResult);
    }
  }, [strengthResult, onStrengthChange]);

  const config = strengthConfig[strengthResult.strength];

  const requirements = [
    {
      key: "minLength" as keyof PasswordRequirements,
      label: `Co najmniej ${minLength} znaków`,
      met: strengthResult.requirements.minLength,
    },
    {
      key: "hasUppercase" as keyof PasswordRequirements,
      label: "Wielka litera",
      met: strengthResult.requirements.hasUppercase,
    },
    {
      key: "hasLowercase" as keyof PasswordRequirements,
      label: "Mała litera",
      met: strengthResult.requirements.hasLowercase,
    },
    {
      key: "hasNumber" as keyof PasswordRequirements,
      label: "Cyfra",
      met: strengthResult.requirements.hasNumber,
    },
    {
      key: "hasSpecialChar" as keyof PasswordRequirements,
      label: "Znak specjalny",
      met: strengthResult.requirements.hasSpecialChar,
    },
  ];

  if (!password) {
    return null;
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Strength Meter */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Siła hasła</span>
          <span className={cn("font-medium", config.textColor)}>{config.label}</span>
        </div>

        {/* Progress Bar Container */}
        <div className="relative">
          {/* Background Track */}
          <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden relative">
            {/* Strength Fill */}
            <div
              className={cn(
                "h-full transition-all duration-300 ease-out rounded-full",
                config.color
              )}
              style={{ width: `${strengthResult.score}%` }}
            />
          </div>
        </div>
      </div>

      {/* Requirements Checklist */}
      <div className="space-y-1.5">
        {requirements.map((req) => (
          <div key={req.key} className="flex items-center gap-2 text-xs transition-colors">
            {req.met ? (
              <Check
                className="w-3.5 h-3.5 flex-shrink-0 !text-green-500"
                stroke="#22c55e"
                strokeWidth={2.5}
              />
            ) : (
              <X
                className="w-3.5 h-3.5 flex-shrink-0 !text-red-500"
                stroke="#ef4444"
                strokeWidth={2.5}
              />
            )}
            <span className={cn(req.met ? "text-foreground" : "text-muted-foreground")}>
              {req.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

interface PasswordInputWithStrengthProps extends React.InputHTMLAttributes<HTMLInputElement> {
  password: string;
  onPasswordChange: (value: string) => void;
  minLength?: number;
  showToggle?: boolean;
  onStrengthChange?: (result: PasswordStrengthResult) => void;
}

export const PasswordInputWithStrength = React.forwardRef<
  HTMLInputElement,
  PasswordInputWithStrengthProps
>(
  (
    {
      password,
      onPasswordChange,
      minLength = 8,
      showToggle = true,
      onStrengthChange,
      className,
      ...inputProps
    },
    ref
  ) => {
    const [showPassword, setShowPassword] = useState(false);

    return (
      <>
        {/* Password Input */}
        <div className="relative">
          <input
            ref={ref}
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            className={cn(
              "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-300",
              className
            )}
            {...inputProps}
          />
          {showToggle && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors focus:outline-none"
              aria-label={showPassword ? "Ukryj hasło" : "Pokaż hasło"}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          )}
        </div>

        {/* Mobile: Show below input */}
        {password && (
          <div className="mt-4 md:hidden">
            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <PasswordStrengthValidator
                password={password}
                minLength={minLength}
                onStrengthChange={onStrengthChange}
                showToggle={false}
              />
            </div>
          </div>
        )}
      </>
    );
  }
);

PasswordInputWithStrength.displayName = "PasswordInputWithStrength";

interface PasswordInputWithToggleProps extends React.InputHTMLAttributes<HTMLInputElement> {
  value: string;
  onValueChange: (value: string) => void;
  showToggle?: boolean;
}

export const PasswordInputWithToggle: React.FC<PasswordInputWithToggleProps> = ({
  value,
  onValueChange,
  showToggle = true,
  className,
  ...inputProps
}) => {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="relative">
      <input
        type={showPassword ? "text" : "password"}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-300",
          className
        )}
        {...inputProps}
      />
      {showToggle && (
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors focus:outline-none"
          aria-label={showPassword ? "Ukryj hasło" : "Pokaż hasło"}
        >
          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      )}
    </div>
  );
};
