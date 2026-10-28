import * as React from "react"

import { cn } from "@/lib/utils"
import { useLanguage } from "@/context/LanguageContext"

const Card = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)}
    {...props} />
))
Card.displayName = "Card"

const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props} />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef(({ className, children, ...props }, ref) => {
  const { t } = useLanguage()
  return <div ref={ref} className={cn("text-2xl font-semibold leading-none tracking-tight", className)} {...props}>
    {typeof children === "string" ? t(children) : children}
  </div>
})
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef(({ className, children, ...props }, ref) => {
  const { t } = useLanguage()
  return <div ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props}>
    {typeof children === "string" ? t(children) : children}
  </div>
})
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props} />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
