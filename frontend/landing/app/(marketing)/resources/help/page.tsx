import { AnimationContainer, MaxWidthWrapper } from "@/components";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import MagicBadge from "@/components/ui/magic-badge";
import { Mail, ArrowRight } from "lucide-react";
import Link from "next/link";

const faqCategories = [
  {
    id: "getting-started",
    title: "Najczęstsze pytania",
    color: "var(--primary)",
    items: [
      {
        id: "1",
        question: "Jak zacząć korzystać z PhotoCloud?",
        answer: "Rozpoczęcie jest niezwykle proste! Załóż darmowe konto w kilka sekund i od razu otrzymasz swoją pierwszą galerię o pojemności 1 GB na 3 miesiące, bez żadnych zobowiązań. Po zalogowaniu możesz natychmiast tworzyć i przesyłać zdjęcia, odkrywając intuicyjny workflow."
      },
      {
        id: "2",
        question: "Czy pierwsza galeria jest naprawdę darmowa?",
        answer: "Absolutnie tak! Twoja pierwsza galeria (1 GB na 3 miesiące) jest całkowicie darmowa i nie wymaga podawania danych karty płatniczej. To nasz sposób, byś mógł bez żadnego ryzyka przetestować wszystkie funkcje platformy i zobaczyć, jak PhotoCloud pracuje dla Ciebie."
      },
      {
        id: "3",
        question: "Jak klienci wybierają i pobierają zdjęcia?",
        answer: "Proces jest intuicyjny dla klienta. Po otrzymaniu linku do galerii, mogą swobodnie przeglądać i zaznaczać ulubione zdjęcia. Widzą podsumowanie wybranych plików i koszt w czasie rzeczywistym. Po ich akceptacji, Ty otrzymujesz powiadomienie, a zdjęcia są gotowe do przygotowania i pobrania."
      },
      {
        id: "4",
        question: "Jakie formaty zdjęć są obsługiwane i czy mogę pobrać oryginalne pliki?",
        answer: "PhotoCloud obsługuje wszystkie popularne formaty zdjęć (JPEG, PNG itp.), automatycznie optymalizując je do szybkiego wyświetlania. Tak, masz pełną swobodę – możesz pobrać wybrane lub wszystkie oryginalne pliki w formie skompresowanego archiwum ZIP po zakończeniu selekcji przez klienta."
      },
    ]
  },
  {
    id: "pricing-account",
    title: "Cennik i Konto",
    color: "var(--primary-dark)",
    items: [
      {
        id: "5",
        question: "Ile kosztuje PhotoCloud i jak działają płatności?",
        answer: "W PhotoCloud nie ma miesięcznych subskrypcji – płacisz tylko za każdą galerię, co ułatwia wliczenie kosztu w Twoje usługi. Oferujemy elastyczne pakiety danych i okresy ważności, które dopasowują się do Twoich indywidualnych potrzeb, zapewniając pełną przejrzystość cen."
      },
      {
        id: "6",
        question: "Co się dzieje z galerią po wygaśnięciu okresu?",
        answer: "Przed wygaśnięciem otrzymasz przypomnienie e-mail, dając Ci czas na decyzję. Masz możliwość przedłużenia ważności galerii lub utworzenia nowej, by zachować pełną kontrolę nad swoimi projektami bez nieoczekiwanych strat."
      },
      {
        id: "7",
        question: "Jak działa ochrona hasłem dla galerii?",
        answer: "Masz pełną kontrolę nad prywatnością. Każdą galerię możesz zabezpieczyć unikalnym hasłem, dzięki czemu tylko osoby, którym je udostępnisz, mają dostęp do zdjęć. To gwarantuje bezpieczeństwo i poufność Twoich projektów."
      },
    ]
  },
];

const gettingStartedSteps = [
  {
    title: "Utwórz konto",
    description: "Zarejestruj się i otrzymaj 1 darmową galerię do przetestowania"
  },
  {
    title: "Utwórz galerię",
    description: "Dodaj nazwę, ustaw hasło (opcjonalnie) i wybierz plan"
  },
  {
    title: "Prześlij zdjęcia",
    description: "Dodaj zdjęcia do galerii. Obsługujemy wszystkie popularne formaty"
  },
  {
    title: "Opublikuj galerię",
    description: "Opłać galerię na podstawie rozmiaru zdjęć. Pierwsza galeria jest darmowa"
  },
  {
    title: "Udostępnij klientowi",
    description: "Wyślij link do galerii. Klient może przeglądać i wybierać zdjęcia"
  },
  {
    title: "Dostarcz zdjęcia finalne",
    description: "Przerób wybrane zdjęcia i dostarcz klientowi zdjęcia finalne"
  }
];

