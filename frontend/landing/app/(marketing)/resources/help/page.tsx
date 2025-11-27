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
import { HelpCircle, BookOpen, Mail, ArrowRight } from "lucide-react";
import Link from "next/link";

const faqItems = [
  {
    id: "1",
    question: "Jak rozpocząć korzystanie z PhotoCloud?",
    answer: "Rozpocznij od utworzenia darmowego konta. Każdy nowy użytkownik otrzymuje 1 darmową galerię do przetestowania. Po zalogowaniu możesz od razu utworzyć pierwszą galerię i przesłać zdjęcia."
  },
  {
    id: "2",
    question: "Ile kosztuje korzystanie z PhotoCloud?",
    answer: "Ceny zaczynają się od 7 PLN za galerię (1 miesiąc, 1 GB). Masz do wyboru różne pakiety: 1 GB, 3 GB lub 10 GB oraz okresy: 1 miesiąc, 3 miesiące lub 12 miesięcy. Zobacz pełny cennik na stronie /pricing."
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
  {
    id: "7",
    question: "Jakie formaty zdjęć są obsługiwane?",
    answer: "PhotoCloud obsługuje wszystkie popularne formaty zdjęć, w tym JPEG, PNG i inne standardowe formaty obrazów. Zdjęcia są automatycznie przetwarzane i optymalizowane do szybkiego wyświetlania."
  },
  {
    id: "8",
    question: "Czy mogę pobrać oryginalne zdjęcia?",
    answer: "Tak, możesz pobrać oryginalne zdjęcia w formie ZIP. Jeśli klient wybrał zdjęcia, możesz wygenerować ZIP z wybranymi zdjęciami. ZIP jest dostępny do pobrania przed przesłaniem zdjęć finalnych i jest jednorazowego użytku (usuwany po pobraniu)."
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
    title: "Udostępnij klientowi",
    description: "Wyślij link do galerii. Klient może przeglądać i wybierać zdjęcia"
  },
  {
    title: "Odbierz wybrane zdjęcia",
    description: "Gdy klient wybierze zdjęcia, otrzymasz powiadomienie i możesz pobrać pliki"
  }
];

const HelpPage = () => {
  return (
    <MaxWidthWrapper className="py-20">
      <AnimationContainer delay={0.1}>
        <div className="flex flex-col items-center justify-center py-10 max-w-lg mx-auto">
          <MagicBadge title="Pomoc" />
          <h1 className="text-2xl md:text-4xl lg:text-5xl font-semibold font-heading text-center mt-6 !leading-tight text-foreground">
            Centrum pomocy
          </h1>
          <p className="text-base md:text-lg mt-6 text-center text-muted-foreground">
            Znajdź odpowiedzi na swoje pytania i dowiedz się, jak rozpocząć korzystanie z PhotoCloud.
          </p>
        </div>
      </AnimationContainer>

      <AnimationContainer delay={0.2}>
        <div className="mt-20">
          <h2 className="text-3xl font-semibold mb-8 text-center text-foreground">Najczęściej zadawane pytania</h2>
          <div className="max-w-3xl mx-auto">
            <Accordion type="single" collapsible>
              {faqItems.map((faq) => (
                <AccordionItem key={faq.id} value={faq.id}>
                  <AccordionTrigger className="text-foreground">{faq.question}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">{faq.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </AnimationContainer>

      <AnimationContainer delay={0.3}>
        <div className="mt-20">
          <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <div className="flex items-center gap-3 mb-4">
                <BookOpen className="h-6 w-6 text-primary" />
                <CardTitle className="text-2xl text-foreground">Jak rozpocząć?</CardTitle>
              </div>
              <CardDescription>
                Wykonaj te 5 prostych kroków, aby rozpocząć korzystanie z PhotoCloud
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {gettingStartedSteps.map((step, index) => (
                  <div key={index} className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                      {index + 1}
                    </div>
                    <div>
                      <h3 className="font-semibold mb-1 text-foreground">{step.title}</h3>
                      <p className="text-sm text-muted-foreground">{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </AnimationContainer>

      <AnimationContainer delay={0.4}>
        <Card className="mt-20 border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center gap-3 mb-4">
              <Mail className="h-6 w-6 text-primary" />
              <CardTitle className="text-2xl text-foreground">Potrzebujesz pomocy?</CardTitle>
            </div>
            <CardDescription className="text-base">
              Jeśli nie znalazłeś odpowiedzi na swoje pytanie, skontaktuj się z nami. Jesteśmy tutaj, aby pomóc!
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button asChild size="lg">
              <Link href={`${process.env.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3000'}/sign-up`} className="flex items-center gap-2">
                Skontaktuj się z nami
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </AnimationContainer>
    </MaxWidthWrapper>
  )
};

export default HelpPage

