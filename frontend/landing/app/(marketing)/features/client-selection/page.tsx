import { AnimationContainer, MaxWidthWrapper } from "@/components";
import { Button } from "@/components/ui/button";
import { LampContainer } from "@/components/ui/lamp";
import MagicBadge from "@/components/ui/magic-badge";
import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";

const ClientSelectionPage = () => {
  return (
    <>
      <MaxWidthWrapper>
        <AnimationContainer delay={0.1} className="w-full">
          <div className="flex flex-col items-center justify-center py-10 max-w-lg mx-auto">
            <MagicBadge title="Wybór klienta" />
            <h1 className="text-2xl md:text-4xl lg:text-5xl font-semibold font-heading text-center mt-6 !leading-tight text-foreground">
              Wybór zdjęć przez klienta
            </h1>
            <p className="text-base md:text-lg mt-6 text-center text-muted-foreground">
              Klienci mogą samodzielnie przeglądać i wybierać ulubione zdjęcia. Prosty i intuicyjny proces.
            </p>
            <div className="flex items-center justify-center gap-x-4 mt-8">
              <Button size="sm" asChild>
                <Link href={`${process.env.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3001'}/sign-up`}>
                  Rozpocznij za darmo
                </Link>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link href="/pricing">
                  Zobacz cennik
                </Link>
              </Button>
            </div>
          </div>
        </AnimationContainer>
        <AnimationContainer delay={0.2} className="w-full">
          <div className="w-full flex max-w-4xl py-10 mx-auto">
            <div className="w-full h-auto bg-foreground/10 rounded-lg p-20 flex items-center justify-center border border-border">
              <p className="text-muted-foreground text-center">Wizualizacja wyboru przez klienta</p>
            </div>
          </div>
        </AnimationContainer>
      </MaxWidthWrapper>
      <MaxWidthWrapper className="pt-20">
        <AnimationContainer delay={0.4} className="w-full">
          <LampContainer className="max-w-2xl mx-auto">
            <div className="flex flex-col items-center justify-center relative w-full text-center">
              <h2 className="bg-gradient-to-br from-neutral-300 to-neutral-500 py-4 bg-clip-text text-center text-4xl font-semibold font-heading tracking-tight text-transparent md:text-7xl mt-8">
                Ułatw wybór klientom
              </h2>
              <p className="text-muted-foreground mt-6 max-w-lg mx-auto text-base md:text-lg">
                Daj klientom możliwość samodzielnego wyboru zdjęć. Prosty proces, który oszczędza czas i zwiększa satysfakcję.
              </p>
              <div className="mt-6">
                <Button asChild>
                  <Link href={`${process.env.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3001'}/sign-up`} className="flex items-center">
                    Rozpocznij za darmo
                    <ArrowRightIcon className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
              </div>
            </div>
          </LampContainer>
        </AnimationContainer>
      </MaxWidthWrapper>
    </>
  )
};

export default ClientSelectionPage

