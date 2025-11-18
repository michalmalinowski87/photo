import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

export default function withClientAuth(WrappedComponent) {
	return function AuthenticatedComponent(props) {
		const router = useRouter();
		const { id } = router.query;
		const [token, setToken] = useState('');
		const [clientId, setClientId] = useState('');
		const [galleryName, setGalleryName] = useState('');
		const [checkingAuth, setCheckingAuth] = useState(true);

		useEffect(() => {
			if (!id) return;

			const storedToken = localStorage.getItem(`gallery_token_${id}`);
			const storedName = localStorage.getItem(`gallery_name_${id}`);
			
			if (!storedToken) {
				// No token, redirect to login
				router.replace(`/gallery/login?id=${id}`);
				return;
			}

			// Decode token to get clientId (simple base64 decode of payload)
			try {
				const payload = JSON.parse(atob(storedToken.split('.')[1]));
				setToken(storedToken);
				setClientId(payload.clientId);
				if (storedName) {
					setGalleryName(storedName);
				}
				setCheckingAuth(false);
			} catch (e) {
				// Invalid token, redirect to login
				localStorage.removeItem(`gallery_token_${id}`);
				localStorage.removeItem(`gallery_name_${id}`);
				router.replace(`/gallery/login?id=${id}`);
			}
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
				clientId={clientId}
				galleryId={id}
				galleryName={galleryName}
				mode="client"
			/>
		);
	};
}

