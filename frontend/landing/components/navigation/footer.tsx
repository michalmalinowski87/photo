"use client";

import Link from 'next/link';
import { AnimationContainer } from "@/components"
import { TextHoverEffect } from "@/components/ui/text-hover-effect"
import { PostHogActions } from "@photocloud/posthog-types";

const Footer = () => {
  return (
    <footer className="flex flex-col relative items-center justify-center border-t border-border pb-8 md:pb-0 px-6 lg:px-8 w-full max-w-6xl mx-auto bg-[radial-gradient(35%_128px_at_50%_0%,theme(backgroundColor.white/8%),transparent)]">

      <div className="absolute top-0 left-1/2 right-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-1.5 bg-foreground rounded-full"></div>

      <div className="grid gap-8 xl:grid-cols-3 xl:gap-8 w-full">
        <div className="grid-cols-2 gap-8 grid mt-16 xl:col-span-2 xl:mt-0">
          <div className="md:grid md:grid-cols-2 md:gap-8">
            <AnimationContainer delay={0.2}>
              <div className="">
                <h3 className="text-base font-medium text-foreground">
                  Produkt
                </h3>
                <ul className="mt-4 text-sm text-muted-foreground">
                  <li className="mt-2">
                    <Link 
                      href="/#funkcje" 
                      className="hover:text-foreground transition-all duration-300"
                      data-ph-action={PostHogActions.landing.footerLinkClick}
                      data-ph-property-landing_footer_link="Funkcje"
                    >
                      Funkcje
                    </Link>
                  </li>
                  <li className="mt-2">
                    <Link 
                      href="/pricing" 
                      className="hover:text-foreground transition-all duration-300"
                      data-ph-action={PostHogActions.landing.footerLinkClick}
                      data-ph-property-landing_footer_link="Cennik"
                    >
                      Cennik
                    </Link>
                  </li>
                  <li className="mt-2">
                    <Link 
                      href="/#funkcje" 
                      className="hover:text-foreground transition-all duration-300"
                      data-ph-action={PostHogActions.landing.footerLinkClick}
                      data-ph-property-landing_footer_link="Opinie"
                    >
                      Opinie
                    </Link>
                  </li>
                </ul>
              </div>
            </AnimationContainer>
            <AnimationContainer delay={0.3}>
              <div className="mt-10 md:mt-0 flex flex-col">
                <h3 className="text-base font-medium text-foreground">
                  Funkcje
                </h3>
                <ul className="mt-4 text-sm text-muted-foreground">
                  <li className="">
                    <Link 
                      href="/features/password-protection" 
                      className="hover:text-foreground transition-all duration-300"
                      data-ph-action={PostHogActions.landing.footerLinkClick}
                      data-ph-property-landing_footer_link="Ochrona hasłem"
                    >
                      Ochrona hasłem
                    </Link>
                  </li>
                  <li className="mt-2">
                    <Link 
                      href="/features/cost-efficient" 
                      className="hover:text-foreground transition-all duration-300"
                      data-ph-action={PostHogActions.landing.footerLinkClick}
                      data-ph-property-landing_footer_link="Opłacalność"
                    >
                      Opłacalność
                    </Link>
                  </li>
                  <li className="mt-2">
                    <Link 
                      href="/features/flexible-pricing" 
                      className="hover:text-foreground transition-all duration-300"
                      data-ph-action={PostHogActions.landing.footerLinkClick}
                      data-ph-property-landing_footer_link="Elastyczne ceny"
                    >
                      Elastyczne ceny
                    </Link>
                  </li>
                  <li className="mt-2">
                    <Link 
                      href="/features/client-selection" 
                      className="hover:text-foreground transition-all duration-300"
                      data-ph-action={PostHogActions.landing.footerLinkClick}
                      data-ph-property-landing_footer_link="Wybór przez klienta"
                    >
                      Wybór przez klienta
                    </Link>
                  </li>
                </ul>
              </div>
            </AnimationContainer>
          </div>
          <div className="md:grid md:grid-cols-2 md:gap-8">
            <AnimationContainer delay={0.4}>
              <div className="">
                <h3 className="text-base font-medium text-foreground">
                  Zasoby
                </h3>
                <ul className="mt-4 text-sm text-muted-foreground">
                  <li className="mt-2">
                    <Link 
                      href="/resources/help" 
                      className="hover:text-foreground transition-all duration-300"
                      data-ph-action={PostHogActions.landing.footerLinkClick}
                      data-ph-property-landing_footer_link="Pomoc"
                    >
                      Pomoc
                    </Link>
                  </li>
                </ul>
              </div>
            </AnimationContainer>
            <AnimationContainer delay={0.5}>
              <div className="mt-10 md:mt-0 flex flex-col">
                <h3 className="text-base font-medium text-foreground">
                  Firma
                </h3>
                <ul className="mt-4 text-sm text-muted-foreground">
                  <li className="">
                    <Link 
                      href="/resources/help" 
                      className="hover:text-foreground transition-all duration-300"
                      data-ph-action={PostHogActions.landing.footerLinkClick}
                      data-ph-property-landing_footer_link="O nas"
                    >
                      O nas
                    </Link>
                  </li>
                  <li className="mt-2">
                    <Link 
                      href="/privacy" 
                      className="hover:text-foreground transition-all duration-300"
                      data-ph-action={PostHogActions.landing.footerLinkClick}
                      data-ph-property-landing_footer_link="Polityka prywatności"
                    >
                      Polityka prywatności
                    </Link>
                  </li>
                  <li className="mt-2">
                    <Link 
                      href="/terms" 
                      className="hover:text-foreground transition-all duration-300"
                      data-ph-action={PostHogActions.landing.footerLinkClick}
                      data-ph-property-landing_footer_link="Warunki korzystania"
                    >
                      Warunki korzystania
                    </Link>
                  </li>
                </ul>
              </div>
            </AnimationContainer>
          </div>
        </div>

      </div>

      <div className="mt-8 mb-8 border-t border-border/40 pt-4 md:pt-8 md:flex md:items-center md:justify-between w-full">
        <AnimationContainer delay={0.6}>
          <p className="text-sm text-muted-foreground mt-8 md:mt-0">
            &copy; {new Date().getFullYear()} PhotoCloud. Wszelkie prawa zastrzeżone.
          </p>
        </AnimationContainer>
      </div>
    </footer>
  )
}

export default Footer
