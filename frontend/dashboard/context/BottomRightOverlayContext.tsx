import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";

interface BottomRightOverlayState {
  nextStepsVisible: boolean;
  nextStepsExpanded: boolean;
  nextStepsWidth: number; // Width when expanded
  nextStepsCollapsedWidth: number; // Width when collapsed
  setNextStepsVisible: (visible: boolean) => void;
  setNextStepsExpanded: (expanded: boolean) => void;
  setNextStepsWidth: (width: number) => void;
  setNextStepsCollapsedWidth: (width: number) => void;
}

const BottomRightOverlayContext = createContext<BottomRightOverlayState | null>(null);

interface BottomRightOverlayProviderProps {
  children: ReactNode;
}

export const BottomRightOverlayProvider: React.FC<BottomRightOverlayProviderProps> = ({
  children,
}) => {
  const [nextStepsVisible, setNextStepsVisible] = useState(false);
  const [nextStepsExpanded, setNextStepsExpanded] = useState(true);
  const [nextStepsWidth, setNextStepsWidth] = useState(384); // w-96 = 384px
  const [nextStepsCollapsedWidth, setNextStepsCollapsedWidth] = useState(64); // w-16 = 4rem = 64px

  return (
    <BottomRightOverlayContext.Provider
      value={{
        nextStepsVisible,
        nextStepsExpanded,
        nextStepsWidth,
        nextStepsCollapsedWidth,
        setNextStepsVisible,
        setNextStepsExpanded,
        setNextStepsWidth,
        setNextStepsCollapsedWidth,
      }}
    >
      {children}
    </BottomRightOverlayContext.Provider>
  );
};

export const useBottomRightOverlay = (): BottomRightOverlayState | null => {
  return useContext(BottomRightOverlayContext);
};

export const useBottomRightOverlayRequired = (): BottomRightOverlayState => {
  const context = useContext(BottomRightOverlayContext);
  if (!context) {
    throw new Error("useBottomRightOverlayRequired must be used within BottomRightOverlayProvider");
  }
  return context;
};

