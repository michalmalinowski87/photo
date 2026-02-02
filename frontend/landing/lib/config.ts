/**
 * Server-side config fetch for landing (legal pages).
 * Fetches company and legal document data from GET /config.
 */

export interface CompanyConfig {
  company_name: string;
  company_tax_id: string;
  company_address: string;
  company_email: string;
  legal_document_publication_date: string;
}

const DEFAULT_COMPANY: CompanyConfig = {
  company_name: "TBA",
  company_tax_id: "TBA",
  company_address: "TBA",
  company_email: "TBA",
  legal_document_publication_date: "02.02.2026",
};

export interface PublicConfig {
  company: CompanyConfig;
}

/**
 * Fetches public config from API (company data for legal docs).
 * Uses NEXT_PUBLIC_API_URL. Returns default company if fetch fails or URL is not set.
 */
export async function getPublicConfig(): Promise<PublicConfig> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl?.trim()) {
    return { company: DEFAULT_COMPANY };
  }
  try {
    const res = await fetch(`${apiUrl}/config`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return { company: DEFAULT_COMPANY };
    const data = (await res.json()) as { company?: CompanyConfig };
    const company = data.company && typeof data.company === "object"
      ? {
          company_name: String(data.company.company_name ?? DEFAULT_COMPANY.company_name),
          company_tax_id: String(data.company.company_tax_id ?? DEFAULT_COMPANY.company_tax_id),
          company_address: String(data.company.company_address ?? DEFAULT_COMPANY.company_address),
          company_email: String(data.company.company_email ?? DEFAULT_COMPANY.company_email),
          legal_document_publication_date: String(data.company.legal_document_publication_date ?? DEFAULT_COMPANY.legal_document_publication_date),
        }
      : DEFAULT_COMPANY;
    return { company };
  } catch {
    return { company: DEFAULT_COMPANY };
  }
}
