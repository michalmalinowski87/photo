import { AnimationContainer, MaxWidthWrapper } from "@/components";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import MagicBadge from "@/components/ui/magic-badge";
import { Lock, DollarSign, Settings, Users } from "lucide-react";

const featuresList = [
  {
    title: "Galeria chroniona hasłem",
    description: "Bezpieczne udostępnianie zdjęć tylko wybranym klientom. Kontroluj, kto ma dostęp do Twoich galerii.",
    href: "/features/password-protection",
    icon: Lock,
  },
  {
    title: "Opłacalne rozwiązanie",
    description: "Proste i przystępne ceny bez ukrytych kosztów. Płać tylko za to, czego potrzebujesz.",
    href: "/features/cost-efficient",
    icon: DollarSign,
  },
  {
    title: "Elastyczne ceny",
    description: "System dodatków pozwala dostosować ofertę do indywidualnych potrzeb każdego fotografa i klienta.",
    href: "/features/flexible-pricing",
    icon: Settings,
  },
  {
    title: "Wybór przez klienta",
    description: "Umożliw swoim klientom samodzielne wybieranie ulubionych zdjęć z galerii w prosty i intuicyjny sposób.",
    href: "/features/client-selection",
    icon: Users,
  },
];

export default function FeaturesPage() {
  return (
    <MaxWidthWrapper className="py-20">
      <AnimationContainer delay={0.1}>
        <div className="flex flex-col items-center justify-center w-full py-8 max-w-xl mx-auto">
          <MagicBadge title="Funkcje" />
          <h1 className="text-center text-3xl md:text-5xl !leading-[1.1] font-medium font-heading text-foreground mt-6">
            Wszystkie funkcje PhotoCloud
          </h1>
          <p className="mt-4 text-center text-lg text-muted-foreground max-w-lg">
            Odkryj wszystkie narzędzia, które pomogą Ci profesjonalnie zarządzać zdjęciami i klientami.
          </p>
        </div>
      </AnimationContainer>

      <AnimationContainer delay={0.2}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12">
          {featuresList.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <AnimationContainer key={feature.href} delay={0.1 * (index + 1)}>
                <Card className="h-full hover:border-primary/50 transition-colors">
                  <CardHeader>
                    <div className="flex items-center gap-3 mb-2">
                      <Icon className="h-8 w-8 text-primary" />
                      <CardTitle className="text-foreground text-xl">{feature.title}</CardTitle>
                    </div>
                    <CardDescription className="text-base">
                      {feature.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button asChild variant="outline" className="w-full">
                      <Link href={feature.href}>
                        Dowiedz się więcej
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              </AnimationContainer>
            );
          })}
        </div>
      </AnimationContainer>

      <AnimationContainer delay={0.4}>
        <div className="mt-16 text-center">
          <h2 className="text-2xl font-semibold text-foreground mb-4">
            Gotowy, aby rozpocząć?
          </h2>
          <p className="text-muted-foreground mb-6">
            Rozpocznij z 1 darmową galerią i odkryj wszystkie funkcje PhotoCloud.
          </p>
          <Button asChild size="lg">
            <Link href={`${process.env.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3001'}/sign-up`}>
              Rozpocznij za darmo
            </Link>
          </Button>
        </div>
      </AnimationContainer>
    </MaxWidthWrapper>
  );
}

