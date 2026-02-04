"use client";

import React from "react";

export function CoverAreaLoading({ text = "Ładowanie okładki…" }: { text?: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-white">
      <div className="flex flex-col items-center justify-center gap-4 opacity-70">
        <div className="text-2xl font-semibold text-gray-900 animate-pulse">PixiProof</div>
        <div className="text-sm text-gray-600">{text}</div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-black rounded-full animate-pulse" style={{ animationDelay: "0s" }} />
          <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse" style={{ animationDelay: "0.2s" }} />
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: "0.4s" }} />
        </div>
      </div>
    </div>
  );
}

