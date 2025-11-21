"use client";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, PLANS } from "@/utils";
import { motion } from "framer-motion";
import { CheckCircleIcon } from "lucide-react";
import Link from "next/link";
import { useState } from 'react';

type Tab = "1m" | "3m" | "12m";

const PricingCards = () => {
  const MotionTabTrigger = motion(TabsTrigger);
  const [activeTab, setActiveTab] = useState<Tab>("1m");
  const [hoveredPlan, setHoveredPlan] = useState<string | null>(null);

  const getTabLabel = (value: Tab) => {
    switch (value) {
      case "1m": return "1 miesiąc";
      case "3m": return "3 miesiące";
      case "12m": return "12 miesięcy";
    }
  };

  return (
    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Tab)} className="w-full flex flex-col items-center justify-center">
      <TabsList>
        <MotionTabTrigger
          value="1m"
          onClick={() => setActiveTab("1m")}
          className="relative"
        >
          {activeTab === "1m" && (
            <motion.div
              layoutId="active-tab-indicator"
              transition={{
                type: "spring",
                bounce: 0.5,
              }}
              className="absolute top-0 left-0 w-full h-full bg-background shadow-sm rounded-md z-10"
            />
          )}
          <span className="z-20">1 miesiąc</span>
        </MotionTabTrigger>
        <MotionTabTrigger
          value="3m"
          onClick={() => setActiveTab("3m")}
          className="relative"
        >
          {activeTab === "3m" && (
            <motion.div
              layoutId="active-tab-indicator"
              transition={{
                type: "spring",
                bounce: 0.5,
              }}
              className="absolute top-0 left-0 w-full h-full bg-background shadow-sm rounded-md z-10"
            />
          )}
          <span className="z-20">3 miesiące</span>
        </MotionTabTrigger>
        <MotionTabTrigger
          value="12m"
          onClick={() => setActiveTab("12m")}
          className="relative"
        >
          {activeTab === "12m" && (
            <motion.div
              layoutId="active-tab-indicator"
              transition={{
                type: "spring",
                bounce: 0.5,
              }}
              className="absolute top-0 left-0 w-full h-full bg-background shadow-sm rounded-md z-10"
            />
          )}
          <span className="z-20">12 miesięcy</span>
        </MotionTabTrigger>
      </TabsList>

      <TabsContent value="1m" className="grid grid-cols-1 lg:grid-cols-3 gap-5 w-full md:gap-8 flex-wrap max-w-5xl mx-auto pt-6">
        {PLANS.map((plan) => {
          const isHovered = hoveredPlan === plan.name;
          return (
            <Card
              key={plan.name}
              onMouseEnter={() => setHoveredPlan(plan.name)}
              onMouseLeave={() => setHoveredPlan(null)}
              className={cn(
                "flex flex-col w-full rounded-xl bg-card/50 backdrop-blur-sm transition-all duration-300",
                "border-2",
                isHovered ? "border-theme-primary" : "border-transparent"
              )}
            >
              <CardHeader className={cn(
                "border-b border-border/50 transition-colors duration-300",
                isHovered ? "bg-theme-primary/[0.07]" : "bg-foreground/[0.03]"
              )}>
                <CardTitle className={cn(!isHovered && "text-muted-foreground", "text-lg font-medium text-foreground transition-colors duration-300")}>
                  {plan.name}
                </CardTitle>
                <CardDescription>
                  {plan.info}
                </CardDescription>
                <h5 className="text-3xl font-semibold text-foreground mt-4">
                  {plan.price["1m"]} PLN
                  <span className="text-base text-muted-foreground font-normal ml-2">
                    / miesiąc
                  </span>
                </h5>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                {plan.features.map((feature, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <CheckCircleIcon className={cn("w-4 h-4 transition-colors duration-300", isHovered ? "text-theme-primary" : "text-white")} />
                    <TooltipProvider>
                      <Tooltip delayDuration={0}>
                        <TooltipTrigger asChild>
                          <p className={cn(feature.tooltip && "border-b !border-dashed border-border cursor-pointer text-foreground")}>
                            {feature.text}
                          </p>
                        </TooltipTrigger>
                        {feature.tooltip && (
                          <TooltipContent>
                            <p>{feature.tooltip}</p>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                ))}
              </CardContent>
              <CardFooter className="w-full mt-auto">
                <Link
                  href="/auth/sign-up"
                  style={{ width: "100%" }}
                  className={buttonVariants({ 
                    variant: isHovered ? "primary" : "ghost",
                    className: cn(
                      "transition-colors duration-300",
                      isHovered 
                        ? "bg-theme-primary hover:bg-theme-primary/90 text-white border-0" 
                        : "!bg-black !border !border-white text-white hover:!bg-white/90 hover:!text-black"
                    )
                  })}
                >
                  {plan.btn.text}
                </Link>
              </CardFooter>
            </Card>
          );
        })}
      </TabsContent>

      <TabsContent value="3m" className="grid grid-cols-1 lg:grid-cols-3 gap-5 w-full md:gap-8 flex-wrap max-w-5xl mx-auto pt-6">
        {PLANS.map((plan) => {
          const isHovered = hoveredPlan === plan.name;
          return (
            <Card
              key={plan.name}
              onMouseEnter={() => setHoveredPlan(plan.name)}
              onMouseLeave={() => setHoveredPlan(null)}
              className={cn(
                "flex flex-col w-full rounded-xl bg-card/50 backdrop-blur-sm transition-all duration-300",
                "border-2",
                isHovered ? "border-theme-primary" : "border-transparent"
              )}
            >
              <CardHeader className={cn(
                "border-b border-border/50 transition-colors duration-300",
                isHovered ? "bg-theme-primary/[0.07]" : "bg-foreground/[0.03]"
              )}>
                <CardTitle className={cn(!isHovered && "text-muted-foreground", "text-lg font-medium text-foreground transition-colors duration-300")}>
                  {plan.name}
                </CardTitle>
                <CardDescription>
                  {plan.info}
                </CardDescription>
                <h5 className="text-3xl font-semibold text-foreground mt-4">
                  {plan.price["3m"]} PLN
                  <span className="text-base text-muted-foreground font-normal ml-2">
                    / 3 miesiące
                  </span>
                </h5>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                {plan.features.map((feature, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <CheckCircleIcon className={cn("w-4 h-4 transition-colors duration-300", isHovered ? "text-theme-primary" : "text-white")} />
                    <TooltipProvider>
                      <Tooltip delayDuration={0}>
                        <TooltipTrigger asChild>
                          <p className={cn(feature.tooltip && "border-b !border-dashed border-border cursor-pointer text-foreground")}>
                            {feature.text}
                          </p>
                        </TooltipTrigger>
                        {feature.tooltip && (
                          <TooltipContent>
                            <p>{feature.tooltip}</p>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                ))}
              </CardContent>
              <CardFooter className="w-full mt-auto">
                <Link
                  href={plan.btn.href}
                  style={{ width: "100%" }}
                  className={buttonVariants({ 
                    className: cn(
                      "transition-colors duration-300",
                      isHovered 
                        ? "bg-theme-primary hover:bg-theme-primary/90 text-white" 
                        : "bg-white text-foreground hover:bg-white/90"
                    )
                  })}
                >
                  {plan.btn.text}
                </Link>
              </CardFooter>
            </Card>
          );
        })}
      </TabsContent>

      <TabsContent value="12m" className="grid grid-cols-1 lg:grid-cols-3 gap-5 w-full md:gap-8 flex-wrap max-w-5xl mx-auto pt-6">
        {PLANS.map((plan) => {
          const isHovered = hoveredPlan === plan.name;
          return (
            <Card
              key={plan.name}
              onMouseEnter={() => setHoveredPlan(plan.name)}
              onMouseLeave={() => setHoveredPlan(null)}
              className={cn(
                "flex flex-col w-full rounded-xl bg-card/50 backdrop-blur-sm transition-all duration-300",
                "border-2",
                isHovered ? "border-theme-primary" : "border-transparent"
              )}
            >
              <CardHeader className={cn(
                "border-b border-border/50 transition-colors duration-300",
                isHovered ? "bg-theme-primary/[0.07]" : "bg-foreground/[0.03]"
              )}>
                <CardTitle className={cn(!isHovered && "text-muted-foreground", "text-lg font-medium text-foreground transition-colors duration-300")}>
                  {plan.name}
                </CardTitle>
                <CardDescription>
                  {plan.info}
                </CardDescription>
                <h5 className="text-3xl font-semibold text-foreground mt-4 flex items-end">
                  {plan.price["12m"]} PLN
                  <div className="text-base text-muted-foreground font-normal ml-2">
                    / rok
                  </div>
                </h5>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                {plan.features.map((feature, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <CheckCircleIcon className={cn("w-4 h-4 transition-colors duration-300", isHovered ? "text-theme-primary" : "text-white")} />
                    <TooltipProvider>
                      <Tooltip delayDuration={0}>
                        <TooltipTrigger asChild>
                          <p className={cn(feature.tooltip && "border-b !border-dashed border-border cursor-pointer text-foreground")}>
                            {feature.text}
                          </p>
                        </TooltipTrigger>
                        {feature.tooltip && (
                          <TooltipContent>
                            <p>{feature.tooltip}</p>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                ))}
              </CardContent>
              <CardFooter className="w-full mt-auto">
                <Link
                  href={plan.btn.href}
                  style={{ width: "100%" }}
                  className={buttonVariants({ 
                    className: cn(
                      "transition-colors duration-300",
                      isHovered 
                        ? "bg-theme-primary hover:bg-theme-primary/90 text-white" 
                        : "bg-white text-foreground hover:bg-white/90"
                    )
                  })}
                >
                  {plan.btn.text}
                </Link>
              </CardFooter>
            </Card>
          );
        })}
      </TabsContent>
    </Tabs>
  )
};

export default PricingCards
