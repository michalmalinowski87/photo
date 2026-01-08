import * as React from "react"

import { cn } from "@/utils"

function Card({ ref, className, ...props }: React.HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-2xl border-0 bg-card text-card-foreground shadow-sm hover:shadow-md transition-all duration-300",
        className
      )}
      {...props}
    />
  )
}
Card.displayName = "Card"

function CardHeader({ ref, className, ...props }: React.HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      className={cn("flex flex-col space-y-1.5 p-6", className)}
      {...props}
    />
  )
}
CardHeader.displayName = "CardHeader"

function CardTitle({ ref, className, ...props }: React.HTMLAttributes<HTMLHeadingElement> & { ref?: React.Ref<HTMLParagraphElement> }) {
  return (
    <h3
      ref={ref}
      className={cn(
        "text-2xl font-semibold leading-none tracking-tight",
        className
      )}
      {...props}
    />
  )
}
CardTitle.displayName = "CardTitle"

function CardDescription({ ref, className, ...props }: React.HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}
CardDescription.displayName = "CardDescription"

function CardContent({ ref, className, ...props }: React.HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
  )
}
CardContent.displayName = "CardContent"

function CardFooter({ ref, className, ...props }: React.HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      className={cn("flex items-center p-6 pt-0", className)}
      {...props}
    />
  )
}
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
