"use client";

import { ReactNode } from "react";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
}

export function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div className="pt-[200px] pb-16 px-8 flex flex-col items-center justify-center opacity-40">
      <div className="w-full max-w-2xl py-26 px-20 flex flex-col items-center justify-center space-y-10">
        <div className="text-gray-400 scale-[1.43]">{icon}</div>
        <div className="text-center space-y-5">
          <h3 className="text-[1.95rem] font-medium text-gray-700">
            {title}
          </h3>
          <p className="text-[1.3rem] text-gray-500 leading-relaxed max-w-xl">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}