const HelpPage = () => {
  return (
    <>
      {/* Hero Section */}
      <section id="help-hero" className="help-hero-area">
        <div className="container">
          <AnimationContainer delay={0.1}>
            <div className="flex flex-col items-center justify-center max-w-lg mx-auto">
              <MagicBadge title="Pomoc" />
              <h1 className="text-2xl md:text-4xl lg:text-5xl font-semibold font-heading text-center mt-6 !leading-tight text-foreground">
                Centrum pomocy
              </h1>
              <p className="text-base md:text-lg mt-6 text-center text-muted-foreground">
                Znajdź odpowiedzi na swoje pytania i dowiedz się, jak rozpocząć korzystanie z PhotoCloud.
              </p>
            </div>
          </AnimationContainer>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="faq-area">
        <div className="section-title-five">
          <div className="container">
            <div className="row">
              <div className="col-12">
                <div className="content">
                  <h6>FAQ</h6>
                  <h2 className="fw-bold">Najczęściej zadawane pytania</h2>
                  <p>
                    Masz pytania? Przygotowaliśmy odpowiedzi na najważniejsze zagadnienia, aby rozwiać wątpliwości i pokazać, jak proste jest korzystanie z PhotoCloud.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="container">
          <AnimationContainer delay={0.2}>
            <div className="row justify-content-center">
              <div className="col-lg-10">
                <div className="faq-categories-wrapper">
                  {faqCategories.map((category, categoryIndex) => (
                    <AnimationContainer key={category.id} delay={0.1 * categoryIndex}>
                      <div className="faq-category-block" style={{ backgroundColor: category.color }}>
                        <h3 className="faq-category-title">{category.title}</h3>
                        <div className="faq-category-content">
                          <Accordion type="single" collapsible className="w-full">
                            {category.items.map((faq) => (
                              <AccordionItem key={faq.id} value={faq.id} className="faq-category-item">
                                <AccordionTrigger className="faq-category-trigger">
                                  {faq.question}
                                </AccordionTrigger>
                                <AccordionContent className="faq-category-content-text">
                                  {faq.answer}
                                </AccordionContent>
                              </AccordionItem>
                            ))}
                          </Accordion>
                        </div>
                      </div>
                    </AnimationContainer>
                  ))}
                </div>
              </div>
            </div>
          </AnimationContainer>
        </div>
      </section>

      {/* Getting Started Section */}
      <section id="getting-started" className="getting-started-area">
        <div className="section-title-five">
          <div className="container">
            <div className="row">
              <div className="col-12">
                <div className="content">
                  <h6>Przewodnik</h6>
                  <h2 className="fw-bold">Jak rozpocząć?</h2>
                  <p>
                    Wykonaj te 6 prostych kroków, aby rozpocząć korzystanie z PhotoCloud i udostępniać zdjęcia klientom w profesjonalny sposób.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="container">
          <AnimationContainer delay={0.3}>
            <div className="row justify-content-center">
              <div className="col-lg-10">
                <div className="row">
                  {gettingStartedSteps.map((step, index) => (
                    <div key={index} className="col-md-6 col-lg-4 mb-4">
                      <AnimationContainer delay={0.1 * (index + 1)}>
                        <div className="getting-started-card">
                          <div className="step-number">{index + 1}</div>
                          <h3>{step.title}</h3>
                          <p>{step.description}</p>
                        </div>
                      </AnimationContainer>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </AnimationContainer>
        </div>
      </section>

      {/* CTA Section */}
      <section id="call-action" className="call-action">
        <div className="container">
          <div className="row justify-content-center">
            <div className="col-xxl-6 col-xl-7 col-lg-8 col-md-9">
              <AnimationContainer delay={0.1}>
                <div className="inner-content">
                  <h2 className="text-white mb-4">Gotowy, by rozpocząć swoją przygodę z PhotoCloud?</h2>
                  <p className="text-white text-lg">
                    Dołącz do grona zadowolonych fotografów, którzy cenią prostotę, szybkość i kontrolę. Skorzystaj z darmowej galerii już dziś i przekonaj się, jak PhotoCloud usprawni Twoją pracę.
                  </p>
                  <div className="light-rounded-buttons">
                    <Link 
                      href={`${process.env.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3001'}/sign-up`} 
                      className="btn primary-btn-outline"
                    >
                      Rozpocznij za Darmo – Bez Karty!
                      <ArrowRight className="w-4 h-4 ml-2 inline-block" />
                    </Link>
                  </div>
                </div>
              </AnimationContainer>
            </div>
          </div>
        </div>
      </section>
    </>
  )
};

export default HelpPage

