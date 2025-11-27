import { AnimationContainer, MaxWidthWrapper, PricingCards } from "@/components";
import { BentoCard, BentoGrid, CARDS } from "@/components/ui/bento-grid";
import { BorderBeam } from "@/components/ui/border-beam";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { LampContainer } from "@/components/ui/lamp";
import MagicBadge from "@/components/ui/magic-badge";
import MagicCard from "@/components/ui/magic-card";
import { COMPANIES, PROCESS, REVIEWS } from "@/utils";
import { ArrowRightIcon, CreditCardIcon, StarIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

const HomePage = async () => {
  return (
    <div className="overflow-x-hidden scrollbar-hide size-full">
      {/* Hero Section */}
      <MaxWidthWrapper>
        <div className="flex flex-col items-center justify-center w-full text-center bg-gradient-to-t from-background">
          <AnimationContainer className="flex flex-col items-center justify-center w-full text-center">
            <h1 className="text-foreground text-center py-6 text-5xl font-medium tracking-normal text-balance sm:text-6xl md:text-7xl lg:text-8xl !leading-[1.15] w-full font-heading">
              Prosty sposób na udostępnianie{" "}
              <span className="text-transparent bg-gradient-to-r from-theme-secondary to-theme-primary bg-clip-text inline-block">
                zdjęć klientom
              </span>
            </h1>
            <p className="mb-12 text-lg tracking-tight text-muted-foreground md:text-xl text-balance">
              PhotoCloud to prosty i opłacalny sposób na udostępnianie zdjęć klientom.
              <br className="hidden md:block" />
              <span className="hidden md:block">Łączymy fotografów z ich klientami w bezpieczny i wygodny sposób.</span>
            </p>
            <div className="flex items-center justify-center whitespace-nowrap gap-4 z-50">
              <Button asChild className="bg-theme-primary hover:bg-theme-primary/90 text-white">
                <Link href={`${process.env.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3000'}/sign-up`}>
                  Rozpocznij za darmo
                </Link>
              </Button>
            </div>
          </AnimationContainer>

          <AnimationContainer delay={0.2} className="relative pt-20 pb-20 md:py-32 px-2 bg-transparent w-full">
            <div className="absolute md:top-[10%] left-1/2 gradient w-3/4 -translate-x-1/2 h-1/4 md:h-1/3 inset-0 blur-[5rem] animate-image-glow"></div>
            <div className="-m-2 rounded-xl p-2 ring-1 ring-inset ring-foreground/20 lg:-m-4 lg:rounded-2xl bg-opacity-50 backdrop-blur-3xl">
              <BorderBeam
                size={250}
                duration={12}
                delay={9}
              />
              <div className="rounded-md lg:rounded-xl bg-foreground/10 ring-1 ring-border p-20 flex items-center justify-center min-h-[400px]">
                <p className="text-muted-foreground text-center">Dashboard Preview</p>
              </div>
              <div className="absolute -bottom-4 inset-x-0 w-full h-1/2 bg-gradient-to-t from-background z-40"></div>
              <div className="absolute bottom-0 md:-bottom-8 inset-x-0 w-full h-1/4 bg-gradient-to-t from-background z-50"></div>
            </div>
          </AnimationContainer>
        </div>
      </MaxWidthWrapper>

      {/* Features Section */}
      <MaxWidthWrapper className="pt-10">
        <AnimationContainer delay={0.1}>
          <div className="flex flex-col w-full items-center lg:items-center justify-center py-8">
            <MagicBadge title="Funkcje" />
            <h2 className="text-center lg:text-center text-3xl md:text-5xl !leading-[1.1] font-medium font-heading text-foreground mt-6">
              Co oferujemy
            </h2>
            <p className="mt-4 text-center lg:text-center text-lg text-muted-foreground max-w-lg">
              PhotoCloud to potężne narzędzie do zarządzania galeriami, które pomaga udostępniać i organizować wszystkie Twoje zdjęcia w jednym miejscu.
            </p>
          </div>
        </AnimationContainer>
        <AnimationContainer delay={0.2}>
          <BentoGrid className="py-8">
            {CARDS.map((feature, idx) => (
              <BentoCard key={idx} {...feature} />
            ))}
          </BentoGrid>
        </AnimationContainer>
      </MaxWidthWrapper>

      {/* Process Section */}
      <MaxWidthWrapper className="py-10">
        <AnimationContainer delay={0.1}>
          <div className="flex flex-col items-center lg:items-center justify-center w-full py-8 max-w-xl mx-auto">
            <MagicBadge title="Proces" />
            <h2 className="text-center lg:text-center text-3xl md:text-5xl !leading-[1.1] font-medium font-heading text-foreground mt-6">
              Proste udostępnianie w 3 krokach
            </h2>
            <p className="mt-4 text-center lg:text-center text-lg text-muted-foreground max-w-lg">
              Wykonaj te proste kroki, aby zoptymalizować, zorganizować i udostępnić swoje zdjęcia z łatwością.
            </p>
          </div>
        </AnimationContainer>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 w-full py-8 gap-4 md:gap-8">
          {PROCESS.map((process, id) => (
            <AnimationContainer delay={0.2 * id} key={id}>
              <MagicCard className="group md:py-8">
                <div className="flex flex-col items-start justify-center w-full h-full">
                  <process.icon strokeWidth={1.5} className="w-10 h-10 text-foreground flex-shrink-0" />
                  <div className="flex flex-col relative items-start w-full flex-1 min-h-0">
                    <span className="absolute -top-6 right-0 border-2 border-border text-foreground font-medium text-2xl rounded-full w-12 h-12 flex items-center justify-center pt-0.5">
                      {id + 1}
                    </span>
                    <h3 className="text-base mt-6 font-medium text-foreground line-clamp-2">
                      {process.title}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground line-clamp-3">
                      {process.description}
                    </p>
                  </div>
                </div>
              </MagicCard>
            </AnimationContainer>
          ))}
        </div>
      </MaxWidthWrapper>

      {/* Pricing Section */}
      <MaxWidthWrapper className="py-10">
        <AnimationContainer delay={0.1}>
          <div className="flex flex-col items-center lg:items-center justify-center w-full py-8 max-w-xl mx-auto">
            <MagicBadge title="Prosty cennik" />
            <h2 className="text-center lg:text-center text-3xl md:text-5xl !leading-[1.1] font-medium font-heading text-foreground mt-6">
              Wybierz plan, który działa dla Ciebie
            </h2>
            <p className="mt-4 text-center lg:text-center text-lg text-muted-foreground max-w-lg">
              Prosty, przejrzysty cennik bez abonamentu – płacisz tylko za galerię i łatwo wliczasz koszt w pakiet dla klienta. Szanujemy Twój czas.
            </p>
          </div>
        </AnimationContainer>
        <AnimationContainer delay={0.2}>
          <PricingCards />
        </AnimationContainer>
      </MaxWidthWrapper>

      {/* Reviews Section */}
      <MaxWidthWrapper className="py-10">
        <AnimationContainer delay={0.1}>
          <div className="flex flex-col items-center lg:items-center justify-center w-full py-8 max-w-xl mx-auto">
            <MagicBadge title="Nasi klienci" />
            <h2 className="text-center lg:text-center text-3xl md:text-5xl !leading-[1.1] font-medium font-heading text-foreground mt-6">
              Co mówią nasi użytkownicy
            </h2>
            <p className="mt-4 text-center lg:text-center text-lg text-muted-foreground max-w-lg">
              Oto co niektórzy z naszych użytkowników mówią o PhotoCloud.
            </p>
          </div>
        </AnimationContainer>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 place-items-start gap-4 md:gap-8 py-10">
          <div className="flex flex-col items-start h-min gap-6">
            {REVIEWS.slice(0, 2).map((review, index) => (
              <AnimationContainer delay={0.2 * index} key={index}>
                <MagicCard key={index} className="md:p-0">
                  <Card className="flex flex-col w-full border-none h-min">
                    <CardHeader className="space-y-0">
                      <CardTitle className="text-lg font-medium text-foreground">
                        {review.name}
                      </CardTitle>
                      <CardDescription>
                        {review.username}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="h-[100px] pb-4 flex items-start">
                      <p className="text-muted-foreground line-clamp-4">
                        {review.review}
                      </p>
                    </CardContent>
                    <CardFooter className="w-full space-x-1 mt-auto">
                      {Array.from({ length: review.rating }, (_, i) => (
                        <StarIcon key={i} className="w-4 h-4 fill-yellow-500 text-yellow-500" />
                      ))}
                    </CardFooter>
                  </Card>
                </MagicCard>
              </AnimationContainer>
            ))}
          </div>
          <div className="flex flex-col items-start h-min gap-6">
            {REVIEWS.slice(2, 4).map((review, index) => (
              <AnimationContainer delay={0.2 * index} key={index}>
                <MagicCard key={index} className="md:p-0">
                  <Card className="flex flex-col w-full border-none h-min">
                    <CardHeader className="space-y-0">
                      <CardTitle className="text-lg font-medium text-foreground">
                        {review.name}
                      </CardTitle>
                      <CardDescription>
                        {review.username}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="h-[100px] pb-4 flex items-start">
                      <p className="text-muted-foreground line-clamp-4">
                        {review.review}
                      </p>
                    </CardContent>
                    <CardFooter className="w-full space-x-1 mt-auto">
                      {Array.from({ length: review.rating }, (_, i) => (
                        <StarIcon key={i} className="w-4 h-4 fill-yellow-500 text-yellow-500" />
                      ))}
                    </CardFooter>
                  </Card>
                </MagicCard>
              </AnimationContainer>
            ))}
          </div>
          <div className="flex flex-col items-start h-min gap-6">
            {REVIEWS.slice(4, 6).map((review, index) => (
              <AnimationContainer delay={0.2 * index} key={index}>
                <MagicCard key={index} className="md:p-0">
                  <Card className="flex flex-col w-full border-none h-min">
                    <CardHeader className="space-y-0">
                      <CardTitle className="text-lg font-medium text-foreground">
                        {review.name}
                      </CardTitle>
                      <CardDescription>
                        {review.username}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="h-[100px] pb-4 flex items-start">
                      <p className="text-muted-foreground line-clamp-4">
                        {review.review}
                      </p>
                    </CardContent>
                    <CardFooter className="w-full space-x-1 mt-auto">
                      {Array.from({ length: review.rating }, (_, i) => (
                        <StarIcon key={i} className="w-4 h-4 fill-yellow-500 text-yellow-500" />
                      ))}
                    </CardFooter>
                  </Card>
                </MagicCard>
              </AnimationContainer>
            ))}
          </div>
        </div>
      </MaxWidthWrapper>

      {/* CTA Section */}
      <MaxWidthWrapper className="mt-20 max-w-[100vw] overflow-x-hidden scrollbar-hide">
        <AnimationContainer delay={0.1}>
          <LampContainer>
            <div className="flex flex-col items-center justify-center relative w-full text-center">
              <h2 className="bg-gradient-to-b from-neutral-200 to-neutral-400 py-4 bg-clip-text text-center text-4xl md:text-7xl !leading-[1.15] font-medium font-heading tracking-tight text-transparent mt-8">
                Wejdź w przyszłość udostępniania zdjęć
              </h2>
              <p className="text-muted-foreground mt-6 max-w-md mx-auto">
                Doświadcz nowoczesnego rozwiązania, które zmienia sposób, w jaki udostępniasz zdjęcia. Podnieś swój profesjonalizm dzięki naszej platformie.
              </p>
              <div className="mt-6">
                <Button asChild>
                  <Link href={`${process.env.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3000'}/sign-up`} className="flex items-center">
                    Rozpocznij za darmo
                    <ArrowRightIcon className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
              </div>
            </div>
          </LampContainer>
        </AnimationContainer>
      </MaxWidthWrapper>

    </div>
  )
};

export default HomePage

