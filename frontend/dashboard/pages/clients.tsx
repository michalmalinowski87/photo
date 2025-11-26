import { useState, useEffect } from "react";
import api, { formatApiError } from "../lib/api-service";
import { initializeAuth, redirectToLandingSignIn } from "../lib/auth-init";
import Button from "../components/ui/button/Button";
import Input from "../components/ui/input/InputField";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "../components/ui/table";
import { FullPageLoading } from "../components/ui/loading/Loading";
import { useToast } from "../hooks/useToast";
import { ConfirmDialog } from "../components/ui/confirm/ConfirmDialog";

interface Client {
	clientId: string;
	email?: string;
	firstName?: string;
	lastName?: string;
	phone?: string;
	isCompany?: boolean;
	companyName?: string;
	nip?: string;
	createdAt?: string;
	[key: string]: any;
}

interface ClientFormData {
	email: string;
	firstName: string;
	lastName: string;
	phone: string;
	isCompany: boolean;
	companyName: string;
	nip: string;
}

interface PageHistoryItem {
	page: number;
	cursor: string | null;
}

export default function Clients() {
	const { showToast } = useToast();
	const [loading, setLoading] = useState<boolean>(true);
	const [initialLoad, setInitialLoad] = useState<boolean>(true);
	const [error, setError] = useState<string>("");
	const [clients, setClients] = useState<Client[]>([]);
	const [showForm, setShowForm] = useState<boolean>(false);
	const [editingClient, setEditingClient] = useState<Client | null>(null);
	const [formData, setFormData] = useState<ClientFormData>({
		email: "",
		firstName: "",
		lastName: "",
		phone: "",
		isCompany: false,
		companyName: "",
		nip: "",
	});
	const [searchQuery, setSearchQuery] = useState<string>("");
	const [currentPage, setCurrentPage] = useState<number>(1);
	const [paginationCursor, setPaginationCursor] = useState<string | null>(null);
	const [hasMore, setHasMore] = useState<boolean>(false);
	const [pageHistory, setPageHistory] = useState<PageHistoryItem[]>([{ page: 1, cursor: null }]);
	const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<boolean>(false);
	const [clientToDelete, setClientToDelete] = useState<string | null>(null);

	useEffect(() => {
		initializeAuth(
			() => {
				loadClients(1, null, "");
			},
			() => {
				redirectToLandingSignIn("/clients");
			}
		);
	}, []);

	useEffect(() => {
		const timer = setTimeout(() => {
			setCurrentPage(1);
			setPageHistory([{ page: 1, cursor: null }]);
			loadClients(1, null, searchQuery);
		}, 300);

		return () => clearTimeout(timer);
	}, [searchQuery]);

	const loadClients = async (page: number, lastKey: string | null, search: string): Promise<void> => {
		setLoading(true);
		setError("");
		
		try {
			const params: Record<string, string> = {};
			params.limit = '20';
			
			if (search) {
				const offset = (page - 1) * 20;
				params.search = search;
				params.offset = offset.toString();
			} else {
				if (lastKey) {
					params.lastKey = lastKey;
				}
			}
			
			const data = await api.clients.list(params);
			setClients(data.items || []);
			setHasMore(data.hasMore || false);
			const newCursor = data.lastKey || null;
			setPaginationCursor(newCursor);
			setCurrentPage(page);
			
			if (!search) {
				const historyIndex = pageHistory.findIndex(h => h.page === page);
				if (historyIndex >= 0) {
					const newHistory = [...pageHistory];
					newHistory[historyIndex] = { page, cursor: lastKey };
					setPageHistory(newHistory);
				} else {
					setPageHistory([...pageHistory, { page, cursor: lastKey }]);
				}
			}
			
			if (initialLoad) {
				setInitialLoad(false);
			}
		} catch (err) {
			setError(formatApiError(err as Error));
		} finally {
			setLoading(false);
		}
	};

	const handleCreate = (): void => {
		setEditingClient(null);
		setFormData({
			email: "",
			firstName: "",
			lastName: "",
			phone: "",
			isCompany: false,
			companyName: "",
			nip: "",
		});
		setShowForm(true);
	};

	const handleEdit = (client: Client): void => {
		setEditingClient(client);
		setFormData({
			email: client.email || "",
			firstName: client.firstName || "",
			lastName: client.lastName || "",
			phone: client.phone || "",
			isCompany: client.isCompany || false,
			companyName: client.companyName || "",
			nip: client.nip || "",
		});
		setShowForm(true);
	};

	const handleSave = async (): Promise<void> => {
		setLoading(true);
		setError("");
		
		try {
			if (editingClient) {
				await api.clients.update(editingClient.clientId, formData);
			} else {
				await api.clients.create(formData);
			}
			
			setShowForm(false);
			await loadClients(currentPage, pageHistory.find(h => h.page === currentPage)?.cursor || null, searchQuery);
			showToast("success", "Sukces", editingClient ? "Klient został zaktualizowany" : "Klient został utworzony");
		} catch (err) {
			const errorMsg = formatApiError(err as Error);
			setError(errorMsg);
			showToast("error", "Błąd", errorMsg);
		} finally {
			setLoading(false);
		}
	};

	const handleDeleteClick = (clientId: string): void => {
		setClientToDelete(clientId);
		setDeleteConfirmOpen(true);
	};

	const handleDeleteConfirm = async (): Promise<void> => {
		if (!clientToDelete) return;
		
		setLoading(true);
		setError("");
		setDeleteConfirmOpen(false);
		
		try {
			await api.clients.delete(clientToDelete);
			
			await loadClients(currentPage, pageHistory.find(h => h.page === currentPage)?.cursor || null, searchQuery);
			showToast("success", "Sukces", "Klient został usunięty");
			setClientToDelete(null);
		} catch (err) {
			const errorMsg = formatApiError(err as Error);
			setError(errorMsg);
			showToast("error", "Błąd", errorMsg);
		} finally {
			setLoading(false);
		}
	};

	const handleNextPage = (): void => {
		if (hasMore) {
			const nextPage = currentPage + 1;
			if (searchQuery) {
				loadClients(nextPage, null, searchQuery);
			} else {
				if (paginationCursor) {
					loadClients(nextPage, paginationCursor, searchQuery);
				}
			}
		}
	};

	const handlePreviousPage = (): void => {
		if (currentPage > 1) {
			const previousPage = currentPage - 1;
			if (searchQuery) {
				loadClients(previousPage, null, searchQuery);
			} else {
				const previousPageData = pageHistory.find(h => h.page === previousPage);
				if (previousPageData) {
					loadClients(previousPage, previousPageData.cursor, searchQuery);
				} else {
					loadClients(1, null, searchQuery);
				}
			}
		}
	};

	if (showForm) {
		return (
			<div className="space-y-6">
				<div className="flex items-center justify-between">
					<h1 className="text-3xl font-bold text-gray-900 dark:text-white">
						{editingClient ? "Edytuj klienta" : "Dodaj klienta"}
					</h1>
					<button
						onClick={() => setShowForm(false)}
						className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-colors"
						aria-label="Anuluj"
					>
						<svg
							className="w-5 h-5"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</button>
				</div>

				{error && (
					<div className="p-4 bg-error-50 border border-error-200 rounded-lg text-error-600 dark:bg-error-50 dark:border-error-200 dark:text-error-600">
						{error}
					</div>
				)}

				<div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
					<div className="space-y-4">
						<div>
							<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
								Email *
							</label>
							<Input
								type="email"
								placeholder="email@example.com"
								value={formData.email}
								onChange={(e) =>
									setFormData({ ...formData, email: e.target.value })
								}
							/>
						</div>
						
						<div>
							<label className="flex items-center gap-2">
								<input
									type="checkbox"
									checked={formData.isCompany}
									onChange={(e) =>
										setFormData({ ...formData, isCompany: e.target.checked })
									}
									className="w-4 h-4 text-brand-500 rounded"
								/>
								<span className="text-sm font-medium text-gray-700 dark:text-gray-300">
									Firma
								</span>
							</label>
						</div>
						
						{formData.isCompany ? (
							<>
								<div>
									<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
										Nazwa firmy *
									</label>
									<Input
										type="text"
										placeholder="Nazwa firmy"
										value={formData.companyName}
										onChange={(e) =>
											setFormData({ ...formData, companyName: e.target.value })
										}
									/>
								</div>
								<div>
									<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
										NIP *
									</label>
									<Input
										type="text"
										placeholder="NIP"
										value={formData.nip}
										onChange={(e) =>
											setFormData({ ...formData, nip: e.target.value })
										}
									/>
								</div>
							</>
						) : (
							<>
								<div>
									<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
										Imię *
									</label>
									<Input
										type="text"
										placeholder="Imię"
										value={formData.firstName}
										onChange={(e) =>
											setFormData({ ...formData, firstName: e.target.value })
										}
									/>
								</div>
								<div>
									<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
										Nazwisko *
									</label>
									<Input
										type="text"
										placeholder="Nazwisko"
										value={formData.lastName}
										onChange={(e) =>
											setFormData({ ...formData, lastName: e.target.value })
										}
									/>
								</div>
							</>
						)}
						
						<div>
							<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
								Telefon
							</label>
							<Input
								type="tel"
								placeholder="+48 123 456 789"
								value={formData.phone}
								onChange={(e) =>
									setFormData({ ...formData, phone: e.target.value })
								}
							/>
						</div>
					</div>
					
					<div className="flex justify-end gap-3 mt-6">
						<Button variant="outline" onClick={() => setShowForm(false)}>
							Anuluj
						</Button>
						<Button variant="primary" onClick={handleSave} disabled={loading}>
							{loading ? "Zapisywanie..." : "Zapisz"}
						</Button>
					</div>
				</div>
			</div>
		);
	}

	if (loading && initialLoad) {
		return <FullPageLoading text="Ładowanie klientów..." />;
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h1 className="text-3xl font-bold text-gray-900 dark:text-white">
					Klienci
				</h1>
				<button
					onClick={handleCreate}
					className="text-xl font-bold text-brand-500 hover:text-brand-600 dark:text-brand-400 dark:hover:text-brand-300 transition-colors flex items-center gap-2"
				>
					<span className="text-2xl">+</span>
					<span>Dodaj klienta</span>
				</button>
			</div>

			{error && (
				<div className="p-4 bg-error-50 border border-error-200 rounded-lg text-error-600 dark:bg-error-50 dark:border-error-200 dark:text-error-600">
					{error}
				</div>
			)}

			{(!loading && clients.length > 0) || searchQuery ? (
				<div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
					<div>
						<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
							Szukaj (email, imię, nazwisko, firma, NIP, telefon)
						</label>
						<Input
							type="text"
							placeholder="Wpisz tekst do wyszukania..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
						/>
					</div>
				</div>
			) : null}

			{clients.length === 0 ? (
				<div className="pt-32 pb-8 text-center text-gray-500 dark:text-gray-400 text-xl">
					{searchQuery ? "Brak wyników wyszukiwania." : "Brak klientów. Kliknij \"Dodaj klienta\" aby dodać pierwszego."}
				</div>
			) : (
				<>
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow className="bg-gray-50 dark:bg-gray-900">
									<TableCell isHeader className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
										Email
									</TableCell>
									<TableCell isHeader className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
										Imię i nazwisko / Firma
									</TableCell>
									<TableCell isHeader className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
										Telefon
									</TableCell>
									<TableCell isHeader className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
										Data utworzenia
									</TableCell>
									<TableCell isHeader className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
										Akcje
									</TableCell>
								</TableRow>
							</TableHeader>
							<TableBody>
								{clients.map((client) => (
									<TableRow
										key={client.clientId}
										className="hover:bg-gray-50 dark:hover:bg-gray-800"
									>
										<TableCell className="px-4 py-3 text-sm text-gray-900 dark:text-white">
											{client.email}
										</TableCell>
										<TableCell className="px-4 py-3 text-sm text-gray-900 dark:text-white">
											{client.isCompany ? (
												<div>
													<div className="font-medium">{client.companyName}</div>
													<div className="text-xs text-gray-500 dark:text-gray-400">
														NIP: {client.nip}
													</div>
												</div>
											) : (
												`${client.firstName} ${client.lastName}`
											)}
										</TableCell>
										<TableCell className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
											{client.phone || "-"}
										</TableCell>
										<TableCell className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
											{client.createdAt
												? new Date(client.createdAt).toLocaleDateString("pl-PL")
												: "-"}
										</TableCell>
										<TableCell className="px-4 py-3">
											<div className="flex gap-2">
												<Button
													size="sm"
													variant="outline"
													onClick={() => handleEdit(client)}
												>
													Edytuj
												</Button>
												<Button
													size="sm"
													variant="outline"
													onClick={() => handleDeleteClick(client.clientId)}
												>
													Usuń
												</Button>
											</div>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>

					{clients.length > 0 && (
						<div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
							<div className="text-sm text-gray-600 dark:text-gray-400">
								Strona {currentPage}
								{clients.length === 20 && hasMore && " (więcej dostępne)"}
							</div>
							<div className="flex gap-2">
								<Button
									variant="outline"
									size="sm"
									onClick={handlePreviousPage}
									disabled={loading || currentPage === 1}
								>
									Poprzednia
								</Button>
								<Button
									variant="outline"
									size="sm"
									onClick={handleNextPage}
									disabled={loading || !hasMore}
								>
									Następna
								</Button>
							</div>
						</div>
					)}
				</>
			)}

			<ConfirmDialog
				isOpen={deleteConfirmOpen}
				onClose={() => {
					setDeleteConfirmOpen(false);
					setClientToDelete(null);
				}}
				onConfirm={handleDeleteConfirm}
				title="Usuń klienta"
				message="Czy na pewno chcesz usunąć tego klienta? Ta operacja jest nieodwracalna."
				confirmText="Usuń"
				cancelText="Anuluj"
				variant="danger"
				loading={loading}
			/>
		</div>
	);
}

