/**
 * Provides haptic feedback for button clicks and interactions
 * Uses the Vibration API when available (mobile devices)
 * Note: Visual click effect is handled via CSS (scale transform on :active)
 */
export function hapticFeedback(type: 'light' | 'medium' | 'heavy' = 'light'): void {
  // Visual feedback is handled by CSS (scale transform on :active)
  // Optionally add vibration for mobile devices if desired
  if (typeof window === 'undefined' || !('vibrate' in navigator)) {
    return; // Not available on this device
  }

  // Only use vibration on mobile devices for additional tactile feedback
  if (window.innerWidth <= 768) {
    const patterns = {
      light: 5,      // Very short, light vibration
      medium: 10,    // Short vibration
      heavy: 15,     // Slightly longer vibration
    };

    try {
      navigator.vibrate(patterns[type]);
    } catch (error) {
      // Silently fail if vibration is not supported or blocked
      console.debug('Haptic feedback not available:', error);
    }
  }
}

/**
 * Wrapper for button click handlers that adds haptic feedback
 */
export function withHapticFeedback<T extends (...args: any[]) => any>(
  handler: T,
  type: 'light' | 'medium' | 'heavy' = 'light'
): T {
  return ((...args: Parameters<T>) => {
    hapticFeedback(type);
    return handler(...args);
  }) as T;
}
