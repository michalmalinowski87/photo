"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';

interface CompanyConfig {
  company_name: string;
  company_tax_id: string;
  company_address: string;
  company_email: string;
}

export default function FooterBusiness() {
  const [company, setCompany] = useState<CompanyConfig | null>(null);

  useEffect(() => {
    const fetchCompany = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL;
        if (!apiUrl) return;
        
        const res = await fetch(`${apiUrl}/config`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });
        if (!res.ok) return;
        
        const data = await res.json() as { company?: CompanyConfig };
        if (data.company) {
          setCompany(data.company);
        }
      } catch {
        // Silently fail - footer will show without company data
      }
    };

    void fetchCompany();
  }, []);

  return (
    <footer className="footer-area footer-eleven">
      <div className="footer-top">
        <div className="container">
          <div className="inner-content">
            <div className="row">
              <div className="col-lg-4 col-md-6 col-12">
                <div className="footer-widget f-about">
                  <div className="logo">
                    <Link href="/">
                      <div className="flex flex-col items-start">
                        <span className="brand-text-black">PixiProof</span>
                        <span className="text-xs text-gray-600 mt-0.5 font-medium tracking-wide">
                          Your photos. Their stories.
                        </span>
                      </div>
                    </Link>
                  </div>
                  <p>
                    PixiProof – proofing, który wreszcie pracuje dla Ciebie. Szybkie, bezpieczne
                    galerie, automatyczne notyfikacje i zero comiesięcznych opłat. Płacisz tylko za
                    to, co naprawdę wykorzystujesz.
                  </p>
                  <p className="copyright-text">
                    <span>© 2026 PixiProof.</span> Wszelkie prawa zastrzeżone.
                  </p>
                  {company && (
                    <div className="mt-3 text-xs text-gray-600 dark:text-gray-400">
                      <p className="mb-1">
                        <strong>{company.company_name}</strong>
                        {company.company_tax_id !== "TBA" && `, NIP: ${company.company_tax_id}`}
                      </p>
                      {company.company_address !== "TBA" && (
                        <p className="mb-1">{company.company_address}</p>
                      )}
                      {company.company_email !== "TBA" && (
                        <p>
                          <a href={`mailto:${company.company_email}`} className="hover:underline">
                            {company.company_email}
                          </a>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="col-lg-2 col-md-6 col-12">
                <div className="footer-widget f-link">
                  <h5>Rozwiązania</h5>
                  <ul>
                    <li>
                      <Link href="/#about">O nas</Link>
                    </li>
                    <li>
                      <Link href="/#services">Funkcje</Link>
                    </li>
                    <li>
                      <Link href="/#pricing">Cennik</Link>
                    </li>
                  </ul>
                </div>
              </div>
              <div className="col-lg-2 col-md-6 col-12">
                <div className="footer-widget f-link">
                  <h5>Wsparcie</h5>
                  <ul>
                    <li>
                      <Link href="/resources/help">Pomoc</Link>
                    </li>
                    <li>
                      <Link href="/resources/help">FAQ</Link>
                    </li>
                  </ul>
                </div>
              </div>
              <div className="col-lg-2 col-md-6 col-12">
                <div className="footer-widget f-link">
                  <h5>Dokumenty</h5>
                  <ul>
                    <li>
                      <Link href="/terms">Regulamin</Link>
                    </li>
                    <li>
                      <Link href="/privacy">Polityka Prywatności</Link>
                    </li>
                    <li>
                      {company && company.company_email !== "TBA" ? (
                        <a href={`mailto:${company.company_email}`}>Kontakt</a>
                      ) : (
                        <Link href="/privacy">Kontakt</Link>
                      )}
                    </li>
                  </ul>
                </div>
              </div>
              <div className="col-lg-4 col-md-6 col-12">
                <div className="footer-widget">

                  <div className="footer-social">
                    <ul className="footer-social-list">
                      <li>
                        <a href="javascript:void(0)" className="footer-social-link" aria-label="Facebook">
                          <i className="lni lni-facebook-filled"></i>
                        </a>
                      </li>
                      <li>
                        <a href="javascript:void(0)" className="footer-social-link" aria-label="Twitter">
                          <i className="lni lni-twitter-original"></i>
                        </a>
                      </li>
                      <li>
                        <a href="javascript:void(0)" className="footer-social-link" aria-label="LinkedIn">
                          <i className="lni lni-linkedin-original"></i>
                        </a>
                      </li>
                      <li>
                        <a href="javascript:void(0)" className="footer-social-link" aria-label="YouTube">
                          <i className="lni lni-youtube"></i>
                        </a>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
              <div className="col-lg-4 col-md-6 col-12" style={{ display: 'none' }}>
                <div className="footer-widget newsletter">
                  <h5>Subskrybuj</h5>
                  <p>
                    Subskrybuj nasz newsletter, aby otrzymywać najnowsze aktualizacje i oferty
                    specjalne.
                  </p>
                  <form action="#" method="get" target="_blank" className="newsletter-form">
                    <input name="EMAIL" placeholder="Twój adres e-mail" required type="email" />
                    <div className="button">
                      <button className="sub-btn" type="submit">
                        <i className="lni lni-envelope"></i>
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

