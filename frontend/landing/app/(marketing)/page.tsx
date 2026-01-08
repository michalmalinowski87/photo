"use client";

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { PLANS } from '@/utils/constants/pricing';

type Duration = '1m' | '3m' | '12m';

export default function HomePage() {
  const [activeTab, setActiveTab] = useState('who');
  const [selectedDuration, setSelectedDuration] = useState<Duration>('1m');
  const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3001';

  return (
    <>
      {/* Hero Section */}
      <section id="hero-area" className="header-area header-eight">
        <div className="container">
          <div className="row align-items-center">
            <div className="col-lg-6 col-md-12 col-12">
              <div className="header-content">
                <h1>Prosty sposób na udostępnianie zdjęć klientom</h1>
                <p>
                  PhotoCloud to proste i opłacalne narzędzie do zarządzania galeriami, które pomaga udostępniać i organizować wszystkie Twoje zdjęcia w jednym miejscu. Łączymy fotografów z ich klientami w bezpieczny i wygodny sposób.
                </p>
                <div className="button">
                  <Link href={`${dashboardUrl}/sign-up`} className="btn primary-btn">
                    Rozpocznij za darmo
                  </Link>
                  <a
                    href="#"
                    className="glightbox video-button"
                    data-glightbox="type: video"
                    data-glightbox-source="youtube"
                    data-glightbox-href="#"
                  >
                    <span className="btn icon-btn rounded-full">
                      <i className="lni lni-play"></i>
                    </span>
                    <span className="text">Zobacz Wprowadzenie</span>
                  </a>
                </div>
              </div>
            </div>
            <div className="col-lg-6 col-md-12 col-12">
              <div className="header-image">
                <Image
                  src="/assets/images/header/hero-image.jpg"
                  alt="PhotoCloud Dashboard Preview"
                  width={800}
                  height={600}
                  className="w-full"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section className="about-area about-five">
        <div className="container">
          <div className="row align-items-center">
            <div className="col-lg-6 col-12">
              <div className="about-image-five">
                <svg className="shape" width="106" height="134" viewBox="0 0 106 134" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {/* SVG dots pattern - simplified version */}
                  {Array.from({ length: 10 }).map((_, i) => (
                    <circle key={i} cx={1.66654 + (i % 2) * 14.66676} cy={1.66679 + Math.floor(i / 2) * 14.66671} r="1.66667" fill="#DADADA" />
                  ))}
                </svg>
                <Image
                  src="/assets/images/about/about-img1.jpg"
                  alt="about"
                  width={500}
                  height={600}
                  className="w-full"
                />
              </div>
            </div>
            <div className="col-lg-6 col-12">
              <div className="about-five-content">
                <h6 className="small-title text-lg">O NAS</h6>
                <h2 className="main-title fw-bold">Twoje zdjęcia, Twoje zasady. Upraszczamy udostępnianie.</h2>
                <div className="about-five-tab">
                  <nav>
                    <div className="nav nav-tabs" id="nav-tab" role="tablist">
                      <button
                        className={`nav-link ${activeTab === 'who' ? 'active' : ''}`}
                        onClick={() => setActiveTab('who')}
                        type="button"
                      >
                        Kim Jesteśmy
                      </button>
                      <button
                        className={`nav-link ${activeTab === 'vision' ? 'active' : ''}`}
                        onClick={() => setActiveTab('vision')}
                        type="button"
                      >
                        Nasza Wizja
                      </button>
                      <button
                        className={`nav-link ${activeTab === 'history' ? 'active' : ''}`}
                        onClick={() => setActiveTab('history')}
                        type="button"
                      >
                        Nasza Historia
                      </button>
                    </div>
                  </nav>
                  <div className="tab-content" id="nav-tabContent">
                    <div className={`tab-pane fade ${activeTab === 'who' ? 'show active' : ''}`}>
                      <p>PhotoCloud to platforma stworzona z myślą o profesjonalnych fotografach. Rozumiemy wyzwania związane z udostępnianiem i zarządzaniem zdjęciami dla klientów. Nasza misja to dostarczenie intuicyjnego, bezpiecznego i efektywnego rozwiązania, które pozwala skupić się na tym, co najważniejsze – tworzeniu niesamowitych zdjęć. Jesteśmy zespołem pasjonatów technologii i fotografii, dążącym do ciągłego doskonalenia narzędzi, które wspierają Twoją pracę.</p>
                    </div>
                    <div className={`tab-pane fade ${activeTab === 'vision' ? 'show active' : ''}`}>
                      <p>Naszą wizją jest stworzenie wiodącej platformy, która rewolucjonizuje sposób, w jaki fotografowie współpracują z klientami. Chcemy, aby udostępnianie zdjęć było przyjemnością, a zarządzanie galeriami – dziecinnie proste. Dążymy do tego, by PhotoCloud był synonimem innowacyjności, niezawodności i pełnej kontroli dla każdego fotografa, niezależnie od skali jego działalności. Nasz cel to nie tylko dostarczanie narzędzi, ale budowanie społeczności i wspieranie rozwoju branży fotograficznej.</p>
                    </div>
                    <div className={`tab-pane fade ${activeTab === 'history' ? 'show active' : ''}`}>
                      <p>PhotoCloud narodził się z potrzeby – z frustracji związanej z przestarzałymi i skomplikowanymi metodami udostępniania zdjęć. Grupa doświadczonych fotografów i deweloperów połączyła siły, aby stworzyć platformę, która odpowiada na realne problemy branży. Od naszych skromnych początków, poprzez intensywny rozwój i liczne testy z udziałem beta-użytkowników, zawsze kierowaliśmy się jedną zasadą: prostota i funkcjonalność. Dziś, PhotoCloud to dojrzałe narzędzie, które stale ewoluuje, dzięki ciągłemu słuchaniu potrzeb naszych użytkowników i adaptacji do dynamicznie zmieniającego się rynku.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section id="services" className="services-area services-eight">
        <div className="section-title-five">
          <div className="container">
            <div className="row">
              <div className="col-12">
                <div className="content">
                  <h6>NASZE USŁUGI</h6>
                  <h2 className="fw-bold">Oferujemy rozwiązania, które ułatwią Twoją pracę</h2>
                  <p>
                    PhotoCloud to kompleksowe narzędzie zaprojektowane, aby usprawnić każdy aspekt udostępniania i zarządzania zdjęciami dla klientów.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="container">
          <div className="row">
            {[
              {
                icon: 'lni-gallery',
                title: 'Zarządzanie Galeriami',
                description: 'Twórz piękne, spersonalizowane galerie zdjęć dla swoich klientów. Łatwo organizuj i prezentuj swoją pracę w profesjonalny sposób.'
              },
              {
                icon: 'lni-users',
                title: 'Wybór Klienta',
                description: 'Pozwól klientom wybierać ulubione zdjęcia bezpośrednio w galerii. Uprość proces selekcji i przyspiesz realizację zamówień.'
              },
              {
                icon: 'lni-lock',
                title: 'Ochrona Hasłem',
                description: 'Zapewnij bezpieczeństwo swoim zdjęciom dzięki ochronie galerii hasłem. Kontroluj dostęp i dbaj o prywatność klientów.'
              },
              {
                icon: 'lni-image',
                title: 'Optymalizacja Obrazów',
                description: 'Automatyczna optymalizacja zdjęć dla szybkiego ładowania i doskonałej jakości, bez kompromisów. Zadbaj o wrażenia swoich klientów.'
              },
              {
                icon: 'lni-wallet',
                title: 'Elastyczne Ceny',
                description: 'Prosty i przejrzysty cennik bez abonamentu – płacisz tylko za galerię i łatwo wliczasz koszt w pakiet dla klienta. Szanujemy Twój czas.'
              },
              {
                icon: 'lni-headphone-alt',
                title: 'Wsparcie 24/7',
                description: 'Nasze wsparcie techniczne jest dostępne 24 godziny na dobę, 7 dni w tygodniu, aby pomóc Ci w każdej sytuacji. Twoja satysfakcja jest naszym priorytetem.'
              }
            ].map((service, index) => (
              <div key={index} className="col-lg-4 col-md-6">
                <div className="single-services">
                  <div className="service-icon">
                    <i className={`lni ${service.icon}`}></i>
                  </div>
                  <div className="service-content">
                    <h4>{service.title}</h4>
                    <p>{service.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="pricing-area pricing-fourteen">
        <div className="section-title-five">
          <div className="container">
            <div className="row">
              <div className="col-12">
                <div className="content">
                  <h6>PROSTY CENNIK</h6>
                  <h2 className="fw-bold">Wybierz plan, który działa dla Ciebie</h2>
                  <p>
                    Oferujemy elastyczne plany cenowe, które dostosowują się do Twoich potrzeb. Płacisz tylko za to, czego używasz, bez ukrytych opłat i długoterminowych zobowiązań.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="container">
          {/* Duration Selector */}
          <div className="row justify-content-center mb-5">
            <div className="col-lg-8 col-md-10 col-12">
              <div className="duration-selector">
                {(['1m', '3m', '12m'] as Duration[]).map((duration) => {
                  const isSelected = selectedDuration === duration;
                  return (
                    <button
                      key={duration}
                      onClick={() => setSelectedDuration(duration)}
                      type="button"
                      className={`btn duration-btn ${isSelected ? 'primary-btn' : 'primary-btn-outline'}`}
                    >
                      {duration === '1m' ? '1 MIESIĄC' : duration === '3m' ? '3 MIESIĄCE' : '12 MIESIĘCY'}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Pricing Cards */}
          <div className="row">
            {PLANS.map((plan, index) => {
              const price = plan.price[selectedDuration];
              const isMiddle = index === 1; // 3GB plan is middle/recommended

              return (
                <div key={index} className="col-lg-4 col-md-6 col-12">
                  <div className={`pricing-style-fourteen ${isMiddle ? "middle" : ""}`}>
                    <div className="table-head">
                      <h6 className="title">{plan.name}</h6>
                      <div className="price">
                        <h2 className="amount">
                          <span>{price}</span>
                          <span className="currency"> PLN</span>
                        </h2>
                      </div>
                    </div>
                    <div className="light-rounded-buttons">
                      <Link
                        href={`${dashboardUrl}/sign-up`}
                        className={`btn pricing-btn ${isMiddle ? "primary-btn" : "primary-btn-outline"}`}
                      >
                        {index === 0 ? "Rozpocznij za darmo" : "Wybierz plan"}
                      </Link>
                    </div>
                    <div className="table-content">
                      <ul className="table-list">
                        <li>
                          <i className="lni lni-checkmark-circle"></i>
                          {plan.photoEstimate.displayText}
                        </li>
                        {plan.features.map((feature, idx) => (
                          <li key={idx}>
                            <i className="lni lni-checkmark-circle"></i>
                            {feature.text}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section id="call-action" className="call-action">
        <div className="container">
          <div className="row justify-content-center">
            <div className="col-xxl-6 col-xl-7 col-lg-8 col-md-9">
              <div className="inner-content">
                <h2>Wejdź w przyszłość udostępniania zdjęć</h2>
                <p>
                  Doświadcz nowoczesnego rozwiązania, które zmienia sposób, w jaki udostępniasz zdjęcia. Podnieś swój profesjonalizm dzięki naszej platformie.
                </p>
                <div className="light-rounded-buttons">
                  <Link href={`${dashboardUrl}/sign-up`} className="btn primary-btn-outline">
                    Rozpocznij za darmo
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <div id="clients" className="brand-area section">
        <div className="section-title-five">
          <div className="container">
            <div className="row">
              <div className="col-12">
                <div className="content">
                  <h6>Nasi Zadowoleni Klienci</h6>
                  <h2 className="fw-bold">Kto nam zaufał</h2>
                  <p>
                    Jesteśmy dumni z zaufania, jakim obdarzyło nas wielu profesjonalnych fotografów. Przeczytaj opinie tych, którzy już korzystają z PhotoCloud.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="container">
          <div className="row">
            <div className="col-12">
              <div className="testimonials-grid">
                {[
                  {
                    text: 'PhotoCloud zmienił sposób, w jaki udostępniam zdjęcia klientom. Prosty, bezpieczny i bardzo opłacalny!',
                    name: 'Anna Kowalska',
                    role: 'Fotograf ślubny'
                  },
                  {
                    text: 'Kocham elastyczny system cenowy. Mogę dostosować ofertę do potrzeb każdego klienta. Gorąco polecam!',
                    name: 'Marcin Nowak',
                    role: 'Fotograf portretowy'
                  },
                  {
                    text: 'Ochrona hasłem i łatwy wybór zdjęć przez klientów to ogromna zaleta. Klienci są zachwyceni!',
                    name: 'Katarzyna Wiśniewska',
                    role: 'Fotograf rodzinny'
                  },
                  {
                    text: 'Szybkie ładowanie, intuicyjny interfejs i świetne wsparcie. To wszystko czego potrzebuję!',
                    name: 'Piotr Zieliński',
                    role: 'Fotograf eventowy'
                  },
                  {
                    text: 'Najlepsza inwestycja w moim biznesie. Klienci doceniają profesjonalizm i wygodę.',
                    name: 'Magdalena Krawczyk',
                    role: 'Fotograf produktowy'
                  },
                  {
                    text: 'PhotoCloud to game changer. Oszczędzam czas i pieniądze, a klienci są zadowoleni.',
                    name: 'Tomasz Lewandowski',
                    role: 'Fotograf komercyjny'
                  }
                ].map((testimonial, index) => (
                  <div key={index} className="testimonial-card">
                    <div className="testimonial-quote">&quot;</div>
                    <p className="testimonial-text">{testimonial.text}</p>
                    <div className="testimonial-footer">
                      <div className="testimonial-info">
                        <h5 className="testimonial-name">{testimonial.name}</h5>
                        <p className="testimonial-role">{testimonial.role}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll to Top - handled by component */}
    </>
  );
}
