import Link from "next/link";
import React from "react";

// Note: This page cannot use getServerSideProps in Next.js
// The build may fail with React 19/Next.js 15 - this is a known compatibility issue
// The page will work at runtime, but static generation may fail
export default function Custom404() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">404</h1>
        <h2 className="text-2xl font-semibold mb-4">Page Not Found</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          The page you are looking for does not exist.
        </p>
        <Link
          href="/"
          className="inline-block px-4 py-2 bg-blue-600 text-white rounded hover:opacity-90"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
