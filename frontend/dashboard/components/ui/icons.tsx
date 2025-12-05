import { CheckCircle2, XCircle, AlertTriangle, Info, LucideProps } from "lucide-react";

/**
 * Centralized icons library for the dashboard
 * Provides consistent icon usage across components
 */
export const Icons = {
  // Toast/Alert icons
  success: (props: LucideProps) => <CheckCircle2 {...props} className="fill-current" />,
  error: (props: LucideProps) => <XCircle {...props} className="fill-current" />,
  warning: (props: LucideProps) => <AlertTriangle {...props} className="fill-current" />,
  info: (props: LucideProps) => <Info {...props} className="fill-current" />,
};
