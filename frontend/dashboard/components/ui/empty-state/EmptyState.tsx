import { ReactNode } from "react";

import Button from "../button/Button";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  actionButton?: {
    label: string;
    onClick: () => void;
    icon?: ReactNode;
  };
  processExplanation?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  actionButton,
  processExplanation,
}: EmptyStateProps) {
  return (
    <div className="pt-[200px] pb-16 px-8 flex flex-col items-center justify-center opacity-40">
      <div className="w-full max-w-2xl py-26 px-20 flex flex-col items-center justify-center space-y-10">
        <div className="text-photographer-mutedText dark:text-gray-500 scale-[1.43]">{icon}</div>
        <div className="text-center space-y-5">
          <h3 className="text-[1.95rem] font-medium text-photographer-heading dark:text-white">{title}</h3>
          <p className="text-[1.3rem] text-photographer-mutedText dark:text-gray-400 leading-relaxed max-w-xl">
            {description}
          </p>
          {processExplanation && (
            <p className="text-base text-photographer-mutedText dark:text-gray-500 mt-8 pt-8">
              {processExplanation}
            </p>
          )}
        </div>
        {actionButton && (
          <div className="pt-2">
            <Button
              variant="outline"
              size="md"
              onClick={actionButton.onClick}
              startIcon={actionButton.icon}
              className="opacity-90 hover:opacity-100 scale-[1.3]"
            >
              {actionButton.label}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
