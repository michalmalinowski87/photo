import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { apiFetch, formatApiError } from '../lib/api';
import { initAuth, getIdToken, signOut, redirectToCognito, getHostedUILogoutUrl } from '../lib/auth';

export default function Wallet() {
	const router = useRouter();
	const [apiUrl, setApiUrl] = useState('');
	const [idToken, setIdToken] = useState('');
	const [balance, setBalance] = useState(null);
	const [transactions, setTransactions] = useState([]);
	const [loading, setLoading] = useState(false);
	const [topUpAmount, setTopUpAmount] = useState(10000); // 100 PLN default
	const [message, setMessage] = useState('');

	useEffect(() => {
		setApiUrl(process.env.NEXT_PUBLIC_API_URL || '');
		
		// Initialize auth with token sharing
		const { initializeAuth, redirectToLandingSignIn } = require('../lib/auth-init');
		initializeAuth(
			(token) => {
				setIdToken(token);
			},
			() => {
				// No token found, redirect to landing sign-in
				redirectToLandingSignIn('/wallet');
			}
		);
	}, []);

	const handleLogout = async () => {
		// Clear all tokens and session data on dashboard domain
		signOut();
		setIdToken('');
		
		// Redirect to Cognito logout endpoint to clear server-side session cookies
		const userPoolDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
		const landingUrl = process.env.NEXT_PUBLIC_LANDING_URL || 'http://localhost:3003';
		const logoutCallbackUrl = `${landingUrl}/auth/logout-callback`;
		
		if (userPoolDomain) {
			// Use helper function to build Cognito logout URL
			const logoutUrl = getHostedUILogoutUrl(userPoolDomain, logoutCallbackUrl);
			window.location.href = logoutUrl;
		} else {
			window.location.href = logoutCallbackUrl;
		}
	};

	async function loadBalance() {
		if (!apiUrl || !idToken) {
			setMessage('Need API URL and ID Token');
			return;
		}
		setLoading(true);
		setMessage('');
		try {
			const { data } = await apiFetch(`${apiUrl}/wallet/balance`, {
				headers: { Authorization: `Bearer ${idToken}` }
			});
			setBalance(data.balanceCents || 0);
			setMessage(''); // Clear any previous errors
		} catch (error) {
			const errorMsg = formatApiError(error);
			setMessage(`Error loading balance: ${errorMsg}`);
			setBalance(null);
		} finally {
			setLoading(false);
		}
	}

	async function loadTransactions() {
		if (!apiUrl || !idToken) {
			setMessage('Need API URL and ID Token');
			return;
		}
		setLoading(true);
		setMessage('');
		try {
			const { data } = await apiFetch(`${apiUrl}/wallet/transactions`, {
				headers: { Authorization: `Bearer ${idToken}` }
			});
			setTransactions(data.transactions || []);
			if (data.transactions && data.transactions.length > 0) {
				setMessage(`Loaded ${data.transactions.length} transaction(s)`);
			} else {
				setMessage('No transactions found');
			}
		} catch (error) {
			const errorMsg = formatApiError(error);
			setMessage(`Error loading transactions: ${errorMsg}`);
			setTransactions([]);
		} finally {
			setLoading(false);
		}
	}

	async function createTopUp() {
		if (!apiUrl || !idToken) {
			setMessage('Need API URL and ID Token');
			return;
		}
		setMessage('');
		try {
			// Get current URL for redirect back to wallet page
			const redirectUrl = typeof window !== 'undefined' 
				? `${window.location.origin}/wallet?payment=success`
				: '';
			
			const { data } = await apiFetch(`${apiUrl}/payments/checkout`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
				body: JSON.stringify({ 
					amountCents: topUpAmount, 
					type: 'wallet_topup',
					redirectUrl: redirectUrl
				})
			});
			if (data.checkoutUrl) {
				window.location.href = data.checkoutUrl;
			} else {
				setMessage('No checkout URL returned');
			}
		} catch (error) {
			setMessage(formatApiError(error));
		}
	}

	useEffect(() => {
		if (apiUrl && idToken) {
			loadBalance();
			loadTransactions();
		}
	}, [apiUrl, idToken]);

	// Check for payment success query parameter
	useEffect(() => {
		if (typeof window !== 'undefined') {
			const params = new URLSearchParams(window.location.search);
			if (params.get('payment') === 'success') {
				setMessage('Payment successful! Your wallet has been topped up.');
				// Reload balance to show updated amount
				if (apiUrl && idToken) {
					loadBalance();
					loadTransactions();
				}
				// Clean up URL
				window.history.replaceState({}, '', window.location.pathname);
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return (
		<div style={{ padding: 24, maxWidth: '100%', boxSizing: 'border-box' }}>
			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
				<h1 style={{ margin: 0 }}>Wallet</h1>
				{idToken && <button onClick={handleLogout} style={{ padding: '8px 16px' }}>Logout</button>}
			</div>
			
			{/* Configuration - Only show if not auto-configured */}
			{(!process.env.NEXT_PUBLIC_API_URL || !idToken) && (
				<div style={{ marginBottom: 16, padding: 16, background: '#f5f5f5', borderRadius: 8 }}>
					<div style={{ marginBottom: 8 }}>
						<label>API URL </label>
						<input style={{ width: '100%', maxWidth: 420 }} value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} />
					</div>
					<div style={{ marginBottom: 8 }}>
						<label>ID Token </label>
						<input style={{ width: '100%', maxWidth: 420 }} value={idToken} onChange={(e) => setIdToken(e.target.value)} placeholder="Auto-filled if logged in" />
						{!idToken && <span style={{ marginLeft: 8, color: '#666' }}>or <a href={`${process.env.NEXT_PUBLIC_LANDING_URL || 'http://localhost:3000'}/auth/sign-in`}>login here</a></span>}
					</div>
				</div>
			)}

			{/* Balance Display */}
			<div style={{ margin: '24px 0', padding: 24, border: '2px solid #0066cc', borderRadius: '8px', background: '#f0f7ff' }}>
				<h2 style={{ margin: '0 0 8px 0' }}>Current Balance</h2>
				{balance !== null ? (
					<div style={{ fontSize: '32px', fontWeight: 'bold', color: '#0066cc' }}>
						{(balance / 100).toFixed(2)} PLN
					</div>
				) : (
					<div style={{ color: '#666' }}>Not loaded</div>
				)}
				<button onClick={loadBalance} disabled={loading || !apiUrl || !idToken} style={{ marginTop: 12, padding: '8px 16px' }}>
					{loading ? 'Loading...' : 'Refresh Balance'}
				</button>
			</div>

			{/* Top Up */}
			<div style={{ margin: '24px 0', padding: 16, border: '1px solid #ddd', borderRadius: '8px' }}>
				<h2 style={{ margin: '0 0 16px 0' }}>Top Up Wallet</h2>
				<div style={{ marginBottom: 12 }}>
					<label>Amount (PLN) </label>
					<input 
						type="number" 
						value={topUpAmount / 100} 
						onChange={(e) => setTopUpAmount(Math.max(1, Math.round(parseFloat(e.target.value) * 100)))} 
						min="1"
						step="1"
						style={{ width: '100%', maxWidth: 200 }}
					/>
					<span style={{ marginLeft: 8, color: '#666' }}>({topUpAmount} cents)</span>
				</div>
				<button onClick={createTopUp} disabled={!apiUrl || !idToken || topUpAmount < 100} style={{ padding: '12px 24px' }}>
					Top Up via Stripe
				</button>
				<p style={{ marginTop: 8, fontSize: '14px', color: '#666' }}>
					Minimum top-up: 1 PLN (100 cents). You will be redirected to Stripe Checkout.
				</p>
			</div>

			{/* Transaction History */}
			<div style={{ margin: '24px 0', padding: 16, border: '1px solid #ddd', borderRadius: '8px' }}>
				<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
					<h2 style={{ margin: 0 }}>Transaction History</h2>
					<button onClick={loadTransactions} disabled={loading || !apiUrl || !idToken} style={{ padding: '8px 16px' }}>
						{loading ? 'Loading...' : 'Refresh'}
					</button>
				</div>
				{transactions.length === 0 && !loading && (
					<p style={{ color: '#666' }}>No transactions yet.</p>
				)}
				{loading && <p>Loading transactions...</p>}
				{transactions.length > 0 && (
					<div style={{ overflowX: 'auto' }}>
						<table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
							<thead>
								<tr style={{ background: '#f5f5f5' }}>
									<th style={{ padding: 8, textAlign: 'left', border: '1px solid #ddd' }}>Date</th>
									<th style={{ padding: 8, textAlign: 'left', border: '1px solid #ddd' }}>Type</th>
									<th style={{ padding: 8, textAlign: 'left', border: '1px solid #ddd' }}>Status</th>
									<th style={{ padding: 8, textAlign: 'right', border: '1px solid #ddd' }}>Amount</th>
									<th style={{ padding: 8, textAlign: 'left', border: '1px solid #ddd' }}>Payment Method</th>
									<th style={{ padding: 8, textAlign: 'left', border: '1px solid #ddd' }}>Composites</th>
									<th style={{ padding: 8, textAlign: 'left', border: '1px solid #ddd' }}>Reference</th>
								</tr>
							</thead>
							<tbody>
								{transactions.map((tx) => {
									const isCredit = tx.type === 'WALLET_TOPUP';
									const isDebit = tx.type === 'WALLET_DEBIT' || tx.type === 'STRIPE_CHECKOUT' || tx.type === 'MIXED' || tx.type === 'REFUND';
									const typeColors = {
										'WALLET_TOPUP': '#00aa00',
										'WALLET_DEBIT': '#cc0000',
										'STRIPE_CHECKOUT': '#0066cc',
										'MIXED': '#ff9800',
										'REFUND': '#9c27b0'
									};
									const statusColors = {
										'PAID': '#00aa00',
										'UNPAID': '#ff9800',
										'CANCELED': '#999',
										'FAILED': '#cc0000',
										'REFUNDED': '#9c27b0'
									};
									
									return (
										<tr key={tx.transactionId || tx.txnId}>
											<td style={{ padding: 8, border: '1px solid #ddd', fontSize: '12px' }}>
												{new Date(tx.createdAt).toLocaleString()}
											</td>
											<td style={{ padding: 8, border: '1px solid #ddd' }}>
												<span style={{ 
													padding: '2px 8px', 
													background: typeColors[tx.type] || '#666', 
													color: 'white', 
													borderRadius: '4px', 
													fontSize: '12px'
												}}>
													{tx.type}
												</span>
											</td>
											<td style={{ padding: 8, border: '1px solid #ddd' }}>
												{tx.status && (
													<span style={{ 
														padding: '2px 8px', 
														background: statusColors[tx.status] || '#666', 
														color: 'white', 
														borderRadius: '4px', 
														fontSize: '11px'
													}}>
														{tx.status}
													</span>
												)}
											</td>
											<td style={{ padding: 8, border: '1px solid #ddd', textAlign: 'right', fontWeight: isCredit ? 'bold' : 'normal' }}>
												<div>
													{isCredit ? '+' : '-'}{(Math.abs(tx.amountCents) / 100).toFixed(2)} PLN
												</div>
												{tx.type === 'MIXED' && tx.walletAmountCents > 0 && tx.stripeAmountCents > 0 && (
													<div style={{ fontSize: '10px', color: '#666', marginTop: 2 }}>
														({(tx.walletAmountCents / 100).toFixed(2)} wallet + {(tx.stripeAmountCents / 100).toFixed(2)} Stripe)
													</div>
												)}
											</td>
											<td style={{ padding: 8, border: '1px solid #ddd', fontSize: '11px' }}>
												{tx.paymentMethod || (isCredit ? 'WALLET' : 'N/A')}
											</td>
											<td style={{ padding: 8, border: '1px solid #ddd', fontSize: '11px' }}>
												{tx.composites && tx.composites.length > 0 ? (
													<div>
														{tx.composites.map((composite, idx) => (
															<div key={idx} style={{ marginBottom: idx < tx.composites.length - 1 ? 4 : 0 }}>
																{composite}
															</div>
														))}
													</div>
												) : (
													<span style={{ color: '#999' }}>-</span>
												)}
											</td>
											<td style={{ padding: 8, border: '1px solid #ddd', fontSize: '11px' }}>
												<code>{tx.refId || tx.transactionId || tx.txnId}</code>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				)}
			</div>

			{message && (
				<div style={{ 
					marginTop: 16, 
					padding: 12, 
					background: message.includes('Error') ? '#fee' : '#efe',
					border: `1px solid ${message.includes('Error') ? '#fcc' : '#cfc'}`,
					borderRadius: 8,
					color: message.includes('Error') ? '#c33' : '#3c3'
				}}>
					{message}
				</div>
			)}
		</div>
	);
}

