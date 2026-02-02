import { getConfigFromSsm } from './ssm-config';
import type { CompanyConfig } from '@photocloud/legal';

const COMPANY_CONFIG_KEYS = [
  'CompanyName',
  'CompanyTaxId',
  'CompanyAddress',
  'CompanyEmail',
  'LegalDocumentPublicationDate',
] as const;

let companyConfigCache: CompanyConfig | null = null;
let companyConfigPromise: Promise<CompanyConfig> | null = null;
let companyConfigCacheTimestamp = 0;
const COMPANY_CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function mapToCompanyConfig(raw: Record<string, string | undefined>): CompanyConfig {
  return {
    company_name: raw.CompanyName?.trim() ?? 'TBA',
    company_tax_id: raw.CompanyTaxId?.trim() ?? 'TBA',
    company_address: raw.CompanyAddress?.trim() ?? 'TBA',
    company_email: raw.CompanyEmail?.trim() ?? 'TBA',
    legal_document_publication_date: raw.LegalDocumentPublicationDate?.trim() ?? '02.02.2026',
  };
}

/**
 * Gets company and legal document config from SSM (for legal pages and PDFs).
 * Cached for 5 minutes.
 */
export async function getCompanyConfig(): Promise<CompanyConfig> {
  const now = Date.now();
  if (companyConfigCache !== null && now - companyConfigCacheTimestamp < COMPANY_CONFIG_CACHE_TTL) {
    return companyConfigCache;
  }
  if (companyConfigPromise) {
    return companyConfigPromise;
  }

  const stage = process.env.STAGE || 'dev';
  companyConfigPromise = (async () => {
    try {
      const raw = await getConfigFromSsm(stage, [...COMPANY_CONFIG_KEYS]);
      const config = mapToCompanyConfig(raw);
      companyConfigCache = config;
      companyConfigCacheTimestamp = Date.now();
      return config;
    } finally {
      companyConfigPromise = null;
    }
  })();

  return companyConfigPromise;
}
