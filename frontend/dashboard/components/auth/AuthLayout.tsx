import React, { useEffect } from 'react';

interface AuthLayoutProps {
	children: React.ReactNode;
}

/**
 * AuthLayout - Wrapper for authentication pages (login, sign-up, verify-email)
 * Uses the landing page template structure to match the website design
 * Note: auth.css is imported in _app.tsx for auth routes
 * ALWAYS forces dark mode - dashboard theme should NEVER affect auth pages
 */
export default function AuthLayout({ children }: AuthLayoutProps) {
	useEffect(() => {
		// Force dark mode by removing 'dark' class and adding 'auth-dark' class
		const htmlElement = document.documentElement;
		const bodyElement = document.body;
		
		// Remove any theme classes that might interfere
		htmlElement.classList.remove('dark', 'light');
		bodyElement.classList.remove('dark', 'light');
		
		// Add auth-specific class to ensure dark mode
		htmlElement.classList.add('auth-dark');
		bodyElement.classList.add('auth-dark');
		
		// Force dark background
		htmlElement.style.backgroundColor = 'hsl(0 0% 3.9%)';
		bodyElement.style.backgroundColor = 'hsl(0 0% 3.9%)';
		bodyElement.style.color = 'hsl(0 0% 98%)';
		
		// Cleanup: remove auth classes when navigating away
		return () => {
			htmlElement.classList.remove('auth-dark');
			bodyElement.classList.remove('auth-dark');
			htmlElement.style.backgroundColor = '';
			bodyElement.style.backgroundColor = '';
			bodyElement.style.color = '';
		};
	}, []);

	return (
		<div className="auth-layout min-h-screen bg-background text-foreground antialiased" style={{ backgroundColor: 'hsl(0 0% 3.9%)', color: 'hsl(0 0% 98%)' }}>
			{children}
		</div>
	);
}

