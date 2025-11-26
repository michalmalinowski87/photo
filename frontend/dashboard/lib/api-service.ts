import { getValidToken } from './api';

/**
 * API Service - Centralized API client with automatic authentication, validation, and error handling
 * 
 * Usage:
 *   import api, { formatApiError } from './lib/api-service';
 *   const galleries = await api.galleries.list();
 *   const gallery = await api.galleries.get(galleryId);
 *   await api.galleries.create(data);
 */

interface ApiError extends Error {
	status?: number;
	body?: any;
	refreshFailed?: boolean;
	originalError?: Error;
}

interface PaginationParams {
	limit?: string | number;
	offset?: string | number;
	lastKey?: string;
	page?: string | number;
	itemsPerPage?: string | number;
	search?: string;
	excludeDeliveryStatus?: string;
}

interface Gallery {
	galleryId: string;
	name?: string;
	clientEmail?: string;
	pricingPackage?: any;
	[key: string]: any;
}

interface Client {
	clientId: string;
	email?: string;
	firstName?: string;
	lastName?: string;
	phone?: string;
	isCompany?: boolean;
	companyName?: string;
	nip?: string;
	[key: string]: any;
}

interface Package {
	packageId: string;
	name?: string;
	includedPhotos?: number;
	pricePerExtraPhoto?: number;
	price?: number;
	[key: string]: any;
}

interface Order {
	orderId: string;
	galleryId: string;
	[key: string]: any;
}

interface ListResponse<T> {
	items: T[];
	hasMore?: boolean;
	lastKey?: string | null;
}

class ApiService {
	private baseUrl: string | null = null;

	constructor() {
		this.initialize();
	}

	private initialize(): void {
		if (typeof window !== 'undefined') {
			this.baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
		}
	}

	/**
	 * Internal method to make authenticated API requests
	 * Handles token fetching, error parsing, and response handling
	 */
	private async _request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
		if (!this.baseUrl) {
			throw new Error('API URL not configured');
		}

		const url = `${this.baseUrl}${endpoint}`;
		
		// Get valid token (will refresh if needed)
		const token = await getValidToken();
		
