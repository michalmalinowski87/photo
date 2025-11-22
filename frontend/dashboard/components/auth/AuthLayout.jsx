import React from 'react';

/**
 * AuthLayout - Wrapper for authentication pages (login, sign-up, verify-email)
 * Uses the landing page template structure to match the website design
 * Note: auth.css is imported in _app.js for auth routes
 */
export default function AuthLayout({ children }) {
	return (
		<div className="auth-layout min-h-screen bg-background text-foreground antialiased">
			{children}
		</div>
	);
}

