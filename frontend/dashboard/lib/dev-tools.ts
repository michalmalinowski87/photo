/**
 * Unified development tools for PhotoCloud dashboard
 * Exposes console commands for testing and development purposes
 * Only available in development mode
 */

import { invalidateSession, triggerSessionExpired } from "./auth";

interface DevToolsNamespace {
  session: {
    invalidate: () => void;
    trigger: () => void;
    help: () => void;
  };
  wizard: {
    open: () => void;
    help: () => void;
  };
  help: () => void;
}

/**
 * Initialize and expose dev tools globally
 * Should be called from _app.tsx in development mode only
 */
export function initDevTools(): void {
  if (typeof window === "undefined" || process.env.NODE_ENV !== "development") {
    return;
  }

  const devTools: DevToolsNamespace = {
    session: {
      invalidate: () => {
        invalidateSession();
        console.log("✅ Session invalidated. Now navigate or refresh to trigger the popup.");
      },
      trigger: () => {
        triggerSessionExpired();
      },
      help: () => {
        console.log(`
🧪 Session Expiration Test Helpers:

1. devTools.session.invalidate()
   - Clears all tokens and Cognito session
   - After this, navigate or refresh the page to trigger the session expired popup

2. devTools.session.trigger()
   - Directly shows the session expired popup (simulates the event)

Example:
  devTools.session.invalidate()
  // Then refresh the page or navigate to trigger API calls
        `);
      },
    },
    wizard: {
      open: () => {
        console.log("🧪 Gallery wizard dev mode: Wizard will be locked open on next open.");
        // Set a flag that AppLayout can read to lock the wizard
        (window as any).__galleryWizardDevLocked = true;
        // Trigger wizard open by dispatching a custom event
        window.dispatchEvent(new CustomEvent("openGalleryWizard"));
      },
      help: () => {
        console.log(`
🧪 Gallery Wizard Dev Helpers:

1. devTools.wizard.open()
   - Opens the gallery creation wizard and locks it (prevents closing)
   - Useful for development and testing the wizard UI
   - Wizard will stay open until you manually close it or refresh the page

Example:
  devTools.wizard.open()
  // Wizard opens and stays on screen for development
        `);
      },
    },
    help: () => {
      console.log(`
🧪 PhotoCloud Development Tools

Available commands:
  devTools.help()              - Show this help message
  devTools.session.help()      - Show session testing helpers
  devTools.session.invalidate()- Invalidate session for testing
  devTools.session.trigger()   - Trigger session expired popup
  devTools.wizard.help()       - Show wizard helpers
  devTools.wizard.open()       - Open gallery wizard (locked)

Quick Examples:
  // Test session expiration
  devTools.session.invalidate()
  
  // Open wizard for development
  devTools.wizard.open()
      `);
    },
  };

  // Expose globally
  (window as any).devTools = devTools;

  // Backward compatibility: Keep old testSessionExpiration for existing scripts/docs
  (window as any).testSessionExpiration = {
    invalidate: devTools.session.invalidate,
    trigger: devTools.session.trigger,
    help: devTools.session.help,
  };

  // Show welcome message
  console.log(
    `%c🧪 PhotoCloud Dev Tools`,
    "color: #10b981; font-weight: bold; font-size: 14px;"
  );
  console.log(
    "Run %cdevTools.help()%c for available commands.",
    "color: #3b82f6; font-weight: bold;",
    "color: inherit;"
  );
}

/**
 * Check if dev tools are available
 */
export function isDevToolsAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    process.env.NODE_ENV === "development" &&
    typeof (window as any).devTools !== "undefined"
  );
}

