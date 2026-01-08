"use client";

import { Eye, EyeOff, Check, X } from "lucide-react";
import React, { useMemo, useState, useEffect } from "react";

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
    color: "var(--error)",
    bgColor: "var(--error-light)",
    textColor: "var(--error)",
  },
  fair: {
    label: "Słabe",
    color: "var(--caution)",
    bgColor: "var(--caution-light)",
    textColor: "var(--caution)",
  },
  good: {
    label: "Dobre",
    color: "var(--caution)",
    bgColor: "var(--caution-light)",
    textColor: "var(--caution)",
  },
  strong: {
    label: "Silne",
    color: "var(--success)",
    bgColor: "var(--success-light)",
    textColor: "var(--success)",
  },
};

export const PasswordStrengthValidator: React.FC<PasswordStrengthValidatorProps> = ({
  password,
  minLength = 8,
  onStrengthChange,
  className = "",
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
    <div className={`space-y-3 ${className}`} style={{ marginTop: '12px' }}>
      {/* Strength Meter */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span style={{ color: 'var(--dark-3)' }}>Siła hasła</span>
          <span className="font-medium" style={{ color: config.textColor }}>
            {config.label}
          </span>
        </div>

        {/* Progress Bar Container */}
        <div className="relative">
          {/* Background Track */}
          <div
            className="h-2 rounded-full overflow-hidden relative"
            style={{
              backgroundColor: 'var(--gray-4)',
            }}
          >
            {/* Strength Fill */}
            <div
              className="h-full transition-all duration-300 ease-out rounded-full"
              style={{
                width: `${strengthResult.score}%`,
                backgroundColor: config.color,
              }}
            />
          </div>
        </div>
      </div>

      {/* Requirements Checklist */}
      <div className="space-y-1.5">
        {requirements.map((req) => (
          <div
            key={req.key}
            className="flex items-center gap-2 text-xs transition-colors"
          >
            {req.met ? (
              <Check
                className="w-3.5 h-3.5 flex-shrink-0"
                style={{ color: 'var(--success)' }}
                strokeWidth={2.5}
              />
            ) : (
              <X
                className="w-3.5 h-3.5 flex-shrink-0"
                style={{ color: 'var(--error)' }}
                strokeWidth={2.5}
              />
            )}
            <span
              style={{
                color: req.met ? 'var(--dark-2)' : 'var(--dark-3)',
              }}
            >
              {req.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

interface PasswordInputWithStrengthProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
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
      className = "",
      ...inputProps
    },
    ref
  ) => {
    const [showPassword, setShowPassword] = useState(false);

    return (
      <div>
        {/* Password Input */}
        <div className="relative">
          <input
            ref={ref}
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            className={className}
            style={{
              paddingRight: showToggle ? '40px' : undefined,
              width: '100%',
            }}
            {...inputProps}
          />
          {showToggle && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors focus:outline-none"
              style={{
                color: 'var(--dark-3)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--dark-2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--dark-3)';
              }}
              aria-label={showPassword ? "Ukryj hasło" : "Pokaż hasło"}
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          )}
        </div>

        {/* Password Strength Validator */}
        {password && (
          <PasswordStrengthValidator
            password={password}
            minLength={minLength}
            onStrengthChange={onStrengthChange}
          />
        )}
      </div>
    );
  }
);

PasswordInputWithStrength.displayName = "PasswordInputWithStrength";

interface PasswordInputWithToggleProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  value: string;
  onValueChange: (value: string) => void;
  showToggle?: boolean;
}

export const PasswordInputWithToggle: React.FC<PasswordInputWithToggleProps> = ({
  value,
  onValueChange,
  showToggle = true,
  className = "",
  ...inputProps
}) => {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="relative">
      <input
        type={showPassword ? "text" : "password"}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className={className}
        style={{
          paddingRight: showToggle ? '40px' : undefined,
          width: '100%',
        }}
        {...inputProps}
      />
      {showToggle && (
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors focus:outline-none"
          style={{
            color: 'var(--dark-3)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--dark-2)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--dark-3)';
          }}
          aria-label={showPassword ? "Ukryj hasło" : "Pokaż hasło"}
        >
          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      )}
    </div>
  );
};