		const defaultHeaders: HeadersInit = {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${token}`,
		};

		const config: RequestInit = {
			...options,
			headers: {
				...defaultHeaders,
				...options.headers,
			},
		};

		try {
			const response = await fetch(url, config);
			const contentType = response.headers.get('content-type');
			const isJson = contentType?.includes('application/json') ?? false;
			
			let body: any;
			try {
				body = isJson ? await response.json() : await response.text();
			} catch (e) {
				body = null;
			}

			// Handle 401 - try refresh and retry once
			if (response.status === 401 && typeof window !== 'undefined') {
				try {
					const newToken = await getValidToken();
					const retryConfig: RequestInit = {
						...config,
						headers: {
							...config.headers,
							'Authorization': `Bearer ${newToken}`,
						},
					};
					
					const retryResponse = await fetch(url, retryConfig);
					const retryContentType = retryResponse.headers.get('content-type');
					const retryIsJson = retryContentType?.includes('application/json') ?? false;
					
					let retryBody: any;
					try {
						retryBody = retryIsJson ? await retryResponse.json() : await retryResponse.text();
					} catch (e) {
						retryBody = null;
					}

					if (!retryResponse.ok) {
						const error: ApiError = new Error(retryBody?.error || retryBody?.message || `HTTP ${retryResponse.status}`);
						error.status = retryResponse.status;
						error.body = retryBody;
						throw error;
					}

					return retryBody;
				} catch (refreshErr) {
					// Refresh failed - trigger session expired event
					if (typeof window !== 'undefined') {
						window.dispatchEvent(new CustomEvent('session-expired', {
							detail: { returnUrl: window.location.pathname + window.location.search }
						}));
					}
					
					const error: ApiError = new Error('Session expired. Please log in again.');
					error.status = 401;
					error.body = body;
					error.refreshFailed = true;
					throw error;
				}
			}

			if (!response.ok) {
				const error: ApiError = new Error(body?.error || body?.message || `HTTP ${response.status}: ${response.statusText}`);
				error.status = response.status;
				error.body = body;
				throw error;
			}

			return body;
		} catch (error) {
			if ((error as ApiError).status) {
				throw error;
			}
			// Network or other errors
			const networkError: ApiError = new Error(`Network error: ${(error as Error).message}`);
			networkError.originalError = error as Error;
			throw networkError;
		}
	}

	/**
	 * Format error for display
	 */
	formatError(error: ApiError | Error): string {
		const apiError = error as ApiError;
		if (apiError.status) {
			const bodyStr = typeof apiError.body === 'string' ? apiError.body : JSON.stringify(apiError.body);
			return apiError.message || `Error ${apiError.status}${bodyStr ? ` - ${bodyStr}` : ''}`;
		}
		return error.message || 'An unexpected error occurred';
	}

	// ==================== GALLERIES ====================

	galleries = {
		/**
		 * List all galleries
		 */
		list: async (): Promise<ListResponse<Gallery> | Gallery[]> => {
			return await this._request('/galleries');
		},

		/**
		 * Get a specific gallery
		 */
		get: async (galleryId: string): Promise<Gallery> => {
			if (!galleryId) {
				throw new Error('Gallery ID is required');
			}
			return await this._request<Gallery>(`/galleries/${galleryId}`);
		},

		/**
		 * Create a new gallery
		 */
		create: async (data: Partial<Gallery>): Promise<Gallery> => {
			if (!data) {
				throw new Error('Gallery data is required');
			}
			return await this._request<Gallery>('/galleries', {
				method: 'POST',
				body: JSON.stringify(data),
			});
		},

		/**
		 * Update a gallery
		 */
		update: async (galleryId: string, data: Partial<Gallery>): Promise<Gallery> => {
			if (!galleryId) {
				throw new Error('Gallery ID is required');
			}
			if (!data) {
				throw new Error('Gallery data is required');
			}
			return await this._request<Gallery>(`/galleries/${galleryId}`, {
				method: 'PATCH',
				body: JSON.stringify(data),
			});
		},

		/**
		 * Delete a gallery
		 */
		delete: async (galleryId: string): Promise<void> => {
			if (!galleryId) {
				throw new Error('Gallery ID is required');
			}
			return await this._request<void>(`/galleries/${galleryId}`, {
				method: 'DELETE',
			});
		},

		/**
		 * Get gallery images
		 */
		getImages: async (galleryId: string): Promise<{ images: any[] }> => {
			if (!galleryId) {
				throw new Error('Gallery ID is required');
			}
			return await this._request(`/galleries/${galleryId}/images`);
		},

		/**
		 * Delete a gallery image
		 */
		deleteImage: async (galleryId: string, imageKey: string): Promise<void> => {
			if (!galleryId) {
				throw new Error('Gallery ID is required');
			}
			if (!imageKey) {
				throw new Error('Image key is required');
			}
			return await this._request(`/galleries/${galleryId}/photos/${encodeURIComponent(imageKey)}`, {
				method: 'DELETE',
			});
		},

		/**
		 * Send gallery link to client
		 */
		sendToClient: async (galleryId: string): Promise<{ isReminder?: boolean }> => {
			if (!galleryId) {
				throw new Error('Gallery ID is required');
			}
			return await this._request(`/galleries/${galleryId}/send-to-client`, {
				method: 'POST',
			});
		},

		/**
		 * Pay for gallery
		 */
		pay: async (galleryId: string, options: { dryRun?: boolean; forceStripeOnly?: boolean } = {}): Promise<{ checkoutUrl?: string; paid?: boolean; totalAmountCents?: number; walletAmountCents?: number; stripeAmountCents?: number }> => {
			if (!galleryId) {
				throw new Error('Gallery ID is required');
			}
			return await this._request(`/galleries/${galleryId}/pay`, {
				method: 'POST',
				body: JSON.stringify(options),
			});
		},

		/**
		 * Update gallery client password
		 */
		updateClientPassword: async (galleryId: string, password: string, clientEmail: string): Promise<void> => {
			if (!galleryId) {
				throw new Error('Gallery ID is required');
			}
			if (!password || !clientEmail) {
				throw new Error('Password and client email are required');
			}
			return await this._request(`/galleries/${galleryId}/client-password`, {
				method: 'PATCH',
				body: JSON.stringify({ password, clientEmail }),
			});
		},

		/**
		 * Update gallery pricing package
		 */
		updatePricingPackage: async (galleryId: string, pricingPackage: any): Promise<void> => {
			if (!galleryId) {
				throw new Error('Gallery ID is required');
			}
			if (!pricingPackage) {
				throw new Error('Pricing package is required');
			}
			return await this._request(`/galleries/${galleryId}/pricing-package`, {
				method: 'PATCH',
				body: JSON.stringify({ pricingPackage }),
			});
		},

		/**
		 * Check if gallery has delivered orders
		 */
		checkDeliveredOrders: async (galleryId: string): Promise<ListResponse<Order> | { items: Order[] }> => {
			if (!galleryId) {
				throw new Error('Gallery ID is required');
			}
			return await this._request(`/galleries/${galleryId}/orders/delivered`);
		},

		/**
		 * Calculate plan for gallery based on uploaded size
		 */
		calculatePlan: async (galleryId: string, duration: string = '1m'): Promise<{
			suggestedPlan: any;
			originalsLimitBytes: number;
			finalsLimitBytes: number;
			uploadedSizeBytes: number;
			selectionEnabled: boolean;
			usagePercentage?: number;
			isNearCapacity?: boolean;
			isAtCapacity?: boolean;
			exceedsLargestPlan?: boolean;
			nextTierPlan?: { planKey: string; name: string; priceCents: number; storageLimitBytes: number; storage: string };
		}> => {
			if (!galleryId) {
				throw new Error('Gallery ID is required');
			}
			return await this._request(`/galleries/${galleryId}/calculate-plan?duration=${duration}`);
		},

		/**
		 * Validate upload limits after upload completes
		 */
		validateUploadLimits: async (galleryId: string): Promise<{ withinLimit: boolean; uploadedSizeBytes: number; originalsLimitBytes?: number; excessBytes?: number; nextTierPlan?: string; nextTierPriceCents?: number; nextTierLimitBytes?: number; isSelectionGallery?: boolean }> => {
			if (!galleryId) {
				throw new Error('Gallery ID is required');
			}
			return await this._request(`/galleries/${galleryId}/validate-upload-limits`, {
				method: 'POST',
			});
		},

		/**
		 * Upgrade gallery plan (for paid galleries only - pays difference)
		 */
		upgradePlan: async (galleryId: string, data: { plan: string; forceStripeOnly?: boolean }): Promise<{
			paid: boolean;
			checkoutUrl?: string;
			transactionId: string;
			totalAmountCents: number;
			walletAmountCents: number;
			stripeAmountCents: number;
			currentPlan: string;
			newPlan: string;
			currentPriceCents: number;
			newPriceCents: number;
			priceDifferenceCents: number;
			message: string;
		}> => {
			if (!galleryId) {
				throw new Error('Gallery ID is required');
			}
			if (!data || !data.plan) {
				throw new Error('Plan is required');
			}
			return await this._request(`/galleries/${galleryId}/upgrade-plan`, {
				method: 'POST',
				body: JSON.stringify(data),
			});
		},
	};

	// ==================== ORDERS ====================

	orders = {
		/**
		 * List all orders
		 */
		list: async (params: PaginationParams = {}): Promise<ListResponse<Order> | Order[]> => {
			const queryString = new URLSearchParams(params as Record<string, string>).toString();
			const endpoint = queryString ? `/orders?${queryString}` : '/orders';
			return await this._request(endpoint);
		},

		/**
		 * Get orders for a specific gallery
		 */
		getByGallery: async (galleryId: string): Promise<ListResponse<Order> | { items: Order[] }> => {
			if (!galleryId) {
				throw new Error('Gallery ID is required');
			}
			return await this._request(`/galleries/${galleryId}/orders`);
		},

		/**
		 * Get a specific order
		 */
		get: async (galleryId: string, orderId: string): Promise<Order> => {
			if (!galleryId) {
				throw new Error('Gallery ID is required');
			}
			if (!orderId) {
				throw new Error('Order ID is required');
			}
			return await this._request<Order>(`/galleries/${galleryId}/orders/${orderId}`);
		},

		/**
		 * Update an order
		 */
		update: async (galleryId: string, orderId: string, data: Partial<Order>): Promise<Order> => {
			if (!galleryId) {
				throw new Error('Gallery ID is required');
			}
			if (!orderId) {
				throw new Error('Order ID is required');
			}
			if (!data) {
				throw new Error('Order data is required');
			}
			return await this._request<Order>(`/galleries/${galleryId}/orders/${orderId}`, {
				method: 'PATCH',
				body: JSON.stringify(data),
			});
		},

		/**
		 * Approve change request
		 */
		approveChangeRequest: async (galleryId: string, orderId: string): Promise<void> => {
			if (!galleryId) {
				throw new Error('Gallery ID is required');
			}
			if (!orderId) {
				throw new Error('Order ID is required');
			}
			return await this._request(`/galleries/${galleryId}/orders/${orderId}/approve-change`, {
				method: 'POST',
			});
		},

		/**
		 * Deny change request
		 */
		denyChangeRequest: async (galleryId: string, orderId: string, reason?: string): Promise<void> => {
			if (!galleryId) {
				throw new Error('Gallery ID is required');
			}
			if (!orderId) {
				throw new Error('Order ID is required');
			}
			return await this._request(`/galleries/${galleryId}/orders/${orderId}/deny-change`, {
				method: 'POST',
				body: JSON.stringify({ reason: reason || undefined }),
			});
		},

		/**
		 * Get final images for an order
		 */
		getFinalImages: async (galleryId: string, orderId: string): Promise<{ images: any[] }> => {
			if (!galleryId) {
				throw new Error('Gallery ID is required');
			}
			if (!orderId) {
				throw new Error('Order ID is required');
			}
			return await this._request(`/galleries/${galleryId}/orders/${orderId}/final/images`);
		},

		/**
		 * Delete a final image
		 */
		deleteFinalImage: async (galleryId: string, orderId: string, imageKey: string): Promise<void> => {
			if (!galleryId) {
				throw new Error('Gallery ID is required');
			}
			if (!orderId) {
				throw new Error('Order ID is required');
			}
			if (!imageKey) {
				throw new Error('Image key is required');
			}
			return await this._request(`/galleries/${galleryId}/orders/${orderId}/final/images/${encodeURIComponent(imageKey)}`, {
				method: 'DELETE',
			});
		},

		/**
		 * Download order ZIP (returns URL or handles 202 for async generation)
		 */
		downloadZip: async (galleryId: string, orderId: string): Promise<{ status?: number; generating?: boolean; blob?: Blob; url?: string }> => {
			if (!galleryId) {
				throw new Error('Gallery ID is required');
			}
			if (!orderId) {
				throw new Error('Order ID is required');
			}
			// For ZIP downloads with 202 handling, we need to use fetch directly
			// but still get token through service
			const token = await getValidToken();
			const url = `${this.baseUrl}/galleries/${galleryId}/orders/${orderId}/zip`;
			const response = await fetch(url, {
				headers: { Authorization: `Bearer ${token}` },
			});
			
			if (response.status === 202) {
				return { status: 202, generating: true };
			}
			
			if (!response.ok) {
				const error: ApiError = new Error(`HTTP ${response.status}: ${response.statusText}`);
				error.status = response.status;
				throw error;
			}
			
			const blob = await response.blob();
			return { blob, url: URL.createObjectURL(blob) };
		},
	};

	// ==================== CLIENTS ====================

	clients = {
		/**
		 * List clients
		 */
		list: async (params: PaginationParams = {}): Promise<ListResponse<Client>> => {
			const queryString = new URLSearchParams(params as Record<string, string>).toString();
			const endpoint = queryString ? `/clients?${queryString}` : '/clients';
			return await this._request<ListResponse<Client>>(endpoint);
		},

		/**
		 * Get a specific client
		 */
		get: async (clientId: string): Promise<Client> => {
			if (!clientId) {
				throw new Error('Client ID is required');
			}
			return await this._request<Client>(`/clients/${clientId}`);
		},

		/**
		 * Create a client
		 */
		create: async (data: Partial<Client>): Promise<Client> => {
			if (!data) {
				throw new Error('Client data is required');
			}
			return await this._request<Client>('/clients', {
				method: 'POST',
				body: JSON.stringify(data),
			});
		},

		/**
		 * Update a client
		 */
		update: async (clientId: string, data: Partial<Client>): Promise<Client> => {
			if (!clientId) {
				throw new Error('Client ID is required');
			}
			if (!data) {
				throw new Error('Client data is required');
			}
			return await this._request<Client>(`/clients/${clientId}`, {
				method: 'PUT',
				body: JSON.stringify(data),
			});
		},

		/**
		 * Delete a client
		 */
		delete: async (clientId: string): Promise<void> => {
			if (!clientId) {
				throw new Error('Client ID is required');
			}
			return await this._request<void>(`/clients/${clientId}`, {
				method: 'DELETE',
			});
		},
	};

	// ==================== PACKAGES ====================

	packages = {
		/**
		 * List packages
		 */
		list: async (): Promise<ListResponse<Package>> => {
			return await this._request<ListResponse<Package>>('/packages');
		},

		/**
		 * Get a specific package
		 */
		get: async (packageId: string): Promise<Package> => {
			if (!packageId) {
				throw new Error('Package ID is required');
			}
			return await this._request<Package>(`/packages/${packageId}`);
		},

		/**
		 * Create a package
		 */
		create: async (data: Partial<Package>): Promise<Package> => {
			if (!data) {
				throw new Error('Package data is required');
			}
			return await this._request<Package>('/packages', {
				method: 'POST',
				body: JSON.stringify(data),
			});
		},

		/**
		 * Update a package
		 */
		update: async (packageId: string, data: Partial<Package>): Promise<Package> => {
			if (!packageId) {
				throw new Error('Package ID is required');
			}
			if (!data) {
				throw new Error('Package data is required');
			}
			return await this._request<Package>(`/packages/${packageId}`, {
				method: 'PUT',
				body: JSON.stringify(data),
			});
		},

		/**
		 * Delete a package
		 */
		delete: async (packageId: string): Promise<void> => {
			if (!packageId) {
				throw new Error('Package ID is required');
			}
			return await this._request<void>(`/packages/${packageId}`, {
				method: 'DELETE',
			});
		},
	};

	// ==================== WALLET ====================

	wallet = {
		/**
		 * Get wallet balance
		 */
		getBalance: async (): Promise<{ balanceCents: number }> => {
			return await this._request('/wallet/balance');
		},

		/**
		 * Get wallet transactions
		 */
		getTransactions: async (params: PaginationParams = {}): Promise<{ transactions: any[]; hasMore?: boolean; lastKey?: string | null }> => {
			const queryString = new URLSearchParams(params as Record<string, string>).toString();
			const endpoint = queryString ? `/wallet/transactions?${queryString}` : '/wallet/transactions';
			return await this._request(endpoint);
		},
	};

	// ==================== PAYMENTS ====================

	payments = {
		/**
		 * Create checkout session
		 */
		createCheckout: async (data: { amountCents: number; type: string; redirectUrl?: string }): Promise<{ checkoutUrl: string }> => {
			if (!data) {
				throw new Error('Payment data is required');
			}
			return await this._request('/payments/checkout', {
				method: 'POST',
				body: JSON.stringify(data),
			});
		},
	};

	// ==================== UPLOADS ====================

	uploads = {
		/**
		 * Get presigned URL for upload
		 */
		getPresignedUrl: async (data: { galleryId: string; orderId?: string; key: string; contentType: string; fileSize: number }): Promise<{ url: string }> => {
			if (!data) {
				throw new Error('Upload data is required');
			}
			if (!data.galleryId) {
				throw new Error('Gallery ID is required');
			}
			if (!data.key) {
				throw new Error('File key is required');
			}
			return await this._request('/uploads/presign', {
				method: 'POST',
				body: JSON.stringify(data),
			});
		},

		/**
		 * Get presigned URL for final image upload
		 */
		getFinalImagePresignedUrl: async (galleryId: string, orderId: string, data: { key: string; contentType: string }): Promise<{ url: string }> => {
			if (!galleryId) {
				throw new Error('Gallery ID is required');
			}
			if (!orderId) {
				throw new Error('Order ID is required');
			}
			if (!data) {
				throw new Error('Upload data is required');
			}
			if (!data.key) {
				throw new Error('File key is required');
			}
			return await this._request(`/galleries/${galleryId}/orders/${orderId}/final/upload`, {
				method: 'POST',
				body: JSON.stringify({
					key: data.key,
					contentType: data.contentType || 'image/jpeg',
				}),
			});
		},

		/**
		 * Mark final upload as complete (triggers backend processing)
		 */
		markFinalUploadComplete: async (galleryId: string, orderId: string): Promise<void> => {
			if (!galleryId) {
				throw new Error('Gallery ID is required');
			}
			if (!orderId) {
				throw new Error('Order ID is required');
			}
			return await this._request(`/galleries/${galleryId}/orders/${orderId}/final/upload-complete`, {
				method: 'POST',
			});
		},
	};

	// ==================== AUTH ====================

	auth = {
		/**
		 * Get business info
		 */
		getBusinessInfo: async (): Promise<{ businessName?: string; email?: string; phone?: string; address?: string; nip?: string }> => {
			return await this._request('/auth/business-info');
		},

		/**
		 * Update business info
		 */
		updateBusinessInfo: async (data: { businessName?: string; email?: string; phone?: string; address?: string; nip?: string }): Promise<void> => {
			if (!data) {
				throw new Error('Business info data is required');
			}
			return await this._request('/auth/business-info', {
				method: 'PUT',
				body: JSON.stringify(data),
			});
		},

		/**
		 * Change password
		 */
		changePassword: async (currentPassword: string, newPassword: string): Promise<void> => {
			if (!currentPassword || !newPassword) {
				throw new Error('Current password and new password are required');
			}
			return await this._request('/auth/change-password', {
				method: 'POST',
				body: JSON.stringify({ currentPassword, newPassword }),
			});
		},
	};
}

// Export singleton instance
const apiService = new ApiService();
export default apiService;

// Also export formatError for convenience
export const formatApiError = (error: ApiError | Error): string => apiService.formatError(error);

