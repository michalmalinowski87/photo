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
                <h1>PhotoCloud - Intuicyjne udostępnianie zdjęć, które działa dla Ciebie</h1>
                <p>
                  Zaprojektowany przez fotografów z ponad 15-letnim doświadczeniem, z naciskiem na
                  prostotę i funkcjonalność. Oszczędzaj czas i poprawiaj interakcje z klientami
                  dzięki intuicyjnym narzędziom, które dostosowują się do Twojego tempa.
                </p>
                <div className="button">
                  <Link href={`${dashboardUrl}/sign-up`} className="btn primary-btn">
                    Rozpocznij za darmo
                  </Link>
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
                <h2 className="main-title fw-bold">Twoje zdjęcia, Twoje zasady.</h2>
                <div className="about-five-tab">
                  <nav>
                    <div className="nav nav-tabs" id="nav-tab" role="tablist">
                      <button
                        className={`nav-link ${activeTab === "who" ? "active" : ""}`}
                        onClick={() => setActiveTab("who")}
                        type="button"
                      >
                        Kim Jesteśmy
                      </button>
                      <button
                        className={`nav-link ${activeTab === "vision" ? "active" : ""}`}
                        onClick={() => setActiveTab("vision")}
                        type="button"
                      >
                        Nasza Wizja
                      </button>
                      <button
                        className={`nav-link ${activeTab === "history" ? "active" : ""}`}
                        onClick={() => setActiveTab("history")}
                        type="button"
                      >
                        Nasza Historia
                      </button>
                    </div>
                  </nav>
                  <div className="tab-content" id="nav-tabContent">
                    <div className={`tab-pane fade ${activeTab === "who" ? "show active" : ""}`}>
                      <p>
                        PhotoCloud to platforma stworzona przez fotografów z ponad 15-letnim
                        doświadczeniem w branży. Rozumiemy wyzwania związane z udostępnianiem i
                        zarządzaniem zdjęciami dla klientów, ponieważ sami je przeżywaliśmy. Nasza
                        misja to dostarczenie intuicyjnego, bezpiecznego i efektywnego rozwiązania,
                        które pozwala skupić się na tym, co najważniejsze – tworzeniu niesamowitych
                        zdjęć. Jesteśmy zespołem doświadczonych fotografów i pasjonatów technologii,
                        dążącym do ciągłego doskonalenia narzędzi, które wspierają Twoją pracę.
                      </p>
                    </div>
                    <div className={`tab-pane fade ${activeTab === "vision" ? "show active" : ""}`}>
                      <p>
                        Naszą wizją jest stworzenie wiodącej platformy, która rewolucjonizuje
                        sposób, w jaki fotografowie współpracują z klientami. Chcemy, aby
                        udostępnianie zdjęć było przyjemnością, a zarządzanie galeriami – dziecinnie
                        proste. Dążymy do tego, by PhotoCloud był synonimem innowacyjności,
                        niezawodności i pełnej kontroli dla każdego fotografa, niezależnie od skali
                        jego działalności. Nasz cel to nie tylko dostarczanie narzędzi, ale
                        budowanie społeczności i wspieranie rozwoju branży fotograficznej.
                      </p>
                    </div>
                    <div
                      className={`tab-pane fade ${activeTab === "history" ? "show active" : ""}`}
                    >
                      <p>
                        PhotoCloud narodził się z potrzeby – z frustracji związanej z przestarzałymi
                        i skomplikowanymi metodami udostępniania zdjęć. Grupa fotografów z ponad
                        15-letnim doświadczeniem w branży połączyła siły z deweloperami, aby
                        stworzyć platformę, która odpowiada na realne problemy branży. Od naszych
                        skromnych początków, poprzez intensywny rozwój i liczne testy z udziałem
                        beta-użytkowników, zawsze kierowaliśmy się jedną zasadą: prostota i
                        funkcjonalność. Dziś, PhotoCloud to dojrzałe narzędzie, które stale
                        ewoluuje, dzięki ciągłemu słuchaniu potrzeb naszych użytkowników i adaptacji
                        do dynamicznie zmieniającego się rynku.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Key Missions Section */}
      <section id="key-missions" className="services-area services-eight">
        <div className="section-title-five">
          <div className="container">
            <div className="row">
              <div className="col-12">
                <div className="content">
                  <h6>KLUCZOWE MISJE</h6>
                  <h2 className="fw-bold">Stworzone dla fotografów, którzy cenią swój czas</h2>
                  <p>
                    Każda funkcja została zaprojektowana, aby usprawnić Twoją pracę, bez zbędnych
                    komplikacji, dzięki czemu możesz skupić się na tym, co robisz najlepiej.
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
                icon: "lni-bolt",
                title: "Prostota",
                description:
                  "Eliminujemy zbędną złożoność, byś mógł skupić się na fotografii i wyjątkowych chwilach. Każda funkcja przyspiesza Twój workflow – od tworzenia galerii po bezproblemowe udostępnianie klientom.",
              },
              {
                icon: "lni-alarm",
                title: "Powiadomienia",
                description:
                  "Powiadomienia e-mail informują Cię na każdym etapie, byś nigdy nie przegapił ważnego momentu. Pozwól technologii zająć się szczegółami, i skup się natym co najważniejsze: kreatywnej fotografii.",
              },
              {
                icon: "lni-wallet",
                title: "Przejrzyste Ceny",
                description:
                  "Pożegnaj miesięczne abonamenty i ukryte opłaty. Oferujemy łatwe wliczanie kosztów w cenę usługi. Bez zobowiązań, bez niespodzianek – wiesz dokładnie, za co płacisz, za każdym razem.",
              },
              {
                icon: "lni-lock",
                title: "Bezpieczeństwo",
                description:
                  "Chroń prywatność klientów dzięki galeriom zabezpieczonym hasłem. Każda galeria jest domyślnie chroniona – tylko autoryzowane osoby zobaczą Twoje zdjęcia. Śpij spokojnie, wiedząc, że honorujesz zaufanie klientów.",
              },
              {
                icon: "lni-rocket",
                title: "Szybkość",
                description:
                  "Błyskawiczne ładowanie dzięki bezstratnej optymalizacji i najnowszej technologii, która zachowuje każdy szczegół obrazu. Galerie otwierają się natychmiast, nawet na wolnych łączach, łącząc profesjonalną jakość z najwyższą wydajnością.",
              },
              {
                icon: "lni-layers",
                title: "Elastyczny Proces",
                description:
                  "Utrzymuj porządek w pracy dzięki systemowi zamówień, który zapewnia spójność i ciągłość pracy. Każdy etap jest prosty i przewidywalny, a nasz system prowadzi klientow przez proces co redukuje potrzebę wymiany wiadomości.",
              },
            ].map((mission, index) => (
              <div key={index} className="col-lg-4 col-md-6">
                <div className="single-services">
                  <div className="service-icon">
                    <i className={`lni ${mission.icon}`}></i>
                  </div>
                  <div className="service-content">
                    <h4>{mission.title}</h4>
                    <p>{mission.description}</p>
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
                    Oferujemy elastyczne plany cenowe, które dostosowują się do Twoich potrzeb.
                    Płacisz tylko za to, czego używasz, bez ukrytych opłat i długoterminowych
                    zobowiązań.
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
                {(["1m", "3m", "12m"] as Duration[]).map((duration) => {
                  const isSelected = selectedDuration === duration;
                  return (
                    <button
                      key={duration}
                      onClick={() => setSelectedDuration(duration)}
                      type="button"
                      className={`btn duration-btn ${isSelected ? "primary-btn" : "primary-btn-outline"}`}
                    >
                      {duration === "1m"
                        ? "1 MIESIĄC"
                        : duration === "3m"
                          ? "3 MIESIĄCE"
                          : "12 MIESIĘCY"}
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
                <h2>Rozpocznij darmowy okres próbny już dziś</h2>
                <p>
                  Doświadcz udostępniania zdjęć, które naprawdę działa dla Ciebie. Oszczędzaj czas,
                  usprawniaj przepływ pracy i zachwycaj klientów profesjonalnym podejściem, które
                  wyróżnia Cię na rynku.
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
                    Jesteśmy dumni z zaufania, jakim obdarzyło nas wielu profesjonalnych fotografów.
                    Przeczytaj opinie tych, którzy już korzystają z PhotoCloud.
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
                    text: "PhotoCloud zmienił sposób, w jaki udostępniam zdjęcia klientom. Prosty, bezpieczny i bardzo opłacalny!",
                    name: "Anna Kowalska",
                    role: "Fotograf ślubny",
                  },
                  {
                    text: "Kocham elastyczny system cenowy. Mogę dostosować ofertę do potrzeb każdego klienta. Gorąco polecam!",
                    name: "Marcin Nowak",
                    role: "Fotograf portretowy",
                  },
                  {
                    text: "Ochrona hasłem i łatwy wybór zdjęć przez klientów to ogromna zaleta. Klienci są zachwyceni!",
                    name: "Katarzyna Wiśniewska",
                    role: "Fotograf rodzinny",
                  },
                  {
                    text: "Szybkie ładowanie, intuicyjny interfejs i świetne wsparcie. To wszystko czego potrzebuję!",
                    name: "Piotr Zieliński",
                    role: "Fotograf eventowy",
                  },
                  {
                    text: "Najlepsza inwestycja w moim biznesie. Klienci doceniają profesjonalizm i wygodę.",
                    name: "Magdalena Krawczyk",
                    role: "Fotograf produktowy",
                  },
                  {
                    text: "PhotoCloud to game changer. Oszczędzam czas i pieniądze, a klienci są zadowoleni.",
                    name: "Tomasz Lewandowski",
                    role: "Fotograf komercyjny",
                  },
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
