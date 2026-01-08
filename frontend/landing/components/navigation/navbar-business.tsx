"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';

export default function NavbarBusiness() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSticky, setIsSticky] = useState(false);
  const [activeLink, setActiveLink] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useAuth();
  const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3001';

  // Track when component has mounted to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

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

  useEffect(() => {
    // Only run scroll handlers after component has mounted to avoid hydration mismatch
    if (!mounted) return;

    // Handle sticky navbar
    const handleScroll = () => {
      const headerNavbar = document.querySelector('.navbar-area');
      if (headerNavbar) {
        const sticky = headerNavbar.getBoundingClientRect().top;
        setIsSticky(window.pageYOffset > sticky);
      }
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Check initial state

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [mounted]);

  useEffect(() => {
    // Only run scroll handlers after component has mounted to avoid hydration mismatch
    if (!mounted) return;

    // Handle active link based on scroll position
    const handleScrollActive = () => {
      const scrollPos = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop;
      const sections = document.querySelectorAll('.page-scroll');
      
      // Get navbar height dynamically
      const navbar = document.querySelector('.navbar-area');
      const headerOffset = navbar ? (navbar as HTMLElement).offsetHeight - 20 : 83; // navbar height + small padding
      
      let currentActive: string | null = null;
      
      for (let i = 0; i < sections.length; i++) {
        const currLink = sections[i] as HTMLElement;
        const val = currLink.getAttribute('href');
        
        // Skip external links and non-hash links
        if (!val || val === '#' || val === 'javascript:void(0)' || val.startsWith('http://') || val.startsWith('https://') || !val.startsWith('#')) {
          continue;
        }
        
        const refElement = document.querySelector(val);
        if (!refElement) {
          continue;
        }
        
        const scrollTopMinus = scrollPos + headerOffset;
        const elementTop = (refElement as HTMLElement).offsetTop;
        const elementHeight = (refElement as HTMLElement).offsetHeight;
        
        if (elementTop <= scrollTopMinus && (elementTop + elementHeight > scrollTopMinus)) {
          currentActive = val;
          break;
        }
      }
      
      setActiveLink(currentActive);
    };

    window.addEventListener('scroll', handleScrollActive);
    handleScrollActive(); // Check initial state

    return () => {
      window.removeEventListener('scroll', handleScrollActive);
    };
  }, [mounted]);

  return (
    <>
      <section className={`navbar-area navbar-nine ${mounted && isSticky ? 'sticky' : ''}`}>
        <div className="container">
          <div className="row">
            <div className="col-lg-12">
              <nav className="navbar navbar-expand-lg">
                <Link className="navbar-brand" href="/">
                  <span className="brand-text-white">
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
                      <Link 
                        className={`page-scroll ${mounted && (!activeLink && pathname === '/') ? 'active' : ''}`} 
                        href={`${dashboardUrl}/sign-up`}
                      >
                        Start
                      </Link>
                    </li>
                    <li className="nav-item">
                      <Link 
                        className={`page-scroll ${mounted && activeLink === '#services' ? 'active' : ''}`} 
                        href="#services"
                      >
                        Funkcje
                      </Link>
                    </li>
                    <li className="nav-item">
                      <Link 
                        className={`page-scroll ${mounted && activeLink === '#pricing' ? 'active' : ''}`} 
                        href="#pricing"
                      >
                        Cennik
                      </Link>
                    </li>
                    <li className="nav-item">
                      <Link 
                        className={`page-scroll ${mounted && pathname === '/resources/help' ? 'active' : ''}`} 
                        href="/resources/help"
                      >
                        FAQ
                      </Link>
                    </li>
                  </ul>
                  
                  {/* Right side: Dashboard when logged in, Login when not */}
                  {!isLoading && (
                    <ul className="navbar-nav ms-auto d-none d-lg-flex">
                      <li className="nav-item">
                        {isAuthenticated ? (
                          <Link className="page-scroll" href={`${dashboardUrl}/`}>
                            Dashboard
                          </Link>
                        ) : (
                          <Link className="page-scroll" href={`${dashboardUrl}/login`}>
                            Logowanie
                          </Link>
                        )}
                      </li>
                    </ul>
                  )}
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
              <span className="brand-text-black">
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
                <Link href={`${dashboardUrl}/sign-up`} onClick={() => setIsSidebarOpen(false)}>
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
                <Link href="/resources/help" onClick={() => setIsSidebarOpen(false)}>
                  FAQ
                </Link>
              </li>
              {!isLoading && isAuthenticated ? (
                <li>
                  <Link href={`${dashboardUrl}/`} onClick={() => setIsSidebarOpen(false)}>
                    Dashboard
                  </Link>
                </li>
              ) : (
                <li>
                  <Link href={`${dashboardUrl}/login`} onClick={() => setIsSidebarOpen(false)}>
                    Logowanie
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

