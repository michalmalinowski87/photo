"use client";

import Link from 'next/link';

export default function FooterBusiness() {
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
                      <span className="brand-text-black">
                        PhotoCloud
                      </span>
                    </Link>
                  </div>
                  <p>
                    PhotoCloud to innowacyjna platforma dla fotografów, która ułatwia udostępnianie, organizowanie i sprzedaż zdjęć klientom. Nasze narzędzia wspierają Twój rozwój i pomagają budować silne relacje z klientami.
                  </p>
                  <p className="copyright-text">
                    <span>© 2026 PhotoCloud.</span> Wszelkie prawa zastrzeżone.
                  </p>
                </div>
              </div>
              <div className="col-lg-2 col-md-6 col-12">
                <div className="footer-widget f-link">
                  <h5>Rozwiązania</h5>
                  <ul>
                    <li><Link href="#services">Funkcje</Link></li>
                    <li><Link href="#pricing">Galerie Klientów</Link></li>
                    <li><Link href="#pricing">Sprzedaż Zdjęć</Link></li>
                    <li><Link href="#services">Bezpieczeństwo</Link></li>
                  </ul>
                </div>
              </div>
              <div className="col-lg-2 col-md-6 col-12">
                <div className="footer-widget f-link">
                  <h5>Wsparcie</h5>
                  <ul>
                    <li><Link href="#pricing">Cennik</Link></li>
                    <li><Link href="/resources/help">Pomoc</Link></li>
                    <li><Link href="/resources/help">FAQ</Link></li>
                    <li><Link href="#contact">Kontakt</Link></li>
                  </ul>
                </div>
              </div>
              <div className="col-lg-4 col-md-6 col-12">
                <div className="footer-widget newsletter">
                  <h5>Subskrybuj</h5>
                  <p>Subskrybuj nasz newsletter, aby otrzymywać najnowsze aktualizacje i oferty specjalne.</p>
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

