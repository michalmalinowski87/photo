import { getLegalDocMeta, getLegalHtml, fillLegalPlaceholders } from "@photocloud/legal";
import { getPublicConfig } from "@/lib/config";

export const revalidate = 3600;

export default async function PrivacyPage() {
  const meta = getLegalDocMeta("privacy");
  const config = await getPublicConfig();
  const rawHtml = getLegalHtml("privacy");
  const html = fillLegalPlaceholders(rawHtml, config.company);

  return (
    <section className="legal-page">
      <div className="container">
        <div className="row justify-content-center">
          <div className="col-lg-10 col-xl-9">
            <div className="legal-card">
              <div className="legal-doc" dangerouslySetInnerHTML={{ __html: html }} />
              <p className="legal-note">
                <strong>Wersja dokumentu:</strong> {meta.version}. Jeśli masz pytania, napisz do nas na{" "}
                <a href={`mailto:${config.company.company_email}`}>{config.company.company_email}</a>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

