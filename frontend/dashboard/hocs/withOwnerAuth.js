import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { initAuth, getIdToken } from '../lib/auth';

export default function withOwnerAuth(WrappedComponent) {
	return function AuthenticatedComponent(props) {
		const router = useRouter();
		const { id } = router.query;
		const [token, setToken] = useState('');
		const [ownerId, setOwnerId] = useState('');
		const [checkingAuth, setCheckingAuth] = useState(true);

		useEffect(() => {
			if (!id) return;

			// Initialize auth and get Cognito token
			const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
			const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
			
			if (!userPoolId || !clientId) {
				router.replace('/login');
				return;
			}

			initAuth(userPoolId, clientId);
			
			getIdToken()
				.then((cognitoToken) => {
					// Decode token to get owner ID
					try {
						const payload = JSON.parse(atob(cognitoToken.split('.')[1]));
						setToken(cognitoToken);
						setOwnerId(payload.sub || payload['cognito:username'] || '');
						setCheckingAuth(false);
					} catch (e) {
						console.error('Failed to decode Cognito token:', e);
						router.replace('/login');
					}
				})
				.catch(() => {
					// No valid session, check localStorage for manual token
					const stored = localStorage.getItem('idToken');
					if (stored) {
						try {
							const payload = JSON.parse(atob(stored.split('.')[1]));
							setToken(stored);
							setOwnerId(payload.sub || payload['cognito:username'] || '');
							setCheckingAuth(false);
						} catch (e) {
							router.replace('/login');
						}
					} else {
						router.replace('/login');
					}
				});
		}, [id, router]);

		if (checkingAuth) {
			return (
				<div style={{ padding: 24, textAlign: 'center' }}>
					<div>Loading...</div>
				</div>
			);
		}

		return (
			<WrappedComponent
				{...props}
				token={token}
				ownerId={ownerId}
				galleryId={id}
				mode="owner"
			/>
		);
	};
}

