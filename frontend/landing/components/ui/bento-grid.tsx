import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/utils";
import { ArrowRightIcon, Lock, DollarSign, Settings, Users } from "lucide-react";
import Link from "next/link";
import { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./card";

export const CARDS = [
  {
    Icon: Lock,
    name: "Galeria chroniona hasłem",
    description: "Bezpieczne udostępnianie zdjęć tylko wybranym klientom.",
    href: "/features/password-protection",
    cta: "Dowiedz się więcej",
    className: "col-span-3 lg:col-span-1",
    background: (
      <Card className="absolute top-10 left-10 origin-top rounded-none rounded-tl-md transition-all duration-300 ease-out [mask-image:linear-gradient(to_top,transparent_0%,#000_100%)] group-hover:scale-105 border border-border border-r-0">
        <CardHeader>
          <CardTitle className="text-foreground">
            Galeria chroniona hasłem
          </CardTitle>
          <CardDescription>
            Bezpieczne udostępnianie zdjęć tylko wybranym klientom.
          </CardDescription>
        </CardHeader>
        <CardContent className="-mt-4">
          <div className="text-sm text-muted-foreground">
            Ustaw hasło dostępu do galerii
          </div>
        </CardContent>
      </Card>
    ),
  },
  {
    Icon: DollarSign,
    name: "Opłacalne rozwiązanie",
    description: "Proste i przystępne ceny bez ukrytych kosztów.",
    href: "/features/cost-efficient",
    cta: "Dowiedz się więcej",
    className: "col-span-3 lg:col-span-2",
    background: (
      <Card className="absolute right-10 top-10 w-[70%] origin-to translate-x-0 border border-border transition-all duration-300 ease-out [mask-image:linear-gradient(to_top,transparent_40%,#000_100%)] group-hover:-translate-x-10">
        <CardHeader>
          <CardTitle className="text-foreground">Proste ceny</CardTitle>
          <CardDescription>
            Od 7 PLN za galerię
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-foreground">7 PLN</div>
          <div className="text-sm text-muted-foreground">za 1 miesiąc</div>
        </CardContent>
      </Card>
    ),
  },
  {
    Icon: Settings,
    name: "Elastyczne ceny",
    description: "System dodatków pozwala dostosować ofertę do potrzeb.",
    href: "/features/flexible-pricing",
    cta: "Dowiedz się więcej",
    className: "col-span-3 lg:col-span-2 max-w-full overflow-hidden",
    background: (
      <Card className="absolute right-2 pl-28 md:pl-0 top-4 h-[300px] w-[600px] border-none transition-all duration-300 ease-out [mask-image:linear-gradient(to_top,transparent_10%,#000_100%)] group-hover:scale-105">
        <CardHeader>
          <CardTitle className="text-foreground">Dostosuj do potrzeb</CardTitle>
          <CardDescription>
            Dodaj funkcje, gdy ich potrzebujesz
          </CardDescription>
        </CardHeader>
      </Card>
    ),
  },
  {
    Icon: Users,
    name: "Wybór przez klienta",
    description: "Klienci mogą samodzielnie wybierać ulubione zdjęcia.",
    className: "col-span-3 lg:col-span-1",
    href: "/features/client-selection",
    cta: "Dowiedz się więcej",
    background: (
      <Card className="absolute right-0 top-10 origin-top rounded-md border border-border transition-all duration-300 ease-out [mask-image:linear-gradient(to_top,transparent_40%,#000_100%)] group-hover:scale-105">
        <CardHeader>
          <CardTitle className="text-foreground">Wybór przez klienta</CardTitle>
          <CardDescription>
            Klienci wybierają ulubione zdjęcia
          </CardDescription>
        </CardHeader>
      </Card>
    ),
  },
];

const BentoGrid = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => {
  return (
    <div
      className={cn(
        "grid w-full auto-rows-[22rem] grid-cols-3 gap-4",
        className,
      )}
    >
      {children}
    </div>
  );
};

const BentoCard = ({
  name,
  className,
  background,
  Icon,
  description,
  href,
  cta,
}: {
  name: string;
  className: string;
  background: ReactNode;
  Icon: any;
  description: string;
  href: string;
  cta: string;
}) => (
  <div
    key={name}
    className={cn(
      "group relative col-span-3 flex flex-col justify-between border border-border/60 overflow-hidden rounded-xl",
      "bg-black [box-shadow:0_-20px_80px_-20px_#ffffff1f_inset]",
      className,
    )}
  >
    <div>{background}</div>
    <div className="pointer-events-none z-10 flex flex-col gap-1 p-6 transition-all duration-300 group-hover:-translate-y-10">
      <Icon className="h-12 w-12 origin-left text-neutral-700 transition-all duration-300 ease-in-out group-hover:scale-75" />
      <h3 className="text-xl font-semibold text-neutral-300">
        {name}
      </h3>
      <p className="max-w-lg text-neutral-400">{description}</p>
    </div>

    <div
      className={cn(
        "absolute bottom-0 flex w-full translate-y-10 flex-row items-center p-4 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100",
      )}
    >
      <Link href={href} className={buttonVariants({ size: "sm", variant: "ghost", className: "cursor-pointer" })}>
        {cta}
        <ArrowRightIcon className="ml-2 h-4 w-4" />
      </Link>
    </div>
    <div className="pointer-events-none absolute inset-0 transition-all duration-300 group-hover:bg-black/[.03] group-hover:dark:bg-neutral-800/10" />
  </div>
);

export { BentoCard, BentoGrid };
