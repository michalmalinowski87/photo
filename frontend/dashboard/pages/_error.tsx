import React from 'react';
import { useRouter } from 'next/router';
import { NextPageContext } from 'next';

interface ErrorProps {
	statusCode?: number;
}

function Error({ statusCode }: ErrorProps) {
	const router = useRouter();

	return (
		<div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground">
			<div className="text-center">
				<h1 className="text-4xl font-bold mb-4">
					{statusCode ? `Error ${statusCode}` : 'An error occurred'}
				</h1>
				<p className="text-muted-foreground mb-6">
					{statusCode === 404
						? 'This page could not be found.'
						: 'Something went wrong. Please try again later.'}
				</p>
				<button
					onClick={() => router.push('/')}
					className="px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90"
				>
					Go Home
				</button>
			</div>
		</div>
	);
}

Error.getInitialProps = ({ res, err }: NextPageContext) => {
	const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
	return { statusCode };
};

export default Error;

