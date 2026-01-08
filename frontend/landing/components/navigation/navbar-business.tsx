"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';

export default function NavbarBusiness() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { isAuthenticated, isLoading } = useAuth();
  const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3001';

  useEffect(() => {
    // Close sidebar when clicking overlay
    const overlay = document.querySelector('.overlay-left');
    if (overlay) {
      overlay.addEventListener('click', () => {
        setIsSidebarOpen(false);
      });
    }

    return () => {
      if (overlay) {
        overlay.removeEventListener('click', () => {
          setIsSidebarOpen(false);
        });
      }
    };
  }, []);

  useEffect(() => {
    // Update sidebar and overlay classes
    const sidebar = document.querySelector('.sidebar-left');
    const overlay = document.querySelector('.overlay-left');
    
    if (sidebar && overlay) {
      if (isSidebarOpen) {
        sidebar.classList.add('open');
        overlay.classList.add('open');
      } else {
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
      }
    }
  }, [isSidebarOpen]);

  return (
    <>
      <section className="navbar-area navbar-nine">
        <div className="container">
          <div className="row">
            <div className="col-lg-12">
              <nav className="navbar navbar-expand-lg">
                <Link className="navbar-brand" href="/">
                  <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--white)' }}>
                    PhotoCloud
                  </span>
                </Link>
                <button
                  className={`navbar-toggler ${isMenuOpen ? 'active' : ''}`}
                  type="button"
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  data-bs-toggle="collapse"
                  data-bs-target="#navbarNine"
                  aria-controls="navbarNine"
                  aria-expanded={isMenuOpen}
                  aria-label="Toggle navigation"
                >
                  <span className="toggler-icon"></span>
                  <span className="toggler-icon"></span>
                  <span className="toggler-icon"></span>
                </button>

                <div className={`collapse navbar-collapse sub-menu-bar ${isMenuOpen ? 'show' : ''}`} id="navbarNine">
                  <ul className="navbar-nav me-auto">
                    <li className="nav-item">
                      <Link className="page-scroll active" href="#hero-area">
                        Start
                      </Link>
                    </li>
                    <li className="nav-item">
                      <Link className="page-scroll" href="#services">
                        Funkcje
                      </Link>
                    </li>
                    <li className="nav-item">
                      <Link className="page-scroll" href="#pricing">
                        Cennik
                      </Link>
                    </li>
                    <li className="nav-item">
                      <Link className="page-scroll" href="#contact">
                        Kontakt
                      </Link>
                    </li>
                    {!isLoading && isAuthenticated && (
                      <li className="nav-item">
                        <Link className="page-scroll" href={`${dashboardUrl}/`}>
                          Dashboard
                        </Link>
                      </li>
                    )}
                  </ul>
                </div>

                <div className="navbar-btn d-none d-lg-inline-block">
                  <a
                    className="menu-bar"
                    href="#side-menu-left"
                    onClick={(e) => {
                      e.preventDefault();
                      setIsSidebarOpen(true);
                    }}
                  >
                    <i className="lni lni-menu"></i>
                  </a>
                </div>
              </nav>
            </div>
          </div>
        </div>
      </section>

      {/* Sidebar */}
      <div className={`sidebar-left ${isSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-close">
          <a
            className="close"
            href="#close"
            onClick={(e) => {
              e.preventDefault();
              setIsSidebarOpen(false);
            }}
          >
            <i className="lni lni-close"></i>
          </a>
        </div>
        <div className="sidebar-content">
          <div className="sidebar-logo">
            <Link href="/">
              <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--black)' }}>
                PhotoCloud
              </span>
            </Link>
          </div>
          <p className="text">
            PhotoCloud to prosty i opłacalny sposób na udostępnianie zdjęć klientom. Łączymy fotografów z ich klientami w bezpieczny i wygodny sposób.
          </p>
          <div className="sidebar-menu">
            <h5 className="menu-title">Szybkie Linki</h5>
            <ul>
              <li>
                <Link href="#hero-area" onClick={() => setIsSidebarOpen(false)}>
                  Start
                </Link>
              </li>
              <li>
                <Link href="#services" onClick={() => setIsSidebarOpen(false)}>
                  Funkcje
                </Link>
              </li>
              <li>
                <Link href="#pricing" onClick={() => setIsSidebarOpen(false)}>
                  Cennik
                </Link>
              </li>
              <li>
                <Link href="#contact" onClick={() => setIsSidebarOpen(false)}>
                  Kontakt
                </Link>
              </li>
              {!isLoading && isAuthenticated && (
                <li>
                  <Link href={`${dashboardUrl}/`} onClick={() => setIsSidebarOpen(false)}>
                    Dashboard
                  </Link>
                </li>
              )}
            </ul>
          </div>
          <div className="sidebar-social align-items-center justify-content-center">
            <h5 className="social-title">Obserwuj Nas</h5>
            <ul>
              <li>
                <a href="javascript:void(0)">
                  <i className="lni lni-facebook-filled"></i>
                </a>
              </li>
              <li>
                <a href="javascript:void(0)">
                  <i className="lni lni-twitter-original"></i>
                </a>
              </li>
              <li>
                <a href="javascript:void(0)">
                  <i className="lni lni-linkedin-original"></i>
                </a>
              </li>
              <li>
                <a href="javascript:void(0)">
                  <i className="lni lni-youtube"></i>
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div className={`overlay-left ${isSidebarOpen ? 'open' : ''}`}></div>
    </>
  );
}

