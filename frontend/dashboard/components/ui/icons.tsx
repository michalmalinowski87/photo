import { CheckCircle2, XCircle, AlertTriangle, Info, LucideProps } from "lucide-react";

import { cn } from "../../utils/cn";

/**
 * Centralized icons library for the dashboard
 * Provides consistent icon usage across components
 */
export const Icons = {
  // Toast/Alert icons - inherit color from parent via currentColor
  // flex-shrink-0 prevents icon from shrinking in flex containers
  // Using stroke-current only so icons display as outlines without filled backgrounds
  success: ({ className, ...props }: LucideProps) => (
    <CheckCircle2 {...props} className={cn("flex-shrink-0 stroke-current", className)} strokeWidth={2.5} fill="none" />
  ),
  error: ({ className, ...props }: LucideProps) => (
    <XCircle {...props} className={cn("flex-shrink-0 stroke-current", className)} strokeWidth={2.5} fill="none" />
  ),
  warning: ({ className, ...props }: LucideProps) => (
    <AlertTriangle {...props} className={cn("flex-shrink-0 stroke-current", className)} strokeWidth={2.5} fill="none" />
  ),
  info: ({ className, ...props }: LucideProps) => (
    <Info {...props} className={cn("flex-shrink-0 stroke-current", className)} strokeWidth={2.5} fill="none" />
  ),
};
