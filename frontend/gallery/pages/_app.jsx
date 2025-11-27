import { WebPCompatibilityCheck } from '../../shared-auth/webp-check';

export default function App({ Component, pageProps }) {
	return (
		<WebPCompatibilityCheck>
			<Component {...pageProps} />
		</WebPCompatibilityCheck>
	);
}
