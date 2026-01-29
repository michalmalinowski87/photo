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

  const is404 = statusCode === 404;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">{is404 ? "404" : "Oops!"}</h1>
        <h2 className="text-2xl font-semibold mb-4">
          {is404 ? "Page Not Found" : "Something went wrong"}
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          {is404
            ? "The page you are looking for does not exist."
            : "Something went wrong. Please try again later."}
        </p>
        <button
          onClick={() => {
            void router.push("/");
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:opacity-90"
        >
          Go to Dashboard
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
