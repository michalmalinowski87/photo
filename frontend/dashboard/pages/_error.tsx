import { NextPageContext } from "next";
import { useRouter } from "next/router";
import React from "react";

interface ErrorProps {
  statusCode?: number;
  err?: Error;
}

function Error({ statusCode, err }: ErrorProps) {
  const router = useRouter();

  React.useEffect(() => {
    // Log the error to an error reporting service
    if (err) {
      
    }
  }, [err]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">
          {statusCode ? `Error ${statusCode}` : "An error occurred"}
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          {statusCode === 404
            ? "This page could not be found."
            : "Something went wrong. Please try again later."}
        </p>
        <button
          onClick={() => {
            void router.push("/");
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:opacity-90"
        >
          Go Home
        </button>
      </div>
    </div>
  );
}

Error.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res?.statusCode ?? err?.statusCode ?? 404;
  return {
    statusCode,
    err: err ?? undefined,
  };
};

Error.displayName = "ErrorPage";

export default Error;
