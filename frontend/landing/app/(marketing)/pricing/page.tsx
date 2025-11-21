import { AnimationContainer, MaxWidthWrapper, PricingCards } from "@/components";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import MagicBadge from "@/components/ui/magic-badge";

const FAQ = [
  {
    id: "1",
    question: "Jak rozpocząć korzystanie z PhotoHub?",
    answer: "Rozpocznij od utworzenia darmowego konta. Każdy nowy użytkownik otrzymuje 1 darmową galerię do przetestowania. Po zalogowaniu możesz od razu utworzyć pierwszą galerię i przesłać zdjęcia."
  },
  {
    id: "2",
    question: "Ile kosztuje korzystanie z PhotoHub?",
    answer: "Ceny zaczynają się od 7 PLN za galerię (1 miesiąc, 1 GB). Masz do wyboru różne pakiety: 1 GB, 3 GB lub 10 GB oraz okresy: 1 miesiąc, 3 miesiące lub 12 miesięcy."
  },
  {
    id: "3",
    question: "Jak działa ochrona hasłem?",
    answer: "Podczas tworzenia galerii możesz ustawić hasło dostępu. Tylko osoby z tym hasłem mogą przeglądać zdjęcia w galerii. Hasło możesz zmienić w każdej chwili lub usunąć galerię."
  },
  {
    id: "4",
    question: "Jak klienci wybierają zdjęcia?",
    answer: "Po udostępnieniu galerii klientowi, może on przeglądać wszystkie zdjęcia i klikać na te, które chce wybrać. Widzi liczbę wybranych zdjęć i koszt w czasie rzeczywistym. Po wyborze zatwierdza wybór, a Ty otrzymujesz powiadomienie."
  },
  {
    id: "5",
    question: "Czy mogę zmienić plan galerii po utworzeniu?",
    answer: "Każda galeria ma przypisany plan przy utworzeniu. Jeśli potrzebujesz większej przestrzeni lub dłuższego okresu, możesz utworzyć nową galerię z odpowiednim planem."
  },
  {
    id: "6",
    question: "Co się dzieje po wygaśnięciu galerii?",
    answer: "Galeria wygasa po upływie wybranego okresu (1 miesiąc, 3 miesiące lub 12 miesięcy). Przed wygaśnięciem otrzymasz powiadomienie email. Możesz przedłużyć galerię lub utworzyć nową."
  },
];

const PricingPage = () => {
  return (
    <MaxWidthWrapper className="mb-40">
      <AnimationContainer delay={0.1}>
        <div className="flex flex-col items-center justify-center py-10 max-w-lg mx-auto">
          <MagicBadge title="Cennik" />
          <h1 className="text-2xl md:text-4xl lg:text-5xl font-semibold font-heading text-center mt-6 !leading-tight text-foreground">
            Prosty i przejrzysty cennik
          </h1>
          <p className="text-base md:text-lg mt-6 text-center text-muted-foreground">
            Wybierz plan, który najlepiej odpowiada Twoim potrzebom. Bez miesięcznych opłat - płacisz tylko za galerię, co pozwala łatwo wliczyć koszt do pakietu zdjęć dla klienta. Wszystko jest proste, przejrzyste i zaledwie kilka kliknięć od finalizacji. Wiemy, że profesjonaliści są zajęci i chcemy ułatwić im pracę, a nie ją komplikować.
          </p>
        </div>
      </AnimationContainer>

      <AnimationContainer delay={0.2}>
        <PricingCards />
      </AnimationContainer>

      <AnimationContainer delay={0.3}>
        <div className="mt-20 w-full">
          <div className="flex flex-col items-center justify-center w-full pt-12">
            <h2 className="mt-6 text-2xl font-semibold text-center lg:text-3xl xl:text-4xl text-foreground">
              Najczęściej zadawane pytania
            </h2>
            <p className="max-w-lg mt-6 text-center text-muted-foreground">
              Oto niektóre z najczęściej zadawanych pytań. Jeśli masz pytanie, na które nie ma tutaj odpowiedzi, skontaktuj się z nami.
            </p>
          </div>
          <div className="max-w-3xl mx-auto w-full mt-20">
            <Accordion type="single" collapsible>
              {FAQ.map((faq) => (
                <AccordionItem key={faq.id} value={faq.id}>
                  <AccordionTrigger className="text-foreground">{faq.question}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">{faq.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </AnimationContainer>

    </MaxWidthWrapper>
  )
};

export default PricingPage

